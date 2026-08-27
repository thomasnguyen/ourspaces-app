import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const vote = mutation({
  args: { widgetId: v.id("widgets"), userId: v.string(), optionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.query("votes").withIndex("by_widget_user", (q) => q.eq("widgetId", args.widgetId).eq("userId", args.userId)).unique();
    if (current) await ctx.db.patch(current._id, { optionId: args.optionId });
    else await ctx.db.insert("votes", args);
    return null;
  },
});

export const pollResults = query({
  args: { widgetId: v.id("widgets"), userId: v.optional(v.string()) },
  returns: v.object({ results: v.record(v.string(), v.object({ count: v.number(), voterNames: v.array(v.string()) })), currentOptionId: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget) return { results: {}, currentOptionId: null };
    const votes = await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", args.widgetId)).take(200);
    const results: Record<string, { count: number; voterNames: string[] }> = {};
    for (const vote of votes) {
      const result = results[vote.optionId] ?? { count: 0, voterNames: [] };
      result.count += 1;
      const member = await ctx.db
        .query("members")
        .withIndex("by_space_user", (q) => q.eq("spaceId", widget.spaceId).eq("userId", vote.userId))
        .unique();
      if (member) result.voterNames.push(member.name);
      results[vote.optionId] = result;
    }
    const currentVote = args.userId
      ? await ctx.db.query("votes").withIndex("by_widget_user", (q) => q.eq("widgetId", args.widgetId).eq("userId", args.userId!)).unique()
      : null;
    return { results, currentOptionId: currentVote?.optionId ?? null };
  },
});
