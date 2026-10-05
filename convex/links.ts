import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { rightOfWay } from "./rightOfWay";
import { dateIn } from "../src/lib/deck/needs";
import { splitWhen } from "../src/lib/deck/edits";

/**
 * Links: a card that waits on another card and fills itself from it (a
 * recipe's flow, src/lib/deck/recipes.ts). A link is data, one `links` row:
 *
 *   from   the source card
 *   to     the target card, which shows "waiting on <source>" until resolved
 *   when   what counts as resolved, any of (joined by |):
 *          "always"   at once (standings → its check-in)
 *          "closed"   someone tapped "call it" on the source (`callIt`)
 *          "everyone" everyone it asked has answered (every voter on a poll,
 *                     every member on a day-finder)
 *          "time"     the clock passed `at` (a scheduled `tick`)
 *          "tap"      someone tapped "deal the rest" on the thread (`deal`)
 *          "live"     every change of the source writes again, until a person
 *                     taps "lock it" (`lock`)
 *   fill   which field of the target it writes ("source", "title", …)
 *   value  what it writes: "id" (the source's id), "winner" (a poll's top
 *          choice), "date" (a day-finder's best day), "yes" (who said yes),
 *          "unclaimed" (a list's open items and who hasn't claimed)
 *   tag    the thread's words on the board ("winner names it")
 *   cutAt  a person cut the thread: never resolves again; code never re-ties it
 *
 * Code applies it, never a model: `applyLinks` runs in the mutation that
 * changed the source, and every write a link makes goes through
 * `writeLinked`, which passes Right of Way's door like every AI-side write.
 */

export type LinkSpec = { when: string; fill: string; value: string; at?: number; tag?: string };

const has = (link: Doc<"links">, kind: string) => link.when.split("|").includes(kind);
type Votes = Map<string, number>;

async function votesOn(ctx: MutationCtx, pollId: Id<"widgets">): Promise<{ by: Votes; voters: number }> {
  const rows = await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", pollId)).take(200);
  const by: Votes = new Map();
  for (const r of rows) by.set(r.optionId, (by.get(r.optionId) ?? 0) + 1);
  return { by, voters: rows.length };
}

type Slots = { name: string; slots: boolean[] }[];

/** Is the source resolved for this link? `tapped`: someone asked for it now. */
async function resolved(ctx: MutationCtx, link: Doc<"links">, from: Doc<"widgets">, now: number, tapped = false): Promise<boolean> {
  const d = from.data as Record<string, unknown>;
  if (has(link, "always") || has(link, "live")) return true;
  if (tapped && has(link, "tap")) return true;
  if (has(link, "time") && link.at !== undefined && now >= link.at) return true;
  if (has(link, "closed") && d.closed === true) return true;
  if (has(link, "everyone")) {
    if (from.type === "poll") {
      // everyone it asked: the asker and the people it waits on
      const asked = ((d.waitingOn as string[] | undefined) ?? []).length + 1;
      const { voters } = await votesOn(ctx, from._id);
      if (asked > 1 && voters >= asked) return true;
    }
    if (from.type === "availability") {
      const members = (d.members as Slots | undefined) ?? [];
      if (members.length > 1 && members.every((m) => m.slots.some(Boolean))) return true;
    }
  }
  return false;
}

/** What the link writes into the target: a patch of its data, or undefined when there's nothing to write yet. */
async function valueOf(ctx: MutationCtx, link: Doc<"links">, from: Doc<"widgets">, to: Doc<"widgets">): Promise<Record<string, unknown> | undefined> {
  const d = from.data as Record<string, unknown>;
  const t = to.data as Record<string, unknown>;
  switch (link.value) {
    case "id":
      return { [link.fill]: from._id };
    case "winner": {
      // the poll's top choice (ties: the first on the card); no votes, no winner
      const options = (d.options as { id: string; label: string }[] | undefined) ?? [];
      const { by } = await votesOn(ctx, from._id);
      let best: { label: string; n: number } | null = null;
      for (const o of options) {
        const n = by.get(o.id) ?? 0;
        if (n > 0 && (!best || n > best.n)) best = { label: o.label, n };
      }
      if (!best) return undefined;
      const [, when] = to.type === "rsvp" ? splitWhen(String(t.title ?? "")) : ["", ""];
      return { [link.fill]: when ? `${best.label.toLowerCase()} · ${when}` : best.label.toLowerCase() };
    }
    case "date": {
      // the day-finder's best day (most free; ties: the earliest), as the next such date
      const days = (d.days as string[] | undefined) ?? [];
      const members = (d.members as Slots | undefined) ?? [];
      let best = -1;
      let most = 0;
      days.forEach((_, i) => {
        const n = members.filter((m) => m.slots[i]).length;
        if (n > most) [best, most] = [i, n];
      });
      if (best < 0) return undefined;
      const today = new Date(link._creationTime).toISOString().slice(0, 10);
      const iso = dateIn(days[best], today)?.iso;
      return iso ? { [link.fill]: iso, startDate: today, event: `${String(t.event ?? "it")} · ${days[best].toLowerCase()}` } : undefined;
    }
    case "yes": {
      // a split among whoever said yes, the total shared again on every answer
      const yes = ((d.responses as { name: string; status: string }[] | undefined) ?? []).filter((r) => r.status === "yes").map((r) => r.name);
      const total = Number(t.total) || 0;
      const share = Math.round(total / Math.max(1, yes.length));
      return { splits: yes.map((name) => ({ name, owes: share, paid: 0 })) };
    }
    case "unclaimed": {
      // what nobody claimed, for the people who haven't claimed anything
      const items = (d.items as { name: string; by?: string | null; claimed?: boolean }[] | undefined) ?? [];
      const open = items.filter((i) => !i.claimed).map((i) => i.name);
      if (!open.length) return undefined;
      const claimed = new Set(items.filter((i) => i.claimed && i.by).map((i) => String(i.by).toLowerCase()));
      const dealTo = ((t.dealTo as string[] | undefined) ?? []).filter((n) => !claimed.has(n.toLowerCase()));
      return { slices: open.slice(0, 8).map((label, i) => ({ id: "abcdefgh"[i], label })), title: dealTo.length ? `the rest · for ${dealTo.map((n) => n.toLowerCase()).join(", ")}` : "the rest" };
    }
    default:
      return undefined;
  }
}

/**
 * The one write a link makes: its patch on the target. It passes the one
 * door first (rightOfWay.ts), like every AI write; held, it waits as a ghost
 * and lands when the holder lets go (rightOfWay.ts landWaiting).
 */
export async function writeLinked(ctx: MutationCtx, link: Doc<"links">, value: unknown, now: number) {
  const to = await ctx.db.get(link.to);
  if (!to || value === undefined) return false;
  const patch = (value && typeof value === "object" && !Array.isArray(value) ? value : { [link.fill]: value }) as Record<string, unknown>;
  const data = to.data as Record<string, unknown>;
  const fields = Object.entries(patch).map(([field, nv]) => ({ field, old: data[field], new: nv }));
  if (fields.every((f) => JSON.stringify(f.old) === JSON.stringify(f.new))) return false;
  // the one door every AI write passes (rightOfWay.ts)
  const door = await rightOfWay(ctx, { kind: "link", spaceId: to.spaceId, widgetId: to._id, by: { name: "link" }, fields, replay: { kind: "link", linkId: link._id, fill: link.fill, value: patch } });
  if (door.verdict !== "go") return false;
  const { unfinished: _u, ...rest } = data;
  await ctx.db.patch(to._id, { data: { ...rest, ...patch } as Doc<"widgets">["data"] });
  // a live link stays open (it follows the source until locked); `at` = when it last wrote
  await ctx.db.patch(link._id, has(link, "live") ? { at: now } : { resolvedAt: now });
  return true;
}

async function tryLink(ctx: MutationCtx, link: Doc<"links">, from: Doc<"widgets">, now: number, tapped = false) {
  if (link.resolvedAt !== undefined || link.cutAt !== undefined) return false;
  if (!(await resolved(ctx, link, from, now, tapped))) return false;
  const to = await ctx.db.get(link.to);
  if (!to) return false;
  return writeLinked(ctx, link, await valueOf(ctx, link, from, to), now);
}

/** Resolve every open link from this card that can resolve now. Call after a source changes. */
export async function applyLinks(ctx: MutationCtx, fromId: Id<"widgets">) {
  const links = await ctx.db.query("links").withIndex("by_from", (q) => q.eq("from", fromId)).take(20);
  const open = links.filter((l) => l.resolvedAt === undefined && l.cutAt === undefined);
  if (!open.length) return 0;
  const from = await ctx.db.get(fromId);
  if (!from) return 0;
  const now = Date.now();
  let n = 0;
  for (const link of open) if (await tryLink(ctx, link, from, now)) n++;
  return n;
}

/** Declare a link (a recipe's commit does), then resolve it if it already can. A timed one gets its clock. */
export async function addLink(ctx: MutationCtx, spaceId: Id<"spaces">, from: Id<"widgets">, to: Id<"widgets">, spec: LinkSpec) {
  const id = await ctx.db.insert("links", { spaceId, from, to, ...spec });
  if (spec.when.split("|").includes("time") && spec.at && spec.at > Date.now()) await ctx.scheduler.runAt(spec.at, internal.links.tick, { linkId: id });
  // a live link waits for its first answer; the rest resolve now if they can
  if (!spec.when.split("|").includes("live")) await applyLinks(ctx, from);
}

/** A timed link's clock ran out. */
export const tick = internalMutation({
  args: { linkId: v.id("links") },
  returns: v.null(),
  handler: async (ctx, { linkId }) => {
    const link = await ctx.db.get(linkId);
    const from = link && (await ctx.db.get(link.from));
    if (link && from) await tryLink(ctx, link, from, Date.now());
    return null;
  },
});

async function linkInSpace(ctx: MutationCtx, linkId: Id<"links">, spaceId: Id<"spaces">) {
  const link = await ctx.db.get(linkId);
  return link && link.spaceId === spaceId ? link : null;
}

/** "call it": anyone closes a poll or a day-finder another card waits on (a person's write on the source). */
export const callIt = mutation({
  args: { spaceId: v.id("spaces"), widgetId: v.id("widgets"), by: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { spaceId, widgetId, by }) => {
    const w = await ctx.db.get(widgetId);
    if (!w || w.spaceId !== spaceId) return false;
    await ctx.db.patch(w._id, { data: { ...(w.data as object), closed: true, closedBy: by } as Doc<"widgets">["data"] });
    return (await applyLinks(ctx, w._id)) > 0;
  },
});

/** "deal the rest": a person resolves a link that waits on a tap (the potluck's wheel). */
export const deal = mutation({
  args: { spaceId: v.id("spaces"), linkId: v.id("links") },
  returns: v.boolean(),
  handler: async (ctx, { spaceId, linkId }) => {
    const link = await linkInSpace(ctx, linkId, spaceId);
    const from = link && (await ctx.db.get(link.from));
    return !!(link && from && (await tryLink(ctx, link, from, Date.now(), true)));
  },
});

/** "lock it": a live link stops following its source; the target keeps what it has. */
export const lock = mutation({
  args: { spaceId: v.id("spaces"), linkId: v.id("links") },
  returns: v.null(),
  handler: async (ctx, { spaceId, linkId }) => {
    const link = await linkInSpace(ctx, linkId, spaceId);
    if (link && link.resolvedAt === undefined) await ctx.db.patch(link._id, { resolvedAt: Date.now() });
    return null;
  },
});

/** A person cuts the thread: the link never fills, and nothing re-ties it. The target is an ordinary card now. */
export const cut = mutation({
  args: { spaceId: v.id("spaces"), linkId: v.id("links") },
  returns: v.null(),
  handler: async (ctx, { spaceId, linkId }) => {
    const link = await linkInSpace(ctx, linkId, spaceId);
    if (link && link.cutAt === undefined) await ctx.db.patch(link._id, { cutAt: Date.now() });
    return null;
  },
});

/**
 * The room's links: every open target shows "waiting on <source>" (state
 * `waiting`), a live one that has written follows its source (`live`), a
 * filled one keeps its thread (`done`). Cut links are gone from the board.
 */
export const waiting = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ id: v.id("links"), from: v.id("widgets"), to: v.id("widgets"), when: v.string(), tag: v.optional(v.string()), state: v.string() })),
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db.query("links").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(100);
    return rows
      .filter((l) => l.cutAt === undefined && (l.resolvedAt === undefined || l.tag))
      .map((l) => ({
        id: l._id,
        from: l.from,
        to: l.to,
        when: l.when,
        ...(l.tag ? { tag: l.tag } : {}),
        state: l.resolvedAt !== undefined ? "done" : l.when.split("|").includes("live") && l.at !== undefined ? "live" : "waiting",
      }));
  },
});
