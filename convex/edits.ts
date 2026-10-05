import { mutation, query, type MutationCtx } from "./_generated/server";
import { seatOf, canRead } from "./seat";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { applyEdit, type EditOp } from "../src/lib/deck/edits";
import { cardCtx, commitEdit, rightOfWay } from "./rightOfWay";
import { openVote } from "./choiceVotes";

/**
 * Voice edits (src/lib/deck/edits.ts): "add ramen to the dinner poll".
 * The asker's code sends the card and a typed op; this re-applies the op to
 * the card as stored (never trusting the client's data), finds the people's
 * choices it would override, passes the one door (rightOfWay.ts) and writes
 * through `writeWidgetData`, the same path the card's own edit takes.
 * A choice that isn't only the asker's own makes the door say ask: a vote of
 * those people opens on the card (choiceVotes.ts) and nothing is written.
 * Vote rows are only ever removed after such a vote passed (commitEdit).
 */

const opV = v.object({ op: v.string(), value: v.union(v.string(), v.number()), item: v.optional(v.string()) });
const resultV = v.object({
  status: v.union(v.literal("applied"), v.literal("refused"), v.literal("failed"), v.literal("wait"), v.literal("ask")),
  text: v.string(),
  writeId: v.optional(v.id("aiWrites")),
  fields: v.array(v.string()),
  verdict: v.optional(v.string()),
  /** wait: who holds the card, and the ghost (rightOfWay.ts); go: the asker held it themself */
  on: v.optional(v.object({ userId: v.string(), name: v.string(), color: v.string(), kind: v.string() })),
  pendingId: v.optional(v.id("pending")),
  /** ask: the vote on the card (asked, joined the open one, already asked, or busy), who votes and on what */
  vote: v.optional(v.object({ id: v.id("choiceVotes"), state: v.string(), who: v.array(v.string()), why: v.array(v.string()), stake: v.string(), ask: v.string() })),
  /** a consented write's note: the choices it cleared */
  cleared: v.optional(v.string()),
});
type Result = typeof resultV.type;

/** Ops that set a value: a waiting one is dropped if someone changed that field meanwhile. Adds and removes re-check by re-running. */
const SETS = new Set(["rename", "setWhen", "setDate", "setDays", "setDay"]);

async function run(ctx: MutationCtx, a: { spaceId: Id<"spaces">; widgetId: Id<"widgets">; op: EditOp; by: string; byUserId: string; today: string; kind: "edit" | "undo"; life?: number }): Promise<Result> {
  const widget = await ctx.db.get(a.widgetId);
  // a card in another room is never touched
  if (!widget || widget.spaceId !== a.spaceId) return { status: "failed", text: "that card isn't in this room", fields: [] };
  const card = { type: widget.type, data: widget.data as Record<string, unknown> };
  const base = await cardCtx(ctx, widget, a.today);
  const r = applyEdit(card, a.op, base);
  const who = { name: a.by, userId: a.byUserId };
  if (!r.ok && !r.choice) return { status: r.refused ? "refused" : "failed", text: r.reason, fields: [] };
  const choice = r.ok ? undefined : r.choice;
  // people's choices in the way: what it would be with their consent (it may still be impossible: "a poll needs two options")
  const c = r.ok ? r : applyEdit(card, a.op, { ...base, consent: true });
  if (!c.ok) return { status: "failed", text: c.reason, fields: [] };
  // the one door (rightOfWay.ts): others' choices are `ask`, someone holding the card is `wait`
  const door = await rightOfWay(ctx, {
    kind: a.kind, spaceId: a.spaceId, widgetId: widget._id, by: who, fields: c.fields, text: choice ? choice.ask : c.text, undo: c.undo,
    ...(choice ? { choice } : {}),
    replay: { kind: "edit", op: a.op, today: a.today, ...(choice ? { consent: true as const } : {}), ...(SETS.has(a.op.op) ? { set: Object.fromEntries(c.fields.filter((f) => !CLEARED.has(f.field)).map((f) => [f.field, f.old ?? null])) } : {}) },
  });
  if (door.verdict === "ask" && choice) {
    const vote = await openVote(ctx, { widget, choice, op: a.op, changed: c.changed, today: a.today, by: who, writeId: door.writeId, life: a.life });
    return { status: "ask", text: door.reason, writeId: door.writeId, fields: [], verdict: "ask", vote: { id: vote.voteId, state: vote.state, who: vote.who, why: choice.people.map((p) => `${p.name} ${p.why}`), stake: choice.stake, ask: choice.ask } };
  }
  if (door.verdict === "wait") return { status: "wait", text: door.reason, writeId: door.writeId, fields: c.fields.map((f) => f.field), verdict: "wait", ...(door.on ? { on: door.on } : {}), ...(door.pendingId ? { pendingId: door.pendingId } : {}) };
  if (door.verdict !== "go") return { status: "refused", text: door.reason, writeId: door.writeId, fields: [], verdict: door.verdict };
  await commitEdit(ctx, widget, c);
  return { status: "applied", text: c.text, writeId: door.writeId, fields: c.fields.map((f) => f.field), verdict: door.verdict, ...(door.on ? { on: door.on } : {}), ...(c.cleared ? { cleared: c.cleared.note } : {}) };
}

/** Fields a consented edit clears: not part of "changed while it waited". */
const CLEARED = new Set(["responses", "logs", "dateBy"]);

export const apply = mutation({
  // life: a test's short life for the vote this may open (ms; default a day)
  args: { spaceId: v.id("spaces"), widgetId: v.id("widgets"), op: opV, by: v.string(), byUserId: v.string(), today: v.string(), life: v.optional(v.number()) },
  returns: resultV,
  handler: async (ctx, a): Promise<Result> => {
    const me = await seatOf(ctx, a.spaceId);
    if (!me) return { status: "refused", text: "enter the space first", fields: [] };
    return await run(ctx, { ...a, by: me.name, byUserId: me.userId, kind: "edit" });
  },
});

/** The slip's undo: the asker only, within half a minute, the inverse op through the same door. */
export const undo = mutation({
  args: { spaceId: v.id("spaces"), writeId: v.id("aiWrites"), byUserId: v.string(), today: v.string() },
  returns: resultV,
  handler: async (ctx, a): Promise<Result> => {
    const me = await seatOf(ctx, a.spaceId);
    if (!me) return { status: "refused", text: "enter the space first", fields: [] };
    a = { ...a, byUserId: me.userId };
    const row = await ctx.db.get(a.writeId);
    if (!row || row.spaceId !== a.spaceId || row.kind !== "edit" || row.verdict !== "go" || !row.widgetId || !row.undo) return { status: "failed", text: "nothing to undo", fields: [] };
    if (row.byUserId !== a.byUserId) return { status: "refused", text: "only the person who asked can undo it", fields: [] };
    if (row.undone) return { status: "failed", text: "already undone", fields: [] };
    if (Date.now() - row.at > 30_000) return { status: "failed", text: "too late to undo", fields: [] };
    const out = await run(ctx, { spaceId: a.spaceId, widgetId: row.widgetId, op: JSON.parse(row.undo) as EditOp, by: row.by, byUserId: a.byUserId, today: a.today, kind: "undo" });
    if (out.status === "applied") await ctx.db.patch(row._id, { undone: true });
    return out;
  },
});

/** The room's last AI edits: every screen shows "juno added ramen" on the card as it lands. */
export const recent = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ id: v.id("aiWrites"), at: v.number(), widgetId: v.id("widgets"), kind: v.string(), by: v.string(), byUserId: v.optional(v.string()), text: v.string() })),
  handler: async (ctx, { spaceId }) => {
    if (!(await canRead(ctx, spaceId))) return [];
    const rows = await ctx.db.query("aiWrites").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(30);
    return rows
      .filter((r) => (r.kind === "edit" || r.kind === "undo") && r.verdict === "go" && r.widgetId)
      .slice(0, 6)
      .map((r) => ({ id: r._id, at: r.at, widgetId: r.widgetId!, kind: r.kind, by: r.by, ...(r.byUserId ? { byUserId: r.byUserId } : {}), text: r.text ?? "" }));
  },
});
