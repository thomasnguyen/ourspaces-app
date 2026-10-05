import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Right of Way: the ledger of AI writes, who holds what, writes waiting on a hand (schema.ts lists them). */

// Every AI write through the one door (rightOfWay.ts): fields = JSON [{field,old,new}], verdict go|wait|never,
// undo = inverse op JSON, outcome = what a wait came to (JSON {state,ms,on,heldBy}). others = anyone but the asker
// holding the thing (or a new card's spot) at the door, read from the leases apart from the gate: the ledger's check.
export const aiWrites = defineTable({
  spaceId: v.id("spaces"), widgetId: v.optional(v.id("widgets")), kind: v.string(), by: v.string(), byUserId: v.optional(v.string()),
  fields: v.string(), verdict: v.string(), reason: v.optional(v.string()), text: v.optional(v.string()), undo: v.optional(v.string()),
  undone: v.optional(v.boolean()), at: v.number(), outcome: v.optional(v.string()), others: v.optional(v.array(v.string())),
}).index("by_space", ["spaceId"]);

// Right of Way (leases.ts): who holds what (thing = card id | piece:<game>:<i>) until `until`.
export const leases = defineTable({ spaceId: v.id("spaces"), thing: v.string(), kind: v.string(), userId: v.string(), name: v.string(), color: v.string(), since: v.number(), until: v.number(), letGoAt: v.optional(v.number()), settleAt: v.number() })
  .index("by_thing", ["spaceId", "thing"]);

// A write told to wait (the ghost): write = its replay, on = the holder (JSON).
export const pending = defineTable({ spaceId: v.id("spaces"), thing: v.string(), writeId: v.id("aiWrites"), write: v.string(), on: v.string(), at: v.number() })
  .index("by_thing", ["spaceId", "thing"]);

// A choice vote riding on a card (choiceVotes.ts): voters = the people whose choice is at stake (why = their choice),
// options = keep + up to two changes (op = the edit, JSON), state open | change | keep | withdrawn | moot.
export const choiceVotes = defineTable({
  spaceId: v.id("spaces"), widgetId: v.id("widgets"), key: v.string(), stake: v.string(),
  voters: v.array(v.object({ id: v.optional(v.string()), name: v.string(), why: v.string() })),
  options: v.array(v.object({
    id: v.string(), ask: v.string(), changed: v.optional(v.string()), op: v.optional(v.string()),
    by: v.optional(v.string()), byUserId: v.optional(v.string()), writeId: v.optional(v.id("aiWrites")),
  })),
  answers: v.array(v.object({ voter: v.string(), option: v.string(), at: v.number() })),
  state: v.string(), why: v.optional(v.string()), note: v.optional(v.string()), landed: v.optional(v.string()),
  today: v.string(), at: v.number(), endsAt: v.number(), closedAt: v.optional(v.number()),
}).index("by_widget", ["widgetId", "state"]).index("by_space", ["spaceId", "at"]);
