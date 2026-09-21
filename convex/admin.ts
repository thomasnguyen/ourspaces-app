import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { messagesCounter, widgetsCounter } from "./stats";
import { pollTallies } from "./votes";

/**
 * The secret admin page (`#/admin`, docs/local/admin-reset.md).
 *
 * Rooms are public and unlocked on purpose — anyone who walks in can drag a
 * poll across the board or empty a thread. So each room keeps a BASELINE: a
 * snapshot of the board the way we want visitors to find it. Save it once
 * when a room looks right; "reset" throws away whatever happened since and
 * replays it.
 *
 * What a reset restores: the space row's look (name, icon, color, tagline,
 * canvas size), every widget, its votes, its paint, and every message.
 * What it deliberately does NOT touch: `members` (real people who joined —
 * that history is the point), the AgentMail inbox, the slug, and ownership.
 * What it clears outright: recaps, ask streams, the work log, cursors, and
 * any mail that landed after the baseline was saved.
 *
 * Every function here is gated on ADMIN_KEY, a Convex env var. There is no
 * other door: the route renders a key field and nothing else until the key
 * checks out server-side.
 */

const BASELINE_VERSION = 1;
/** A Convex document caps at 1 MiB; the whole database is ~65 KB of board. */
const MAX_BASELINE_CHARS = 900_000;

const resetAllReturns = v.object({
  rooms: v.array(v.object({ slug: v.string(), widgets: v.number(), messages: v.number() })),
  cleared: v.number(),
  skipped: v.array(v.string()),
});

function requireAdmin(key: string) {
  const expected = env.ADMIN_KEY?.trim();
  if (!expected) {
    throw new Error("ADMIN_KEY is not set on this deployment — npx convex env set ADMIN_KEY <key>");
  }
  if (key !== expected) throw new Error("wrong admin key");
}

type BaselineWidget = {
  key: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotate?: number;
  data: Doc<"widgets">["data"];
  createdBy: string;
  createdAt: number;
};

type Baseline = {
  version: number;
  savedAt: number;
  space: {
    name: string;
    type: Doc<"spaces">["type"];
    icon: string;
    color: string;
    tagline?: string;
    canvasW?: number;
    canvasH?: number;
    eventAt?: number;
  };
  widgets: BaselineWidget[];
  votes: { widget: string; userId: string; optionId: string }[];
  /** `thread` is "global", a widget key, or "<widget key>::q:<n>". */
  messages: (Omit<Doc<"messages">, "_id" | "_creationTime" | "spaceId" | "widgetId" | "promotedWidgetId"> & {
    thread: string;
    promoted?: string;
  })[];
  paint: (Omit<Doc<"paintMarks">, "_id" | "_creationTime" | "spaceId" | "widgetId"> & { widget: string })[];
};

async function spaceBySlug(ctx: QueryCtx, slug: string) {
  return await ctx.db
    .query("spaces")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

async function baselineRow(ctx: QueryCtx, slug: string) {
  return await ctx.db
    .query("baselines")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

/** Thread ids are "global" | "recap" | "<widgetId>" | "<widgetId>::q:<n>" —
 *  only the base segment is ever an id, so only the base gets translated.
 *
 *  A base that isn't in the map travels UNCHANGED. Two kinds of thread land
 *  here: the named ones ("global", "recap" — convex/recap.ts), and threads
 *  whose widget was already deleted before the baseline was frozen. Dropping
 *  those messages instead cost the crew 11 and the book club 3 on the first
 *  master reset: a message is the one thing on a board a person wrote by
 *  hand, so it is never collateral for a dangling pointer. */
function remapThread(thread: string, map: Map<string, string>) {
  const [base, ...suffix] = thread.split("::");
  const mapped = map.get(base);
  return mapped ? [mapped, ...suffix].join("::") : thread;
}

async function readBoard(ctx: QueryCtx, space: Doc<"spaces">): Promise<Baseline> {
  const widgets = await ctx.db
    .query("widgets")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect();

  const votes: Baseline["votes"] = [];
  for (const widget of widgets) {
    for (const vote of await ctx.db
      .query("votes")
      .withIndex("by_widget", (q) => q.eq("widgetId", widget._id))
      .collect()) {
      votes.push({ widget: String(widget._id), userId: vote.userId, optionId: vote.optionId });
    }
  }

  const messages: Baseline["messages"] = [];
  for (const message of await ctx.db
    .query("messages")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect()) {
    const { _id, _creationTime, spaceId, widgetId, promotedWidgetId, ...fields } = message;
    messages.push({
      ...fields,
      thread: widgetId,
      promoted: promotedWidgetId ? String(promotedWidgetId) : undefined,
    });
  }

  const paint: Baseline["paint"] = [];
  for (const mark of await ctx.db
    .query("paintMarks")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect()) {
    const { _id, _creationTime, spaceId, widgetId, ...fields } = mark;
    paint.push({ ...fields, widget: String(widgetId) });
  }

  return {
    version: BASELINE_VERSION,
    savedAt: Date.now(),
    space: {
      name: space.name,
      type: space.type,
      icon: space.icon,
      color: space.color,
      tagline: space.tagline,
      canvasW: space.canvasW,
      canvasH: space.canvasH,
      eventAt: space.eventAt,
    },
    // Embeddings are left out on purpose: they are ~8 KB a widget and
    // similar.backfillSpace rebuilds them after a reset.
    widgets: widgets.map((widget) => ({
      key: String(widget._id),
      type: widget.type,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      z: widget.z,
      rotate: widget.rotate,
      data: widget.data,
      createdBy: widget.createdBy,
      createdAt: widget.createdAt,
    })),
    votes,
    messages,
    paint,
  };
}

async function writeBaseline(ctx: MutationCtx, space: Doc<"spaces">) {
  const board = await readBoard(ctx, space);
  const json = JSON.stringify(board);
  if (json.length > MAX_BASELINE_CHARS) {
    throw new Error(`${space.slug}: baseline is ${json.length} chars, over the document cap`);
  }
  const existing = await baselineRow(ctx, space.slug!);
  if (existing) await ctx.db.patch(existing._id, { savedAt: board.savedAt, json });
  else await ctx.db.insert("baselines", { slug: space.slug!, savedAt: board.savedAt, json });
  return { slug: space.slug!, savedAt: board.savedAt, widgets: board.widgets.length, messages: board.messages.length, bytes: json.length };
}

/** Wipe the board and replay the baseline. Members are untouched. */
async function restoreBaseline(ctx: MutationCtx, space: Doc<"spaces">) {
  const row = await baselineRow(ctx, space.slug!);
  if (!row) throw new Error(`${space.slug} has no baseline saved yet`);
  const baseline = JSON.parse(row.json) as Baseline;
  const removed = { widgets: 0, messages: 0, votes: 0, paint: 0, mail: 0, other: 0 };

  // 1 · the board as it stands: widgets take their votes and paint with them
  for (const widget of await ctx.db
    .query("widgets")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect()) {
    for (const vote of await ctx.db
      .query("votes")
      .withIndex("by_widget", (q) => q.eq("widgetId", widget._id))
      .collect()) {
      await pollTallies.delete(ctx, vote);
      await ctx.db.delete(vote._id);
      removed.votes += 1;
    }
    await ctx.db.delete(widget._id);
    await widgetsCounter.dec(ctx);
    removed.widgets += 1;
  }
  for (const mark of await ctx.db
    .query("paintMarks")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect()) {
    await ctx.db.delete(mark._id);
    removed.paint += 1;
  }
  for (const message of await ctx.db
    .query("messages")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id))
    .collect()) {
    await ctx.db.delete(message._id);
    await messagesCounter.dec(ctx);
    removed.messages += 1;
  }

  // 2 · the transient rows that describe a board that no longer exists
  for (const recap of await ctx.db.query("recaps").withIndex("by_space", (q) => q.eq("spaceId", space._id)).collect()) {
    await ctx.db.delete(recap._id);
    removed.other += 1;
  }
  for (const stream of await ctx.db.query("askStreams").withIndex("by_space", (q) => q.eq("spaceId", space._id)).collect()) {
    await ctx.db.delete(stream._id);
    removed.other += 1;
  }
  for (const step of await ctx.db.query("work").withIndex("by_space", (q) => q.eq("spaceId", space._id)).collect()) {
    await ctx.db.delete(step._id);
    removed.other += 1;
  }
  for (const cursor of await ctx.db.query("presence").withIndex("by_space", (q) => q.eq("spaceId", space._id)).collect()) {
    await ctx.db.delete(cursor._id);
    removed.other += 1;
  }
  // Mail that landed after the baseline: its widget is gone, so the arrival
  // envelope would narrate a filing that points at nothing. Older events stay.
  for (const event of await ctx.db
    .query("emailEvents")
    .withIndex("by_space", (q) => q.eq("spaceId", space._id).gte("_creationTime", baseline.savedAt))
    .collect()) {
    await ctx.db.delete(event._id);
    removed.mail += 1;
  }
  // Queued Firecrawl refreshes for widgets that just stopped existing.
  for (const queued of await ctx.db.query("linkRefreshQueue").collect()) {
    if (!(await ctx.db.get(queued.widgetId))) {
      await ctx.db.delete(queued._id);
      removed.other += 1;
    }
  }

  // 3 · the space row's look. Slug, inbox, owner and askThread are routing —
  // restoring those would break mail and hand the room to whoever saved it.
  await ctx.db.patch(space._id, {
    name: baseline.space.name,
    type: baseline.space.type,
    icon: baseline.space.icon,
    color: baseline.space.color,
    tagline: baseline.space.tagline,
    canvasW: baseline.space.canvasW,
    canvasH: baseline.space.canvasH,
    eventAt: baseline.space.eventAt,
    lastActivityAt: Date.now(),
    ragIndexedAt: undefined,
  });

  // 4 · replay. New ids, so everything that referenced one gets translated.
  const widgetIds = new Map<string, string>();
  for (const widget of baseline.widgets) {
    const { key, ...fields } = widget;
    const newId = await ctx.db.insert("widgets", { ...fields, spaceId: space._id });
    widgetIds.set(key, newId);
    await widgetsCounter.inc(ctx);
  }
  for (const vote of baseline.votes) {
    const widgetId = widgetIds.get(vote.widget);
    if (!widgetId) continue;
    const voteId = await ctx.db.insert("votes", {
      widgetId: widgetId as Id<"widgets">,
      userId: vote.userId,
      optionId: vote.optionId,
    });
    await pollTallies.insert(ctx, (await ctx.db.get(voteId))!);
  }
  for (const message of baseline.messages) {
    const { thread, promoted, ...fields } = message;
    const widgetId = remapThread(thread, widgetIds);
    const promotedWidgetId = promoted ? widgetIds.get(promoted) : undefined;
    await ctx.db.insert("messages", {
      ...fields,
      spaceId: space._id,
      widgetId,
      promotedWidgetId: promotedWidgetId as Id<"widgets"> | undefined,
    });
    await messagesCounter.inc(ctx);
  }
  // Paint is the only thing that can be dropped here, and only when its
  // widget is gone from the baseline — a stroke with nothing under it has
  // nowhere to be drawn.
  for (const mark of baseline.paint) {
    const { widget, ...fields } = mark;
    const widgetId = widgetIds.get(widget);
    if (!widgetId) continue;
    await ctx.db.insert("paintMarks", {
      ...fields,
      spaceId: space._id,
      widgetId: widgetId as Id<"widgets">,
    });
  }

  // 5 · the two indexes that point at the ids we just replaced.
  await ctx.scheduler.runAfter(0, internal.rag.reindexSpace, { spaceId: space._id });
  await ctx.scheduler.runAfter(0, internal.similar.backfillSpace, { spaceId: space._id });

  return {
    slug: space.slug!,
    savedAt: baseline.savedAt,
    removed,
    restored: { widgets: baseline.widgets.length, messages: baseline.messages.length, votes: baseline.votes.length, paint: baseline.paint.length },
  };
}

/** Does this key open the page? The only thing the route asks before the key
 *  is accepted, and the only thing it can ask without one. */
export const check = query({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (_ctx, { key }) => {
    const expected = env.ADMIN_KEY?.trim();
    return Boolean(expected) && key === expected;
  },
});

/** Every room, what is on its board now, and what its baseline holds. */
export const overview = query({
  args: { key: v.string() },
  returns: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      icon: v.string(),
      color: v.string(),
      live: v.object({ widgets: v.number(), messages: v.number(), members: v.number() }),
      baseline: v.union(
        v.null(),
        v.object({ savedAt: v.number(), widgets: v.number(), messages: v.number(), bytes: v.number() }),
      ),
    }),
  ),
  handler: async (ctx, { key }) => {
    requireAdmin(key);
    const rows = [];
    for (const space of await ctx.db.query("spaces").collect()) {
      if (!space.slug || space.archivedAt) continue;
      const widgets = await ctx.db
        .query("widgets")
        .withIndex("by_space", (q) => q.eq("spaceId", space._id))
        .collect();
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_space", (q) => q.eq("spaceId", space._id))
        .collect();
      const members = await ctx.db
        .query("members")
        .withIndex("by_space", (q) => q.eq("spaceId", space._id))
        .collect();
      const saved = await baselineRow(ctx, space.slug);
      const parsed = saved ? (JSON.parse(saved.json) as Baseline) : null;
      rows.push({
        slug: space.slug,
        name: space.name,
        icon: space.icon,
        color: space.color,
        live: { widgets: widgets.length, messages: messages.length, members: members.length },
        baseline: parsed
          ? { savedAt: saved!.savedAt, widgets: parsed.widgets.length, messages: parsed.messages.length, bytes: saved!.json.length }
          : null,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Freeze this room's board as the state reset returns to. Overwrites the
 *  room's previous baseline — the page makes you type the slug first. */
export const saveBaseline = mutation({
  args: { key: v.string(), slug: v.string() },
  returns: v.object({ slug: v.string(), savedAt: v.number(), widgets: v.number(), messages: v.number(), bytes: v.number() }),
  handler: async (ctx, { key, slug }) => {
    requireAdmin(key);
    const space = await spaceBySlug(ctx, slug);
    if (!space) throw new Error(`no space with slug "${slug}"`);
    return await writeBaseline(ctx, space);
  },
});

/** Throw away what visitors did and put the room back. */
export const resetToBaseline = mutation({
  args: { key: v.string(), slug: v.string() },
  returns: v.object({
    slug: v.string(),
    savedAt: v.number(),
    removed: v.object({ widgets: v.number(), messages: v.number(), votes: v.number(), paint: v.number(), mail: v.number(), other: v.number() }),
    restored: v.object({ widgets: v.number(), messages: v.number(), votes: v.number(), paint: v.number() }),
  }),
  handler: async (ctx, { key, slug }) => {
    requireAdmin(key);
    const space = await spaceBySlug(ctx, slug);
    if (!space) throw new Error(`no space with slug "${slug}"`);
    return await restoreBaseline(ctx, space);
  },
});

/** The master reset: every room that has a baseline, put back in one go.
 *  Demo-scale (eight rooms, ~70 widgets, ~90 messages), so a single
 *  transaction covers it — either every room lands or none of them do. */
async function restoreEveryRoom(ctx: MutationCtx) {
  const rooms = [];
  const skipped: string[] = [];
  let cleared = 0;
  for (const space of await ctx.db.query("spaces").collect()) {
    if (!space.slug || space.archivedAt) continue;
    if (!(await baselineRow(ctx, space.slug))) {
      skipped.push(space.slug);
      continue;
    }
    const out = await restoreBaseline(ctx, space);
    cleared += out.removed.widgets + out.removed.messages;
    rooms.push({ slug: out.slug, widgets: out.restored.widgets, messages: out.restored.messages });
  }
  return { rooms, cleared, skipped };
}

export const resetAll = mutation({
  args: { key: v.string() },
  returns: resetAllReturns,
  handler: async (ctx, { key }) => {
    requireAdmin(key);
    return await restoreEveryRoom(ctx);
  },
});

/** The same master reset, on a timer (`convex/crons.ts`, midnight Pacific).
 *  Rooms are public and unlocked, so a day of visitors leaves drag-scribble
 *  and spam on the board; every morning it is the room we meant to show.
 *  No key: crons call internal functions directly, and nothing on the public
 *  API surface reaches this. */
export const nightlyReset = internalMutation({
  args: {},
  returns: resetAllReturns,
  handler: async (ctx) => {
    const out = await restoreEveryRoom(ctx);
    console.log(
      `nightly reset: ${out.rooms.length} rooms back to baseline, ${out.cleared} rows cleared` +
        (out.skipped.length ? `, skipped (no baseline): ${out.skipped.join(", ")}` : ""),
    );
    return out;
  },
});
