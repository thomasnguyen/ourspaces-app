import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { rightOfWay as gate, type Lease, type Verdict } from "../src/lib/rightOfWay";
import { applyEdit, type EditOp } from "../src/lib/deck/edits";
import { leasesOn } from "./leases";
import { writeWidgetData } from "./widgets";

/**
 * The one door. Every change the AI makes to the board passes through
 * `rightOfWay` inside the mutation that would commit it: a voice edit and
 * its undo (edits.ts), a link filling its target (links.ts `writeLinked`), a
 * card the voice build writes and its late-word rewrite (voiceBuild.ts), a
 * game started (games.ts), a piece the space's hand places (puzzles.ts).
 *
 * It reads the live leases (leases.ts) and asks the pure gate
 * (src/lib/rightOfWay.ts, the case table is there) for go | wait | never.
 * No model is called anywhere on this path.
 *
 *   go     the caller commits it
 *   wait   kept as a `pending` row (the ghost every screen draws) and
 *          replayed by `landWaiting` in the mutation that ends the hold,
 *          after re-checking it still makes sense; dropped after 30 s
 *   never  not written (a refusal, the last puzzle piece, or a new card
 *          on a held spot, which the caller places elsewhere)
 *
 * Every call is a row in `aiWrites` (the ledger "what it held back" reads).
 */

export type Replay =
  /** set = for ops that set a value: the touched fields as they were; changed meanwhile → dropped */
  | { kind: "edit"; op: EditOp; today: string; set?: Record<string, unknown> }
  | { kind: "link"; linkId: Id<"links">; fill: string; value: unknown }
  | { kind: "puzzle"; gameId: Id<"games">; i: number; x: number; y: number };

export type AiWrite = {
  kind: "edit" | "undo" | "link" | "build" | "game" | "puzzle";
  spaceId: Id<"spaces">;
  widgetId?: Id<"widgets">;
  /** What it changes, if not the card (a puzzle piece: "piece:<game>:<i>"). */
  thing?: string;
  /** Who asked: a person's name, or "link" for a link resolving, "the space" for its own hand. */
  by: { name: string; userId?: string };
  fields: { field: string; old: unknown; new: unknown }[];
  /** The slip line ("added ramen") and the inverse op for undo, for edits. */
  text?: string;
  undo?: unknown;
  /** A new card's spot: the gate keeps it off held cards. */
  rect?: { x: number; y: number; w: number; h: number };
  /** Code refused it before the door (it would undo people's choices). */
  refused?: string;
  /** It would complete a shared thing (the last piece). */
  finishes?: boolean;
  /** How to land it later, if it has to wait. Without one a wait is just not written. */
  replay?: Replay;
};
export type Holder = { userId: string; name: string; color: string; kind: string };
export type Door = { verdict: Verdict["kind"]; reason: string; writeId: Id<"aiWrites">; on?: Holder; onThing?: string; pendingId?: Id<"pending"> };

export const WAIT_MS = 30_000;
const DOING: Record<string, string> = { drag: "moving", type: "typing in", vote: "choosing on", piece: "holding" };

const cut = (x: unknown) => {
  const s = JSON.stringify(x ?? null);
  return s.length > 240 ? `${s.slice(0, 237)}…` : s;
};
const holderOf = (l: Doc<"leases">): Holder => ({ userId: l.userId, name: l.name, color: l.color, kind: l.kind });
const asLease = (l: Doc<"leases">): Lease => ({ thing: l.thing, by: { kind: "person", id: l.userId, name: l.name }, kind: l.kind as Lease["kind"] });
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export async function rightOfWay(ctx: MutationCtx, write: AiWrite): Promise<Door> {
  const thing = write.thing ?? write.widgetId;
  const rows = thing !== undefined ? await leasesOn(ctx, write.spaceId, thing) : write.rect ? await leasesOn(ctx, write.spaceId) : [];
  /* a new card: which held cards its spot would touch */
  let spot: string[] | undefined;
  if (thing === undefined && write.rect) {
    spot = [];
    for (const l of rows) {
      const id = ctx.db.normalizeId("widgets", l.thing);
      const w = id && (await ctx.db.get(id));
      if (w && overlaps(write.rect, w)) spot.push(l.thing);
    }
  }
  const v = gate({ thing, by: { kind: "space", ...(write.by.userId ? { asker: write.by.userId } : {}) }, spot, refused: write.refused, finishes: write.finishes }, rows.map(asLease));
  // the lease behind the verdict: who it waits on, or (go) the asker's own hold on it
  const lease = v.kind !== "go" && v.on ? rows.find((l) => l.thing === v.on!.thing && l.userId === (v.on!.by as { id: string }).id) : v.kind === "go" && thing !== undefined ? rows.find((l) => l.thing === thing) : undefined;
  const on = lease ? holderOf(lease) : undefined;
  const reason =
    v.kind === "go"
      ? lease ? `${lease.name} holds it: their own hand` : "nobody holds it"
      : v.kind === "wait"
        ? `${on!.name} is ${DOING[on!.kind] ?? "holding"} it`
        : v.kind === "never" && on && thing === undefined ? `${v.why}; placed it below` : v.why;
  const writeId = await log(ctx, write, v.kind, reason);
  let pendingId: Id<"pending"> | undefined;
  if (v.kind === "wait" && write.replay && thing !== undefined) {
    // a late word re-sends the same edit ("rename it to taco" → "… taco tuesday"): the newer one replaces the waiting one
    for (const old of await ctx.db.query("pending").withIndex("by_thing", (q) => q.eq("spaceId", write.spaceId).eq("thing", thing)).take(16)) {
      const r = JSON.parse(old.write) as Replay;
      const row = await ctx.db.get(old.writeId);
      if (row?.byUserId === write.by.userId && r.kind === "edit" && write.replay.kind === "edit" && r.op.op === write.replay.op.op) await close(ctx, old, "replaced");
    }
    pendingId = await ctx.db.insert("pending", { spaceId: write.spaceId, thing, writeId, write: JSON.stringify(write.replay), on: JSON.stringify(on), at: Date.now() });
    await ctx.scheduler.runAfter(WAIT_MS, internal.rightOfWay.expire, { pendingId });
  }
  console.log(`rightOfWay ${write.kind} ${thing ?? "new"} by ${write.by.name}: ${write.fields.map((f) => f.field).join(",")} → ${v.kind} (${reason})`);
  return { verdict: v.kind, reason, writeId, ...(on ? { on, onThing: lease!.thing } : {}), ...(pendingId ? { pendingId } : {}) };
}

/** One ledger row. */
export async function log(ctx: MutationCtx, write: AiWrite, verdict: string, reason?: string) {
  return await ctx.db.insert("aiWrites", {
    spaceId: write.spaceId,
    ...(write.widgetId ? { widgetId: write.widgetId } : {}),
    kind: write.kind,
    by: write.by.name,
    ...(write.by.userId ? { byUserId: write.by.userId } : {}),
    fields: JSON.stringify(write.fields.map((f) => ({ field: f.field, old: cut(f.old), new: cut(f.new) }))),
    verdict,
    ...(reason ? { reason } : {}),
    ...(write.text ? { text: write.text } : {}),
    ...(write.undo ? { undo: JSON.stringify(write.undo) } : {}),
    at: Date.now(),
  });
}

/** Re-check a waiting write against the card as it is now, and write it if it still makes sense. */
async function replay(ctx: MutationCtx, r: Replay, row: Doc<"aiWrites">): Promise<{ ok: true } | { ok: false; why: string }> {
  const changed = { ok: false as const, why: "that changed while you waited; nothing done" };
  if (r.kind === "edit") {
    const widget = row.widgetId && (await ctx.db.get(row.widgetId));
    if (!widget) return { ok: false, why: "the card was deleted while you waited; nothing done" };
    for (const [field, old] of Object.entries(r.set ?? {})) if (JSON.stringify((widget.data as Record<string, unknown>)[field] ?? null) !== JSON.stringify(old ?? null)) return changed;
    let votes: Record<string, number> | undefined;
    if (widget.type === "poll") {
      votes = {};
      for (const x of await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", widget._id)).take(500)) votes[x.optionId] = (votes[x.optionId] ?? 0) + 1;
    }
    const out = applyEdit({ type: widget.type, data: widget.data as Record<string, unknown> }, r.op, { today: r.today, votes });
    if (!out.ok) return changed;
    await writeWidgetData(ctx, widget, out.data as Doc<"widgets">["data"], { stampLater: true });
    return { ok: true };
  }
  if (r.kind === "link") {
    const link = await ctx.db.get(r.linkId);
    const to = link && (await ctx.db.get(link.to));
    if (!link || !to || link.resolvedAt !== undefined) return changed;
    await ctx.db.patch(to._id, { data: { ...(to.data as object), [r.fill]: r.value } as Doc<"widgets">["data"] });
    await ctx.db.patch(link._id, { resolvedAt: Date.now() });
    return { ok: true };
  }
  const game = await ctx.db.get(r.gameId);
  if (!game || game.phase === "done") return changed;
  const rows = await ctx.db.query("puzzlePieces").withIndex("by_game", (q) => q.eq("gameId", r.gameId)).take(64);
  const piece = rows.find((p) => p.i === r.i);
  if (piece?.placed) return { ok: false, why: "someone placed it first" };
  if (rows.filter((p) => p.placed).length + 1 >= (game.known ?? 20)) return { ok: false, why: "the last one belongs to a person" };
  if (piece) await ctx.db.patch(piece._id, { x: r.x, y: r.y, placed: true, by: "the space" });
  else await ctx.db.insert("puzzlePieces", { gameId: r.gameId, i: r.i, x: r.x, y: r.y, placed: true, by: "the space" });
  return { ok: true };
}

/**
 * A hold on `thing` ended (leases.ts `settle`, the same mutation that deletes
 * the lease): every write waiting on it asks the gate again, and lands, keeps
 * waiting on the next holder, or is dropped with a plain line.
 */
export async function landWaiting(ctx: MutationCtx, spaceId: Id<"spaces">, thing: string, ended: { name: string; letGoAt: number | null; expired: boolean }) {
  const waiting = await ctx.db.query("pending").withIndex("by_thing", (q) => q.eq("spaceId", spaceId).eq("thing", thing)).take(16);
  if (!waiting.length) return;
  const rows = await leasesOn(ctx, spaceId, thing);
  const now = Date.now();
  for (const p of waiting) {
    const row = await ctx.db.get(p.writeId);
    if (!row) {
      await ctx.db.delete(p._id);
      continue;
    }
    const v = gate({ thing, by: { kind: "space", ...(row.byUserId ? { asker: row.byUserId } : {}) } }, rows.map(asLease));
    if (v.kind === "wait") {
      const next = rows.find((l) => l.userId === (v.on.by as { id: string }).id);
      if (next) await ctx.db.patch(p._id, { on: JSON.stringify(holderOf(next)) });
      continue;
    }
    await ctx.db.delete(p._id);
    const out = await replay(ctx, JSON.parse(p.write) as Replay, row);
    await ctx.db.patch(row._id, {
      outcome: JSON.stringify({
        state: out.ok ? "landed" : "dropped",
        ms: now - p.at,
        on: ended.name,
        ...(ended.letGoAt !== null ? { afterLetGo: now - ended.letGoAt } : {}),
        ...(ended.expired ? { expired: true } : {}),
        ...(out.ok ? {} : { why: out.why }),
        at: now,
      }),
    });
  }
}

async function close(ctx: MutationCtx, p: Doc<"pending">, state: "expired" | "cancelled" | "replaced") {
  await ctx.db.delete(p._id);
  const on = JSON.parse(p.on) as Holder;
  const now = Date.now();
  await ctx.db.patch(p.writeId, { outcome: JSON.stringify({ state, ms: now - p.at, on: on.name, why: state === "expired" ? `${on.name} held it past 30 s; nothing done` : state, at: now }) });
}

export const expire = internalMutation({
  args: { pendingId: v.id("pending") },
  returns: v.null(),
  handler: async (ctx, { pendingId }) => {
    const p = await ctx.db.get(pendingId);
    if (p) await close(ctx, p, "expired");
    return null;
  },
});

/** The asker takes their waiting write back. */
export const cancel = mutation({
  args: { pendingId: v.id("pending"), userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { pendingId, userId }) => {
    const p = await ctx.db.get(pendingId);
    const row = p && (await ctx.db.get(p.writeId));
    if (!p || !row || row.byUserId !== userId) return false;
    await close(ctx, p, "cancelled");
    return true;
  },
});

const ghostV = v.object({
  id: v.id("pending"), writeId: v.id("aiWrites"), thing: v.string(), widgetId: v.optional(v.id("widgets")), kind: v.string(),
  by: v.string(), byUserId: v.optional(v.string()), text: v.string(), write: v.string(), on: v.string(), at: v.number(),
});
const settledV = v.object({ id: v.id("aiWrites"), widgetId: v.optional(v.id("widgets")), kind: v.string(), by: v.string(), byUserId: v.optional(v.string()), text: v.string(), outcome: v.string() });

/** Every screen: the writes waiting right now (the ghosts) and how the last few waits ended (the slips). */
export const room = query({
  args: { spaceId: v.id("spaces") },
  returns: v.object({ ghosts: v.array(ghostV), settled: v.array(settledV) }),
  handler: async (ctx, { spaceId }) => {
    const waiting = await ctx.db.query("pending").withIndex("by_thing", (q) => q.eq("spaceId", spaceId)).take(20);
    const ghosts = [];
    for (const p of waiting) {
      const row = await ctx.db.get(p.writeId);
      if (!row) continue;
      ghosts.push({ id: p._id, writeId: p.writeId, thing: p.thing, ...(row.widgetId ? { widgetId: row.widgetId } : {}), kind: row.kind, by: row.by, ...(row.byUserId ? { byUserId: row.byUserId } : {}), text: row.text ?? "", write: p.write, on: p.on, at: p.at });
    }
    const recent = await ctx.db.query("aiWrites").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(40);
    const settled = recent
      .filter((r) => r.outcome)
      .slice(0, 8)
      .map((r) => ({ id: r._id, ...(r.widgetId ? { widgetId: r.widgetId } : {}), kind: r.kind, by: r.by, ...(r.byUserId ? { byUserId: r.byUserId } : {}), text: r.text ?? "", outcome: r.outcome! }));
    return { ghosts, settled };
  },
});

/** "What it held back" (the knows page): recent waits and nevers, from the ledger. */
export const heldBack = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ id: v.id("aiWrites"), at: v.number(), kind: v.string(), by: v.string(), verdict: v.string(), reason: v.string(), text: v.string(), outcome: v.optional(v.string()) })),
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db.query("aiWrites").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(200);
    return rows
      .filter((r) => (r.verdict === "wait" || r.verdict === "never" || r.verdict === "refused") && !r.outcome?.includes('"replaced"'))
      .slice(0, 8)
      .map((r) => ({ id: r._id, at: r.at, kind: r.kind, by: r.by, verdict: r.verdict, reason: r.reason ?? "", text: r.text ?? "", ...(r.outcome ? { outcome: r.outcome } : {}) }));
  },
});
