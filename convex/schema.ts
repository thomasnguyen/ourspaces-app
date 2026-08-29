import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * OurSpaces data model — PRD §11.
 * Everything live flows through these reactive tables. Presence is ephemeral
 * and TTL'd. A "frame" is just a widget with type: "frame" — no extra table.
 */
export default defineSchema({
  spaces: defineTable({
    name: v.string(),
    // "ongoing" = evergreen relationship; "event" = time-bound (carries eventAt)
    type: v.union(v.literal("ongoing"), v.literal("event")),
    icon: v.string(),
    color: v.string(), // the saturated identity color — the card IS the color (§10)
    createdAt: v.number(),
    lastActivityAt: v.number(),
    eventAt: v.optional(v.number()), // event spaces only
    archivedAt: v.optional(v.number()), // settles into Past when set (§5.3)
    slug: v.optional(v.string()),
    canvasW: v.optional(v.number()),
    canvasH: v.optional(v.number()),
    tagline: v.optional(v.string()),
    inboxId: v.optional(v.string()), // AgentMail inbox — the space's own email
    inboxAddress: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_slug", ["slug"])
    .index("by_inbox", ["inboxId"]),

  // Every email the space sends or receives — feeds the activity log widget.
  emailEvents: defineTable({
    spaceId: v.id("spaces"),
    direction: v.union(v.literal("in"), v.literal("out")),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    summary: v.string(),
    widgetId: v.optional(v.id("widgets")),
    createdAt: v.number(),
  }).index("by_space", ["spaceId"]),

  members: defineTable({
    spaceId: v.id("spaces"),
    userId: v.string(), // anonymous auth identity
    name: v.string(),
    color: v.string(), // presence color, distinct per member
    emoji: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    lastSeen: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_user", ["spaceId", "userId"]),

  widgets: defineTable({
    spaceId: v.id("spaces"),
    // Open widget type string; the prototype union lives in src/data/types.ts.
    type: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    data: v.any(), // type-specific: countdown target, poll options, note text, frame title…
    createdBy: v.string(),
    createdAt: v.number(),
    rotate: v.optional(v.number()),
  }).index("by_space", ["spaceId"]),

  messages: defineTable({
    spaceId: v.id("spaces"),
    widgetId: v.string(), // "global" or the chat widget this belongs to
    userId: v.string(),
    text: v.string(),
    createdAt: v.number(),
    authorName: v.string(),
    authorColor: v.string(),
    authorEmoji: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    promotable: v.optional(v.boolean()),
    promotedWidgetId: v.optional(v.id("widgets")),
  }).index("by_widget", ["widgetId"])
    .index("by_space", ["spaceId"])
    .index("by_space_widget", ["spaceId", "widgetId"]),

  votes: defineTable({
    widgetId: v.id("widgets"),
    userId: v.string(),
    optionId: v.string(),
  })
    .index("by_widget", ["widgetId"])
    .index("by_widget_user", ["widgetId", "userId"]), // one vote per user

  paintMarks: defineTable({
    spaceId: v.id("spaces"),
    widgetId: v.id("widgets"),
    userId: v.string(),
    authorName: v.string(),
    authorColor: v.string(),
    tone: v.union(
      v.literal("berry"),
      v.literal("orange"),
      v.literal("blue"),
      v.literal("violet"),
      v.literal("teal"),
      v.literal("lime"),
    ),
    size: v.number(),
    points: v.array(v.object({ x: v.number(), y: v.number() })),
    regionId: v.optional(v.string()),
    preset: v.optional(v.union(v.literal("electric"), v.literal("sunset"))),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_and_widget", ["spaceId", "widgetId"]),

  presence: defineTable({
    spaceId: v.id("spaces"),
    userId: v.string(),
    x: v.number(),
    y: v.number(),
    updatedAt: v.number(), // stale rows cleared by a scheduled function
    name: v.string(),
    color: v.string(),
    emoji: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    gesture: v.optional(
      v.object({
        sessionId: v.string(),
        widgetId: v.id("widgets"),
        kind: v.union(v.literal("move"), v.literal("resize")),
        x: v.number(),
        y: v.number(),
        w: v.number(),
        h: v.number(),
        z: v.number(),
        updatedAt: v.number(),
      }),
    ),
  }).index("by_space", ["spaceId"]),
});
