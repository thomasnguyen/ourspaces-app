import { v } from "convex/values";
import {
  PersistentTextStreaming,
  StreamIdValidator,
  type StreamId,
} from "@convex-dev/persistent-text-streaming";
import { components, internal } from "./_generated/api";
import { httpAction, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { askAgent } from "./agent";
import { rateLimiter } from "./rateLimits";

/**
 * persistent-text-streaming: token-by-token HTTP streaming for "ask the
 * space", persisted so the answer survives a reload or a second viewer.
 * Real capability, verified end-to-end — not yet the default UI path
 * (ActionDock's existing reveal animation stays as-is; see plan notes).
 */
const persistentTextStreaming = new PersistentTextStreaming(components.persistentTextStreaming);

export const createAskStream = mutation({
  args: {},
  returns: StreamIdValidator,
  handler: async (ctx) => await persistentTextStreaming.createStream(ctx),
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

export const streamAsk = httpAction(async (ctx, request) => {
  const body = (await request.json()) as {
    streamId: string;
    spaceId: string;
    question: string;
  };
  const spaceId = body.spaceId as Id<"spaces">;

  const response = await persistentTextStreaming.stream(
    ctx,
    request,
    body.streamId as StreamId,
    async (streamCtx, _request, _streamId, append) => {
      await rateLimiter.limit(streamCtx, "recapAsk", { key: spaceId, throws: true });
      const [snap, retrieved] = await Promise.all([
        streamCtx.runQuery(internal.recap.snapshot, { spaceId }),
        streamCtx
          .runAction(internal.rag.groundQuestion, { spaceId, question: body.question })
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
            `\n\nQuestion: ${body.question}\n\nReply in 1-2 sentences, lowercase, casual.`,
        },
      );
      for await (const chunk of result.textStream) {
        await append(chunk);
      }
    },
  );

  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Vary", "Origin");
  return response;
});
