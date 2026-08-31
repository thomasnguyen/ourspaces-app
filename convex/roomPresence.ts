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

/** For the space list — "X online" per space without an active session. */
export const onlineCountForSpace = query({
  args: { spaceId: v.string() },
  returns: v.number(),
  handler: async (ctx, { spaceId }) => {
    const users = await presence.listRoom(ctx, spaceId, true);
    return users.length;
  },
});
