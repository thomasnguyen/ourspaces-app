import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";

const tone = v.union(
  v.literal("berry"),
  v.literal("orange"),
  v.literal("blue"),
  v.literal("violet"),
  v.literal("teal"),
  v.literal("lime"),
);

export const listBySpace = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(schema.doc("paintMarks")),
  handler: async (ctx, { spaceId }) => {
    const recent = await ctx.db
      .query("paintMarks")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(240);
    return recent.reverse();
  },
});

export const addStroke = mutation({
  args: {
    spaceId: v.id("spaces"),
    widgetId: v.id("widgets"),
    userId: v.string(),
    authorName: v.string(),
    authorColor: v.string(),
    tone,
    size: v.number(),
    points: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  returns: v.union(v.id("paintMarks"), v.null()),
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || widget.spaceId !== args.spaceId || widget.type !== "cozyColor") {
      return null;
    }
    return await ctx.db.insert("paintMarks", {
      ...args,
      points: args.points.slice(0, 256),
      size: Math.min(0.08, Math.max(0.015, args.size)),
      createdAt: Date.now(),
    });
  },
});

export const clear = mutation({
  args: {
    spaceId: v.id("spaces"),
    widgetId: v.id("widgets"),
  },
  returns: v.number(),
  handler: async (ctx, { spaceId, widgetId }) => {
    const marks = await ctx.db
      .query("paintMarks")
      .withIndex("by_space_and_widget", (q) =>
        q.eq("spaceId", spaceId).eq("widgetId", widgetId),
      )
      .take(400);
    for (const mark of marks) await ctx.db.delete(mark._id);
    return marks.length;
  },
});

/** Adds the demo widget to already-seeded couple rooms without wiping the room. */
export const ensureCozyColorWidget = mutation({
  args: {
    spaceId: v.id("spaces"),
    createdBy: v.string(),
  },
  returns: v.id("widgets"),
  handler: async (ctx, { spaceId, createdBy }) => {
    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .take(100);
    await ctx.db.patch(spaceId, { canvasW: 1260, canvasH: 980 });
    for (const widget of widgets) {
      if (widget.type === "note" && String(widget.data?.text ?? "").includes("airport pickup")) {
        await ctx.db.patch(widget._id, { x: 650, y: 600 });
      }
      if (widget.type === "quote" && String(widget.data?.text ?? "").includes("same moon")) {
        await ctx.db.patch(widget._id, { x: 956, y: 602, w: 250 });
      }
      if (widget.type === "sticker" && widget.data?.stickerId === "double-smile") {
        await ctx.db.patch(widget._id, { x: 1032, y: 782 });
      }
    }
    const existing = widgets.find((widget) => widget.type === "cozyColor");
    if (existing) return existing._id;

    return await ctx.db.insert("widgets", {
      spaceId,
      type: "cozyColor",
      x: 630,
      y: 52,
      w: 560,
      h: 500,
      z: 4,
      data: {
        title: "same moon, both windows",
        src: "/assets/cozy-color-same-moon.png",
      },
      createdBy,
      createdAt: Date.now(),
    });
  },
});
