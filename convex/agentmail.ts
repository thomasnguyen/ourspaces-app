import { v } from "convex/values";
import { AgentMail } from "@agentmail/convex";
import { components, internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";

/** The space's inbox. Credentials come from AGENTMAIL_* env vars. */
export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.agentmail.onMessageReceived,
});

/** Give a space its own email address (idempotent). */
export const ensureInbox = action({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }): Promise<{ inboxId: string; address: string }> => {
    const space = await ctx.runQuery(internal.agentmail.getSpaceInbox, { spaceId });
    if (space?.inboxId && space.inboxAddress) {
      return { inboxId: space.inboxId, address: space.inboxAddress };
    }
    const username = (space?.slug ?? "space").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const inbox = await agentmail.createInbox(ctx as any, {
      username,
      displayName: space?.name ?? "OurSpaces",
    });
    const inboxId: string = inbox.inbox_id ?? inbox.inboxId ?? inbox.id;
    const address: string = inbox.email ?? inbox.address ?? inboxId;
    await ctx.runMutation(internal.agentmail.setSpaceInbox, { spaceId, inboxId, address });
    return { inboxId, address };
  },
});

export const getSpaceInbox = internalQuery({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const s = await ctx.db.get(spaceId);
    return s ? { slug: s.slug, name: s.name, inboxId: s.inboxId, inboxAddress: s.inboxAddress } : null;
  },
});

export const setSpaceInbox = internalMutation({
  args: { spaceId: v.id("spaces"), inboxId: v.string(), address: v.string() },
  handler: async (ctx, { spaceId, inboxId, address }) => {
    await ctx.db.patch(spaceId, { inboxId, inboxAddress: address });
  },
});

/** Fires when mail lands in any space inbox. Brief 4 step 7 turns this into a widget. */
export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, { message }) => {
    const inboxId: string = message.inbox_id ?? message.inboxId;
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_inbox", (q) => q.eq("inboxId", inboxId))
      .unique();
    if (!space) return;
    await ctx.db.insert("emailEvents", {
      spaceId: space._id,
      direction: "in",
      from: String(message.from ?? ""),
      to: String(message.to ?? space.inboxAddress ?? ""),
      subject: String(message.subject ?? ""),
      summary: String(message.text ?? message.extracted_text ?? "").slice(0, 400),
      createdAt: Date.now(),
    });
    // TODO(brief 4 step 7): schedule internal.inbox.processInbound to extract a widget.
  },
});
