import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { schema } from "./schema";

export const updatePresence = mutation({
  args: { spaceId: v.id("spaces"), userId: v.string(), x: v.number(), y: v.number(), name: v.string(), color: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.query("presence").withIndex("by_space_user", (q) => q.eq("spaceId", args.spaceId).eq("userId", args.userId)).unique();
    const updatedAt = Date.now();
    if (current) await ctx.db.patch(current._id, { ...args, updatedAt });
    else await ctx.db.insert("presence", { ...args, updatedAt });
    return null;
  },
});

export const listPresence = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(schema.doc("presence")),
  handler: async (ctx, args) => await ctx.db.query("presence").withIndex("by_space_updated_at", (q) => q.eq("spaceId", args.spaceId).gt("updatedAt", Date.now() - 10_000)).take(100),
});

export const clearStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const stale = await ctx.db.query("presence").withIndex("by_updated_at", (q) => q.lt("updatedAt", Date.now() - 30_000)).take(200);
    for (const cursor of stale) await ctx.db.delete(cursor._id);
    return stale.length;
  },
});
