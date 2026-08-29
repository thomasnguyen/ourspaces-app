import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const PRESENCE_TTL_MS = 30_000;
const GESTURE_TTL_MS = 1_500;

const identityArgs = {
  spaceId: v.id("spaces"),
  userId: v.string(),
  name: v.string(),
  color: v.string(),
  emoji: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  x: v.number(),
  y: v.number(),
  zone: v.optional(v.string()),
};

const gestureIdentityArgs = {
  spaceId: v.id("spaces"),
  userId: v.string(),
  name: v.string(),
  color: v.string(),
  emoji: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  cursorX: v.number(),
  cursorY: v.number(),
};

const gestureLayoutArgs = {
  widgetId: v.id("widgets"),
  kind: v.union(v.literal("move"), v.literal("resize")),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  z: v.number(),
};

type PresenceIdentity = {
  spaceId: Id<"spaces">;
  userId: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  x: number;
  y: number;
  zone?: string;
};

async function findPresence(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  userId: string,
) {
  return await ctx.db
    .query("presence")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .filter((q) => q.eq(q.field("userId"), userId))
    .first();
}

async function upsertPresence(
  ctx: MutationCtx,
  identity: PresenceIdentity,
  updatedAt: number,
) {
  const existing = await findPresence(ctx, identity.spaceId, identity.userId);
  if (existing) {
    await ctx.db.patch(existing._id, {
      name: identity.name,
      color: identity.color,
      emoji: identity.emoji,
      avatarUrl: identity.avatarUrl,
      x: identity.x,
      y: identity.y,
      zone: identity.zone,
      updatedAt,
    });
    return existing._id;
  }

  return await ctx.db.insert("presence", { ...identity, updatedAt });
}

async function hasFreshCompetingGesture(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  userId: string,
  widgetId: Id<"widgets">,
  now: number,
) {
  const rows = await ctx.db
    .query("presence")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .collect();
  return rows.some(
    (row) =>
      row.userId !== userId &&
      row.gesture?.widgetId === widgetId &&
      now - row.gesture.updatedAt < GESTURE_TTL_MS,
  );
}

function gestureIdentity(args: {
  spaceId: Id<"spaces">;
  userId: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  cursorX: number;
  cursorY: number;
}): PresenceIdentity {
  return {
    spaceId: args.spaceId,
    userId: args.userId,
    name: args.name,
    color: args.color,
    emoji: args.emoji,
    avatarUrl: args.avatarUrl,
    x: args.cursorX,
    y: args.cursorY,
  };
}

export const heartbeat = mutation({
  args: identityArgs,
  handler: async (ctx, identity) => {
    return await upsertPresence(ctx, identity, Date.now());
  },
});

export const claimGesture = mutation({
  args: {
    ...gestureIdentityArgs,
    sessionId: v.string(),
    ...gestureLayoutArgs,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || widget.spaceId !== args.spaceId) {
      return { accepted: false as const, reason: "missing" as const };
    }

    const rows = await ctx.db
      .query("presence")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .collect();
    const owner = rows
      .filter(
        (row) =>
          row.userId !== args.userId &&
          row.gesture?.widgetId === args.widgetId &&
          now - row.gesture.updatedAt < GESTURE_TTL_MS,
      )
      .sort((a, b) => {
        const freshness =
          (b.gesture?.updatedAt ?? 0) - (a.gesture?.updatedAt ?? 0);
        return freshness || a.userId.localeCompare(b.userId);
      })[0];

    if (owner) {
      await upsertPresence(ctx, gestureIdentity(args), now);
      return {
        accepted: false as const,
        reason: "locked" as const,
        owner: {
          userId: owner.userId,
          name: owner.name,
          color: owner.color,
        },
      };
    }

    const presenceId = await upsertPresence(ctx, gestureIdentity(args), now);
    await ctx.db.patch(presenceId, {
      gesture: {
        sessionId: args.sessionId,
        widgetId: args.widgetId,
        kind: args.kind,
        x: args.x,
        y: args.y,
        w: args.w,
        h: args.h,
        z: args.z,
        updatedAt: now,
      },
    });
    return { accepted: true as const };
  },
});

export const updateGesture = mutation({
  args: {
    ...gestureIdentityArgs,
    sessionId: v.string(),
    ...gestureLayoutArgs,
  },
  handler: async (ctx, args) => {
    const existing = await findPresence(ctx, args.spaceId, args.userId);
    const now = Date.now();
    if (
      !existing?.gesture ||
      existing.gesture.sessionId !== args.sessionId ||
      existing.gesture.widgetId !== args.widgetId ||
      now - existing.gesture.updatedAt >= GESTURE_TTL_MS ||
      (await hasFreshCompetingGesture(
        ctx,
        args.spaceId,
        args.userId,
        args.widgetId,
        now,
      ))
    ) {
      if (
        existing?.gesture?.sessionId === args.sessionId &&
        existing.gesture.widgetId === args.widgetId
      ) {
        await ctx.db.patch(existing._id, { gesture: undefined });
      }
      return false;
    }

    await ctx.db.patch(existing._id, {
      name: args.name,
      color: args.color,
      emoji: args.emoji,
      avatarUrl: args.avatarUrl,
      x: args.cursorX,
      y: args.cursorY,
      updatedAt: now,
      gesture: {
        sessionId: args.sessionId,
        widgetId: args.widgetId,
        kind: args.kind,
        x: args.x,
        y: args.y,
        w: args.w,
        h: args.h,
        z: args.z,
        updatedAt: now,
      },
    });
    return true;
  },
});

export const finishGesture = mutation({
  args: {
    ...gestureIdentityArgs,
    sessionId: v.string(),
    ...gestureLayoutArgs,
  },
  handler: async (ctx, args) => {
    const existing = await findPresence(ctx, args.spaceId, args.userId);
    const now = Date.now();
    if (
      !existing?.gesture ||
      existing.gesture.sessionId !== args.sessionId ||
      existing.gesture.widgetId !== args.widgetId ||
      now - existing.gesture.updatedAt >= GESTURE_TTL_MS ||
      (await hasFreshCompetingGesture(
        ctx,
        args.spaceId,
        args.userId,
        args.widgetId,
        now,
      ))
    ) {
      if (
        existing?.gesture?.sessionId === args.sessionId &&
        existing.gesture.widgetId === args.widgetId
      ) {
        await ctx.db.patch(existing._id, { gesture: undefined });
      }
      return false;
    }

    const widget = await ctx.db.get(args.widgetId);
    if (!widget || widget.spaceId !== args.spaceId) {
      await ctx.db.patch(existing._id, {
        gesture: undefined,
        updatedAt: now,
      });
      return false;
    }

    await ctx.db.patch(args.widgetId, {
      x: args.x,
      y: args.y,
      w: args.w,
      h: args.h,
      z: args.z,
    });
    await ctx.db.patch(existing._id, {
      name: args.name,
      color: args.color,
      emoji: args.emoji,
      avatarUrl: args.avatarUrl,
      x: args.cursorX,
      y: args.cursorY,
      updatedAt: now,
      gesture: undefined,
    });
    return true;
  },
});

export const cancelGesture = mutation({
  args: {
    spaceId: v.id("spaces"),
    userId: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await findPresence(ctx, args.spaceId, args.userId);
    if (!existing?.gesture || existing.gesture.sessionId !== args.sessionId) {
      return false;
    }
    await ctx.db.patch(existing._id, {
      gesture: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const listHereNow = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const staleBefore = Date.now() - PRESENCE_TTL_MS;
    return await ctx.db
      .query("presence")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .filter((q) => q.gte(q.field("updatedAt"), staleBefore))
      .collect();
  },
});

export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const staleBefore = Date.now() - 120_000;
    const rows = await ctx.db.query("presence").collect();
    for (const row of rows) {
      if (row.updatedAt < staleBefore) await ctx.db.delete(row._id);
    }
  },
});
