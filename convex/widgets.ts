import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { schema } from "./schema";

export const listWidgets = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(schema.doc("widgets")),
  handler: async (ctx, args) =>
    await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", args.spaceId)).take(200),
});

export const createWidget = mutation({
  args: {
    spaceId: v.id("spaces"), type: v.string(), x: v.number(), y: v.number(), w: v.number(), h: v.number(), z: v.number(),
    data: v.any(), createdBy: v.string(),
  },
  returns: v.id("widgets"),
  handler: async (ctx, args) => await ctx.db.insert("widgets", { ...args, createdAt: Date.now() }),
});

export const moveWidget = mutation({
  args: { id: v.id("widgets"), x: v.number(), y: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { x: Math.max(0, args.x), y: Math.max(0, args.y) });
    return null;
  },
});

export const resizeWidget = mutation({
  args: { id: v.id("widgets"), w: v.number(), h: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { w: Math.max(140, args.w), h: Math.max(100, args.h) });
    return null;
  },
});

export const bringToFront = mutation({
  args: { id: v.id("widgets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.id);
    if (!widget) return null;
    const widgets = await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", widget.spaceId)).take(200);
    await ctx.db.patch(args.id, { z: Math.max(...widgets.map((item) => item.z), 0) + 1 });
    return null;
  },
});

export const updateWidgetData = mutation({
  args: { id: v.id("widgets"), data: v.any() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { data: args.data });
    return null;
  },
});
