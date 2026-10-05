import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Right of Way: the ledger of AI writes, who holds what, writes waiting on a hand (schema.ts lists them). */

// Every AI write through the one door (rightOfWay.ts): fields = JSON [{field,old,new}], verdict go|wait|never,
// undo = inverse op JSON, outcome = what a wait came to (JSON {state,ms,on}).
export const aiWrites = defineTable({
  spaceId: v.id("spaces"), widgetId: v.optional(v.id("widgets")), kind: v.string(), by: v.string(), byUserId: v.optional(v.string()),
  fields: v.string(), verdict: v.string(), reason: v.optional(v.string()), text: v.optional(v.string()), undo: v.optional(v.string()),
  undone: v.optional(v.boolean()), at: v.number(), outcome: v.optional(v.string()),
}).index("by_space", ["spaceId"]);

// Right of Way (leases.ts): who holds what (thing = card id | piece:<game>:<i>) until `until`.
export const leases = defineTable({ spaceId: v.id("spaces"), thing: v.string(), kind: v.string(), userId: v.string(), name: v.string(), color: v.string(), since: v.number(), until: v.number(), letGoAt: v.optional(v.number()), settleAt: v.number() })
  .index("by_thing", ["spaceId", "thing"]);

// A write told to wait (the ghost): write = its replay, on = the holder (JSON).
export const pending = defineTable({ spaceId: v.id("spaces"), thing: v.string(), writeId: v.id("aiWrites"), write: v.string(), on: v.string(), at: v.number() })
  .index("by_thing", ["spaceId", "thing"]);
