import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";

// aggregate mirror: per-option vote tallies, namespaced by poll widget.
// O(log n) counts instead of collecting every vote row to count them.
export const pollTallies = new TableAggregate<{
  Namespace: Id<"widgets">;
  Key: string;
  DataModel: DataModel;
  TableName: "votes";
}>(components.pollTallies, {
  namespace: (doc) => doc.widgetId,
  sortKey: (doc) => doc.optionId,
});

export const getTallyCounts = query({
  args: { widgetId: v.id("widgets"), optionIds: v.array(v.string()) },
  returns: v.array(v.object({ optionId: v.string(), count: v.number() })),
  handler: async (ctx, { widgetId, optionIds }) => {
    const counts = await pollTallies.countBatch(
      ctx,
      optionIds.map((optionId) => ({ namespace: widgetId, bounds: { eq: optionId } })),
    );
    return optionIds.map((optionId, index) => ({ optionId, count: counts[index] }));
  },
});

export const getResults = query({
  args: { widgetId: v.id("widgets") },
  returns: v.array(schema.doc("votes").extend({ voterName: v.string() })),
  handler: async (ctx, { widgetId }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget) return [];

    const [votes, members] = await Promise.all([
      ctx.db
        .query("votes")
        .withIndex("by_widget", (q) => q.eq("widgetId", widgetId))
        .collect(),
      ctx.db
        .query("members")
        .withIndex("by_space", (q) => q.eq("spaceId", widget.spaceId))
        .collect(),
    ]);
    const memberNames = new Map(
      members.map((member) => [member.userId, member.name]),
    );

    return votes.map((vote) => ({
      ...vote,
      voterName: memberNames.get(vote.userId) ?? "Guest",
    }));
  },
});

export const vote = mutation({
  args: {
    widgetId: v.id("widgets"),
    userId: v.string(),
    optionId: v.string(),
  },
  returns: v.id("votes"),
  handler: async (ctx, { widgetId, userId, optionId }) => {
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_widget_user", (q) =>
        q.eq("widgetId", widgetId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { optionId });
      await pollTallies.replace(ctx, existing, { ...existing, optionId });
      return existing._id;
    }

    const id = await ctx.db.insert("votes", { widgetId, userId, optionId });
    const doc = await ctx.db.get(id);
    await pollTallies.insert(ctx, doc!);
    return id;
  },
});
