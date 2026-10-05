import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { seatOf } from "./seat";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { landWaiting } from "./rightOfWay";

/**
 * Leases: who is holding what, on the server (Right of Way, nebius R1).
 *
 * A person holds a card while they drag it, type in it (any field or the
 * title) or press a choice they haven't let go of; a puzzle piece while it's
 * in their hand. The client says `hold` when it starts and every second
 * while it lasts, and `letGo` when it ends. Each hold runs until `until`:
 *
 *   while held     until = last word from the client + 3 s
 *   after letGo    until = now + a short grace (typing or choosing 1.5 s;
 *                  a drag 0.6 s; a piece 0.4 s)
 *
 * so a closed laptop frees the card within 3 s. One scheduled `settle` per
 * lease deletes it once `until` has passed, and in the same mutation lands
 * (or drops) whatever was waiting on it (rightOfWay.ts `landWaiting`).
 * Every screen sees the leases (`forRoom`): the halo and its name tag.
 */

export const RENEW_MS = 3_000;
export const GRACE_MS = 1_500;
/* a dropped card is done with: its grace only covers the drop's own write and a
   fumbled re-grab, and the halo's release animation runs exactly this long */
const DRAG_GRACE_MS = 600;
const PIECE_GRACE_MS = 400;

const live = (l: Doc<"leases">, now: number) => l.until > now;

/** The leases on one thing (or every one in the room), still running. */
export async function leasesOn(ctx: QueryCtx, spaceId: Id<"spaces">, thing?: string, now = Date.now()) {
  const rows = await ctx.db
    .query("leases")
    .withIndex("by_thing", (q) => (thing === undefined ? q.eq("spaceId", spaceId) : q.eq("spaceId", spaceId).eq("thing", thing)))
    .take(64);
  return rows.filter((l) => live(l, now));
}

/** Leases whose thing starts with `prefix` ("piece:<game>:"). */
export async function leasesFrom(ctx: QueryCtx, spaceId: Id<"spaces">, prefix: string) {
  return await ctx.db
    .query("leases")
    .withIndex("by_thing", (q) => q.eq("spaceId", spaceId).gte("thing", prefix).lt("thing", `${prefix}￿`))
    .take(64);
}

async function mine(ctx: MutationCtx, spaceId: Id<"spaces">, thing: string, userId: string) {
  return (await ctx.db.query("leases").withIndex("by_thing", (q) => q.eq("spaceId", spaceId).eq("thing", thing)).take(16)).find((l) => l.userId === userId) ?? null;
}

/** Start or renew a hold. Returns the lease. */
export async function holdThing(ctx: MutationCtx, a: { spaceId: Id<"spaces">; thing: string; kind: string; userId: string; name: string; color: string }, ms = RENEW_MS) {
  const now = Date.now();
  const until = now + ms;
  const row = await mine(ctx, a.spaceId, a.thing, a.userId);
  if (row) {
    // a re-grab inside the grace is a new hold (the halo's 250 ms counts from here)
    await ctx.db.patch(row._id, { until, kind: a.kind, ...(row.letGoAt !== undefined ? { letGoAt: undefined, since: now } : {}) });
    return row._id;
  }
  const id = await ctx.db.insert("leases", { ...a, since: now, until, settleAt: until });
  await ctx.scheduler.runAt(until, internal.leases.settle, { leaseId: id, at: until });
  return id;
}

/** Let go: the hold ends after a short grace, then whatever waited on it lands. */
export async function letGoThing(ctx: MutationCtx, spaceId: Id<"spaces">, thing: string, userId: string) {
  const row = await mine(ctx, spaceId, thing, userId);
  if (!row || row.letGoAt !== undefined) return false;
  const now = Date.now();
  const at = now + (row.kind === "piece" ? PIECE_GRACE_MS : row.kind === "drag" ? DRAG_GRACE_MS : GRACE_MS);
  await ctx.db.patch(row._id, { letGoAt: now, until: at, settleAt: at });
  await ctx.scheduler.runAt(at, internal.leases.settle, { leaseId: row._id, at });
  return true;
}

const who = { spaceId: v.id("spaces"), thing: v.string(), userId: v.string() };

export const hold = mutation({
  args: { ...who, kind: v.union(v.literal("drag"), v.literal("type"), v.literal("vote")), name: v.string(), color: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    // a card in this room only
    const id = ctx.db.normalizeId("widgets", a.thing);
    const w = id && (await ctx.db.get(id));
    if (!w || w.spaceId !== a.spaceId) return null;
    // a hold is always the caller's own: a hand "by Holly" can't be faked to stall the space
    const me = await seatOf(ctx, a.spaceId);
    if (!me) return null;
    await holdThing(ctx, { ...a, userId: me.userId, name: me.name, color: me.color || a.color });
    return null;
  },
});

export const letGo = mutation({
  args: who,
  returns: v.null(),
  handler: async (ctx, { spaceId, thing }) => {    const me = await seatOf(ctx, spaceId);
    if (me) await letGoThing(ctx, spaceId, thing, me.userId);
    return null;
  },
});

/** The one clock per lease: once `until` has passed, the lease is gone and its waiting writes land. */
export const settle = internalMutation({
  args: { leaseId: v.id("leases"), at: v.number() },
  returns: v.null(),
  handler: async (ctx, { leaseId, at }) => {
    const row = await ctx.db.get(leaseId);
    // a newer clock owns it (a letGo rescheduled it)
    if (!row || row.settleAt !== at) return null;
    const now = Date.now();
    if (row.until > now) {
      await ctx.db.patch(leaseId, { settleAt: row.until });
      await ctx.scheduler.runAt(row.until, internal.leases.settle, { leaseId, at: row.until });
      return null;
    }
    await ctx.db.delete(leaseId);
    await landWaiting(ctx, row.spaceId, row.thing, { name: row.name, letGoAt: row.letGoAt ?? null, expired: row.letGoAt === undefined });
    return null;
  },
});

/** Every screen's view of who holds what (no `until`, so a renewal sends nothing new). */
export const forRoom = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ thing: v.string(), kind: v.string(), userId: v.string(), name: v.string(), color: v.string(), since: v.number(), letGoAt: v.optional(v.number()) })),
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db.query("leases").withIndex("by_thing", (q) => q.eq("spaceId", spaceId)).take(64);
    return rows
      .filter((l) => !l.thing.startsWith("piece:"))
      .map((l) => ({ thing: l.thing, kind: l.kind, userId: l.userId, name: l.name, color: l.color, since: l.since, ...(l.letGoAt !== undefined ? { letGoAt: l.letGoAt } : {}) }));
  },
});
