import { defineTable } from "convex/server";
import { v } from "convex/values";

/** What a voice ask leaves behind: receipts, card-to-card links, the room brief (schema.ts lists them). */

// A voice ask's receipt numbers, JSON (voiceBuild.ts).
export const deals = defineTable({ spaceId: v.id("spaces"), run: v.string() }).index("by_space", ["spaceId"]);

// Card feeds card (links.ts); tag: its thread; cutAt: cut.
export const links = defineTable({
  spaceId: v.id("spaces"), from: v.id("widgets"), to: v.id("widgets"), when: v.string(), fill: v.string(), value: v.string(),
  at: v.optional(v.number()), resolvedAt: v.optional(v.number()), tag: v.optional(v.string()), cutAt: v.optional(v.number()),
}).index("by_from", ["from"]).index("by_space", ["spaceId"]);

// Room brief for voice asks (roomBrief.ts); facts = evidence JSON.
export const briefs = defineTable({ spaceId: v.id("spaces"), text: v.string(), facts: v.string(), at: v.number() }).index("by_space", ["spaceId"]);
