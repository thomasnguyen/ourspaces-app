import { v } from "convex/values";
import { query } from "./_generated/server";

export const pollResults = query({
  args: { widgetId: v.id("widgets") },
  returns: v.record(v.string(), v.object({ count: v.number(), voterNames: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget) return {};
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
    return results;
  },
});
