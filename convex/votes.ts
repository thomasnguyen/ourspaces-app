import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import schema from "./schema";

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
      return existing._id;
    }

    return await ctx.db.insert("votes", { widgetId, userId, optionId });
  },
});
