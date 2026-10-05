// The deck pulls in src/lib/radio.ts, which reads import.meta.env inside a function never called here.
/// <reference types="vite/client" />
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { pingTokenFactory, streamChat } from "./nebius";
import { applyCard, deckPrompt, dealTurn, parseDeal, roomContext } from "../src/lib/deck";

/**
 * Say it → it builds (path-to-win §3 "The engine"), split in two so the room
 * can start while you're still talking:
 *
 * - `deal` asks Nemotron Lightning for cards and only returns them. It can run
 *   speculatively on a phrase that may still grow, so it never writes a
 *   widget. While the model writes, the answer so far is mirrored into the
 *   ask's `deals` row and `live` streams it to the asker, who fills the
 *   skeleton field by field.
 * - `commit` takes the cards the asker kept, checks each again (`applyCard`)
 *   and creates them where the asker's code placed them (`placeCards` runs on
 *   the client, which can see the board as drawn). Convex sync puts them on
 *   every screen in the room.
 *
 * The model answers with cards only; coordinates, HTML and code never come
 * from it. One `deals` row per call (JSON in `run`): the words, whether it was
 * speculative, the context sent, the raw answer, the model's own timings, and
 * later what was committed and the asker's measured stage times.
 */

const MODEL = "lightning" as const;
const MODEL_NAME = "Lightning";
const MAX_TOKENS = 220;

type DealOut = {
  dealId: Id<"deals"> | null;
  model: string;
  context: string;
  answer: string;
  none: boolean;
  error: string | null;
  firstTokenMs: number | null;
  firstLineMs: number | null;
  totalMs: number;
};

export const deal = action({
  args: {
    spaceId: v.id("spaces"),
    said: v.string(),
    room: v.string(),
    today: v.string(),
    people: v.array(v.string()),
    /** A one-line label of the selected object, for the model. */
    selected: v.optional(v.string()),
    /** The asker's id for this call: `live` finds the streaming answer by it. */
    nonce: v.string(),
    /** Fired on a phrase that may still grow (the asker hadn't paused yet). */
    spec: v.boolean(),
  },
  returns: v.object({
    dealId: v.union(v.id("deals"), v.null()),
    model: v.string(),
    context: v.string(),
    answer: v.string(),
    none: v.boolean(),
    error: v.union(v.string(), v.null()),
    firstTokenMs: v.union(v.number(), v.null()),
    firstLineMs: v.union(v.number(), v.null()),
    totalMs: v.number(),
  }),
  handler: async (ctx, args): Promise<DealOut> => {
    const t0 = Date.now();
    const said = args.said.trim().slice(0, 240);
    const context = roomContext({
      room: args.room,
      today: args.today,
      people: args.people.slice(0, 12),
      selected: args.selected,
    });
    // The row opens alongside the model call, never in front of it.
    const opened: Promise<Id<"deals">> = ctx.runMutation(internal.voiceBuild.record, {
      spaceId: args.spaceId,
      run: JSON.stringify({ at: t0, nonce: args.nonce, said, spec: args.spec, model: MODEL_NAME, context, answer: "", done: false }),
    });

    /* Mirror the answer into the row as it grows: one write in flight at a
       time, the newest text wins, so a fast stream costs a handful of writes. */
    let latest = "";
    let written = "";
    let writing: Promise<void> | null = null;
    const flush = () => {
      if (writing || latest === written) return;
      const text = latest;
      writing = opened
        .then((dealId) => ctx.runMutation(internal.voiceBuild.stream, { dealId, answer: text }))
        .catch(() => {})
        .then(() => {
          written = text;
          writing = null;
          flush();
        });
    };

    const result = await streamChat({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      messages: [
        { role: "system", content: deckPrompt() },
        { role: "user", content: dealTurn({ context, said }) },
      ],
      onText: (content) => {
        latest = content;
        flush();
      },
    });
    while (writing) await writing;

    const parsed = parseDeal(result.content, true);
    const none = parsed.none && !parsed.items.some((i) => i.ok);
    const error = result.error ? `${result.status || "fetch"}: ${result.error.slice(0, 160)}` : null;
    const out = {
      model: MODEL_NAME,
      context,
      answer: result.content.slice(0, 2000),
      none,
      error,
      firstTokenMs: result.firstTokenMs,
      firstLineMs: result.firstLineMs,
      totalMs: Date.now() - t0,
    };
    const dealId: Id<"deals"> | null = await opened.catch(() => null);
    if (dealId) {
      await ctx.runMutation(internal.voiceBuild.finish, {
        dealId,
        patch: JSON.stringify({
          ...out,
          done: true,
          modelTotalMs: result.totalMs,
          finish: result.finish,
          usage: result.usage,
          invalid: parsed.items.flatMap((i) => (i.ok ? [] : [i.reason])),
        }),
      });
    }
    return { ...out, dealId };
  },
});

export const record = internalMutation({
  args: { spaceId: v.id("spaces"), run: v.string() },
  returns: v.id("deals"),
  handler: async (ctx, args) => await ctx.db.insert("deals", args),
});

/** Merge fields into a row's JSON. */
async function patchRun(
  ctx: MutationCtx,
  dealId: Id<"deals">,
  fields: Record<string, unknown>,
) {
  const row = await ctx.db.get(dealId);
  if (!row) return;
  await ctx.db.patch(dealId, { run: JSON.stringify({ ...(JSON.parse(row.run) as object), ...fields }) });
}

export const stream = internalMutation({
  args: { dealId: v.id("deals"), answer: v.string() },
  returns: v.null(),
  handler: async (ctx, { dealId, answer }) => {
    await patchRun(ctx, dealId, { answer: answer.slice(0, 2000) });
    return null;
  },
});

export const finish = internalMutation({
  args: { dealId: v.id("deals"), patch: v.string() },
  returns: v.null(),
  handler: async (ctx, { dealId, patch }) => {
    await patchRun(ctx, dealId, JSON.parse(patch) as Record<string, unknown>);
    return null;
  },
});

/** The answer so far for one call (by the asker's nonce), while it streams. */
export const live = query({
  args: { spaceId: v.id("spaces"), nonce: v.string() },
  returns: v.union(v.null(), v.object({ answer: v.string(), done: v.boolean() })),
  handler: async (ctx, { spaceId, nonce }) => {
    const rows = await ctx.db
      .query("deals")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(40);
    for (const row of rows) {
      if (!row.run.includes(nonce)) continue;
      const run = JSON.parse(row.run) as { nonce?: string; answer?: string; done?: boolean };
      if (run.nonce === nonce) return { answer: run.answer ?? "", done: run.done === true };
    }
    return null;
  },
});

/**
 * Create the cards the asker kept, where the asker's code placed them. Each
 * card is the model's own JSON, checked again here; nothing else is trusted
 * from the client but the spot and the stacking order.
 */
export const commit = mutation({
  args: {
    spaceId: v.id("spaces"),
    dealId: v.optional(v.id("deals")),
    by: v.string(),
    people: v.array(v.string()),
    today: v.string(),
    createdBy: v.string(),
    cards: v.array(v.object({ card: v.string(), x: v.number(), y: v.number(), z: v.number() })),
  },
  returns: v.array(v.id("widgets")),
  handler: async (ctx, args) => {
    const people = args.people.slice(0, 12);
    const cardCtx = { by: args.by, people: people.length ? people : [args.by], today: args.today };
    const ids: Id<"widgets">[] = [];
    for (const c of args.cards.slice(0, 8)) {
      let raw: unknown;
      try {
        raw = JSON.parse(c.card);
      } catch {
        continue;
      }
      const applied = applyCard(raw, cardCtx, { z: c.z });
      if (!applied.ok) continue;
      const w = applied.widget;
      const id: Id<"widgets"> = await ctx.runMutation(api.widgets.createWidget, {
        spaceId: args.spaceId,
        type: w.type,
        x: Math.round(c.x),
        y: Math.round(c.y),
        w: w.w,
        h: w.h,
        z: w.z,
        ...(w.rotate !== undefined ? { rotate: w.rotate } : {}),
        data: w.data as never,
        createdBy: args.createdBy,
      });
      ids.push(id);
    }
    if (args.dealId) await patchRun(ctx, args.dealId, { committed: ids, committedAt: Date.now() });
    return ids;
  },
});

/** Orb tapped: wake the action runtime and the Token Factory connection. */
export const warm = action({
  args: {},
  returns: v.object({ status: v.number(), ms: v.number() }),
  handler: async () => await pingTokenFactory(),
});

/** The asker's screen saw the card: ms from the last word, plus every stage mark. */
export const noteLanded = mutation({
  args: { dealId: v.id("deals"), landedMs: v.number(), trace: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { dealId, landedMs, trace }) => {
    const row = await ctx.db.get(dealId);
    if (!row || !(landedMs > -60_000 && landedMs < 120_000)) return null;
    const run = JSON.parse(row.run) as Record<string, unknown>;
    if (run.landedMs !== undefined) return null;
    await ctx.db.patch(dealId, {
      run: JSON.stringify({ ...run, landedMs: Math.round(landedMs), ...(trace ? { client: JSON.parse(trace) as unknown } : {}) }),
    });
    return null;
  },
});

/** Recent asks for one room, newest first (read with `npx convex run`). */
export const recent = internalQuery({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  returns: v.array(v.string()),
  handler: async (ctx, { spaceId, limit }) => {
    const rows = await ctx.db
      .query("deals")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(Math.min(limit ?? 20, 100));
    return rows.map((r) => r.run);
  },
});
