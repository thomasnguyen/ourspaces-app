import { internalMutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "./_generated/api";

const PRESENCE_TTL_MS = 30_000;
// Upper bound on the presence rows the live counter will scan. The read is
// already bounded by the by_updated range (only rows fresher than the TTL),
// so this is belt-and-braces against a stalled sweep.
const MAX_PRESENCE_SCAN = 1000;

// sharded-counter: global live totals for the landing "live backend" widget.
// Every session across every space can create a widget/message/space at
// once — a single counter document would serialize those concurrent writes,
// so each key is sharded across several documents.
const counters = new ShardedCounter(components.shardedCounter, {
  shards: { spaces: 4, widgets: 8, messages: 16 },
});
export const spacesCounter = counters.for("spaces");
export const widgetsCounter = counters.for("widgets");
export const messagesCounter = counters.for("messages");

type LiveTotals = { spaces: number; widgets: number; messages: number };

/** The three global totals, read from the sharded counters. 28 shard
 *  documents (4 + 8 + 16) per read, which is why `getLiveTotals` below takes
 *  NO clock argument — see the comment there. */
async function readTotals(ctx: QueryCtx): Promise<LiveTotals> {
  const [spaces, widgets, messages] = await Promise.all([
    spacesCounter.count(ctx),
    widgetsCounter.count(ctx),
    messagesCounter.count(ctx),
  ]);
  return { spaces, widgets, messages };
}

/** How many cursors are fresh right now. Reads the `by_updated` range rather
 *  than the table: a `.take()` over the whole table makes the caller's read
 *  set EVERY presence row, so every cursor heartbeat in the app invalidated
 *  it — and whatever else that query happened to read came along for the
 *  ride. take() stays as a guard if a sweep is missed. */
async function readHereNow(ctx: QueryCtx, now: number): Promise<number> {
  const staleBefore = now - PRESENCE_TTL_MS;
  const fresh = await ctx.db
    .query("presence")
    .withIndex("by_updated", (q) => q.gte("updatedAt", staleBefore))
    .take(MAX_PRESENCE_SCAN);
  return Math.max(fresh.length, 1);
}

/**
 * The totals, with no clock argument — and that is the whole point.
 *
 * These three numbers were the app's largest single consumer of database
 * bandwidth (1.30 GB of 1.47 GB in Sep 2026), for two compounding reasons.
 * They were bundled with "here now" into one query that took a `now` bucket,
 * so a fresh cache key every 15s forced the 28 shard reads to re-execute four
 * times a minute per visitor, forever, whether or not a single thing had been
 * created. And that same query scanned the presence table, so every cursor
 * heartbeat invalidated it and dragged the shard reads through another run.
 *
 * Argument-free, this is cached until a counter actually moves — which is
 * exactly when the number on screen should change.
 */
export const getLiveTotals = query({
  args: {},
  returns: v.object({
    spaces: v.number(),
    widgets: v.number(),
    messages: v.number(),
  }),
  handler: async (ctx): Promise<LiveTotals> => await readTotals(ctx),
});

/** "here now" — the one count that genuinely needs the clock, kept apart from
 *  the totals so the expensive half doesn't re-run on its cadence. */
export const getHereNow = query({
  args: { now: v.number() },
  returns: v.number(),
  handler: async (ctx, { now }) => await readHereNow(ctx, now),
});

/**
 * Legacy shape: the totals and "here now" in one array.
 *
 * Superseded by getLiveTotals + getHereNow (see above) and kept ONLY because
 * a deployed bundle is still calling it — removing it would break the live
 * site until the frontend is redeployed. Delete it once prod is on a build
 * that uses the split pair; nothing in src/ calls it any more.
 */
export const getLiveCounts = query({
  // `now` is an argument, not Date.now() in the handler. A query is cached
  // against its args, so a clock read inside would freeze at whatever the
  // first caller saw and never tick. Passing a coarse bucket keeps the
  // function deterministic and lets the cache turn over on a known cadence.
  args: { now: v.number() },
  returns: v.object({
    counts: v.array(v.object({ label: v.string(), value: v.number() })),
  }),
  handler: async (ctx, { now }) => {
    const [totals, hereNow] = await Promise.all([
      readTotals(ctx),
      readHereNow(ctx, now),
    ]);
    return {
      counts: [
        { label: "spaces", value: totals.spaces },
        { label: "widgets", value: totals.widgets },
        { label: "messages", value: totals.messages },
        { label: "here now", value: hereNow },
      ],
    };
  },
});

/** One-time init: point the sharded counters at the true current totals. */
export const initCounters = internalMutation({
  args: {},
  returns: v.object({ spaces: v.number(), widgets: v.number(), messages: v.number() }),
  handler: async (ctx) => {
    const [spaces, widgets, messages] = await Promise.all([
      ctx.db.query("spaces").collect(),
      ctx.db.query("widgets").collect(),
      ctx.db.query("messages").collect(),
    ]);
    await spacesCounter.reset(ctx);
    await spacesCounter.add(ctx, spaces.length);
    await widgetsCounter.reset(ctx);
    await widgetsCounter.add(ctx, widgets.length);
    await messagesCounter.reset(ctx);
    await messagesCounter.add(ctx, messages.length);
    return { spaces: spaces.length, widgets: widgets.length, messages: messages.length };
  },
});
