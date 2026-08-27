import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { schema } from "./schema";

export const listMessages = query({
  args: { spaceId: v.id("spaces"), widgetId: v.id("widgets") },
  returns: v.array(schema.doc("messages")),
  handler: async (ctx, args) => await ctx.db.query("messages").withIndex("by_space_widget", (q) => q.eq("spaceId", args.spaceId).eq("widgetId", args.widgetId)).take(200),
});

export const sendMessage = mutation({
  args: { spaceId: v.id("spaces"), widgetId: v.id("widgets"), userId: v.string(), text: v.string(), authorName: v.string(), authorColor: v.string() },
  returns: v.id("messages"),
  handler: async (ctx, args) => await ctx.db.insert("messages", { ...args, text: args.text.trim(), createdAt: Date.now() }),
});

export const promoteMessage = mutation({
  args: { messageId: v.id("messages") },
  returns: v.union(v.id("widgets"), v.null()),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;
    if (message.promotedWidgetId) return message.promotedWidgetId;
    const chat = await ctx.db.get(message.widgetId);
    if (!chat) return null;
    const widgetId = await ctx.db.insert("widgets", {
      spaceId: message.spaceId, type: "note", x: chat.x + chat.w + 36, y: chat.y + 40, w: 300, h: 190, z: chat.z + 3,
      data: { text: message.text, authorName: message.authorName, promoted: true, rotation: message._creationTime % 2 === 0 ? -2 : 2, tone: "crew", kicker: "saved from chat" },
      createdBy: message.userId, createdAt: Date.now(),
    });
    await ctx.db.patch(message._id, { promotedWidgetId: widgetId });
    return widgetId;
  },
});
