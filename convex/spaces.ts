import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Feeds Home and the rail — preview payload plus live member count (PRD §11). */
export const listSpaces = query({
  args: {},
  handler: async (ctx) => {
    const spaces = await ctx.db.query("spaces").collect();
    return await Promise.all(
      spaces.map(async (space) => {
        const members = await ctx.db
          .query("members")
          .withIndex("by_space", (q) => q.eq("spaceId", space._id))
          .collect();
        return { ...space, memberCount: members.length };
      }),
    );
  },
});

/** Stable entry point for the vertical slice. Seed once, then query this on load. */
export const getDemoSpace = query({
  args: {},
  handler: async (ctx) => {
    const bySlug = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", "crew"))
      .unique();
    if (bySlug) return bySlug;
    return await ctx.db
      .query("spaces")
      .withIndex("by_name", (q) => q.eq("name", "the crew"))
      .unique();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) =>
    await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", slug)).unique(),
});

/** Load a space and its board in one subscription so room switches do not waterfall. */
export const getSpaceWithWidgets = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!space) return { space: null, widgets: [] };

    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .collect();
    return { space, widgets };
  },
});

export const createSpace = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("ongoing"), v.literal("event")),
    icon: v.string(),
    color: v.string(),
    eventAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("spaces", {
      ...args,
      createdAt: now,
      lastActivityAt: now,
    });
  },
});

/** Browser-local demo identity: no auth UI required for the realtime rehearsal. */
export const joinDemoSpace = mutation({
  args: {
    spaceId: v.id("spaces"),
    userId: v.string(),
    name: v.string(),
    color: v.string(),
    emoji: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, userId, name, color, emoji, avatarUrl }) => {
    const existing = await ctx.db
      .query("members")
      .withIndex("by_space_user", (q) =>
        q.eq("spaceId", spaceId).eq("userId", userId),
      )
      .unique();
    const lastSeen = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { name, color, emoji, avatarUrl, lastSeen });
      return existing._id;
    }

    return await ctx.db.insert("members", {
      spaceId,
      userId,
      name,
      color,
      emoji,
      avatarUrl,
      lastSeen,
    });
  },
});
