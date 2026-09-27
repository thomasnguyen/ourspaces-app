import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * What the envelope on the canvas watches (docs/mail-arrival.md). One row per
 * inbound email, newest first, bounded to the last couple of minutes by the
 * client's `since` (queries must not read the clock). The body never leaves
 * the server: the arrival needs a sender, a subject, the verdict, the reason
 * and the three timestamps — the widget carries the rest.
 */
export const recentInbound = query({
  args: { spaceId: v.id("spaces"), since: v.number() },
  returns: v.array(
    v.object({
      id: v.id("emailEvents"),
      from: v.string(),
      subject: v.string(),
      createdAt: v.number(),
      readingAt: v.optional(v.number()),
      label: v.optional(v.string()),
      because: v.optional(v.string()),
      widgetId: v.optional(v.id("widgets")),
      repliedAt: v.optional(v.number()),
      hasDocument: v.boolean(),
    }),
  ),
  handler: async (ctx, { spaceId, since }) => {
    const rows = await ctx.db
      .query("emailEvents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", since))
      .order("desc")
      .take(12);
    return rows
      .filter((row) => row.direction === "in")
      .map((row) => ({
        id: row._id,
        from: row.from,
        subject: row.subject,
        createdAt: row.createdAt,
        readingAt: row.readingAt,
        label: row.label,
        because: row.because,
        widgetId: row.widgetId,
        repliedAt: row.repliedAt,
        hasDocument: (row.attachments?.length ?? 0) > 0,
      }));
  },
});
