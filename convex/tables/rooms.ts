import { defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { widgetDataValidator } from "../widgetData";
import { EMBEDDING_DIMENSIONS } from "../ai";

/** The room itself: people, the board, chat, votes, cursors (schema.ts lists them). */

// Waitlist emails are managed in the Convex dashboard; no public read API.
export const waitlist = defineTable({ email: v.string() }).index("by_email", ["email"]);

export const users = defineTable({
  ...authTables.users.validator.fields,
  color: v.optional(v.string()), emoji: v.optional(v.string()),
  // a guest seat folded into an account when the person joined with that account's email on it (auth.ts)
  mergedInto: v.optional(v.string()),
}).index("email", ["email"]).index("phone", ["phone"]);

export const spaces = defineTable({
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
  .index("by_inbox", ["inboxId"]).index("by_owner", ["ownerId"]);

export const members = defineTable({
  spaceId: v.id("spaces"), userId: v.string(), name: v.string(), color: v.string(),
  emoji: v.optional(v.string()), avatarUrl: v.optional(v.string()), lastSeen: v.number(),
}).index("by_space", ["spaceId"]).index("by_space_user", ["spaceId", "userId"]).index("by_user", ["userId"]);

export const widgets = defineTable({
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
  .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: EMBEDDING_DIMENSIONS, filterFields: ["spaceId"] });

export const messages = defineTable({
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
  .searchIndex("search_text", { searchField: "text", filterFields: ["spaceId"] });

export const votes = defineTable({ widgetId: v.id("widgets"), userId: v.string(), optionId: v.string() })
  .index("by_widget", ["widgetId"]).index("by_widget_user", ["widgetId", "userId"]).index("by_user", ["userId"]);

export const paintMarks = defineTable({
  spaceId: v.id("spaces"), widgetId: v.id("widgets"), userId: v.string(),
  authorName: v.string(), authorColor: v.string(),
  tone: v.union(v.literal("berry"), v.literal("orange"), v.literal("blue"), v.literal("violet"), v.literal("teal"), v.literal("lime")),
  size: v.number(), points: v.array(v.object({ x: v.number(), y: v.number() })),
  regionId: v.optional(v.string()),
  preset: v.optional(v.union(v.literal("electric"), v.literal("sunset"))),
  createdAt: v.number(),
})
  .index("by_space", ["spaceId"]).index("by_space_and_widget", ["spaceId", "widgetId"]);

export const presence = defineTable({
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
  .index("by_space", ["spaceId"]).index("by_space_user", ["spaceId", "userId"]).index("by_updated", ["updatedAt"]);

// What #/admin resets a room to — one row per slug (convex/admin.ts).
export const baselines = defineTable({ slug: v.string(), savedAt: v.number(), json: v.string() }).index("by_slug", ["slug"]);
