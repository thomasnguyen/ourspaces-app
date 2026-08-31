import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "./_generated/api";

const PRESENCE_TTL_MS = 30_000;

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

/** Live counts for the build club "live backend" widget. */
export const getLiveCounts = query({
  args: {},
  returns: v.object({
    counts: v.array(v.object({ label: v.string(), value: v.number() })),
  }),
  handler: async (ctx) => {
    const [spaces, widgets, messages, presence] = await Promise.all([
      spacesCounter.count(ctx),
      widgetsCounter.count(ctx),
      messagesCounter.count(ctx),
      ctx.db.query("presence").collect(),
    ]);

    const staleBefore = Date.now() - PRESENCE_TTL_MS;
    const hereNow = presence.filter((row) => row.updatedAt >= staleBefore).length;

    return {
      counts: [
        { label: "spaces", value: spaces },
        { label: "widgets", value: widgets },
        { label: "messages", value: messages },
        { label: "here now", value: Math.max(hereNow, 1) },
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
