import { v } from "convex/values";
import {
  PersistentTextStreaming,
  StreamIdValidator,
  type StreamId,
} from "@convex-dev/persistent-text-streaming";
import { components, internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { askAgent } from "./agent";
import { rateLimiter } from "./rateLimits";
import { touchSpace } from "./activity";
import { messagesCounter } from "./stats";

/**
 * persistent-text-streaming: token-by-token HTTP streaming for "ask the
 * space". This is the ask path — the dock's follow-up composer goes through
 * here, and the answer types itself into the thread as the model writes it.
 *
 * The three pieces, in the order a question travels:
 *   1. `createAskStream` (mutation) mints a stream id, drops an empty
 *      placeholder turn into the `recap` message thread, and records the
 *      question in `askStreams`.
 *   2. `streamAsk` (POST /api/ask-stream, routed in http.ts) is handed only
 *      that stream id — that is all the component's `useStream` hook posts —
 *      looks the question back up, and appends the agent's tokens. The
 *      component writes them to the browser AND to its own table on sentence
 *      boundaries; the final text is patched onto the placeholder turn.
 *   3. `getAskStreamBody` (query) is the persistence half: a reload, a second
 *      viewer, or a dropped HTTP connection reads the same answer reactively
 *      out of the database instead of losing it. `useStream` switches to it
 *      automatically for anyone who is not driving the stream.
 *
 * `convex/recap.ts`'s `ask` action is still here as the non-streaming
 * fallback: the client falls back to it when the stream can't be minted
 * (rate limit) or errors out.
 */
const persistentTextStreaming = new PersistentTextStreaming(components.persistentTextStreaming);

const askStreamRow = v.object({
  streamId: StreamIdValidator,
  messageId: v.id("messages"),
  question: v.string(),
});

export const createAskStream = mutation({
  args: { spaceId: v.id("spaces"), question: v.string() },
  returns: StreamIdValidator,
  handler: async (ctx, { spaceId, question }) => {
    // rate-limiter: one question = one LLM call, metered per space. Throwing
    // here (rather than inside the stream) means the client still has a real
    // error to catch and can fall back to the non-streaming recap.ask path.
    await rateLimiter.limit(ctx, "recapAsk", { key: spaceId, throws: true });
    const streamId = await persistentTextStreaming.createStream(ctx);
    // The turn the answer will type itself into. It exists before the first
    // token so every viewer — not just the asker — sees the reporter start.
    await touchSpace(ctx, spaceId);
    const messageId = await ctx.db.insert("messages", {
      spaceId,
      widgetId: "recap",
      userId: "recap",
      text: "",
      createdAt: Date.now(),
      authorName: "catch me up",
      authorColor: "#C6F750",
      authorEmoji: "✦",
    });
    await messagesCounter.inc(ctx);
    await ctx.db.insert("askStreams", { spaceId, streamId, question, messageId });
    return streamId;
  },
});

/** The space's most recent streamed ask — how a reload or a second viewer
    finds the stream to subscribe to. */
export const latestAskStream = query({
  args: { spaceId: v.id("spaces") },
  returns: v.union(askStreamRow, v.null()),
  handler: async (ctx, { spaceId }) => {
    const row = await ctx.db
      .query("askStreams")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .first();
    if (!row) return null;
    return { streamId: row.streamId, messageId: row.messageId, question: row.question };
  },
});

export const getAskStreamBody = query({
  args: { streamId: StreamIdValidator },
  returns: v.object({
    text: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("streaming"),
      v.literal("done"),
      v.literal("error"),
      v.literal("timeout"),
    ),
  }),
  handler: async (ctx, { streamId }) =>
    await persistentTextStreaming.getStreamBody(ctx, streamId as StreamId),
});

export const askByStream = internalQuery({
  args: { streamId: v.string() },
  returns: v.union(
    v.object({
      spaceId: v.id("spaces"),
      question: v.string(),
      messageId: v.id("messages"),
    }),
    v.null(),
  ),
  handler: async (ctx, { streamId }) => {
    const row = await ctx.db
      .query("askStreams")
      .withIndex("by_stream", (q) => q.eq("streamId", streamId))
      .unique();
    if (!row) return null;
    return { spaceId: row.spaceId, question: row.question, messageId: row.messageId };
  },
});

/** The last token landed: the placeholder turn becomes the answer, so the
    thread reads the same on a reload as it did while it was typing. */
export const finishAsk = internalMutation({
  args: { messageId: v.id("messages"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { messageId, text }) => {
    await ctx.db.patch(messageId, { text });
    return null;
  },
});

export const streamAsk = httpAction(async (ctx, request) => {
  const body = (await request.json()) as { streamId: string };
  const ask = await ctx.runQuery(internal.streaming.askByStream, {
    streamId: body.streamId,
  });
  if (!ask) return new Response("unknown stream", { status: 404 });
  const spaceId: Id<"spaces"> = ask.spaceId;

  const response = await persistentTextStreaming.stream(
    ctx,
    request,
    body.streamId as StreamId,
    async (streamCtx, _request, _streamId, append) => {
      const [snap, retrieved] = await Promise.all([
        streamCtx.runQuery(internal.recap.snapshot, { spaceId }),
        streamCtx
          .runAction(internal.rag.groundQuestion, { spaceId, question: ask.question })
          .catch(() => ""),
      ]);

      let threadId = await streamCtx.runQuery(internal.recap.getAskThreadId, { spaceId });
      if (!threadId) {
        const created = await askAgent.createThread(streamCtx, {});
        threadId = created.threadId;
        await streamCtx.runMutation(internal.recap.setAskThreadId, { spaceId, threadId });
      }

      const result = await askAgent.streamText(
        streamCtx,
        { threadId },
        {
          prompt:
            `Space: ${snap.space}\nBoard: ${JSON.stringify(snap.widgets).slice(0, 2500)}\n` +
            `Chat: ${JSON.stringify(snap.chat).slice(0, 1000)}` +
            (retrieved ? `\n\nMost relevant to this question:\n${retrieved.slice(0, 2000)}` : "") +
            `\n\nQuestion: ${ask.question}\n\nReply in 1-2 sentences, lowercase, casual.`,
        },
      );
      let full = "";
      for await (const chunk of result.textStream) {
        full += chunk;
        await append(chunk);
      }
      await streamCtx.runMutation(internal.streaming.finishAsk, {
        messageId: ask.messageId,
        text: full,
      });
    },
  );

  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Vary", "Origin");
  return response;
});
