import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Presence } from "@convex-dev/presence";

/**
 * presence component: lightweight "who has this space open right now"
 * signal for the space list — deliberately separate from the hand-rolled
 * canvas cursor/gesture system in convex/presence.ts. That system's ~90ms
 * writes drive live widget dragging and double as the gesture-lock
 * arbitration mechanism; swapping it for this component would mean two
 * parallel write paths on the hottest path in the app for no real gain,
 * since the component doesn't arbitrate locks. This is a genuinely
 * separate feature: room occupancy, not cursor coordinates.
 */
export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, { roomId, userId, sessionId, interval }) =>
    await presence.heartbeat(ctx, roomId, userId, sessionId, interval),
});

export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(
    v.object({
      userId: v.string(),
      online: v.boolean(),
      lastDisconnected: v.number(),
      // `unknown` in @convex-dev/presence's own list() return type; we
      // never set or read it, so v.any() mirrors upstream rather than
      // inventing a shape.
      data: v.optional(v.any()),
    }),
  ),
  handler: async (ctx, { roomToken }) => await presence.list(ctx, roomToken),
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    await presence.disconnect(ctx, sessionToken);
    return null;
  },
});

/**
 * Room occupancy for the space list — both numbers the UI wants, from ONE
 * subscription.
 *
 * The rail asks two questions about every tile: "N here" (everyone, in the
 * tooltip) and "is someone ELSE there" (the lime dot). Those used to be two
 * calls to a count-only query with different args — and different args mean
 * different cache keys, so each tile held two live subscriptions doing the
 * same `listRoom` read. That was the largest bandwidth line in the presence
 * component. Returning both numbers means every caller passes identical args,
 * which is what lets convex-helpers' query cache collapse them into one.
 */
export const onlineForSpace = query({
  args: { spaceId: v.string(), userId: v.optional(v.string()) },
  returns: v.object({ total: v.number(), others: v.number() }),
  handler: async (ctx, { spaceId, userId }) => {
    const users = await presence.listRoom(ctx, spaceId, true);
    const total = users.length;
    return {
      total,
      others: userId
        ? users.filter((user) => user.userId !== userId).length
        : total,
    };
  },
});

/**
 * Legacy count-only shape. Superseded by `onlineForSpace`; kept ONLY because
 * the deployed bundle still calls it, and dropping it would break the live
 * site until the frontend is redeployed. Delete once prod is on a build that
 * uses the pair above — nothing in src/ calls it any more.
 */
export const onlineCountForSpace = query({
  args: { spaceId: v.string(), excludeUserId: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, { spaceId, excludeUserId }) => {
    const users = await presence.listRoom(ctx, spaceId, true);
    return users.filter((user) => user.userId !== excludeUserId).length;
  },
});
