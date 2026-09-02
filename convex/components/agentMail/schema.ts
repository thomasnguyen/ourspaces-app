import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Isolated component tables. inboxId / messageId / threadId are AgentMail's own
// string ids — never app-owned v.id()s — so nothing crosses the app namespace.
export default defineSchema({
  // Webhook dedup: AgentMail can redeliver, so an event is processed once.
  events: defineTable({
    eventId: v.string(),
    receivedAt: v.number(),
  }).index("by_eventId", ["eventId"]),

  // Every inbound message, reactively queryable per inbox (thread views, audit).
  inboundMessages: defineTable({
    messageId: v.string(),
    threadId: v.optional(v.string()),
    inboxId: v.string(),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    labels: v.array(v.string()),
    receivedAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_inbox", ["inboxId"]),
});
