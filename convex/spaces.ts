import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";
import { pollTallies } from "./votes";
import { messagesCounter, spacesCounter, widgetsCounter } from "./stats";

const RETIRED_SPACE_SLUGS = ["buildclub", "trip"] as const;

// aggregate mirror: live member count per space (namespaced, unsorted — we
// only need the count). Kills the `.collect().length` in listSpaces.
export const memberCounts = new TableAggregate<{
  Namespace: Id<"spaces">;
  Key: null;
  DataModel: DataModel;
  TableName: "members";
}>(components.memberCounts, {
  namespace: (doc) => doc.spaceId,
  sortKey: () => null,
});

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
      await pollTallies.delete(ctx, vote);
    }
    await ctx.db.delete(widget._id);
    await widgetsCounter.dec(ctx);
  }

  for (const member of await ctx.db
    .query("members")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect()) {
    await ctx.db.delete(member._id);
    await memberCounts.delete(ctx, member);
  }

  for (const table of ["messages", "presence", "paintMarks", "emailEvents", "recaps"] as const) {
    for (const row of await ctx.db
      .query(table)
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .collect()) {
      await ctx.db.delete(row._id);
      if (table === "messages") await messagesCounter.dec(ctx);
    }
  }

  await ctx.db.delete(space._id);
  await spacesCounter.dec(ctx);
  return space._id;
}

/** Feeds Home and the rail — preview payload plus live member count (PRD §11). */
export const listSpaces = query({
  args: {},
  returns: v.array(schema.doc("spaces").extend({ memberCount: v.number() })),
  handler: async (ctx) => {
    const spaces = await ctx.db.query("spaces").collect();
    return await Promise.all(
      spaces.map(async (space) => {
        const memberCount = await memberCounts.count(ctx, { namespace: space._id });
        return { ...space, memberCount };
      }),
    );
  },
});

/** Stable entry point for the vertical slice. Seed once, then query this on load. */
export const getDemoSpace = query({
  args: {},
  returns: v.union(schema.doc("spaces"), v.null()),
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
  returns: v.union(schema.doc("spaces"), v.null()),
  handler: async (ctx, { slug }) =>
    await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", slug)).unique(),
});

/** Load a space and its board in one subscription so room switches do not waterfall. */
export const getSpaceWithWidgets = query({
  args: { slug: v.string() },
  returns: v.object({
    space: v.union(schema.doc("spaces"), v.null()),
    widgets: v.array(schema.doc("widgets")),
  }),
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
  returns: v.id("spaces"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("spaces", {
      ...args,
      createdAt: now,
      lastActivityAt: now,
    });
    await spacesCounter.inc(ctx);
    return id;
  },
});

/** One-off hue swap for a remix space (run via CLI). */
export const retintSpace = internalMutation({
  args: { slug: v.string(), color: v.string() },
  returns: v.null(),
  handler: async (ctx, { slug, color }) => {
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!space) throw new Error(`no space with slug ${slug}`);
    await ctx.db.patch(space._id, { color });
    return null;
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
  returns: v.union(v.id("spaces"), v.null()),
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
  returns: v.array(v.string()),
  handler: async (ctx) => retireCutSpaceRows(ctx),
});

/** One-shot clone of a live space → a new slug (the background remixes).
 * Copies widgets, members, votes, messages, and paint so the copy is
 * indistinguishable from the original; skips the AgentMail inbox so webhooks
 * keep routing to the original. Idempotent per target slug. */
export const duplicateBySlug = internalMutation({
  args: { fromSlug: v.string(), toSlug: v.string(), name: v.string() },
  returns: v.id("spaces"),
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
    await spacesCounter.inc(ctx);

    for (const member of await ctx.db
      .query("members")
      .withIndex("by_space", (q) => q.eq("spaceId", source._id))
      .collect()) {
      const { _id, _creationTime, ...fields } = member;
      const newMemberId = await ctx.db.insert("members", { ...fields, spaceId });
      const newMember = await ctx.db.get(newMemberId);
      await memberCounts.insert(ctx, newMember!);
    }

    const widgetIds = new Map<string, string>();
    for (const widget of await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", source._id))
      .collect()) {
      const { _id, _creationTime, ...fields } = widget;
      const newId = await ctx.db.insert("widgets", { ...fields, spaceId });
      widgetIds.set(String(_id), newId);
      await widgetsCounter.inc(ctx);

      for (const vote of await ctx.db
        .query("votes")
        .withIndex("by_widget", (q) => q.eq("widgetId", _id))
        .collect()) {
        const newVoteId = await ctx.db.insert("votes", {
          widgetId: newId,
          userId: vote.userId,
          optionId: vote.optionId,
        });
        const newVote = await ctx.db.get(newVoteId);
        await pollTallies.insert(ctx, newVote!);
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
      await messagesCounter.inc(ctx);
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
  returns: v.id("members"),
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

    const memberId = await ctx.db.insert("members", {
      spaceId,
      userId,
      name,
      color,
      emoji,
      avatarUrl,
      lastSeen,
    });
    const member = await ctx.db.get(memberId);
    await memberCounts.insert(ctx, member!);
    return memberId;
  },
});
