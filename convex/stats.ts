import { query } from "./_generated/server";
import { v } from "convex/values";

const PRESENCE_TTL_MS = 30_000;

/** Aggregate counts for the build club "live backend" widget. */
export const getLiveCounts = query({
  args: {},
  returns: v.object({
    counts: v.array(v.object({ label: v.string(), value: v.number() })),
  }),
  handler: async (ctx) => {
    const [spaces, widgets, messages, presence] = await Promise.all([
      ctx.db.query("spaces").collect(),
      ctx.db.query("widgets").collect(),
      ctx.db.query("messages").collect(),
      ctx.db.query("presence").collect(),
    ]);

    const staleBefore = Date.now() - PRESENCE_TTL_MS;
    const hereNow = presence.filter((row) => row.updatedAt >= staleBefore).length;

    return {
      counts: [
        { label: "spaces", value: spaces.length },
        { label: "widgets", value: widgets.length },
        { label: "messages", value: messages.length },
        { label: "here now", value: Math.max(hereNow, 1) },
      ],
    };
  },
});
