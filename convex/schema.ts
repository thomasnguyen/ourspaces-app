import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const schema = defineSchema({
  spaces: defineTable({
    name: v.string(),
    type: v.union(v.literal("ongoing"), v.literal("event")),
    icon: v.string(),
    color: v.string(),
    createdAt: v.number(),
    lastActivityAt: v.number(),
    eventAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
  }).index("by_name", ["name"]),
  members: defineTable({
    spaceId: v.id("spaces"),
    userId: v.string(),
    name: v.string(),
    color: v.string(),
    lastSeen: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_user", ["spaceId", "userId"]),
  widgets: defineTable({
    spaceId: v.id("spaces"),
    type: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    data: v.any(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_space", ["spaceId"]),
  messages: defineTable({
    spaceId: v.id("spaces"),
    widgetId: v.id("widgets"),
    userId: v.string(),
    text: v.string(),
    createdAt: v.number(),
    authorName: v.string(),
    authorColor: v.string(),
    authorAvatarUrl: v.optional(v.string()),
    promotedWidgetId: v.optional(v.id("widgets")),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_widget", ["spaceId", "widgetId"])
    .index("by_widget", ["widgetId"]),
  votes: defineTable({
    widgetId: v.id("widgets"),
    userId: v.string(),
    optionId: v.string(),
  })
    .index("by_widget", ["widgetId"])
    .index("by_widget_user", ["widgetId", "userId"]),
  presence: defineTable({
    spaceId: v.id("spaces"),
    userId: v.string(),
    x: v.number(),
    y: v.number(),
    updatedAt: v.number(),
    name: v.string(),
    color: v.string(),
    avatarUrl: v.optional(v.string()),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_user", ["spaceId", "userId"])
    .index("by_space_updated_at", ["spaceId", "updatedAt"])
    .index("by_updated_at", ["updatedAt"]),
});

export default schema;
