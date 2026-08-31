import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { COUPLE_WIDGETS, CREW_WIDGETS, SPACES_BY_ID } from "../src/data/spaces";
import { getGlobalThread, getThreadsForSpace } from "../src/data/chat";
import { retireCutSpaceRows } from "./spaces";
import type { ItineraryData, LinkCardData, WidgetData } from "./widgetData";

function seedUserId(slug: string, name: string) {
  return `seed:${slug}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function convexSafe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(convexSafe);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      /^[\x20-\x7E]+$/.test(key)
        ? key
        : `__unicode_${Array.from(key).map((char) => char.codePointAt(0)?.toString(16)).join("_")}`,
      convexSafe(child),
    ]),
  );
}

async function seedSpace(
  ctx: MutationCtx,
  meta: (typeof SPACES_BY_ID)[string],
  now: number,
) {
  const slug = meta.id;
  const size = meta.canvasSize ?? (slug === "league"
    ? { width: 1060, height: 780 }
    : { width: 1640, height: 1080 });
  const spaceId = await ctx.db.insert("spaces", {
    name: meta.name,
    type: meta.kind,
    icon: meta.icon,
    color: meta.color,
    slug,
    tagline: meta.tagline,
    canvasW: size.width,
    canvasH: size.height,
    createdAt: now,
    lastActivityAt: now,
  });

  for (const member of meta.members) {
    await ctx.db.insert("members", {
      spaceId,
      userId: seedUserId(slug, member.name),
      name: member.name,
      color: member.color,
      lastSeen: now,
    });
  }

  const widgetIds = new Map<string, string>();
  for (const widget of meta.widgets) {
    const id = await ctx.db.insert("widgets", {
      spaceId,
      type: widget.type,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      z: widget.z,
      rotate: widget.rotate,
      data: convexSafe(widget.data) as WidgetData,
      createdBy: seedUserId(slug, meta.members[0]?.name ?? "guest"),
      createdAt: now,
    });
    widgetIds.set(`${slug}:${widget.id}`, id);

    if (widget.type === "poll") {
      for (const option of (widget.data.options as any[]) ?? []) {
        for (const voter of option.voters ?? []) {
          await ctx.db.insert("votes", {
            widgetId: id,
            userId: seedUserId(slug, voter),
            optionId: option.id,
          });
        }
      }
    }
  }

  return { spaceId, widgetIds };
}

async function seedSpaceMessages(
  ctx: MutationCtx,
  meta: (typeof SPACES_BY_ID)[string],
  spaceId: Id<"spaces">,
  widgetIds: Map<string, string>,
  now: number,
) {
  const global = getGlobalThread(meta.id);
  const threads = [global, ...Object.values(getThreadsForSpace(meta.id))];
  let offset = threads.reduce((total, thread) => total + thread.messages.length, 0);
  for (const thread of threads) {
    for (const [index, message] of thread.messages.entries()) {
      const [baseThreadId, ...threadSuffix] = thread.widgetId.split("::");
      const mappedBase = widgetIds.get(`${meta.id}:${baseThreadId}`);
      const widgetId = thread.widgetId === "global"
        ? "global"
        : mappedBase
          ? [mappedBase, ...threadSuffix].join("::")
          : undefined;
      if (!widgetId) continue;
      const member = meta.members.find((candidate) => candidate.name === message.from);
      await ctx.db.insert("messages", {
        spaceId,
        widgetId: String(widgetId),
        userId: seedUserId(meta.id, message.from),
        text: message.text,
        createdAt: now - (offset - index) * 60_000,
        authorName: message.from,
        authorColor: member?.color ?? "#8b8b8b",
        promotable: message.promotable,
      });
    }
    offset -= thread.messages.length;
  }
}

async function seedMissing(ctx: MutationCtx) {
  const now = Date.now();
  const seeded: string[] = [];
  for (const meta of Object.values(SPACES_BY_ID)) {
    const existing = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", meta.id))
      .unique();
    if (existing) continue;
    const { spaceId, widgetIds } = await seedSpace(ctx, meta, now);
    await seedSpaceMessages(ctx, meta, spaceId, widgetIds, now);
    seeded.push(meta.id);
  }
  return seeded;
}

async function seedAll(ctx: MutationCtx) {
  const now = Date.now();
  const widgetIds = new Map<string, string>();
  const spaceIds = new Map<string, Id<"spaces">>();

  for (const meta of Object.values(SPACES_BY_ID)) {
    const seeded = await seedSpace(ctx, meta, now);
    spaceIds.set(meta.id, seeded.spaceId);
    for (const [key, id] of seeded.widgetIds) widgetIds.set(key, id);
  }

  for (const meta of Object.values(SPACES_BY_ID)) {
    const spaceId = spaceIds.get(meta.id);
    if (!spaceId) continue;
    await seedSpaceMessages(ctx, meta, spaceId, widgetIds, now);
  }

  return spaceIds.get("crew");
}

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    await retireCutSpaceRows(ctx);
    await seedMissing(ctx);
    const existing = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", "crew")).unique();
    if (existing) return existing._id;
    return seedAll(ctx);
  },
});

export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["messages", "votes", "paintMarks", "presence", "widgets", "members", "spaces", "recaps"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    return seedAll(ctx);
  },
});

/** Non-destructive: rebrand the crew's tahoe itinerary into the upcoming
 * japan trip (in its own frame) and seed the couple's letter, so live
 * canvases pick up the mail demo without a reseed. Idempotent. */
export const backfillMailDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const out: string[] = [];
    const crew = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", "crew"))
      .unique();
    if (crew) {
      const widgets = await ctx.db
        .query("widgets")
        .withIndex("by_space", (q) => q.eq("spaceId", crew._id))
        .collect();
      const itinerary = widgets.find((w) => w.type === "itinerary");
      if (itinerary && (itinerary.data as ItineraryData).title.startsWith("tahoe")) {
        const mock = CREW_WIDGETS.find((w) => w.id === "itinerary");
        if (mock) {
          await ctx.db.patch(itinerary._id, {
            x: mock.x,
            y: mock.y,
            w: mock.w,
            h: mock.h,
            rotate: mock.rotate,
            data: mock.data,
          });
          out.push("crew itinerary → japan");
        }
      }
      const hasJapanFrame = widgets.some(
        (w) =>
          w.type === "frame" &&
          String((w.data as Record<string, unknown>).title ?? "") === "japan trip",
      );
      if (!hasJapanFrame) {
        const mockFrame = CREW_WIDGETS.find((w) => w.id === "frame-japan");
        if (mockFrame) {
          await ctx.db.insert("widgets", {
            spaceId: crew._id,
            type: "frame",
            x: mockFrame.x,
            y: mockFrame.y,
            w: mockFrame.w,
            h: mockFrame.h,
            z: mockFrame.z,
            data: mockFrame.data,
            createdBy: "seed",
            createdAt: Date.now(),
          });
          out.push("crew japan frame");
        }
      }
    }
    const couple = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", "couple"))
      .unique();
    if (couple) {
      const widgets = await ctx.db
        .query("widgets")
        .withIndex("by_space", (q) => q.eq("spaceId", couple._id))
        .collect();
      if (!widgets.some((w) => w.type === "letter")) {
        const mock = COUPLE_WIDGETS.find((w) => w.id === "us-letter");
        if (mock) {
          await ctx.db.insert("widgets", {
            spaceId: couple._id,
            type: "letter",
            x: mock.x,
            y: mock.y,
            w: mock.w,
            h: mock.h,
            z: mock.z,
            rotate: mock.rotate,
            data: mock.data,
            createdBy: "seed",
            createdAt: Date.now(),
          });
          out.push("couple letter");
        }
      }
    }
    return out;
  },
});

/** Non-destructive: give already-seeded link cards their conversation
 * starters + question threads without wiping anything live. Idempotent. */
export const backfillLinkQuestions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let patchedWidgets = 0;
    let insertedMessages = 0;
    for (const meta of Object.values(SPACES_BY_ID)) {
      const space = await ctx.db
        .query("spaces")
        .withIndex("by_slug", (q) => q.eq("slug", meta.id))
        .unique();
      if (!space) continue;
      const liveWidgets = await ctx.db
        .query("widgets")
        .withIndex("by_space", (q) => q.eq("spaceId", space._id))
        .collect();
      for (const seedWidget of meta.widgets) {
        if (seedWidget.type !== "linkCard") continue;
        const questions = seedWidget.data.questions;
        if (!Array.isArray(questions) || questions.length === 0) continue;
        const live = liveWidgets.find(
          (widget) =>
            widget.type === "linkCard" &&
            (widget.data as LinkCardData).url === seedWidget.data.url &&
            (widget.data as LinkCardData).savedBy === seedWidget.data.savedBy,
        );
        if (!live) continue;
        await ctx.db.patch(live._id, {
          data: { ...(live.data as LinkCardData), questions: convexSafe(questions) as LinkCardData["questions"] },
        });
        patchedWidgets += 1;

        for (const thread of Object.values(getThreadsForSpace(meta.id))) {
          const [baseThreadId] = thread.widgetId.split("::");
          if (baseThreadId !== seedWidget.id || baseThreadId === thread.widgetId) {
            continue;
          }
          const liveThreadId =
            String(live._id) + thread.widgetId.slice(baseThreadId.length);
          const existing = await ctx.db
            .query("messages")
            .withIndex("by_space_widget", (q) =>
              q.eq("spaceId", space._id).eq("widgetId", liveThreadId),
            )
            .take(1);
          if (existing.length > 0) continue;
          for (const [index, message] of thread.messages.entries()) {
            const member = meta.members.find(
              (candidate) => candidate.name === message.from,
            );
            await ctx.db.insert("messages", {
              spaceId: space._id,
              widgetId: liveThreadId,
              userId: seedUserId(meta.id, message.from),
              text: message.text,
              createdAt: now - (thread.messages.length - index) * 60_000,
              authorName: message.from,
              authorColor: member?.color ?? "#8b8b8b",
              promotable: message.promotable,
            });
            insertedMessages += 1;
          }
        }
      }
    }
    return { patchedWidgets, insertedMessages };
  },
});
