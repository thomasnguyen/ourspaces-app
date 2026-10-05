import { mutation, query } from "./_generated/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import schema from "./schema";
import type { DecisionData } from "./widgetData";
import { messagesCounter, widgetsCounter } from "./stats";
import { touchSpace } from "./activity";
import { canRead, seatOf } from "./seat";

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
    if (!(await canRead(ctx, spaceId))) return { page: [], isDone: true, continueCursor: "" };
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
  handler: async (ctx, { spaceId, paginationOpts }) => {
    if (!(await canRead(ctx, spaceId))) return { page: [], isDone: true, continueCursor: "" };
    return await ctx.db
      .query("messages")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("asc")
      .paginate(paginationOpts);
  },
});

// Full-text search over a space's chat history — the "search_text" index
// scores by the "text" field, scoped to one space via the filter field.
export const search = query({
  args: { spaceId: v.id("spaces"), query: v.string() },
  returns: v.array(messageValidator),
  handler: async (ctx, { spaceId, query: text }) => {
    if (!text.trim() || !(await canRead(ctx, spaceId))) return [];
    return await ctx.db
      .query("messages")
      .withSearchIndex("search_text", (q) => q.search("text", text).eq("spaceId", spaceId))
      .take(20);
  },
});

/** Said as the caller's own seat (S3): the author fields a screen sends are ignored; no seat, no message. */
export const sendMessage = mutation({
  args: {
    spaceId: v.id("spaces"),
    widgetId: v.string(),
    text: v.string(),
    // Ignored (the seat says who): kept so older screens still validate.
    userId: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorColor: v.optional(v.string()),
    authorEmoji: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
  },
  returns: v.union(v.id("messages"), v.null()),
  handler: async (ctx, args) => {
    const text = args.text.trim().slice(0, 4000);
    if (!text) return null;
    const me = await seatOf(ctx, args.spaceId);
    if (!me) return null;

    const now = Date.now();
    const id = await ctx.db.insert("messages", {
      spaceId: args.spaceId,
      widgetId: args.widgetId,
      userId: me.userId,
      text,
      authorName: me.name,
      authorColor: me.color,
      ...(me.emoji ? { authorEmoji: me.emoji } : {}),
      ...(me.avatarUrl ? { authorAvatarUrl: me.avatarUrl } : {}),
      createdAt: now,
    });
    await messagesCounter.inc(ctx);
    await touchSpace(ctx, args.spaceId, now);
    return id;
  },
});

/** The demo climax: one chat row becomes a persistent canvas note. */
export const promoteMessage = mutation({
  args: {
    messageId: v.id("messages"),
    spaceId: v.id("spaces"),
    /** Ignored: the note's maker is the caller's seat (S3). */
    userId: v.optional(v.string()),
    x: v.number(),
    y: v.number(),
  },
  returns: v.union(v.id("widgets"), v.null()),
  handler: async (ctx, { messageId, spaceId, x, y }) => {
    const me = await seatOf(ctx, spaceId);
    if (!me) return null;
    const userId = me.userId;
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message not found");
    // listBySpace is public and returns message ids for any space, so without
    // this an outsider could plant a "decision" widget on another canvas.
    if (message.spaceId !== spaceId) return null;

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

    const now = Date.now();
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
      createdAt: now,
    });
    await widgetsCounter.inc(ctx);
    await touchSpace(ctx, message.spaceId, now);
    return id;
  },
});
