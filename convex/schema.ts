import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { widgetDataValidator } from "./widgetData";
import { EMBEDDING_DIMENSIONS } from "./ai";

// Shape rationale: docs/data-model-plan.md §11.
export default defineSchema({
  // Convex Auth's tables (convex/auth.ts). users grows the profile that
  // follows a joined person across devices (docs/accounts.md).
  ...authTables,
  // Waitlist emails are managed in the Convex dashboard; no public read API.
  waitlist: defineTable({ email: v.string() }).index("by_email", ["email"]),

  users: defineTable({
    ...authTables.users.validator.fields,
    color: v.optional(v.string()), emoji: v.optional(v.string()),
  }).index("email", ["email"]).index("phone", ["phone"]),

  spaces: defineTable({
    name: v.string(), type: v.union(v.literal("ongoing"), v.literal("event")),
    icon: v.string(), color: v.string(), createdAt: v.number(), lastActivityAt: v.number(),
    eventAt: v.optional(v.number()), archivedAt: v.optional(v.number()), slug: v.optional(v.string()),
    canvasW: v.optional(v.number()), canvasH: v.optional(v.number()), tagline: v.optional(v.string()),
    inboxId: v.optional(v.string()), inboxAddress: v.optional(v.string()),
    askThreadId: v.optional(v.string()), ragIndexedAt: v.optional(v.number()),
    // Unset on seeded spaces, load-bearing: "no owner" means nobody can
    // rename or delete it from the client. Only createSpace writes it from
    // the caller's identity, never an argument.
    ownerId: v.optional(v.string()),
  })
    .index("by_name", ["name"]).index("by_slug", ["slug"])
    .index("by_inbox", ["inboxId"]).index("by_owner", ["ownerId"]),

  emailEvents: defineTable({
    spaceId: v.id("spaces"), from: v.string(), to: v.string(),
    subject: v.string(), summary: v.string(), body: v.optional(v.string()),
    direction: v.union(v.literal("in"), v.literal("out")), widgetId: v.optional(v.id("widgets")), messageId: v.optional(v.string()), threadId: v.optional(v.string()),
    // Pre-parsed by Firecrawl: an empty-bodied receipt still files itself
    // off the PDF.
    attachments: v.optional(v.array(v.object({
      filename: v.string(), contentType: v.string(), size: v.number(), text: v.string(),
    }))),
    because: v.optional(v.string()), label: v.optional(v.string()),
    readingAt: v.optional(v.number()), repliedAt: v.optional(v.number()), createdAt: v.number(),
  }).index("by_space", ["spaceId"]),

  work: defineTable({
    spaceId: v.id("spaces"), runId: v.string(), step: v.string(), line: v.string(),
    kind: v.union(v.literal("mail"), v.literal("link"), v.literal("search"), v.literal("crawl")),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    subject: v.optional(v.string()), widgetId: v.optional(v.id("widgets")), createdAt: v.number(),
  }).index("by_space", ["spaceId"]),

  members: defineTable({
    spaceId: v.id("spaces"), userId: v.string(), name: v.string(), color: v.string(),
    emoji: v.optional(v.string()), avatarUrl: v.optional(v.string()), lastSeen: v.number(),
  }).index("by_space", ["spaceId"]).index("by_space_user", ["spaceId", "userId"]).index("by_user", ["userId"]),

  widgets: defineTable({
    spaceId: v.id("spaces"),
    // Open string, not a literal union: the client picks it, and the 32
    // shipped names live in src/data/types.ts. `data` is validated per type.
    type: v.string(),
    x: v.number(), y: v.number(), w: v.number(), h: v.number(), z: v.number(),
    data: widgetDataValidator, createdBy: v.string(), createdAt: v.number(), rotate: v.optional(v.number()),
    // Set by convex/similar.ts so an arriving card can ask if the board
    // already holds it. Optional — embeddings may be unconfigured.
    embedding: v.optional(v.array(v.float64())),
    embeddedText: v.optional(v.string()),
  })
    .index("by_space", ["spaceId"])
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: EMBEDDING_DIMENSIONS, filterFields: ["spaceId"] }),

  messages: defineTable({
    spaceId: v.id("spaces"),
    // "global" | a widget id | "<widgetId>::q:<n>" for a question sub-thread —
    // a string, not v.id, because of the first two.
    widgetId: v.string(), userId: v.string(), text: v.string(), createdAt: v.number(),
    // Author copied, not joined: no read per message per update.
    authorName: v.string(), authorColor: v.string(),
    authorEmoji: v.optional(v.string()), authorAvatarUrl: v.optional(v.string()),
    promotable: v.optional(v.boolean()), promotedWidgetId: v.optional(v.id("widgets")),
  })
    .index("by_widget", ["widgetId"]).index("by_space", ["spaceId"]).index("by_space_widget", ["spaceId", "widgetId"])
    .searchIndex("search_text", { searchField: "text", filterFields: ["spaceId"] }),

  votes: defineTable({ widgetId: v.id("widgets"), userId: v.string(), optionId: v.string() })
    .index("by_widget", ["widgetId"]).index("by_widget_user", ["widgetId", "userId"]).index("by_user", ["userId"]),

  paintMarks: defineTable({
    spaceId: v.id("spaces"), widgetId: v.id("widgets"), userId: v.string(),
    authorName: v.string(), authorColor: v.string(),
    tone: v.union(v.literal("berry"), v.literal("orange"), v.literal("blue"), v.literal("violet"), v.literal("teal"), v.literal("lime")),
    size: v.number(), points: v.array(v.object({ x: v.number(), y: v.number() })),
    regionId: v.optional(v.string()),
    preset: v.optional(v.union(v.literal("electric"), v.literal("sunset"))),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"]).index("by_space_and_widget", ["spaceId", "widgetId"]),

  recaps: defineTable({
    spaceId: v.id("spaces"), since: v.string(), kind: v.union(v.literal("daily"), v.literal("ask")),
    lines: v.array(v.object({ text: v.string(), widgetId: v.optional(v.string()), messageId: v.optional(v.string()) })),
    createdAt: v.number(),
  }).index("by_space", ["spaceId"]).index("by_space_kind_created", ["spaceId", "kind", "createdAt"]),

  // /api/ask-stream gets a streamId only; the rest lives here.
  askStreams: defineTable({
    spaceId: v.id("spaces"), streamId: v.string(), question: v.string(),
    messageId: v.id("messages"), // the recap turn to fill in when done
  })
    .index("by_stream", ["streamId"]).index("by_space", ["spaceId"]),

  presence: defineTable({
    spaceId: v.id("spaces"), userId: v.string(), x: v.number(), y: v.number(), updatedAt: v.number(),
    name: v.string(), color: v.string(), emoji: v.optional(v.string()), avatarUrl: v.optional(v.string()),
    // unset = canvas cursor; "cozy:<id>" = x/y normalized 0..1 on a board
    zone: v.optional(v.string()),
    // Also the gesture lock: holding it = owning the drag (presence.ts).
    gesture: v.optional(v.object({
      sessionId: v.string(), widgetId: v.id("widgets"), kind: v.union(v.literal("move"), v.literal("resize")),
      x: v.number(), y: v.number(), w: v.number(), h: v.number(), z: v.number(), updatedAt: v.number(),
    })),
  })
    .index("by_space", ["spaceId"]).index("by_space_user", ["spaceId", "userId"]).index("by_updated", ["updatedAt"]),

  // What #/admin resets a room to — one row per slug (convex/admin.ts).
  baselines: defineTable({ slug: v.string(), savedAt: v.number(), json: v.string() }).index("by_slug", ["slug"]),

  // A voice ask's receipt numbers, JSON (voiceBuild.ts).
  deals: defineTable({ spaceId: v.id("spaces"), run: v.string() }).index("by_space", ["spaceId"]),
  // A card that waits on another and fills itself from it (links.ts). when: always|closed|winner|time|threshold.
  links: defineTable({
    spaceId: v.id("spaces"), from: v.id("widgets"), to: v.id("widgets"), when: v.string(), fill: v.string(), value: v.string(),
    at: v.optional(v.number()), resolvedAt: v.optional(v.number()),
  }).index("by_from", ["from"]).index("by_space", ["spaceId"]),
  // Every AI write through the one door (rightOfWay.ts): kind edit|undo|link|build, fields = JSON [{field,old,new}],
  // verdict go|wait|ask (or refused: an edit that would undo people's choices), undo = the inverse op JSON.
  aiWrites: defineTable({
    spaceId: v.id("spaces"), widgetId: v.optional(v.id("widgets")), kind: v.string(), by: v.string(), byUserId: v.optional(v.string()),
    fields: v.string(), verdict: v.string(), reason: v.optional(v.string()), text: v.optional(v.string()), undo: v.optional(v.string()),
    undone: v.optional(v.boolean()), at: v.number(),
  }).index("by_space", ["spaceId"]),
  // Room brief for voice asks (roomBrief.ts); facts = evidence JSON.
  briefs: defineTable({ spaceId: v.id("spaces"), text: v.string(), facts: v.string(), at: v.number() }).index("by_space", ["spaceId"]),

  // Games (games.ts; types in src/lib/games/types.ts). A round's answers are their own rows so the
  // query can hold each pick back until the round's reveal is written ("answer to see", server side).
  games: defineTable({
    spaceId: v.id("spaces"), kind: v.string(), name: v.string(), phase: v.string(), round: v.number(),
    startedBy: v.object({ userId: v.string(), name: v.string(), color: v.string() }), startedAt: v.number(),
    phaseEndsAt: v.optional(v.number()), cast: v.array(v.object({ name: v.string(), color: v.string() })),
    seat: v.optional(v.array(v.object({ name: v.string(), color: v.string() }))), seatWhy: v.optional(v.string()),
    known: v.optional(v.number()), worded: v.optional(v.string()), // model | templates (+ why)
  }).index("by_space", ["spaceId"]),
  gamePlayers: defineTable({ gameId: v.id("games"), userId: v.string(), name: v.string(), color: v.string(), joinedAt: v.number(), fromRound: v.number() })
    .index("by_game", ["gameId"]),
  // prompt = GamePrompt (fact key + its words); asks = HotQuestion[] JSON (holds the right answer).
  gameRounds: defineTable({
    gameId: v.id("games"), n: v.number(), prompt: v.object({ id: v.string(), text: v.string(), award: v.string(), glyph: v.string(), fact: v.string(), from: v.string() }),
    asks: v.optional(v.string()), endsAt: v.optional(v.number()), revealedAt: v.optional(v.number()), winners: v.array(v.string()),
    reactions: v.optional(v.array(v.object({ by: v.string(), kind: v.string(), at: v.number() }))), ready: v.optional(v.array(v.string())),
  }).index("by_game", ["gameId", "n"]),
  gameAnswers: defineTable({ gameId: v.id("games"), n: v.number(), userId: v.string(), by: v.string(), pick: v.string(), at: v.number() })
    .index("by_game", ["gameId", "n"]),
  awards: defineTable({ spaceId: v.id("spaces"), gameId: v.id("games"), to: v.string(), title: v.string(), glyph: v.string(), prompt: v.string(), tone: v.number(), at: v.number() })
    .index("by_space", ["spaceId", "at"]),
  // The jigsaw's pieces: where each one is, and who holds it (a lease that runs out by itself).
  puzzlePieces: defineTable({ gameId: v.id("games"), i: v.number(), x: v.number(), y: v.number(), placed: v.boolean(), by: v.optional(v.string()), heldBy: v.optional(v.string()), heldName: v.optional(v.string()), heldUntil: v.optional(v.number()) })
    .index("by_game", ["gameId", "i"]),

  // batch-worker queue: stale linkCards awaiting Firecrawl refresh.
  linkRefreshQueue: defineTable({
    widgetId: v.id("widgets"),
    queuedAt: v.commitTs(), // commit-order cursor, not a wall-clock read
  }).index("queuedAt", ["queuedAt"]),
});
