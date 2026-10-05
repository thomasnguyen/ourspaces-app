import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { seatOf, canRead } from "./seat";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { rightOfWay as gate, type Choice, type Lease, type Verdict } from "../src/lib/rightOfWay";
import { applyEdit, type EditCtx, type EditOp, type EditResult } from "../src/lib/deck/edits";
import { pollTallies } from "./votes";
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
 * (src/lib/rightOfWay.ts, the case table is there) for go | ask | wait | never.
 * No model is called anywhere on this path.
 *
 *   go     the caller commits it
 *   ask    it would override other people's choices: the caller opens a
 *          vote of those people on the card (choiceVotes.ts); a passed vote
 *          sends the write here again, consented, and it goes or waits
 *   wait   kept as a `pending` row (the ghost every screen draws) and
 *          replayed by `landWaiting` in the mutation that ends the hold,
 *          after re-checking it still makes sense; dropped after 30 s
 *   never  not written (a refusal, the last puzzle piece, or a new card
 *          on a held spot, which the caller places elsewhere)
 *
 * Every call is a row in `aiWrites` (the ledger "what it held back" reads).
 */

export type Replay =
  /** set = for ops that set a value: the touched fields as they were; changed meanwhile → dropped. consent = a passed vote's write */
  | { kind: "edit"; op: EditOp; today: string; set?: Record<string, unknown>; consent?: true; vote?: Id<"choiceVotes"> }
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
  /** People's choices it would override (applyEdit found them): the gate says ask unless they're all the asker's own. */
  choice?: Choice;
  /** Sent again after the people at stake agreed ("the vote passed, 2 of 3"): it goes in the ledger's reason. */
  consented?: string;
  /** Code refused it before the door. */
  refused?: string;
  /** It would complete a shared thing (the last piece). */
  finishes?: boolean;
  /** How to land it later, if it has to wait. Without one a wait is just not written. */
  replay?: Replay;
};
export type Holder = { userId: string; name: string; color: string; kind: string };
export type Door = { verdict: Verdict["kind"]; reason: string; writeId: Id<"aiWrites">; on?: Holder; onThing?: string; pendingId?: Id<"pending">; who?: Choice["people"]; stake?: string };

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
  const v = gate({ thing, by: { kind: "space", ...(write.by.userId ? { asker: write.by.userId } : {}), askerName: write.by.name }, spot, choice: write.choice, refused: write.refused, finishes: write.finishes }, rows.map(asLease));
  // the lease behind the verdict: who it waits on, or (go) the asker's own hold on it
  const vOn = v.kind === "wait" || v.kind === "never" ? v.on : undefined;
  const lease = vOn ? rows.find((l) => l.thing === vOn.thing && l.userId === (vOn.by as { id: string }).id) : v.kind === "go" && thing !== undefined ? rows.find((l) => l.thing === thing) : undefined;
  const on = lease ? holderOf(lease) : undefined;
  const own = write.choice ? `only ${write.by.name.toLowerCase()}'s own choice (${write.choice.stake}); ` : "";
  const reason =
    v.kind === "ask"
      ? `that's ${v.who.length === 1 ? `${v.who[0].name.toLowerCase()}'s` : `${v.who.length} people's`} choice: ${write.choice!.stake}`
      : (write.consented ? `${write.consented}; ` : "") +
        (v.kind === "go"
          ? own + (lease ? `${lease.name} holds it: their own hand` : "nobody holds it")
          : v.kind === "wait"
            ? own + `${on!.name} is ${DOING[on!.kind] ?? "holding"} it`
            : on && thing === undefined ? `${v.why}; placed it below` : v.why);
  // who else had a hand on it, read straight from the leases (not from the verdict): the ledger checks every go against it
  const others = [...new Set(rows.filter((l) => l.userId !== write.by.userId && (thing !== undefined || spot?.includes(l.thing))).map((l) => l.name))];
  const writeId = await log(ctx, write, v.kind, reason, others);
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
  return { verdict: v.kind, reason, writeId, ...(on ? { on, onThing: lease!.thing } : {}), ...(pendingId ? { pendingId } : {}), ...(v.kind === "ask" ? { who: v.who, stake: v.stake } : {}) };
}

/** What people did on a card that an edit must not undo, from the tables (a poll's votes and who cast them). */
export async function cardCtx(ctx: MutationCtx, widget: Doc<"widgets">, today: string, consent = false): Promise<EditCtx> {
  if (widget.type !== "poll") return { today, consent };
  const votes: Record<string, number> = {};
  const voters: Record<string, { id: string; name: string }[]> = {};
  for (const x of await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", widget._id)).take(500)) {
    votes[x.optionId] = (votes[x.optionId] ?? 0) + 1;
    const m = await ctx.db.query("members").withIndex("by_space_user", (q) => q.eq("spaceId", widget.spaceId).eq("userId", x.userId)).first();
    (voters[x.optionId] ??= []).push({ id: x.userId, name: m?.name ?? "someone" });
  }
  return { today, votes, voters, consent };
}

/** Write an applied edit: the card's data, and the vote rows of an option a passed vote took off (their note says so). */
export async function commitEdit(ctx: MutationCtx, widget: Doc<"widgets">, r: Extract<EditResult, { ok: true }>) {
  await writeWidgetData(ctx, widget, r.data as Doc<"widgets">["data"], { stampLater: true });
  if (!r.cleared?.votesFor) return;
  for (const x of await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", widget._id)).take(500)) {
    if (x.optionId !== r.cleared.votesFor) continue;
    await ctx.db.delete(x._id);
    await pollTallies.deleteIfExists(ctx, x);
  }
}

/** One ledger row. */
export async function log(ctx: MutationCtx, write: AiWrite, verdict: string, reason?: string, others?: string[]) {
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
    ...(others ? { others } : {}),
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
    // a choice made while it waited is a new choice: without consent it doesn't land over it
    const out = applyEdit({ type: widget.type, data: widget.data as Record<string, unknown> }, r.op, await cardCtx(ctx, widget, r.today, r.consent));
    if (!out.ok) return changed;
    await commitEdit(ctx, widget, out);
    return { ok: true };
  }
  if (r.kind === "link") {
    const link = await ctx.db.get(r.linkId);
    const to = link && (await ctx.db.get(link.to));
    // the link still open and not cut by a person while it waited
    if (!link || !to || link.resolvedAt !== undefined || link.cutAt !== undefined) return changed;
    // a flow's write is a patch of several fields (links.ts valueOf); the challenge's is one
    const patch = r.value && typeof r.value === "object" && !Array.isArray(r.value) ? (r.value as Record<string, unknown>) : { [r.fill]: r.value };
    const { unfinished: _u, ...rest } = to.data as Record<string, unknown>;
    await ctx.db.patch(to._id, { data: { ...rest, ...patch } as Doc<"widgets">["data"] });
    await ctx.db.patch(link._id, link.when.split("|").includes("live") ? { at: Date.now() } : { resolvedAt: Date.now() });
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
    const r = JSON.parse(p.write) as Replay;
    const out = await replay(ctx, r, row);
    // a passed vote's change: the card's note says it landed (or why not)
    if (r.kind === "edit" && r.vote) await ctx.db.patch(r.vote, { landed: out.ok ? "landed" : out.why });
    await ctx.db.patch(row._id, {
      outcome: JSON.stringify({
        state: out.ok ? "landed" : "dropped",
        ms: now - p.at,
        on: ended.name,
        ...(ended.letGoAt !== null ? { afterLetGo: now - ended.letGoAt } : {}),
        ...(ended.expired ? { expired: true } : {}),
        // who else still held it when it landed (the ledger's check; the gate says this is nobody)
        ...(out.ok ? { heldBy: [...new Set(rows.filter((l) => l.userId !== row.byUserId).map((l) => l.name))] } : {}),
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
  const r = JSON.parse(p.write) as Replay;
  if (r.kind === "edit" && r.vote) await ctx.db.patch(r.vote, { landed: state === "expired" ? `${on.name.toLowerCase()} held it past 30 s; nothing done` : state });
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
  handler: async (ctx, { pendingId }) => {
    const p = await ctx.db.get(pendingId);
    const me = p && (await seatOf(ctx, p.spaceId));
    const row = p && (await ctx.db.get(p.writeId));
    if (!p || !row || !me || row.byUserId !== me.userId) return false;
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
    if (!(await canRead(ctx, spaceId))) return { ghosts: [], settled: [] };
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

const heldRowV = v.object({
  id: v.id("aiWrites"), at: v.number(), kind: v.string(), by: v.string(), verdict: v.string(), reason: v.string(), text: v.string(),
  outcome: v.optional(v.string()), widgetId: v.optional(v.id("widgets")),
  /** wait: who it yielded to; ask: who was asked */
  who: v.array(v.string()),
});
const weekV = v.object({
  /** writes it committed this week (a go, or a wait that landed), held back (wait | ask | never), and each kind */
  writes: v.number(), held: v.number(), waits: v.number(), asks: v.number(), nevers: v.number(),
  /** committed writes the leases say someone else was holding at that moment; checked = writes with that reading */
  overHold: v.number(), checked: v.number(), capped: v.boolean(),
});
const parseO = (s?: string) => { try { return s ? (JSON.parse(s) as { state?: string; on?: string; heldBy?: string[] }) : null; } catch { return null; } };

/**
 * "What it held back" (the knows page), from the ledger: the recent waits (who it yielded to, how long, what
 * happened), votes it called (who was asked, the outcome) and refusals, each with its card; and the week in counts.
 * "Never changed something someone was holding" is computed, not asserted: every committed write is checked against
 * who the leases said held it when it went (`others` at the door, `heldBy` when a wait landed), apart from the gate.
 */
export const heldBack = query({
  /** since = the week's start, from the client (rounded to the hour so the query caches) */
  args: { spaceId: v.id("spaces"), since: v.number() },
  returns: v.object({ rows: v.array(heldRowV), week: weekV }),
  handler: async (ctx, { spaceId, since }) => {
    const empty = { rows: [], week: { writes: 0, held: 0, waits: 0, asks: 0, nevers: 0, overHold: 0, checked: 0, capped: false } };
    if (!(await canRead(ctx, spaceId))) return empty;
    const log = await ctx.db.query("aiWrites").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", since)).order("desc").take(1000);
    const held = log.filter((r) => (r.verdict === "wait" || r.verdict === "never" || r.verdict === "ask") && !r.outcome?.includes('"replaced"'));
    const week = { ...empty.week, capped: log.length === 1000, held: held.length };
    for (const r of log) {
      const o = parseO(r.outcome);
      if (r.verdict === "wait" && !r.outcome?.includes('"replaced"')) week.waits++;
      if (r.verdict === "ask") week.asks++;
      if (r.verdict === "never") week.nevers++;
      // a committed write, and who the leases said held it then
      const reading = r.verdict === "go" ? r.others : r.verdict === "wait" && o?.state === "landed" ? o.heldBy : null;
      if (r.verdict !== "go" && !(r.verdict === "wait" && o?.state === "landed")) continue;
      week.writes++;
      if (reading === undefined || reading === null) continue;
      week.checked++;
      if (reading.length) week.overHold++;
    }
    // who was asked: the vote each ask opened (its option carries the ask's ledger row)
    const votes = await ctx.db.query("choiceVotes").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("at", since)).take(200);
    const asked = new Map<string, string[]>();
    for (const cv of votes) for (const op of cv.options) if (op.writeId) asked.set(op.writeId, cv.voters.map((p) => p.name.toLowerCase()));
    const waiting = await ctx.db.query("pending").withIndex("by_thing", (q) => q.eq("spaceId", spaceId)).take(20);
    const on = new Map(waiting.map((p) => [p.writeId as string, (parseO(p.on) as { name?: string } | null)?.name ?? ""]));
    const rows = held.slice(0, 12).map((r) => {
      const o = parseO(r.outcome);
      const who = r.verdict === "ask" ? asked.get(r._id) ?? [] : r.verdict === "wait" ? [(o?.on ?? on.get(r._id) ?? "").toLowerCase()].filter(Boolean) : [];
      return { id: r._id, at: r.at, kind: r.kind, by: r.by, verdict: r.verdict, reason: r.reason ?? "", text: r.text ?? "", ...(r.outcome ? { outcome: r.outcome } : {}), ...(r.widgetId ? { widgetId: r.widgetId } : {}), who };
    });
    return { rows, week };
  },
});

/** R3's live cost: the door's reads and the gate, n times in one mutation (eval/right-of-way: the door's own time). */
export const probe = internalMutation({
  args: { spaceId: v.id("spaces"), thing: v.string(), n: v.number() },
  returns: v.object({ n: v.number(), ms: v.number(), verdict: v.string() }),
  handler: async (ctx, { spaceId, thing, n }) => {
    const t0 = Date.now();
    let verdict = "";
    for (let i = 0; i < n; i++) verdict = gate({ thing, by: { kind: "space" } }, (await leasesOn(ctx, spaceId, thing)).map(asLease)).kind;
    return { n, ms: Date.now() - t0, verdict };
  },
});
