import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { widgetDataValidator } from "./widgetData";

/**
 * OurSpaces data model — PRD §11.
 * Everything live flows through these reactive tables. Presence is ephemeral
 * and TTL'd. A "frame" is just a widget with type: "frame" — no extra table.
 */
export default defineSchema({
  // Convex Auth owns users/authSessions/authAccounts/... — see convex/auth.ts.
  // `members.userId` stays v.string() so seeded crew ("seed:maya") keep
  // working alongside real auth ids (§0).
  ...authTables,

  spaces: defineTable({
    name: v.string(),
    // "ongoing" = evergreen relationship; "event" = time-bound (carries eventAt)
    type: v.union(v.literal("ongoing"), v.literal("event")),
    icon: v.string(),
    color: v.string(), // the saturated identity color — the card IS the color (§10)
    createdAt: v.number(),
    lastActivityAt: v.number(),
    eventAt: v.optional(v.number()), // event spaces only
    archivedAt: v.optional(v.number()), // settles into Past when set (§5.3) — nothing writes it yet
    slug: v.optional(v.string()),
    canvasW: v.optional(v.number()),
    canvasH: v.optional(v.number()),
    tagline: v.optional(v.string()),
    inboxId: v.optional(v.string()), // AgentMail inbox — the space's own email
    inboxAddress: v.optional(v.string()),
    askThreadId: v.optional(v.string()), // agent component thread for recap.ask
    ragIndexedAt: v.optional(v.number()), // last rag.add sweep, see convex/rag.ts
    // Who made it. Unset on every seeded/showcase space, and that is load-
    // bearing: "no owner" means nobody can rename or delete it from the
    // client. Only createSpace writes it, always from getAuthUserId — never
    // from an argument. See docs/data-model-plan.md §1.
    ownerId: v.optional(v.string()),
  })
    .index("by_name", ["name"]) // seed/demo lookup by display name
    .index("by_slug", ["slug"]) // every /:slug page load — the hot read
    .index("by_inbox", ["inboxId"]) // inbound webhook → which space owns this inbox
    .index("by_owner", ["ownerId"]), // "yours" in the rail + the guest→join merge

  // Every email the space sends or receives — feeds the activity log widget.
  emailEvents: defineTable({
    spaceId: v.id("spaces"),
    direction: v.union(v.literal("in"), v.literal("out")),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    summary: v.string(),
    body: v.optional(v.string()), // full text, for the router + letters
    widgetId: v.optional(v.id("widgets")),
    // AgentMail ids on inbound mail — let the router reply in-thread + label it.
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    // Documents that came attached, already parsed to text by Firecrawl. The
    // router reads `text` alongside the email body, so a receipt that says
    // nothing in the body still files itself off the PDF.
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
    // One lowercase sentence from the router: why it landed where it did (B1).
    because: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_space", ["spaceId"]), // activity-log widget, newest first

  members: defineTable({
    spaceId: v.id("spaces"),
    userId: v.string(), // anonymous auth identity
    name: v.string(),
    color: v.string(), // presence color, distinct per member
    emoji: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    lastSeen: v.number(),
  })
    .index("by_space", ["spaceId"]) // roster + memberCounts aggregate
    .index("by_space_user", ["spaceId", "userId"]) // is this person already a member
    .index("by_user", ["userId"]), // every space one person is in (guest→join merge)

  widgets: defineTable({
    spaceId: v.id("spaces"),
    // Stays an open string, not a literal union: the client picks the type
    // (widgets.createWidget takes v.string()) and the 32 shipped names live
    // in src/data/types.ts. `data` is what's actually validated per type.
    type: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    data: widgetDataValidator, // type-specific: countdown target, poll options, note text, frame title…
    createdBy: v.string(),
    createdAt: v.number(),
    rotate: v.optional(v.number()),
    // The canvas subscription. Every widget for a space in one indexed read —
    // no per-widget fan-out, so a drag re-renders one query for everyone.
  }).index("by_space", ["spaceId"]),

  messages: defineTable({
    spaceId: v.id("spaces"),
    // thread key: "global", a widget id, or "<widgetId>::q:<n>" for a
    // question sub-thread — a string, not v.id, because of the first two.
    widgetId: v.string(),
    userId: v.string(),
    text: v.string(),
    createdAt: v.number(),
    // Copied, not joined: the space thread is a live subscription, so a join
    // would cost one extra read per message on every update — and a message
    // should keep the name its author had when they sent it. Cost: a rename
    // patches `members` only; old rows keep the old name, nothing backfills.
    authorName: v.string(),
    authorColor: v.string(),
    authorEmoji: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    promotable: v.optional(v.boolean()),
    // Read by recap.ts, but no writer yet — promoteMessage dedupes on the
    // decision widget's own data.promotedFromMessageId instead.
    promotedWidgetId: v.optional(v.id("widgets")),
    // by_space is not redundant with by_space_widget: it orders a space's
    // whole thread chronologically, which the widget-scoped index can't.
  }).index("by_widget", ["widgetId"]) // a widget's own comment thread
    .index("by_space", ["spaceId"]) // paginated space thread (messages.listBySpace)
    .index("by_space_widget", ["spaceId", "widgetId"]) // thread dock, scoped to one widget
    .searchIndex("search_text", { searchField: "text", filterFields: ["spaceId"] }),

  votes: defineTable({
    widgetId: v.id("widgets"),
    userId: v.string(),
    optionId: v.string(),
  })
    .index("by_widget", ["widgetId"]) // tally a poll (also feeds the pollTallies aggregate)
    .index("by_widget_user", ["widgetId", "userId"]) // one vote per user
    .index("by_user", ["userId"]), // every vote one person cast (guest→join merge)

  paintMarks: defineTable({
    spaceId: v.id("spaces"),
    widgetId: v.id("widgets"),
    userId: v.string(),
    // Same call as messages: copied so a stroke renders with no join, and so
    // a mark keeps the name of whoever drew it. Same cost — a rename never
    // reaches marks already on the board.
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
    .index("by_space", ["spaceId"]) // paint marks for the whole canvas
    .index("by_space_and_widget", ["spaceId", "widgetId"]), // one paint-by-number board

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
    // A prefix of by_space_created, kept because spaces.deleteSpaceBySlug
    // sweeps five tables through one loop and needs the name on all of them.
    .index("by_space", ["spaceId"])
    .index("by_space_created", ["spaceId", "createdAt"]), // recap.latest — newest one, no scan

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
    // No by_space_updated: listHereNow deliberately reads the whole room and
    // lets the cron + the client's own tick decide what's stale, because a
    // wall-clock bound inside a query never re-evaluates (see presence.ts).
    .index("by_space", ["spaceId"]) // gesture-lock arbitration reads the whole room
    .index("by_space_user", ["spaceId", "userId"]) // upsert one person's cursor (findPresence)
    // by_updated is the sweep's index, and it exists for CONTENTION, not
    // speed: the cleanup cron used to `.collect()` the whole table every
    // minute, which made its read set every presence row — so any heartbeat
    // landing mid-sweep lost an OCC conflict and re-ran the whole mutation
    // (310 retries in 72h). A range read of `updatedAt < staleBefore` only
    // conflicts with writes into the stale range, and a live heartbeat writes
    // `now`. Cross-space on purpose; the sweep is not per room.
    .index("by_updated", ["updatedAt"]),

  // batch-worker queue: stale linkCard widgets pending a Firecrawl refresh.
  linkRefreshQueue: defineTable({
    widgetId: v.id("widgets"),
    queuedAt: v.commitTs(), // commit-order cursor, not a wall-clock read
  }).index("queuedAt", ["queuedAt"]), // batch-worker drains in commit order
});
