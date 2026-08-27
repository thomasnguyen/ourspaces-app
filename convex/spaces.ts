import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { schema } from "./schema";

export const listSpaces = query({
  args: {},
  returns: v.array(schema.doc("spaces")),
  handler: async (ctx) => await ctx.db.query("spaces").order("desc").take(50),
});

export const getSpace = query({
  args: { id: v.id("spaces") },
  returns: v.union(schema.doc("spaces"), v.null()),
  handler: async (ctx, args) => (await ctx.db.get(args.id)) ?? null,
});

export const createSpace = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("ongoing"), v.literal("event")),
    icon: v.string(),
    color: v.string(),
    eventAt: v.optional(v.number()),
  },
  returns: v.id("spaces"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("spaces", { ...args, createdAt: now, lastActivityAt: now });
  },
});
