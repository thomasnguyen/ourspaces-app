import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { widgetDataValidator, type PotluckData } from "./widgetData";
import schema from "./schema";
import { widgetsCounter } from "./stats";

/** Drives the canvas — every widget in a space, rendered by type (PRD §11). */
export const listWidgets = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(schema.doc("widgets")),
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
    data: widgetDataValidator,
    createdBy: v.string(),
    rotate: v.optional(v.number()),
  },
  returns: v.id("widgets"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("widgets", { ...args, createdAt: Date.now() });
    await widgetsCounter.inc(ctx);
    return id;
  },
});

/** Committed on drop, optimistic on the client (PRD §11). */

/**
 * Load a widget only if it really belongs to the space the caller claims to be
 * editing. Widget ids are handed to every client on the canvas, so without
 * this a client in one space can patch or delete a widget in another simply by
 * holding its id. `paint.addStroke` and `presence.claimGesture` already scope
 * their writes this way; these mutations did not.
 *
 * Not an ownership check — showcase spaces stay world-writable for guests by
 * design (docs/data-model-plan.md §1). This only keeps a write inside the
 * space it was aimed at.
 */
async function widgetInSpace(
  ctx: MutationCtx,
  widgetId: Id<"widgets">,
  spaceId: Id<"spaces">,
) {
  const widget = await ctx.db.get(widgetId);
  if (!widget || widget.spaceId !== spaceId) return null;
  return widget;
}

export const moveWidget = mutation({
  args: {
    id: v.id("widgets"),
    spaceId: v.id("spaces"),
    x: v.number(),
    y: v.number(),
    z: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { id, spaceId, x, y, z }) => {
    if (!(await widgetInSpace(ctx, id, spaceId))) return null;
    await ctx.db.patch(id, z === undefined ? { x, y } : { x, y, z });
    return null;
  },
});

export const deleteWidget = mutation({
  args: { id: v.id("widgets"), spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, { id, spaceId }) => {
    if (!(await widgetInSpace(ctx, id, spaceId))) return null;
    await ctx.db.delete(id);
    await widgetsCounter.dec(ctx);
    return null;
  },
});

export const claimItem = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    itemName: v.string(),
    claimantName: v.string(),
    claimantUserId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const widget = await widgetInSpace(ctx, args.widgetId, args.spaceId);
    if (!widget) return null;
    const potluckData = widget.data as PotluckData;
    const items = Array.isArray(potluckData?.items) ? potluckData.items : [];
    const nextItems = items.map((item) => {
      if (item.name !== args.itemName) return item;
      if (item.claimed && item.byUserId === args.claimantUserId) {
        const { byUserId: _byUserId, by: _by, claimed: _claimed, ...rest } = item;
        return { ...rest, claimed: false };
      }
      return { ...item, claimed: true, by: args.claimantName, byUserId: args.claimantUserId };
    });
    await ctx.db.patch(widget._id, { data: { ...potluckData, items: nextItems } });
    return null;
  },
});

/** Merge only the wheel outcome so remote clients animate from the same data. */
export const spinWheel = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    spinNonce: v.number(),
    resultIndex: v.number(),
    spunBy: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { widgetId, spaceId, ...spin }) => {
    const widget = await widgetInSpace(ctx, widgetId, spaceId);
    if (!widget) return null;
    await ctx.db.patch(widget._id, { data: { ...widget.data, ...spin } });
    return null;
  },
});

/** Room radio station + who started it. Audio itself stays local. */
export const tuneRadio = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    stationId: v.string(),
    playing: v.boolean(),
    playedBy: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { widgetId, spaceId, ...tune }) => {
    const widget = await widgetInSpace(ctx, widgetId, spaceId);
    if (!widget) return null;
    await ctx.db.patch(widget._id, { data: { ...widget.data, ...tune } });
    return null;
  },
});

export const resizeWidget = mutation({
  args: {
    id: v.id("widgets"),
    spaceId: v.id("spaces"),
    w: v.number(),
    h: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { id, spaceId, w, h }) => {
    if (!(await widgetInSpace(ctx, id, spaceId))) return null;
    await ctx.db.patch(id, { w, h });
    return null;
  },
});

export const updateWidgetData = mutation({
  args: {
    id: v.id("widgets"),
    spaceId: v.id("spaces"),
    data: widgetDataValidator,
  },
  returns: v.null(),
  handler: async (ctx, { id, spaceId, data }) => {
    if (!(await widgetInSpace(ctx, id, spaceId))) return null;
    await ctx.db.patch(id, { data });
    return null;
  },
});
