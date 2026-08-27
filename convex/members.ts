import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { schema } from "./schema";

export const joinSpace = mutation({
  args: { spaceId: v.id("spaces"), userId: v.string(), name: v.string(), color: v.string() },
  returns: v.id("members"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("members").withIndex("by_space_user", (q) => q.eq("spaceId", args.spaceId).eq("userId", args.userId)).unique();
    const lastSeen = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, color: args.color, lastSeen });
      return existing._id;
    }
    return await ctx.db.insert("members", { ...args, lastSeen });
  },
});

export const listMembers = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(schema.doc("members")),
  handler: async (ctx, args) => await ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", args.spaceId)).take(100),
});
