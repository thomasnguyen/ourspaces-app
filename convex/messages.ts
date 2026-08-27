import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listMessages = query({
  args: { spaceId: v.id("spaces"), widgetId: v.string() },
  handler: async (ctx, { spaceId, widgetId }) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_space_widget", (q) => q.eq("spaceId", spaceId).eq("widgetId", widgetId))
      .order("asc")
      .collect();
  },
});

export const listBySpace = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) =>
    await ctx.db.query("messages").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("asc").collect(),
});

export const sendMessage = mutation({
  args: {
    spaceId: v.id("spaces"),
    widgetId: v.string(),
    userId: v.string(),
    text: v.string(),
    authorName: v.string(),
    authorColor: v.string(),
    authorEmoji: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) return null;

    return await ctx.db.insert("messages", {
      ...args,
      text,
      createdAt: Date.now(),
    });
  },
});

/** The demo climax: one chat row becomes a persistent canvas note. */
export const promoteMessage = mutation({
  args: {
    messageId: v.id("messages"),
    userId: v.string(),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, { messageId, userId, x, y }) => {
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message not found");

    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", message.spaceId))
      .collect();
    const existing = widgets.find(
      (widget) =>
        widget.type === "decision" &&
        widget.data?.promotedFromMessageId === messageId,
    );

    if (existing) return existing._id;

    const highestZ = widgets.reduce(
      (highest, widget) => Math.max(highest, widget.z),
      0,
    );

    return await ctx.db.insert("widgets", {
      spaceId: message.spaceId,
      type: "decision",
      x,
      y,
      w: 280,
      h: 190,
      z: highestZ + 1,
      data: {
        title: "decision made",
        detail: message.text,
        author: message.authorName,
        source: "promoted from chat",
        tone: "lime",
        promotedFromMessageId: messageId,
      },
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});
