import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  action,
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import schema from "./schema";
import { rateLimiter } from "./rateLimits";

/**
 * AgentMail = the space's inbox. Every REST call goes through our first-party
 * `agentMail` component (convex/components/agentMail) — create inbox, send,
 * reply-in-thread, label — with the key passed in from here (components can't
 * read env). The inbound webhook lands in convex/http.ts.
 */
const API = "https://api.agentmail.to/v0";

/**
 * Best-effort acknowledgement of an inbound email: label it with the router's
 * verdict and reply in-thread so the sender sees what the space did with it.
 * Non-critical — a mail-send hiccup must not undo the filing that already
 * committed, so failures are swallowed.
 */
export async function ackInbound(
  ctx: ActionCtx,
  args: { inboxId?: string; messageId?: string; label?: string; reply?: string },
): Promise<void> {
  const { inboxId, messageId, label, reply } = args;
  if (!inboxId || !messageId) return;
  try {
    if (label) {
      await ctx.runAction(components.agentMail.lib.addLabels, {
        apiKey: env.AGENTMAIL_API_KEY,
        baseUrl: API,
        inboxId,
        messageId,
        addLabels: [label],
      });
    }
    if (reply) {
      await ctx.runAction(components.agentMail.lib.replyToMessage, {
        apiKey: env.AGENTMAIL_API_KEY,
        baseUrl: API,
        inboxId,
        messageId,
        text: reply,
      });
    }
  } catch {
    // ignore — the email was already filed onto the canvas
  }
}

/** Give a space its own email address (idempotent). */
const inboxResultValidator = v.object({ inboxId: v.string(), address: v.string() });

export const ensureInbox = action({
  args: { spaceId: v.id("spaces"), username: v.optional(v.string()) },
  returns: inboxResultValidator,
  handler: async (ctx, args): Promise<{ inboxId: string; address: string }> =>
    await ctx.runAction(internal.agentmail.ensureInboxInternal, args),
});

/** The three showcase inboxes (free tier caps at 3). Run after seeding. */
export const ensureShowcaseInboxes = action({
  args: {},
  returns: v.record(v.string(), v.string()),
  handler: async (ctx): Promise<Record<string, string>> => {
    // "thecrew" is taken org-wide on agentmail.to; the crew rides the
    // account's default ourspaces@ inbox instead (free tier caps at 3 total).
    const wanted: Record<string, string> = {
      crew: "ourspaces",
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
  returns: inboxResultValidator,
  handler: async (ctx, args): Promise<{ inboxId: string; address: string }> => {
    const space = await ctx.runQuery(internal.agentmail.getSpaceInbox, { spaceId: args.spaceId });
    if (!space) throw new Error("space not found");
    if (space.inboxId && space.inboxAddress) {
      return { inboxId: space.inboxId, address: space.inboxAddress };
    }
    const wanted = (args.username ?? space.slug ?? "space")
      .replace(/[^a-z0-9-]/gi, "-")
      .toLowerCase();
    const { inboxId, address } = await ctx.runAction(components.agentMail.lib.createInbox, {
      apiKey: env.AGENTMAIL_API_KEY,
      baseUrl: API,
      username: wanted,
      displayName: space.name ?? "OurSpaces",
      clientId: `ourspaces-${space.slug ?? wanted}`,
    });
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
  returns: v.null(),
  handler: async (ctx, { spaceId, to, subject, text, html }) => {
    // rate-limiter: AgentMail's free tier caps at 3 inboxes total — guard
    // send volume so a retry loop or a chatty digest can't burn the quota.
    await rateLimiter.limit(ctx, "mailSend", { key: spaceId, throws: true });
    const space = await ctx.runQuery(internal.agentmail.getSpaceInbox, { spaceId });
    if (!space?.inboxId) throw new Error("space has no inbox");
    await ctx.runAction(components.agentMail.lib.sendMessage, {
      apiKey: env.AGENTMAIL_API_KEY,
      baseUrl: API,
      inboxId: space.inboxId,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
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
  returns: v.union(
    v.object({
      slug: v.optional(v.string()),
      name: v.string(),
      inboxId: v.optional(v.string()),
      inboxAddress: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { spaceId }) => {
    const s = await ctx.db.get(spaceId);
    return s
      ? { slug: s.slug, name: s.name, inboxId: s.inboxId, inboxAddress: s.inboxAddress }
      : null;
  },
});

export const getSpaceBySlug = internalQuery({
  args: { slug: v.string() },
  returns: v.union(schema.doc("spaces"), v.null()),
  handler: async (ctx, { slug }) =>
    await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});

/** Remove the `test-*` inbox stubs so ensureShowcaseInboxes can create real ones. */
export const clearStubInboxes = internalMutation({
  args: {},
  returns: v.array(v.string()),
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
  returns: v.null(),
  handler: async (ctx, { spaceId, inboxId, address }) => {
    await ctx.db.patch(spaceId, { inboxId, inboxAddress: address });
    return null;
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
  returns: v.id("emailEvents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("emailEvents", { ...args, createdAt: Date.now() });
  },
});

/** Inbound mail (from the webhook) → emailEvents row → the space's router.
 *  messageId/threadId are kept so the router can reply in-thread + label. */
export const onMessageReceived = internalMutation({
  args: {
    inboxId: v.string(),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { inboxId, messageId, threadId, from, to, subject, text }) => {
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
      messageId,
      threadId,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.inbox.processInbound, { eventId });
    return null;
  },
});
