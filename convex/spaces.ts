import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const RETIRED_SPACE_SLUGS = ["buildclub", "trip"] as const;

async function deleteSpaceBySlug(ctx: MutationCtx, slug: string) {
  const space = await ctx.db
    .query("spaces")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!space) return null;

  for (const widget of await ctx.db
    .query("widgets")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect()) {
    for (const vote of await ctx.db
      .query("votes")
      .withIndex("by_widget", (q) => q.eq("widgetId", widget._id))
      .collect()) {
      await ctx.db.delete(vote._id);
    }
    await ctx.db.delete(widget._id);
  }

  for (const table of ["messages", "members", "presence", "paintMarks", "emailEvents"] as const) {
    for (const row of await ctx.db
      .query(table)
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
  }

  await ctx.db.delete(space._id);
  return space._id;
}

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

/** One-off hue swap for a remix space (run via CLI). */
export const retintSpace = internalMutation({
  args: { slug: v.string(), color: v.string() },
  handler: async (ctx, { slug, color }) => {
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!space) throw new Error(`no space with slug ${slug}`);
    await ctx.db.patch(space._id, { color });
  },
});

/** One-off canvas resize for staging visual comparisons in a demo room. */
export const resizeCanvasBySlug = internalMutation({
  args: { slug: v.string(), canvasW: v.number(), canvasH: v.number() },
  returns: v.id("spaces"),
  handler: async (ctx, { slug, canvasW, canvasH }) => {
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!space) throw new Error(`no space with slug ${slug}`);
    await ctx.db.patch(space._id, { canvasW, canvasH });
    return space._id;
  },
});

/** Remove a space and everything hanging off it (run via CLI — used to clean
 * up the background-remix scaffolding once a winner was picked). */
export const deleteBySlug = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => deleteSpaceBySlug(ctx, slug),
});

export async function retireCutSpaceRows(ctx: MutationCtx) {
  const retired: string[] = [];
  for (const slug of RETIRED_SPACE_SLUGS) {
    const id = await deleteSpaceBySlug(ctx, slug);
    if (id) retired.push(slug);
  }
  return retired;
}

/** Drop the hackathon + Tahoe demo rooms from an already-seeded backend. */
export const retireCutSpaces = internalMutation({
  args: {},
  handler: async (ctx) => retireCutSpaceRows(ctx),
});

/** One-shot clone of a live space → a new slug (the background remixes).
 * Copies widgets, members, votes, messages, and paint so the copy is
 * indistinguishable from the original; skips the AgentMail inbox so webhooks
 * keep routing to the original. Idempotent per target slug. */
export const duplicateBySlug = internalMutation({
  args: { fromSlug: v.string(), toSlug: v.string(), name: v.string() },
  handler: async (ctx, { fromSlug, toSlug, name }) => {
    const existing = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", toSlug))
      .unique();
    if (existing) return existing._id;

    const source = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", fromSlug))
      .unique();
    if (!source) throw new Error(`no ${fromSlug} space to duplicate — seed first`);

    const now = Date.now();
    const spaceId = await ctx.db.insert("spaces", {
      name,
      type: source.type,
      icon: source.icon,
      color: source.color,
      slug: toSlug,
      tagline: source.tagline,
      canvasW: source.canvasW,
      canvasH: source.canvasH,
      createdAt: now,
      lastActivityAt: now,
    });

    for (const member of await ctx.db
      .query("members")
      .withIndex("by_space", (q) => q.eq("spaceId", source._id))
      .collect()) {
      const { _id, _creationTime, ...fields } = member;
      await ctx.db.insert("members", { ...fields, spaceId });
    }

    const widgetIds = new Map<string, string>();
    for (const widget of await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", source._id))
      .collect()) {
      const { _id, _creationTime, ...fields } = widget;
      const newId = await ctx.db.insert("widgets", { ...fields, spaceId });
      widgetIds.set(String(_id), newId);

      for (const vote of await ctx.db
        .query("votes")
        .withIndex("by_widget", (q) => q.eq("widgetId", _id))
        .collect()) {
        await ctx.db.insert("votes", {
          widgetId: newId,
          userId: vote.userId,
          optionId: vote.optionId,
        });
      }
    }

    for (const message of await ctx.db
      .query("messages")
      .withIndex("by_space", (q) => q.eq("spaceId", source._id))
      .collect()) {
      const { _id, _creationTime, ...fields } = message;
      // Thread ids are "<widgetId>" or "<widgetId>::q:<n>" — remap the base.
      const [base, ...suffix] = fields.widgetId.split("::");
      const mappedBase = base === "global" ? "global" : widgetIds.get(base);
      if (!mappedBase) continue;
      await ctx.db.insert("messages", {
        ...fields,
        spaceId,
        widgetId: [mappedBase, ...suffix].join("::"),
        promotedWidgetId: undefined,
      });
    }

    for (const mark of await ctx.db
      .query("paintMarks")
      .withIndex("by_space", (q) => q.eq("spaceId", source._id))
      .collect()) {
      const { _id, _creationTime, ...fields } = mark;
      const mappedWidget = widgetIds.get(String(fields.widgetId));
      if (!mappedWidget) continue;
      await ctx.db.insert("paintMarks", {
        ...fields,
        spaceId,
        widgetId: mappedWidget as typeof fields.widgetId,
      });
    }

    return spaceId;
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
