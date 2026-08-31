import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

/**
 * AgentMail via plain REST. The @agentmail/convex component's actions never
 * resolve through ctx.runAction (nested-workpool bug, see
 * docs/firecrawl-agentmail-setup.md), so we own the three calls we need:
 * create inbox, send message, and the inbound webhook (convex/http.ts).
 */
const API = "https://api.agentmail.to/v0";

async function am(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const key = env.AGENTMAIL_API_KEY;
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
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

/** Give a space its own email address (idempotent). */
export const ensureInbox = action({
  args: { spaceId: v.id("spaces"), username: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ inboxId: string; address: string }> =>
    await ctx.runAction(internal.agentmail.ensureInboxInternal, args),
});

/** The three showcase inboxes (free tier caps at 3). Run after seeding. */
export const ensureShowcaseInboxes = action({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => {
    const wanted: Record<string, string> = {
      crew: "thecrew",
      couple: "ustwo",
      buildroom: "buildroom",
    };
    const out: Record<string, string> = {};
    for (const [slug, username] of Object.entries(wanted)) {
      const space = await ctx.runQuery(internal.agentmail.getSpaceBySlug, { slug });
      if (!space) continue;
      const result: { inboxId: string; address: string } = await ctx.runAction(
        internal.agentmail.ensureInboxInternal,
        { spaceId: space._id, username },
      );
      out[slug] = result.address;
    }
    return out;
  },
});

/** Same as ensureInbox but callable from other actions. */
export const ensureInboxInternal = internalAction({
  args: { spaceId: v.id("spaces"), username: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ inboxId: string; address: string }> => {
    const space = await ctx.runQuery(internal.agentmail.getSpaceInbox, { spaceId: args.spaceId });
    if (!space) throw new Error("space not found");
    if (space.inboxId && space.inboxAddress) {
      return { inboxId: space.inboxId, address: space.inboxAddress };
    }
    const wanted = (args.username ?? space.slug ?? "space")
      .replace(/[^a-z0-9-]/gi, "-")
      .toLowerCase();
    const inbox = await am("/inboxes", {
      method: "POST",
      body: JSON.stringify({
        username: wanted,
        display_name: space.name ?? "OurSpaces",
        client_id: `ourspaces-${space.slug ?? wanted}`,
      }),
    });
    const inboxId = String(inbox.inbox_id ?? "");
    const address = String(inbox.email ?? inboxId);
    if (!inboxId) throw new Error(`AgentMail create inbox returned no inbox_id: ${JSON.stringify(inbox)}`);
    await ctx.runMutation(internal.agentmail.setSpaceInbox, {
      spaceId: args.spaceId,
      inboxId,
      address,
    });
    return { inboxId, address };
  },
});

/** Outbound mail from a space's inbox (weekly digest, replies). */
export const sendEmail = internalAction({
  args: {
    spaceId: v.id("spaces"),
    to: v.array(v.string()),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, to, subject, text, html }) => {
    const space = await ctx.runQuery(internal.agentmail.getSpaceInbox, { spaceId });
    if (!space?.inboxId) throw new Error("space has no inbox");
    await am(`/inboxes/${encodeURIComponent(space.inboxId)}/messages/send`, {
      method: "POST",
      body: JSON.stringify({ to, subject, text, ...(html ? { html } : {}) }),
    });
    await ctx.runMutation(internal.agentmail.logEmailEvent, {
      spaceId,
      direction: "out",
      from: space.inboxAddress ?? space.inboxId,
      to: to.join(", "),
      subject,
      summary: text.slice(0, 400),
    });
    return null;
  },
});

export const getSpaceInbox = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const s = await ctx.db.get(spaceId);
    return s
      ? { slug: s.slug, name: s.name, inboxId: s.inboxId, inboxAddress: s.inboxAddress }
      : null;
  },
});

export const getSpaceBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) =>
    await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});

/** Remove the `test-*` inbox stubs so ensureShowcaseInboxes can create real ones. */
export const clearStubInboxes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const spaces = await ctx.db.query("spaces").collect();
    const cleared: string[] = [];
    for (const space of spaces) {
      if (space.inboxId?.startsWith("test-")) {
        await ctx.db.patch(space._id, { inboxId: undefined, inboxAddress: undefined });
        cleared.push(space.slug ?? space.name);
      }
    }
    return cleared;
  },
});

export const setSpaceInbox = internalMutation({
  args: { spaceId: v.id("spaces"), inboxId: v.string(), address: v.string() },
  handler: async (ctx, { spaceId, inboxId, address }) => {
    await ctx.db.patch(spaceId, { inboxId, inboxAddress: address });
  },
});

export const logEmailEvent = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    direction: v.union(v.literal("in"), v.literal("out")),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    summary: v.string(),
    body: v.optional(v.string()),
    widgetId: v.optional(v.id("widgets")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("emailEvents", { ...args, createdAt: Date.now() });
  },
});

/** Inbound mail (from the webhook) → emailEvents row → the space's router. */
export const onMessageReceived = internalMutation({
  args: {
    inboxId: v.string(),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { inboxId, from, to, subject, text }) => {
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_inbox", (q) => q.eq("inboxId", inboxId))
      .unique();
    if (!space) return null;
    const eventId = await ctx.db.insert("emailEvents", {
      spaceId: space._id,
      direction: "in",
      from,
      to: to || space.inboxAddress || "",
      subject,
      summary: text.slice(0, 400),
      body: text.slice(0, 20_000),
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.inbox.processInbound, { eventId });
    return null;
  },
});
