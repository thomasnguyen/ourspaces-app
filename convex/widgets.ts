import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Drives the canvas — every widget in a space, rendered by type (PRD §11). */
export const listWidgets = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    return await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
  },
});

export const createWidget = mutation({
  args: {
    spaceId: v.id("spaces"),
    type: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    data: v.any(),
    createdBy: v.string(),
    rotate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("widgets", { ...args, createdAt: Date.now() });
  },
});

/** Committed on drop, optimistic on the client (PRD §11). */
export const moveWidget = mutation({
  args: { id: v.id("widgets"), x: v.number(), y: v.number(), z: v.optional(v.number()) },
  handler: async (ctx, { id, x, y, z }) => {
    await ctx.db.patch(id, z === undefined ? { x, y } : { x, y, z });
  },
});

export const deleteWidget = mutation({
  args: { id: v.id("widgets") },
  handler: async (ctx, { id }) => ctx.db.delete(id),
});

export const claimItem = mutation({
  args: {
    widgetId: v.id("widgets"),
    itemName: v.string(),
    claimantName: v.string(),
    claimantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget) throw new Error("Widget not found");
    const items = Array.isArray(widget.data?.items) ? widget.data.items : [];
    const nextItems = items.map((item: Record<string, unknown>) => {
      if (item.name !== args.itemName) return item;
      if (item.claimed && item.byUserId === args.claimantUserId) {
        const { byUserId: _byUserId, by: _by, claimed: _claimed, ...rest } = item;
        return { ...rest, claimed: false, by: undefined, byUserId: undefined };
      }
      return { ...item, claimed: true, by: args.claimantName, byUserId: args.claimantUserId };
    });
    await ctx.db.patch(widget._id, { data: { ...widget.data, items: nextItems } });
  },
});

/** Merge only the wheel outcome so remote clients animate from the same data. */
export const spinWheel = mutation({
  args: {
    widgetId: v.id("widgets"),
    spinNonce: v.number(),
    resultIndex: v.number(),
    spunBy: v.string(),
  },
  handler: async (ctx, { widgetId, ...spin }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget) return;
    await ctx.db.patch(widget._id, { data: { ...widget.data, ...spin } });
  },
});

export const resizeWidget = mutation({
  args: { id: v.id("widgets"), w: v.number(), h: v.number() },
  handler: async (ctx, { id, w, h }) => {
    await ctx.db.patch(id, { w, h });
  },
});

export const updateWidgetData = mutation({
  args: { id: v.id("widgets"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await ctx.db.patch(id, { data });
  },
});
