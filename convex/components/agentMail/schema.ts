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
    // What came attached. The app parses documents out of these (Firecrawl)
    // before routing, so a receipt PDF is readable content, not a filename.
    attachments: v.optional(
      v.array(
        v.object({
          attachmentId: v.string(),
          filename: v.string(),
          contentType: v.string(),
          size: v.number(),
          inline: v.boolean(),
        }),
      ),
    ),
    receivedAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_inbox", ["inboxId"]),
});
