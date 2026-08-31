import { mutation, query } from "./_generated/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import schema from "./schema";
import type { DecisionData } from "./widgetData";
import { messagesCounter, widgetsCounter } from "./stats";

const messageValidator = schema.doc("messages");

// Indexed + paginated: the "by_space_widget" scan is bounded per page
// instead of an unbounded `.collect()` over a chat widget's full history.
export const listMessages = query({
  args: {
    spaceId: v.id("spaces"),
    widgetId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, { spaceId, widgetId, paginationOpts }) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_space_widget", (q) => q.eq("spaceId", spaceId).eq("widgetId", widgetId))
      .order("asc")
      .paginate(paginationOpts);
  },
});

export const listBySpace = query({
  args: { spaceId: v.id("spaces"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, { spaceId, paginationOpts }) =>
    await ctx.db
      .query("messages")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("asc")
      .paginate(paginationOpts),
});

// Full-text search over a space's chat history — the "search_text" index
// scores by the "text" field, scoped to one space via the filter field.
export const search = query({
  args: { spaceId: v.id("spaces"), query: v.string() },
  returns: v.array(messageValidator),
  handler: async (ctx, { spaceId, query: text }) => {
    if (!text.trim()) return [];
    return await ctx.db
      .query("messages")
      .withSearchIndex("search_text", (q) => q.search("text", text).eq("spaceId", spaceId))
      .take(20);
  },
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
  returns: v.union(v.id("messages"), v.null()),
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) return null;

    const id = await ctx.db.insert("messages", {
      ...args,
      text,
      createdAt: Date.now(),
    });
    await messagesCounter.inc(ctx);
    return id;
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
  returns: v.id("widgets"),
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
        (widget.data as DecisionData).promotedFromMessageId === messageId,
    );

    if (existing) return existing._id;

    const highestZ = widgets.reduce(
      (highest, widget) => Math.max(highest, widget.z),
      0,
    );

    const id = await ctx.db.insert("widgets", {
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
    await widgetsCounter.inc(ctx);
    return id;
  },
});
