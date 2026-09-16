import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { widgetDataValidator } from "./widgetData";
import { EMBEDDING_DIMENSIONS } from "./ai";

/**
 * OurSpaces data model — PRD §11. Everything live flows through these reactive
 * tables; presence is ephemeral and TTL'd, and a "frame" is just a widget with
 * type: "frame". Why each table, index and copied field is shaped this way:
 * docs/data-model-plan.md §11.
 */
export default defineSchema({
  // Convex Auth owns users/authSessions/authAccounts/… (convex/auth.ts).
  // members.userId stays v.string() so seeded crew ("seed:maya") coexist with
  // real auth ids.
  ...authTables,

  spaces: defineTable({
    name: v.string(),
    type: v.union(v.literal("ongoing"), v.literal("event")),
    icon: v.string(),
    color: v.string(),
    createdAt: v.number(),
    lastActivityAt: v.number(),
    eventAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    slug: v.optional(v.string()),
    canvasW: v.optional(v.number()),
    canvasH: v.optional(v.number()),
    tagline: v.optional(v.string()),
    inboxId: v.optional(v.string()),
    inboxAddress: v.optional(v.string()),
    askThreadId: v.optional(v.string()),
    ragIndexedAt: v.optional(v.number()),
    // Unset on seeded spaces, and that is load-bearing: "no owner" means nobody
    // can rename or delete it from the client. Only createSpace writes it, from
    // the caller's identity, never from an argument.
    ownerId: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_slug", ["slug"])
    .index("by_inbox", ["inboxId"])
    .index("by_owner", ["ownerId"]),

  emailEvents: defineTable({
    spaceId: v.id("spaces"),
    direction: v.union(v.literal("in"), v.literal("out")),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    summary: v.string(),
    body: v.optional(v.string()),
    widgetId: v.optional(v.id("widgets")),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    // Pre-parsed to text by Firecrawl, so a receipt that says nothing in its
    // body still files itself off the PDF.
    attachments: v.optional(
      v.array(
        v.object({
          filename: v.string(),
          contentType: v.string(),
          size: v.number(),
          text: v.string(),
        }),
      ),
    ),
    because: v.optional(v.string()),
    label: v.optional(v.string()),
    readingAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_space", ["spaceId"]),

  work: defineTable({
    spaceId: v.id("spaces"),
    runId: v.string(),
    kind: v.union(
      v.literal("mail"),
      v.literal("link"),
      v.literal("search"),
      v.literal("crawl"),
    ),
    step: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    line: v.string(),
    subject: v.optional(v.string()),
    widgetId: v.optional(v.id("widgets")),
    createdAt: v.number(),
  }).index("by_space", ["spaceId"]),

  members: defineTable({
    spaceId: v.id("spaces"),
    userId: v.string(),
    name: v.string(),
    color: v.string(),
    emoji: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    lastSeen: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_user", ["spaceId", "userId"])
    .index("by_user", ["userId"]),

  widgets: defineTable({
    spaceId: v.id("spaces"),
    // Open string, not a literal union: the client picks the type and the 32
    // shipped names live in src/data/types.ts. `data` is validated per type.
    type: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    data: widgetDataValidator,
    createdBy: v.string(),
    createdAt: v.number(),
    rotate: v.optional(v.number()),
    // Set by convex/similar.ts so an arriving card can ask whether the board
    // already holds this. Optional — embeddings may be unconfigured.
    embedding: v.optional(v.array(v.float64())),
    embeddedText: v.optional(v.string()),
  })
    .index("by_space", ["spaceId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["spaceId"],
    }),

  messages: defineTable({
    spaceId: v.id("spaces"),
    // "global", a widget id, or "<widgetId>::q:<n>" for a question sub-thread —
    // a string, not v.id, because of the first two.
    widgetId: v.string(),
    userId: v.string(),
    text: v.string(),
    createdAt: v.number(),
    // Author identity is copied, not joined: a live thread would pay an extra
    // read per message per update, and a message should keep the name its
    // author had when they sent it.
    authorName: v.string(),
    authorColor: v.string(),
    authorEmoji: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    promotable: v.optional(v.boolean()),
    promotedWidgetId: v.optional(v.id("widgets")),
  })
    .index("by_widget", ["widgetId"])
    .index("by_space", ["spaceId"])
    .index("by_space_widget", ["spaceId", "widgetId"])
    .searchIndex("search_text", { searchField: "text", filterFields: ["spaceId"] }),

  votes: defineTable({
    widgetId: v.id("widgets"),
    userId: v.string(),
    optionId: v.string(),
  })
    .index("by_widget", ["widgetId"])
    .index("by_widget_user", ["widgetId", "userId"])
    .index("by_user", ["userId"]),

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

  recaps: defineTable({
    spaceId: v.id("spaces"),
    kind: v.union(v.literal("daily"), v.literal("ask")),
    since: v.string(),
    lines: v.array(
      v.object({
        text: v.string(),
        widgetId: v.optional(v.string()),
        messageId: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_created", ["spaceId", "createdAt"]),

  presence: defineTable({
    spaceId: v.id("spaces"),
    userId: v.string(),
    x: v.number(),
    y: v.number(),
    updatedAt: v.number(),
    name: v.string(),
    color: v.string(),
    emoji: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    /** unset = canvas cursor (world coords); "cozy:<boardId>" = coloring-room
     *  cursor with x/y normalized 0..1 over that board */
    zone: v.optional(v.string()),
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
  })
    .index("by_space", ["spaceId"])
    .index("by_space_user", ["spaceId", "userId"])
    .index("by_updated", ["updatedAt"]),

  // batch-worker queue: stale linkCard widgets pending a Firecrawl refresh.
  linkRefreshQueue: defineTable({
    widgetId: v.id("widgets"),
    queuedAt: v.commitTs(), // commit-order cursor, not a wall-clock read
  }).index("queuedAt", ["queuedAt"]),
});
