import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { COUPLE_WIDGETS, CREW_WIDGETS, SPACES_BY_ID, type Widget } from "../src/data/spaces";
import { getGlobalThread, getThreadsForSpace } from "../src/data/chat";
import { retireCutSpaceRows, memberCounts } from "./spaces";
import { pollTallies } from "./votes";
import { messagesCounter, spacesCounter, widgetsCounter } from "./stats";
import type { CountdownData, ItineraryData, LinkCardData, WidgetData } from "./widgetData";
import { FAMILY_CHALLENGE_IDS, familyWidgetsOn } from "../src/data/family";
import { internal } from "./_generated/api";
import { asPrompt, dealLikely, HOUSE_PROMPTS, likelyFacts, type LikelyFact } from "../src/lib/games/facts";
import type { RoomKnows } from "../src/lib/roomKnows";

type LinkShelfData = { title: string; links: { label: string; url: string; by?: string }[] };

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

type Rows = Record<string, unknown>[];
/**
 * Choice rows carry their person's seat (R4, the gate treats a name-only row as nobody's own): a split's rows, rsvp
 * answers, claims and check-in people. `id` maps a name to a seat, or null to leave the row as it is ("you" never).
 */
export function stampSeats(type: string, data: Record<string, unknown>, id: (name: string) => string | null): Record<string, unknown> | null {
  const each = (key: string, f: (r: Record<string, unknown>) => Record<string, unknown>) => {
    const rows = Array.isArray(data[key]) ? (data[key] as Rows) : [];
    const next = rows.map(f);
    return next.some((r, i) => r !== rows[i]) ? { ...data, [key]: next } : null;
  };
  const seat = (name: unknown) => (typeof name === "string" && name.trim() && name.trim().toLowerCase() !== "you" ? id(name) : null);
  const by = (field: string, idField: string) => (r: Record<string, unknown>) => {
    const s = r[idField] === undefined ? seat(r[field]) : null;
    return s ? { ...r, [idField]: s } : r;
  };
  if (type === "expenseSplit") return each("splits", by("name", "userId"));
  if (type === "rsvp") return each("responses", by("name", "userId"));
  if (type === "checkIn") return each("people", by("name", "userId"));
  if (type === "potluck") return each("items", (r) => (r.claimed ? by("by", "byUserId")(r) : r));
  return null;
}

/** One seeded widget, at `at` (the mock spot, or a free one on a live room). */
async function insertWidget(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  slug: string,
  createdBy: string,
  widget: Widget,
  at: { x: number; y: number },
  now: number,
) {
  const id = await ctx.db.insert("widgets", {
    spaceId,
    type: widget.type,
    x: at.x,
    y: at.y,
    w: widget.w,
    h: widget.h,
    z: widget.z,
    rotate: widget.rotate,
    data: convexSafe(stampSeats(widget.type, widget.data as Record<string, unknown>, (name) => seedUserId(slug, name)) ?? widget.data) as WidgetData,
    createdBy,
    createdAt: now,
  });
  await widgetsCounter.inc(ctx);

  if (widget.type === "poll") {
    for (const option of (widget.data.options as any[] | undefined) ?? []) {
      for (const voter of option.voters ?? []) {
        const voteId = await ctx.db.insert("votes", {
          widgetId: id,
          userId: seedUserId(slug, voter),
          optionId: option.id,
        });
        const voteDoc = await ctx.db.get(voteId);
        await pollTallies.insert(ctx, voteDoc!);
      }
    }
  }
  return id;
}

async function seedSpace(
  ctx: MutationCtx,
  meta: (typeof SPACES_BY_ID)[string],
  now: number,
  widgets: Widget[] = meta.widgets,
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
  await spacesCounter.inc(ctx);

  for (const member of meta.members) {
    const memberId = await ctx.db.insert("members", {
      spaceId,
      userId: seedUserId(slug, member.name),
      name: member.name,
      color: member.color,
      lastSeen: now,
    });
    const memberDoc = await ctx.db.get(memberId);
    await memberCounts.insert(ctx, memberDoc!);
  }

  const widgetIds = new Map<string, string>();
  const createdBy = seedUserId(slug, meta.members[0]?.name ?? "guest");
  for (const widget of widgets) {
    const id = await insertWidget(ctx, spaceId, slug, createdBy, widget, widget, now);
    widgetIds.set(`${slug}:${widget.id}`, id);
  }
  await linkStandings(ctx, widgetIds, slug, widgets);

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
      await messagesCounter.inc(ctx);
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

/** Widgets added to the demo rooms after their first seed. A live room already
 * exists, so `refreshDemoRooms` adds these by id, once. A fresh seed or a
 * reset gets every mock widget anyway. */
const LATER_WIDGET_IDS = [
  "poll-last-sat",
  "poll-fri-ramen",
  "poll-cook-or-out",
  "house-away",
  "house-chores",
  "us-usual-days",
  "us-call-times",
];
const DEMO_SLUGS = ["crew", "couple", "house"];

type Box = { x: number; y: number; w: number; h: number };

function overlaps(a: Box, b: Box) {
  const gap = 16;
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

const EDGE = 8;

function inside(box: Box, canvas: { width: number; height: number }) {
  return box.x >= EDGE && box.y >= EDGE && box.x + box.w <= canvas.width - EDGE && box.y + box.h <= canvas.height - EDGE;
}

/** The mock spot if it is clear, else the nearest clear spot on a 20px grid (null if the board is full). */
function freeSpot(box: Box, canvas: { width: number; height: number }, taken: Box[]): { x: number; y: number } | null {
  const fits = (x: number, y: number) => {
    const at = { x, y, w: box.w, h: box.h };
    return inside(at, canvas) && !taken.some((t) => overlaps(at, t));
  };
  if (fits(box.x, box.y)) return { x: box.x, y: box.y };
  let best: { x: number; y: number } | null = null;
  for (let y = EDGE; y + box.h <= canvas.height - EDGE; y += 20) {
    for (let x = EDGE; x + box.w <= canvas.width - EDGE; x += 20) {
      if (!fits(x, y)) continue;
      const d = (x - box.x) ** 2 + (y - box.y) ** 2;
      if (!best || d < (best.x - box.x) ** 2 + (best.y - box.y) ** 2) best = { x, y };
    }
  }
  return best;
}

function identityOf(widget: { data: unknown }) {
  const d = widget.data as Record<string, unknown>;
  return String(d.question ?? d.title ?? d.event ?? d.text ?? "");
}

/** Brings seeded demo rooms up to the current mock without touching anything
 * a person made. Idempotent: a second run adds, patches and moves nothing.
 * - countdowns whose date has passed get the mock's offset again
 * - the japan itinerary follows the day it is refreshed
 * - saved links the shelf is missing are appended, never removed
 * - LATER_WIDGET_IDS are added at the nearest clear spot, and moved only if
 *   they sit off the board or on top of another widget */
export const refreshDemoRooms = internalMutation({
  args: {},
  returns: v.object({
    added: v.array(v.string()),
    moved: v.array(v.string()),
    full: v.array(v.string()),
    dated: v.array(v.string()),
    linked: v.array(v.string()),
    rows: v.object({ spaces: v.number(), members: v.number(), widgets: v.number(), votes: v.number(), messages: v.number() }),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const added: string[] = [];
    const dated: string[] = [];
    const linked: string[] = [];
    const moved: string[] = [];
    const full: string[] = [];
    for (const slug of DEMO_SLUGS) {
      const meta = SPACES_BY_ID[slug];
      const space = await ctx.db
        .query("spaces")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (!meta || !space) continue;
      const live = await ctx.db
        .query("widgets")
        .withIndex("by_space", (q) => q.eq("spaceId", space._id))
        .collect();
      const canvas = { width: space.canvasW ?? 1640, height: space.canvasH ?? 1080 };
      const createdBy = seedUserId(slug, meta.members[0]?.name ?? "guest");

      for (const seed of meta.widgets) {
        if (seed.type === "countdown") {
          const seedData = seed.data as CountdownData;
          const row = live.find((w) => w.type === "countdown" && (w.data as CountdownData).event === seedData.event);
          if (row && String((row.data as CountdownData).targetDate ?? "") < today) {
            await ctx.db.patch(row._id, {
              data: { ...(row.data as CountdownData), targetDate: seedData.targetDate, startDate: seedData.startDate } as WidgetData,
            });
            dated.push(`${slug}: ${seedData.event}`);
          }
        } else if (seed.type === "itinerary") {
          const seedData = seed.data as ItineraryData;
          const row = live.find((w) => w.type === "itinerary" && (w.data as ItineraryData).title.startsWith("japan · "));
          if (row && (row.data as ItineraryData).title !== seedData.title) {
            await ctx.db.patch(row._id, { data: convexSafe(seedData) as WidgetData });
            dated.push(`${slug}: ${seedData.title}`);
          }
        } else if (seed.type === "linkShelf") {
          const seedData = seed.data as LinkShelfData;
          const row = live.find((w) => w.type === "linkShelf" && (w.data as LinkShelfData).title === seedData.title);
          if (row) {
            const have = (row.data as LinkShelfData).links;
            const missing = seedData.links.filter((link) => !have.some((h) => h.label === link.label));
            if (missing.length) {
              await ctx.db.patch(row._id, {
                data: { ...(row.data as LinkShelfData), links: [...have, ...missing] } as WidgetData,
              });
              linked.push(`${slug}: ${missing.map((l) => l.label).join(", ")}`);
            }
          }
        }

        if (!LATER_WIDGET_IDS.includes(seed.id)) continue;
        const box = { x: seed.x, y: seed.y, w: seed.w, h: seed.h };
        const existing = live.find((w) => w.type === seed.type && identityOf(w) === identityOf(seed));
        if (existing) {
          // Only a row this seed made is ours to move; a same-named row a person made is left alone.
          if (existing.createdBy !== createdBy) continue;
          const others = live.filter((w) => w._id !== existing._id).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }));
          const mine = { x: existing.x, y: existing.y, w: seed.w, h: seed.h };
          if (inside(mine, canvas) && !others.some((o) => overlaps(mine, o))) continue;
          const spot = freeSpot(box, canvas, others);
          if (!spot) {
            full.push(`${slug}: ${identityOf(seed)}`);
            continue;
          }
          await ctx.db.patch(existing._id, { x: spot.x, y: spot.y, w: seed.w, h: seed.h });
          live[live.indexOf(existing)] = { ...existing, x: spot.x, y: spot.y, w: seed.w, h: seed.h };
          moved.push(`${slug}: ${identityOf(seed)} to ${spot.x},${spot.y}`);
          continue;
        }
        const spot = freeSpot(box, canvas, live.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })));
        if (!spot) {
          full.push(`${slug}: ${identityOf(seed)}`);
          continue;
        }
        const id = await insertWidget(ctx, space._id, slug, createdBy, seed, spot, now);
        live.push((await ctx.db.get(id))!);
        added.push(`${slug}: ${identityOf(seed)} at ${spot.x},${spot.y}`);
      }
    }

    const rows = {} as Record<"spaces" | "members" | "widgets" | "votes" | "messages", number>;
    for (const table of ["spaces", "members", "widgets", "votes", "messages"] as const) {
      rows[table] = (await ctx.db.query(table).collect()).length;
    }
    return { added, moved, full, dated, linked, rows };
  },
});

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

  return spaceIds.get("crew") ?? null;
}

export const demo = internalMutation({
  args: {},
  returns: v.union(v.id("spaces"), v.null()),
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
  returns: v.union(v.id("spaces"), v.null()),
  handler: async (ctx) => {
    // Wiping every table means every sharded-counter total goes to zero too
    // — reset directly instead of decrementing per deleted row.
    await spacesCounter.reset(ctx);
    await widgetsCounter.reset(ctx);
    await messagesCounter.reset(ctx);
    for (const table of ["messages", "votes", "paintMarks", "presence", "widgets", "members", "spaces", "recaps"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        if (table === "votes") await pollTallies.delete(ctx, row as Doc<"votes">);
        if (table === "members") await memberCounts.delete(ctx, row as Doc<"members">);
      }
    }
    return seedAll(ctx);
  },
});

/** Non-destructive: rebrand the crew's tahoe itinerary into the upcoming
 * japan trip (in its own frame) and seed the couple's letter, so live
 * canvases pick up the mail demo without a reseed. Idempotent. */
export const backfillMailDemo = internalMutation({
  args: {},
  returns: v.array(v.string()),
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
          await widgetsCounter.inc(ctx);
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
          await widgetsCounter.inc(ctx);
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
  returns: v.object({ patchedWidgets: v.number(), insertedMessages: v.number() }),
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
            await messagesCounter.inc(ctx);
            insertedMessages += 1;
          }
        }
      }
    }
    return { patchedWidgets, insertedMessages };
  },
});


/** A standings card points at its check-in by widget id: the mock id becomes the row's. */
async function linkStandings(ctx: MutationCtx, widgetIds: Map<string, string>, slug: string, widgets: Widget[]) {
  for (const w of widgets) {
    if (w.type !== "standings") continue;
    const id = widgetIds.get(`${slug}:${w.id}`);
    const source = widgetIds.get(`${slug}:${String(w.data.source)}`);
    if (id && source) await ctx.db.patch(id as Id<"widgets">, { data: { ...(w.data as WidgetData), source } as WidgetData });
  }
}

/** Stored objects come back with their keys in another order: compare sorted. */
const canon = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, canon(v)])) : x;
const sameData = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/**
 * The family room on a live deployment, as designed and mid-week: the room,
 * its four people, the board, the challenge on day 5 of 6 with the reveal two
 * mornings out. Every date is worked out from `today` (the caller's local
 * YYYY-MM-DD; Convex's clock is UTC). Idempotent: a second run on the same
 * day writes nothing. A seeded card is the seed's own row of its type at its
 * designed spot (or with its designed title): a missing one is put back, a
 * changed one gets the designed data back (the check-in's logs too). Cards
 * anyone else made are left alone. `hero: true` takes the challenge corner
 * off instead, so a voice ask can build it again into the empty space.
 */
export const seedFamily = internalMutation({
  args: { today: v.optional(v.string()), hero: v.optional(v.boolean()) },
  returns: v.object({ created: v.boolean(), added: v.array(v.string()), patched: v.array(v.string()), removed: v.array(v.string()) }),
  handler: async (ctx, { today, hero }) => {
    const meta = SPACES_BY_ID.family;
    const now = Date.now();
    const day = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date(now).toISOString().slice(0, 10);
    const designed = familyWidgetsOn(day);
    const wanted = hero ? designed.filter((w) => !FAMILY_CHALLENGE_IDS.includes(w.id)) : designed;
    const out = { created: false, added: [] as string[], patched: [] as string[], removed: [] as string[] };
    const space = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", "family")).unique();
    if (!space) {
      const { spaceId, widgetIds } = await seedSpace(ctx, meta, now, wanted);
      await seedSpaceMessages(ctx, meta, spaceId, widgetIds, now);
      await ctx.scheduler.runAfter(0, internal.roomBrief.refresh, { spaceId });
      return { ...out, created: true, added: wanted.map((w) => w.id) };
    }
    const createdBy = seedUserId("family", meta.members[0]?.name ?? "guest");
    const live = await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", space._id)).collect();
    const rowFor = (w: Widget) =>
      live.find((row) => row.createdBy === createdBy && row.type === w.type && row.x === w.x && row.y === w.y) ??
      live.find((row) => row.createdBy === createdBy && row.type === w.type && identityOf(w) !== "" && identityOf(row) === identityOf(w));
    const ids = new Map<string, string>();
    for (const w of designed) {
      const row = rowFor(w);
      if (hero && FAMILY_CHALLENGE_IDS.includes(w.id)) {
        if (row) {
          await ctx.db.delete(row._id);
          await widgetsCounter.dec(ctx);
          out.removed.push(w.id);
        }
        continue;
      }
      if (!row) {
        const id = await insertWidget(ctx, space._id, "family", createdBy, w, w, now);
        ids.set(`family:${w.id}`, id);
        out.added.push(w.id);
        continue;
      }
      ids.set(`family:${w.id}`, row._id);
      const data = convexSafe(w.data) as WidgetData;
      // standings' source is the live id (set below), so it is left out of the comparison
      const have = w.type === "standings" ? { ...(row.data as object), source: (data as { source: string }).source } : row.data;
      if (!sameData(have, data) || row.x !== w.x || row.y !== w.y || row.w !== w.w || row.h !== w.h || row.z !== w.z) {
        await ctx.db.patch(row._id, { x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, data: w.type === "standings" ? ({ ...(data as object), source: (row.data as { source: string }).source } as WidgetData) : data });
        out.patched.push(w.id);
      }
    }
    for (const w of wanted) {
      if (w.type !== "standings") continue;
      const id = ids.get(`family:${w.id}`) as Id<"widgets"> | undefined;
      const source = ids.get(`family:${String(w.data.source)}`);
      const row = id ? await ctx.db.get(id) : null;
      if (row && source && (row.data as { source?: string }).source !== source) {
        await ctx.db.patch(row._id, { data: { ...(row.data as object), source } as WidgetData });
        if (!out.patched.includes(w.id)) out.patched.push(w.id);
      }
    }
    if (out.added.length || out.patched.length || out.removed.length) {
      await ctx.db.patch(space._id, { lastActivityAt: now });
      await ctx.scheduler.runAfter(0, internal.roomBrief.refresh, { spaceId: space._id });
    }
    return out;
  },
});

/**
 * R4: name-only choice rows already in the database get their person's seat. A seeded room maps a name to its seeded
 * cast (seed: ids, which no visitor can hold); a made room to the one member with that name (two with it: left as
 * is, and the gate asks). Tour rooms without a cast are left alone. One page per run, it schedules the next.
 */
export const backfillSeatIds = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), stamped: v.optional(v.number()), seen: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { cursor = null, stamped = 0, seen = 0 }) => {
    const page = await ctx.db.query("widgets").paginate({ cursor, numItems: 100 });
    const rosters = new Map<string, ((name: string) => string | null) | null>();
    for (const w of page.page) {
      if (!["expenseSplit", "rsvp", "checkIn", "potluck"].includes(w.type)) continue;
      seen++;
      if (!rosters.has(w.spaceId)) {
        const space = await ctx.db.get(w.spaceId);
        const members = await ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", w.spaceId)).take(500);
        const cast = members.filter((m) => m.userId.startsWith("seed:"));
        const pool = cast.length ? cast : space?.ownerId ? members : [];
        rosters.set(w.spaceId, pool.length ? (name) => { const hit = pool.filter((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase()); return hit.length === 1 ? hit[0].userId : null; } : null);
      }
      const id = rosters.get(w.spaceId);
      const next = id && stampSeats(w.type, w.data as Record<string, unknown>, id);
      if (!next) continue;
      await ctx.db.patch(w._id, { data: next as Doc<"widgets">["data"] });
      stamped++;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.seed.backfillSeatIds, { cursor: page.continueCursor, stamped, seen });
    else console.log(`backfillSeatIds: ${stamped} of ${seen} choice cards stamped`);
    return null;
  },
});

/* ── our house: the real house on the dev lane, for the video ──────────────
   Thomas, Holly, Hoa and Hoang; Bumi is the dog (a fact on the board, not a
   member). The challenge is on day 5 of 6 (Holly hasn't logged today; forty
   puts her first), a dinner poll without ramen, game night on friday with
   three yeses, Bumi's walks and the usual dinner places. Dates from `today`. */
const HOUSE_SLUG = "our-house";
const HOUSE_PEOPLE = [
  { name: "Thomas", color: "#3f70ff" },
  { name: "Holly", color: "#e9369d" },
  { name: "Hoa", color: "#13b8a6" },
  { name: "Hoang", color: "#ff7c42" },
];
/** The board, with room under "this week" for the games corner (scoreboard + game card, 720 x 560, placed by
    code in the first clear spot: lib/games/place.ts); our-house is in LIVE_GAME_ROOMS. */
const HOUSE_CANVAS = { w: 1330, h: 1990 };
/** The two phones sit in Thomas's and Holly's seats: their rows stay unclaimed so the phone that logs first owns it. */
const HOUSE_PHONE_SEATS = ["thomas", "holly"];
export const HOUSE_CHALLENGE_IDS = ["house-frame-challenge", "house-checkin", "house-standings", "house-signup", "house-reveal", "house-deal"];

function houseWidgetsOn(today: string): Widget[] {
  const [y, m, d] = today.split("-").map(Number);
  const at = (n: number) => new Date(Date.UTC(y, m - 1, d + n));
  const iso = (n: number) => at(n).toISOString().slice(0, 10);
  const wd = (n: number) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][at(n).getUTCDay()];
  const yes = (name: string) => ({ name, status: "yes" as const });
  return [
    /* dinner tonight, answered: two yeses, a no, one nobody's heard from. First in creation order so the brief's
       @coming(…) lists it before "who's in" (who's driving to dinner = only the yeses). */
    { id: "house-dinner-rsvp", type: "rsvp", x: 56, y: 1068, w: 230, h: 250, z: 3, rotate: 0.8, data: { title: "dinner tonight · 7", responses: [yes("Holly"), yes("Thomas"), { name: "Hoa", status: "no" as const }], waitingOn: ["Hoang"] } },
    { id: "house-frame-challenge", type: "frame", x: 32, y: 48, w: 1266, h: 650, z: 0, data: { title: `push-ups till ${wd(2)}`, subtitle: "the four of us" } },
    {
      id: "house-checkin", type: "checkIn", x: 56, y: 110, w: 600, h: 420, z: 4, rotate: -0.6,
      data: {
        title: "push-ups", kind: "number", unit: "push-ups", start: iso(-4), days: 6, revealAt: `${iso(2)}T09:00`,
        people: HOUSE_PEOPLE,
        logs: { Hoang: [36, 38, 30, 34, 32], Thomas: [30, 32, 35, 33, 35], Holly: [30, 32, 34, 35, null], Hoa: [20, 25, null, 28, 30] },
      },
    },
    { id: "house-standings", type: "standings", x: 690, y: 104, w: 372, h: 430, z: 4, rotate: 1, data: { title: "standings", source: "house-checkin", stake: "most by the reveal picks friday's dinner. last place walks bumi all weekend." } },
    { id: "house-signup", type: "rsvp", x: 1086, y: 96, w: 190, h: 250, z: 3, rotate: -1.5, data: { title: "who's in", responses: HOUSE_PEOPLE.map((p) => yes(p.name)), waitingOn: [] } },
    { id: "house-reveal", type: "countdown", x: 1090, y: 368, w: 182, h: 262, z: 3, rotate: 2, data: { event: `the reveal · ${wd(2)} 9:00`, targetDate: iso(2), startDate: iso(-4), tone: "butter", hyped: ["Hoang", "Thomas", "Holly"] } },
    { id: "house-deal", type: "note", x: 56, y: 552, w: 400, h: 128, z: 2, rotate: -1, data: { kicker: "the deal", text: "log before bed or it didn't happen. knees don't count.", author: "Thomas", tone: "white" } },

    { id: "house-frame-week", type: "frame", x: 32, y: 744, w: 1266, h: 610, z: 0, data: { title: "this week", subtitle: "dinner, games, bumi" } },
    {
      id: "house-dinner", type: "poll", x: 56, y: 806, w: 270, h: 230, z: 4, rotate: -1.2,
      data: {
        question: "dinner tonight?", tone: "sky",
        options: [
          { id: "a", label: "pho", votes: 2, total: 4, voters: ["Hoa", "Hoang"] },
          { id: "b", label: "tacos", votes: 1, total: 4, voters: ["Thomas"] },
          { id: "c", label: "thai curry", votes: 1, total: 4, voters: ["Holly"] },
          { id: "d", label: "pizza", votes: 0, total: 4, voters: [] },
        ],
      },
    },
    { id: "house-game-night", type: "rsvp", x: 356, y: 800, w: 230, h: 260, z: 3, rotate: 1.2, data: { title: "game night · friday", responses: [yes("Holly"), yes("Hoa"), yes("Hoang")], waitingOn: ["Thomas"] } },
    {
      id: "house-bumi-walks", type: "potluck", x: 616, y: 806, w: 340, h: 230, z: 3, rotate: -0.8,
      data: {
        title: "bumi's walks", kicker: "training tue + thu", tone: "butter", openCount: 0,
        items: [
          { name: "7am walk", by: "Thomas", claimed: true },
          { name: "lunch walk", by: "Hoa", claimed: true },
          { name: "evening walk", by: "Holly", claimed: true },
          { name: "training pickup", by: "Hoang", claimed: true },
        ],
      },
    },
    { id: "house-bumi", type: "note", x: 986, y: 800, w: 290, h: 132, z: 3, rotate: 1.5, data: { kicker: "bumi", text: "bumi's the dog. dinner at 6, no table scraps, training tuesdays and thursdays.", author: "Holly", tone: "warm" } },
    {
      id: "house-places", type: "linkShelf", x: 986, y: 956, w: 290, h: 230, z: 3, rotate: -1,
      data: {
        title: "dinner, the usual", tone: "butter",
        links: [
          { label: "the pho place (maps)", url: "maps.google.com", by: "Hoa" },
          { label: "the taco truck (maps)", url: "maps.google.com", by: "Thomas" },
          { label: "thai on the corner (maps)", url: "maps.google.com", by: "Holly" },
          { label: "pizza friday (maps)", url: "maps.google.com", by: "Hoang" },
        ],
      },
    },
  ];
}

const houseIds = v.object({
  spaceId: v.optional(v.id("spaces")),
  members: v.array(v.id("members")),
  widgets: v.array(v.id("widgets")),
  votes: v.array(v.id("votes")),
});

/**
 * Resets our house to its designed state. `prev` is what the last run made
 * (the caller keeps it, .context/house/ids.json): those widgets and poll votes
 * are deleted by id and the board is written again; the room and its four
 * members are kept. Nothing else in the room is touched (standing order 10a).
 * `hero: true` leaves the challenge corner off so the voice ask builds it.
 */
export const seedHouse = internalMutation({
  args: { today: v.optional(v.string()), hero: v.optional(v.boolean()), prev: v.optional(houseIds) },
  returns: v.object({ ids: houseIds, removed: v.number(), cards: v.number() }),
  handler: async (ctx, { today, hero, prev }) => {
    const now = Date.now();
    const day = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date(now).toISOString().slice(0, 10);
    let space = prev?.spaceId ? await ctx.db.get(prev.spaceId) : null;
    const bySlug = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", HOUSE_SLUG)).unique();
    if (bySlug && bySlug._id !== space?._id) throw new Error(`${HOUSE_SLUG} exists but isn't in the ids file: not ours to reset`);
    if (!space) {
      const spaceId = await ctx.db.insert("spaces", {
        name: "our house", type: "ongoing", icon: "⌂", color: "#3f70ff", slug: HOUSE_SLUG, tagline: "four of us and bumi",
        canvasW: HOUSE_CANVAS.w, canvasH: HOUSE_CANVAS.h, createdAt: now, lastActivityAt: now,
      });
      await spacesCounter.inc(ctx);
      space = (await ctx.db.get(spaceId))!;
    } else {
      await ctx.db.patch(space._id, { lastActivityAt: now, canvasW: HOUSE_CANVAS.w, canvasH: HOUSE_CANVAS.h });
    }
    const spaceId = space._id;

    // the four members: kept when they are still there, else made
    const members: Id<"members">[] = [];
    for (const p of HOUSE_PEOPLE) {
      const userId = seedUserId(HOUSE_SLUG, p.name);
      const kept = prev?.members.length ? await Promise.all(prev.members.map((id) => ctx.db.get(id))) : [];
      const row = kept.find((m) => m && m.spaceId === spaceId && m.userId === userId);
      if (row) {
        members.push(row._id);
        continue;
      }
      const id = await ctx.db.insert("members", { spaceId, userId, name: p.name, color: p.color, lastSeen: now });
      await memberCounts.insert(ctx, (await ctx.db.get(id))!);
      members.push(id);
    }

    // last run's cards and votes, by id only
    let removed = 0;
    for (const id of prev?.votes ?? []) {
      const vote = await ctx.db.get(id);
      if (!vote) continue;
      await ctx.db.delete(id);
      await pollTallies.delete(ctx, vote);
    }
    for (const id of prev?.widgets ?? []) {
      const w = await ctx.db.get(id);
      if (!w || w.spaceId !== spaceId) continue;
      await ctx.db.delete(id);
      await widgetsCounter.dec(ctx);
      removed++;
    }

    const designed = houseWidgetsOn(day).filter((w) => !hero || !HOUSE_CHALLENGE_IDS.includes(w.id));
    /* Someone who has walked in on their own phone owns their rows: the newest
       seat in the room with their name. A vote asks people by id only (R4), so
       a yes the card knew by name alone could never be answered ("move game
       night to sunday" asked Holly and her phone couldn't say). Open the phones,
       then seed. Nobody on a phone yet: Thomas and Holly stay claimable by the
       first log, Hoa and Hoang keep their seeded seats. */
    const joined = new Map<string, Doc<"members">>();
    const seeded = new Set(HOUSE_PEOPLE.map((p) => seedUserId(HOUSE_SLUG, p.name)));
    for (const m of await ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(500)) {
      const key = m.name.trim().toLowerCase();
      if (seeded.has(m.userId) || !HOUSE_PEOPLE.some((p) => p.name.toLowerCase() === key)) continue;
      const had = joined.get(key);
      if (!had || had.lastSeen < m.lastSeen) joined.set(key, m);
    }
    const onPhone = (name: string) => joined.get(name.trim().toLowerCase())?.userId;
    const seat = (name: string) => onPhone(name) ?? (HOUSE_PHONE_SEATS.includes(name.toLowerCase()) ? null : seedUserId(HOUSE_SLUG, name));
    const createdBy = seedUserId(HOUSE_SLUG, "Thomas");
    const ids = new Map<string, Id<"widgets">>();
    const votes: Id<"votes">[] = [];
    for (const w of designed) {
      const data = stampSeats(w.type, w.data, seat) ?? w.data;
      const id = await ctx.db.insert("widgets", {
        spaceId, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, rotate: w.rotate,
        data: convexSafe(data) as WidgetData, createdBy, createdAt: now,
      });
      await widgetsCounter.inc(ctx);
      ids.set(w.id, id);
      if (w.type !== "poll") continue;
      for (const option of (w.data.options as { id: string; voters: string[] }[]) ?? []) {
        for (const voter of option.voters) {
          const voteId = await ctx.db.insert("votes", { widgetId: id, userId: onPhone(voter) ?? seedUserId(HOUSE_SLUG, voter), optionId: option.id });
          await pollTallies.insert(ctx, (await ctx.db.get(voteId))!);
          votes.push(voteId);
        }
      }
    }
    const standings = ids.get("house-standings");
    const checkin = ids.get("house-checkin");
    if (standings && checkin) {
      const row = (await ctx.db.get(standings))!;
      await ctx.db.patch(standings, { data: { ...(row.data as object), source: checkin } as WidgetData });
    }
    await tellHouseCity(ctx, spaceId);
    await ctx.scheduler.runAfter(0, internal.roomBrief.refresh, { spaceId });
    return { ids: { spaceId, members, widgets: [...ids.values()], votes }, removed, cards: ids.size };
  },
});

/** The house is in San Jose: a told fact (Thomas's), so the lookup (convex/tavily.ts) has a city. A rebuild keeps told facts. */
const HOUSE_CITY = "we're in San Jose, CA";
async function tellHouseCity(ctx: MutationCtx, spaceId: Id<"spaces">) {
  const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
  const facts = row ? (JSON.parse(row.facts) as { told?: RoomKnows["told"] }) : {};
  if (facts.told?.some((t) => t.text === HOUSE_CITY)) return;
  const told = [...(facts.told ?? []), { id: "t-house-city", text: HOUSE_CITY, by: "Thomas", color: HOUSE_PEOPLE[0].color, at: Date.now() }];
  if (row) await ctx.db.patch(row._id, { facts: JSON.stringify({ ...facts, told }) });
  else await ctx.db.insert("briefs", { spaceId, text: "", facts: JSON.stringify({ told }), at: 0 });
}

/** Only the city, on the house as it is (no reset): `npx convex run seed:houseCity` on the dev lane. */
export const houseCity = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const space = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", HOUSE_SLUG)).unique();
    if (!space) return false;
    await tellHouseCity(ctx, space._id);
    return true;
  },
});

/**
 * A most-likely-to game in our house, started for a phone (the video's games take, .context/house/take.mjs games).
 * The phones are anonymous seats and a tour-style room only lets a joined member start one (games.start), so the
 * take starts it here, in the starter's newest phone seat, dealt the way games.start deals: the room's facts
 * (likelyFacts / dealLikely), the house prompts topping up to three, one wording call. Join, begin and every pick
 * go through the public mutations from the phones. An open game is returned as it is. Cleanup: games:sweep by id.
 */
export const houseGame = internalMutation({
  args: { starter: v.optional(v.string()) },
  returns: v.object({ gameId: v.id("games"), fresh: v.boolean(), prompts: v.array(v.string()) }),
  handler: async (ctx, { starter = "Holly" }) => {
    const space = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", HOUSE_SLUG)).unique();
    if (!space) throw new Error(`no ${HOUSE_SLUG}: run seed:seedHouse first`);
    const spaceId = space._id;
    const on = await ctx.db.query("games").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(5);
    const open = on.find((g) => g.phase !== "done" && g.kind !== "jigsaw");
    if (open) return { gameId: open._id, fresh: false, prompts: [] };
    const key = starter.trim().toLowerCase();
    const seats = (await ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(500)).filter(
      (m) => m.name.trim().toLowerCase() === key && m.userId !== seedUserId(HOUSE_SLUG, starter),
    );
    const me = seats.sort((a, b) => b.lastSeen - a.lastSeen)[0];
    if (!me) throw new Error(`no phone seat for ${starter} in ${HOUSE_SLUG}: open the phone first`);
    const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
    const brief = row ? (JSON.parse(row.facts) as { knows?: Pick<RoomKnows, "people" | "lines">; told?: RoomKnows["told"]; forgot?: RoomKnows["forgot"] }) : {};
    const people = (brief.knows?.people ?? HOUSE_PEOPLE).filter((p) => p.name.trim().toLowerCase() !== key);
    const cast = [{ name: me.name, color: me.color }, ...people.map(({ name, color }) => ({ name, color }))].slice(0, 8);
    const facts = dealLikely(likelyFacts(brief.knows?.lines ?? [], brief.forgot ?? [], brief.told ?? []), on.length);
    const all: LikelyFact[] = facts.length >= 3 ? facts : [...facts, ...HOUSE_PROMPTS].slice(0, 3);
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      spaceId, kind: "most-likely", name: "most likely to", phase: "invite", round: 0,
      startedBy: { userId: me.userId, name: me.name, color: me.color }, startedAt: now, cast, worded: "templates (wording…)",
    });
    await ctx.db.insert("gamePlayers", { gameId, userId: me.userId, name: me.name, color: me.color, joinedAt: now, fromRound: 0 });
    for (const [n, f] of all.entries()) await ctx.db.insert("gameRounds", { gameId, n, prompt: asPrompt(f, n), winners: [] });
    await ctx.scheduler.runAfter(0, internal.games.word, { gameId });
    await ctx.scheduler.runAfter(180_000, internal.games.tick, { gameId, phase: "expire", n: 0 });
    return { gameId, fresh: true, prompts: all.map((f) => f.template.text) };
  },
});
