import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

/**
 * AgentMail REST wrapped as a Convex component. The API key + base URL are
 * passed in from the app on every call — component functions can't read
 * process.env — which is exactly the seam the abandoned 0.1.0 got wrong.
 * fetch() runs in the default Convex runtime, so no "use node" is needed.
 */
async function am(
  apiKey: string,
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AgentMail ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const messageIdResult = v.object({ messageId: v.string() });

/** Attachment metadata as AgentMail reports it on a message. */
const attachmentValidator = v.object({
  attachmentId: v.string(),
  filename: v.string(),
  contentType: v.string(),
  size: v.number(),
  inline: v.boolean(),
});

function toAttachment(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const attachmentId = String(item.attachment_id ?? "");
  if (!attachmentId) return null;
  return {
    attachmentId,
    filename: String(item.filename ?? ""),
    contentType: String(item.content_type ?? ""),
    size: typeof item.size === "number" ? item.size : 0,
    // `content_disposition: "inline"` is a signature image or a quoted logo,
    // not something a person meant to send. Kept, but flagged so the app skips it.
    inline: String(item.content_disposition ?? "") === "inline",
  };
}

/** Parse an AgentMail `attachments` array into our shape. */
export function readAttachments(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(toAttachment)
    .filter((item): item is Record<string, unknown> => item !== null);
}

/** Create (or re-fetch) an AgentMail inbox → { inboxId, address }. */
export const createInbox = action({
  args: {
    apiKey: v.string(),
    baseUrl: v.string(),
    username: v.string(),
    displayName: v.optional(v.string()),
    clientId: v.optional(v.string()),
  },
  returns: v.object({ inboxId: v.string(), address: v.string() }),
  handler: async (_ctx, args) => {
    const inbox = await am(args.apiKey, args.baseUrl, "/inboxes", {
      method: "POST",
      body: JSON.stringify({
        username: args.username,
        display_name: args.displayName ?? "OurSpaces",
        ...(args.clientId ? { client_id: args.clientId } : {}),
      }),
    });
    const inboxId = String(inbox.inbox_id ?? "");
    const address = String(inbox.email ?? inboxId);
    if (!inboxId) {
      throw new Error(`AgentMail create inbox returned no inbox_id: ${JSON.stringify(inbox)}`);
    }
    return { inboxId, address };
  },
});

/** Outbound send from an inbox (digest, notifications). */
export const sendMessage = action({
  args: {
    apiKey: v.string(),
    baseUrl: v.string(),
    inboxId: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
  },
  returns: messageIdResult,
  handler: async (_ctx, args) => {
    const res = await am(
      args.apiKey,
      args.baseUrl,
      `/inboxes/${encodeURIComponent(args.inboxId)}/messages/send`,
      {
        method: "POST",
        body: JSON.stringify({
          to: args.to,
          subject: args.subject,
          text: args.text,
          ...(args.html ? { html: args.html } : {}),
          ...(args.labels ? { labels: args.labels } : {}),
        }),
      },
    );
    return { messageId: String(res.message_id ?? "") };
  },
});

/** In-thread reply to a received message — keeps the conversation threaded. */
export const replyToMessage = action({
  args: {
    apiKey: v.string(),
    baseUrl: v.string(),
    inboxId: v.string(),
    messageId: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
    replyAll: v.optional(v.boolean()),
  },
  returns: messageIdResult,
  handler: async (_ctx, args) => {
    const res = await am(
      args.apiKey,
      args.baseUrl,
      `/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}/reply`,
      {
        method: "POST",
        body: JSON.stringify({
          text: args.text,
          ...(args.html ? { html: args.html } : {}),
          ...(args.labels ? { labels: args.labels } : {}),
          ...(args.replyAll ? { reply_all: true } : {}),
        }),
      },
    );
    return { messageId: String(res.message_id ?? "") };
  },
});

/** Add / remove labels on a message (mirrors the router's classification). */
export const addLabels = action({
  args: {
    apiKey: v.string(),
    baseUrl: v.string(),
    inboxId: v.string(),
    messageId: v.string(),
    addLabels: v.array(v.string()),
    removeLabels: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await am(
      args.apiKey,
      args.baseUrl,
      `/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          add_labels: args.addLabels,
          ...(args.removeLabels ? { remove_labels: args.removeLabels } : {}),
        }),
      },
    );
    return null;
  },
});

/** Record an inbound message once (deduped by eventId). isNew gates app work. */
export const ingestWebhook = mutation({
  args: {
    eventId: v.string(),
    inboxId: v.string(),
    messageId: v.string(),
    threadId: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    labels: v.optional(v.array(v.string())),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  returns: v.object({ isNew: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.eventId) {
      const seen = await ctx.db
        .query("events")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .unique();
      if (seen) return { isNew: false };
      await ctx.db.insert("events", { eventId: args.eventId, receivedAt: Date.now() });
    }
    await ctx.db.insert("inboundMessages", {
      messageId: args.messageId,
      threadId: args.threadId,
      inboxId: args.inboxId,
      from: args.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      labels: args.labels ?? [],
      attachments: args.attachments,
      receivedAt: Date.now(),
    });
    return { isNew: true };
  },
});

/** Reactive inbound feed for an inbox (newest first). */
export const listInbound = query({
  args: { inboxId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("inboundMessages"),
      _creationTime: v.number(),
      messageId: v.string(),
      threadId: v.optional(v.string()),
      inboxId: v.string(),
      from: v.string(),
      to: v.string(),
      subject: v.string(),
      text: v.string(),
      labels: v.array(v.string()),
      attachments: v.optional(v.array(attachmentValidator)),
      receivedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inboundMessages")
      .withIndex("by_inbox", (q) => q.eq("inboxId", args.inboxId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/** Fetch a message — the fallback for when a webhook payload omits attachments. */
export const getMessageAttachments = action({
  args: {
    apiKey: v.string(),
    baseUrl: v.string(),
    inboxId: v.string(),
    messageId: v.string(),
  },
  returns: v.array(attachmentValidator),
  handler: async (_ctx, args) => {
    const message = await am(
      args.apiKey,
      args.baseUrl,
      `/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}`,
    );
    return readAttachments(message.attachments) as unknown as {
      attachmentId: string;
      filename: string;
      contentType: string;
      size: number;
      inline: boolean;
    }[];
  },
});

/** One attachment → a short-lived public URL Firecrawl can fetch and parse.
 *  AgentMail hands back a `download_url` rather than bytes, which is why this
 *  chain never has to stage the file in Convex storage. */
export const getAttachmentUrl = action({
  args: {
    apiKey: v.string(),
    baseUrl: v.string(),
    inboxId: v.string(),
    messageId: v.string(),
    attachmentId: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (_ctx, args) => {
    const res = await am(
      args.apiKey,
      args.baseUrl,
      `/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}/attachments/${encodeURIComponent(args.attachmentId)}`,
    );
    const url = String(res.download_url ?? res.url ?? "");
    return url || null;
  },
});
