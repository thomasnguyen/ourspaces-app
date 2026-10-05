import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { applyEdit, type EditOp } from "../src/lib/deck/edits";
import { rightOfWay } from "./rightOfWay";
import { writeWidgetData } from "./widgets";

/**
 * Voice edits (src/lib/deck/edits.ts): "add ramen to the dinner poll".
 * The asker's code sends the card and a typed op; this re-applies the op to
 * the card as stored (never trusting the client's data), refuses what would
 * undo people's choices, passes the one door (rightOfWay.ts) and writes
 * through `writeWidgetData`, the same path the card's own edit takes.
 * Votes live in their own table and are never written here.
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
});
type Result = typeof resultV.type;

/** Each option's vote count, from the votes table (the card's data copy can be stale). */
async function votesOf(ctx: MutationCtx, widget: Doc<"widgets">) {
  if (widget.type !== "poll") return undefined;
  const rows = await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", widget._id)).take(500);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.optionId] = (out[r.optionId] ?? 0) + 1;
  return out;
}

/** Ops that set a value: a waiting one is dropped if someone changed that field meanwhile. Adds and removes re-check by re-running. */
const SETS = new Set(["rename", "setWhen", "setDate", "setDays", "setDay"]);

async function run(ctx: MutationCtx, a: { spaceId: Id<"spaces">; widgetId: Id<"widgets">; op: EditOp; by: string; byUserId: string; today: string; kind: "edit" | "undo" }): Promise<Result> {
  const widget = await ctx.db.get(a.widgetId);
  // a card in another room is never touched
  if (!widget || widget.spaceId !== a.spaceId) return { status: "failed", text: "that card isn't in this room", fields: [] };
  const r = applyEdit({ type: widget.type, data: widget.data as Record<string, unknown> }, a.op, { today: a.today, votes: await votesOf(ctx, widget) });
  const who = { name: a.by, userId: a.byUserId };
  if (!r.ok && !r.refused) return { status: "failed", text: r.reason, fields: [] };
  // the one door (rightOfWay.ts): a refusal is its `never`; someone holding the card is `wait`
  const door = r.ok
    ? await rightOfWay(ctx, {
        kind: a.kind, spaceId: a.spaceId, widgetId: widget._id, by: who, fields: r.fields, text: r.text, undo: r.undo,
        replay: { kind: "edit", op: a.op, today: a.today, ...(SETS.has(a.op.op) ? { set: Object.fromEntries(r.fields.map((f) => [f.field, f.old ?? null])) } : {}) },
      })
    : await rightOfWay(ctx, { kind: a.kind, spaceId: a.spaceId, widgetId: widget._id, by: who, fields: [], text: r.reason, undo: a.op, refused: r.reason });
  if (!r.ok) return { status: "refused", text: r.reason, writeId: door.writeId, fields: [], verdict: "never" };
  if (door.verdict === "wait") return { status: "wait", text: door.reason, writeId: door.writeId, fields: r.fields.map((f) => f.field), verdict: "wait", ...(door.on ? { on: door.on } : {}), ...(door.pendingId ? { pendingId: door.pendingId } : {}) };
  if (door.verdict !== "go") return { status: "refused", text: door.reason, writeId: door.writeId, fields: [], verdict: door.verdict };
  await writeWidgetData(ctx, widget, r.data as Doc<"widgets">["data"], { stampLater: true });
  return { status: "applied", text: r.text, writeId: door.writeId, fields: r.fields.map((f) => f.field), verdict: door.verdict, ...(door.on ? { on: door.on } : {}) };
}

export const apply = mutation({
  args: { spaceId: v.id("spaces"), widgetId: v.id("widgets"), op: opV, by: v.string(), byUserId: v.string(), today: v.string() },
  returns: resultV,
  handler: async (ctx, a) => await run(ctx, { ...a, kind: "edit" }),
});

/** The slip's undo: the asker only, within half a minute, the inverse op through the same door. */
export const undo = mutation({
  args: { spaceId: v.id("spaces"), writeId: v.id("aiWrites"), byUserId: v.string(), today: v.string() },
  returns: resultV,
  handler: async (ctx, a): Promise<Result> => {
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
    const rows = await ctx.db.query("aiWrites").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(30);
    return rows
      .filter((r) => (r.kind === "edit" || r.kind === "undo") && r.verdict === "go" && r.widgetId)
      .slice(0, 6)
      .map((r) => ({ id: r._id, at: r.at, widgetId: r.widgetId!, kind: r.kind, by: r.by, ...(r.byUserId ? { byUserId: r.byUserId } : {}), text: r.text ?? "" }));
  },
});
