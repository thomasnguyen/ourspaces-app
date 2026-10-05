import { ConvexError, v } from "convex/values";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { rateLimiter, PRICE_PER_M, SPEND_CEILING_USD } from "./rateLimits";
import { seatOf, seatOrMaker } from "./seat";
import type { NemotronModel } from "./nebius";

/**
 * The door in front of every Token Factory call a browser can start (S3,
 * nebius/eval/s3-audit.md). One mutation, before the model is called: the
 * caller has a seat in the room (from the session, never an argument), the
 * person's burst and the room's day have room for these calls, and the
 * deployment hasn't passed its day's ceiling. The numbers live in
 * convex/rateLimits.ts.
 *
 * Refusals are plain values the asker's screen turns into a line:
 * "limit" → "that's a lot of asks; try again in a minute", "spent" → the
 * model is off for today. No seat throws: no member's screen ever sees it.
 */

/** Estimated spend, per UTC day: `tf-micro:<day>` (micro-dollars) and `tf-calls:<day>`. */
const spend = new ShardedCounter(components.shardedCounter, { defaultShards: 4 });
const today = () => new Date().toISOString().slice(0, 10);

export type Usage = { prompt_tokens?: number; completion_tokens?: number } | null | undefined;

/** Micro-dollars for one call: tokens × list price. */
export function microsOf(model: NemotronModel, usage: Usage): number {
  const price = PRICE_PER_M[model];
  return Math.ceil((usage?.prompt_tokens ?? 0) * price.prompt + (usage?.completion_tokens ?? 0) * price.completion);
}

async function spentToday(ctx: QueryCtx) {
  const day = today();
  const [micros, calls] = await Promise.all([spend.count(ctx, `tf-micro:${day}`), spend.count(ctx, `tf-calls:${day}`)]);
  return { day, usd: micros / 1e6, calls };
}

/** Count calls that happened (from an action, after the model answered). */
export async function noteSpendIn(ctx: MutationCtx, calls: { model: NemotronModel; usage: Usage }[]) {
  if (!calls.length) return;
  const day = today();
  const micros = calls.reduce((sum, c) => sum + microsOf(c.model, c.usage), 0);
  await spend.add(ctx, `tf-calls:${day}`, calls.length);
  if (micros) await spend.add(ctx, `tf-micro:${day}`, micros);
}

export const noteSpend = internalMutation({
  args: { calls: v.array(v.object({ model: v.union(v.literal("nano"), v.literal("lightning"), v.literal("super"), v.literal("ultra")), prompt: v.number(), completion: v.number() })) },
  returns: v.null(),
  handler: async (ctx, { calls }) => {
    await noteSpendIn(ctx, calls.map((c) => ({ model: c.model, usage: { prompt_tokens: c.prompt, completion_tokens: c.completion } })));
    return null;
  },
});

/** Today's count and estimate (`npx convex run guard:day`). */
export const day = internalQuery({
  args: {},
  returns: v.object({ day: v.string(), usd: v.number(), calls: v.number(), ceilingUsd: v.number() }),
  handler: async (ctx) => ({ ...(await spentToday(ctx)), ceilingUsd: SPEND_CEILING_USD }),
});

export const gateResult = v.union(
  v.object({ ok: v.literal(true), userId: v.string(), name: v.string(), dealId: v.union(v.id("deals"), v.null()) }),
  v.object({ ok: v.literal(false), why: v.union(v.literal("limit"), v.literal("spent")), retryAfter: v.union(v.number(), v.null()) }),
);
export type Gate =
  | { ok: true; userId: string; name: string; dealId: Id<"deals"> | null }
  | { ok: false; why: "limit" | "spent"; retryAfter: number | null };

/**
 * `calls`: how many Token Factory calls the action is about to make. With
 * `run`, the ask's `deals` row is opened in the same transaction (deal).
 */
export const voice = internalMutation({
  args: { spaceId: v.id("spaces"), calls: v.number(), run: v.optional(v.string()) },
  returns: gateResult,
  handler: async (ctx, { spaceId, calls, run }): Promise<Gate> => {
    const me = await seatOf(ctx, spaceId);
    if (!me) throw new Error("not in this room");
    if ((await spentToday(ctx)).usd >= SPEND_CEILING_USD) return { ok: false, why: "spent", retryAfter: null };
    const count = Math.max(1, Math.min(8, Math.round(calls)));
    const person = { key: me.userId, count };
    const room = { key: spaceId, count };
    // two limiter calls, not four (check + limit): this sits in front of every model call
    const p = await rateLimiter.limit(ctx, "voicePerson", person);
    if (!p.ok) return { ok: false, why: "limit", retryAfter: p.retryAfter ?? null };
    const r = await rateLimiter.limit(ctx, "voiceRoomDay", room);
    if (!r.ok) return { ok: false, why: "limit", retryAfter: r.retryAfter ?? null };
    const dealId = run ? await ctx.db.insert("deals", { spaceId, run }) : null;
    return { ok: true, userId: me.userId, name: me.name, dealId };
  },
});

/** The orb's wake ping: any signed-in person, a few a minute. */
export const warm = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const me = await getAuthUserId(ctx);
    if (!me) return false;
    return (await rateLimiter.limit(ctx, "voiceWarm", { key: me })).ok;
  },
});

/** Firecrawl from a browser: a seat in the room it's for, and the person's limit. */
export const firecrawl = internalMutation({
  args: { spaceId: v.optional(v.id("spaces")), kind: v.union(v.literal("scrape"), v.literal("search"), v.literal("crawl")) },
  returns: v.null(),
  handler: async (ctx, { spaceId, kind }) => {
    const me = spaceId ? await seatOrMaker(ctx, spaceId) : null;
    if (!me) throw new Error("not in this room");
    const name = kind === "scrape" ? "firecrawlScrape" : kind === "search" ? "firecrawlSearch" : "firecrawlCrawl";
    await rateLimiter.limit(ctx, name, { key: me.userId, throws: true });
    return null;
  },
});

/**
 * The room's other model calls a browser starts (recap "catch me up" and its
 * ask, the ask stream, a link's spark questions): a seat in the room, and
 * under the day's ceiling. Those calls report no tokens back
 * (convex/ai.ts completeJson), so the call is counted here, up front, at the
 * size b2 measured for an Ultra answer with a board in the prompt.
 */
export async function modelDoor(ctx: MutationCtx, spaceId: Id<"spaces">, model: NemotronModel = "ultra") {
  if (!(await seatOrMaker(ctx, spaceId))) throw new Error("not in this room");
  if ((await spentToday(ctx)).usd >= SPEND_CEILING_USD) throw new ConvexError("spent: the space's AI is resting until tomorrow");
  await noteSpendIn(ctx, [{ model, usage: { prompt_tokens: 2000, completion_tokens: 300 } }]);
}

export const model = internalMutation({
  args: { spaceId: v.id("spaces"), model: v.optional(v.union(v.literal("lightning"), v.literal("ultra"))) },
  returns: v.null(),
  handler: async (ctx, { spaceId, model }) => {
    await modelDoor(ctx, spaceId, model);
    return null;
  },
});

/** For the server's own model paths (game wording): past the ceiling, don't call. */
export const underCeiling = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await spentToday(ctx)).usd < SPEND_CEILING_USD,
});
