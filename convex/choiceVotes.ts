import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { seatOf, canRead } from "./seat";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { applyEdit, fieldsOf, type Choice, type EditOp } from "../src/lib/deck/edits";
import { rightOfWay as gate } from "../src/lib/rightOfWay";
import { KEEP, MAX_OPTIONS, since, tally, voterKey, voterOf } from "../src/lib/choiceVote";
import { cardCtx, commitEdit, rightOfWay } from "./rightOfWay";

/**
 * Choices become a vote (nebius R2). When the door says `ask` (an AI write
 * would override what people chose), the write doesn't happen: a small vote
 * rides on the card instead, "move game night to sunday? tara asked · 3
 * people said yes to friday", keep it / change it. Only the people whose
 * choice is at stake vote; one person is asked directly ("ok / no").
 *
 * Code resolves it, never a model (src/lib/choiceVote.ts `tally`): more than
 * half of them → that; everyone answered without that → keep; its life runs
 * out → keep. A passed change goes through the door again, consented, so it
 * goes or waits on whoever holds the card. Nobody's choice is converted:
 * the ones that no longer make sense are cleared with a note on the card.
 * The asker can withdraw; a second ask on the same choice joins as another
 * option (three in all, then "one thing at a time"); if everyone at stake
 * changes their own choice by hand, it closes as moot and the write goes.
 */

export const LIFE_MS = 24 * 3600_000;
const MIN_LIFE_MS = 10_000;

type Vote = Doc<"choiceVotes">;
type Option = Vote["options"][number];

/** Only the edit's own fields, for "changed while it waited" (the choices it clears are expected to differ). */
const SETS = new Set(["rename", "setWhen", "setDate", "setDays", "setDay"]);

/** The door said ask: open the vote on this choice, or join the open one as another option. */
export async function openVote(
  ctx: MutationCtx,
  a: { widget: Doc<"widgets">; choice: Choice; op: EditOp; changed: string; today: string; by: { name: string; userId: string }; writeId: Id<"aiWrites">; life?: number },
): Promise<{ state: "asked" | "joined" | "already" | "busy"; voteId: Id<"choiceVotes">; who: string[] }> {
  const op = JSON.stringify(a.op);
  const now = Date.now();
  const open = (await ctx.db.query("choiceVotes").withIndex("by_widget", (q) => q.eq("widgetId", a.widget._id).eq("state", "open")).take(8)).find((x) => x.key === a.choice.key);
  const voters = a.choice.people.map((p) => ({ ...(p.id ? { id: p.id } : {}), name: p.name, why: p.why }));
  const option = { ask: a.choice.ask, changed: a.changed, op, by: a.by.name, byUserId: a.by.userId, writeId: a.writeId };
  if (open) {
    const names = open.voters.map((p) => p.name);
    if (open.options.some((o) => o.op === op)) return { state: "already", voteId: open._id, who: names };
    if (open.options.length >= MAX_OPTIONS) return { state: "busy", voteId: open._id, who: names };
    const id = `c${open.options.length}`;
    const all = [...open.voters, ...voters.filter((p) => !open.voters.some((o) => voterKey(o) === voterKey(p)))];
    const mine = voterOf(all, a.by.userId, a.by.name);
    const answers = mine ? [...open.answers.filter((x) => x.voter !== mine), { voter: mine, option: id, at: now }] : open.answers;
    await ctx.db.patch(open._id, { voters: all, options: [...open.options, { id, ...option }], answers });
    await settle(ctx, open._id);
    return { state: "joined", voteId: open._id, who: all.map((p) => p.name) };
  }
  const mine = voterOf(voters, a.by.userId, a.by.name);
  const life = Math.min(LIFE_MS, Math.max(MIN_LIFE_MS, a.life ?? LIFE_MS));
  const voteId = await ctx.db.insert("choiceVotes", {
    spaceId: a.widget.spaceId, widgetId: a.widget._id, key: a.choice.key, stake: a.choice.stake, voters,
    options: [{ id: KEEP, ask: "" }, { id: "c1", ...option }],
    // the asker's own choice is one at stake: their answer is the change they asked for
    answers: mine ? [{ voter: mine, option: "c1", at: now }] : [],
    state: "open", today: a.today, at: now, endsAt: now + life,
  });
  await ctx.scheduler.runAt(now + life, internal.choiceVotes.expire, { voteId });
  return { state: "asked", voteId, who: voters.map((p) => p.name) };
}

/** Close it: the vote's state, and each asker's ledger row says how it ended (the asker's slip reads `why`). */
async function close(ctx: MutationCtx, vote: Vote, state: string, why: string, extra: Partial<Vote> = {}) {
  const now = Date.now();
  await ctx.db.patch(vote._id, { state, why, closedAt: now, ...extra });
  // a link that opened it (links.ts writeLinked) is done: a passed change lands as the edit below, a kept choice stays
  for (const l of await ctx.db.query("links").withIndex("by_space", (q) => q.eq("spaceId", vote.spaceId)).take(100))
    if (l.vote === vote._id) await ctx.db.patch(l._id, { vote: undefined, resolvedAt: now });
  for (const o of vote.options)
    if (o.writeId) await ctx.db.patch(o.writeId, { outcome: JSON.stringify({ state: state === "change" ? "changed" : state === "keep" ? "kept" : state, ms: now - vote.at, on: vote.stake, why, at: now }) });
}

/** Send a change the people agreed to through the door again: it goes, or waits on whoever holds the card. */
async function land(ctx: MutationCtx, vote: Vote, o: Option, consented: string, consent: boolean): Promise<Partial<Vote>> {
  const widget = await ctx.db.get(vote.widgetId);
  if (!widget || !o.op) return { landed: "the card is gone; nothing done" };
  const op = JSON.parse(o.op) as EditOp;
  const card = { type: widget.type, data: widget.data as Record<string, unknown> };
  const r = applyEdit(card, op, await cardCtx(ctx, widget, vote.today, consent));
  if (!r.ok) return { landed: `${r.reason}; nothing done` };
  const by = { name: o.by ?? "someone", ...(o.byUserId ? { userId: o.byUserId } : {}) };
  // a choice made since it opened wasn't asked about (R4, eval X34): it's kept, and its people are asked in turn
  const now = applyEdit(card, op, await cardCtx(ctx, widget, vote.today));
  const was = !now.ok ? now.choice : undefined;
  const newer = was ? since(vote.voters, was.people) : [];
  const choice = was && newer.length ? { ...was, stake: newer.length === 1 ? `${newer[0].name.toLowerCase()} ${newer[0].why}` : `${newer.length} people since`, people: newer } : undefined;
  const own = fieldsOf(widget.type, op.op);
  const door = await rightOfWay(ctx, {
    kind: "edit", spaceId: widget.spaceId, widgetId: widget._id, by,
    fields: r.fields, text: r.text, undo: r.undo, consented, ...(choice ? { choice } : {}),
    replay: { kind: "edit", op, today: vote.today, vote: vote._id, ...(consent ? { consent: true as const } : {}), ...(SETS.has(op.op) ? { set: Object.fromEntries(r.fields.filter((f) => own.includes(f.field)).map((f) => [f.field, f.old ?? null])) } : {}) },
  });
  if (door.verdict === "ask" && choice) {
    const kept = `${newer.length} ${widget.type === "poll" ? "vote" : "choice"}${newer.length === 1 ? " since was" : "s since were"} kept`;
    const next = await openVote(ctx, { widget, choice, op, changed: o.changed ?? "", today: vote.today, by: { name: by.name, userId: o.byUserId ?? "" }, writeId: door.writeId });
    return { landed: `waiting on ${next.who.map((n) => n.toLowerCase()).join(", ")} · ${kept}` };
  }
  if (door.verdict === "go") {
    await commitEdit(ctx, widget, r);
    return { landed: "landed", ...(r.cleared ? { note: r.cleared.note } : {}) };
  }
  if (door.verdict === "wait") return { landed: `waiting on ${door.on?.name.toLowerCase() ?? "someone"}`, ...(r.cleared ? { note: r.cleared.note } : {}) };
  return { landed: `${door.reason}; nothing done` };
}

/** Count it (src/lib/choiceVote.ts) and close it if it's decided. */
async function settle(ctx: MutationCtx, voteId: Id<"choiceVotes">, expired = false) {
  const vote = await ctx.db.get(voteId);
  if (!vote || vote.state !== "open") return;
  const out = tally(vote.voters, vote.options, vote.answers, expired);
  if (out.state === "open") return;
  const one = vote.voters.length === 1;
  if (out.state === "change") {
    const o = vote.options.find((x) => x.id === out.option)!;
    const said = one ? `${vote.voters[0].name.toLowerCase()} said ok` : `${out.n} of ${out.of} said ${vote.options.length > 2 ? o.changed ?? "change it" : "change it"}`;
    await close(ctx, vote, "change", said);
    const landed = await land(ctx, vote, o, `the vote passed: ${said}`, true);
    await ctx.db.patch(vote._id, landed);
    return;
  }
  const why =
    out.why === "expired" ? "nobody decided in time · kept as it is" : out.why === "tie" ? `no majority · kept as it is` : one ? `${vote.voters[0].name.toLowerCase()} said no · kept as it is` : `${out.n} of ${out.of} said keep it · kept as it is`;
  await close(ctx, vote, out.why === "expired" ? "expired" : "keep", why);
}

/**
 * Someone changed a choice by hand on this card (a vote, a claim, an rsvp, a
 * check-in, the card's own edit): if nobody's choice is in the way of an open
 * vote's change any more, the vote is moot and the change just goes.
 */
export async function recheck(ctx: MutationCtx, widgetId: Id<"widgets">) {
  const open = await ctx.db.query("choiceVotes").withIndex("by_widget", (q) => q.eq("widgetId", widgetId).eq("state", "open")).take(4);
  if (!open.length) return;
  const widget = await ctx.db.get(widgetId);
  if (!widget) return;
  const card = { type: widget.type, data: widget.data as Record<string, unknown> };
  for (const vote of open) {
    const base = await cardCtx(ctx, widget, vote.today);
    // the change with the most answers first
    const changes = vote.options.filter((o) => o.op).sort((a, b) => vote.answers.filter((x) => x.option === b.id).length - vote.answers.filter((x) => x.option === a.id).length);
    for (const o of changes) {
      const r = applyEdit(card, JSON.parse(o.op!) as EditOp, base);
      if (!r.ok && r.choice) {
        // still someone else's choice in the way
        const g = gate({ thing: widgetId, by: { kind: "space", ...(o.byUserId ? { asker: o.byUserId } : {}), askerName: o.by }, choice: r.choice }, []);
        if (g.kind === "ask") continue;
      }
      if (!r.ok && !r.choice) {
        // done by hand already ("it's already sunday"), or it no longer applies
        await close(ctx, vote, "moot", `they changed it themselves · ${r.reason}`);
        break;
      }
      await close(ctx, vote, "moot", "everyone changed their own answer · it just went");
      await ctx.db.patch(vote._id, await land(ctx, vote, o, "moot: nobody's choice left in the way", !r.ok));
      break;
    }
  }
}

/** The card was deleted: its open votes close, nothing changes. */
export async function dropFor(ctx: MutationCtx, widgetId: Id<"widgets">) {
  for (const vote of await ctx.db.query("choiceVotes").withIndex("by_widget", (q) => q.eq("widgetId", widgetId).eq("state", "open")).take(8)) await close(ctx, vote, "withdrawn", "the card was deleted · nothing changed");
}

/** A voter answers (or changes their answer while it's open). */
export const answer = mutation({
  args: { voteId: v.id("choiceVotes"), option: v.string(), userId: v.string(), name: v.string() },
  returns: v.string(),
  handler: async (ctx, a) => {
    const vote = await ctx.db.get(a.voteId);
    if (!vote) return "gone";
    if (vote.state !== "open") return vote.state;
    const seat = await seatOf(ctx, vote.spaceId);
    const me = seat && voterOf(vote.voters, seat.userId, seat.name);
    if (!me) return "not yours to answer";
    if (!vote.options.some((o) => o.id === a.option)) return "no such option";
    await ctx.db.patch(vote._id, { answers: [...vote.answers.filter((x) => x.voter !== me), { voter: me, option: a.option, at: Date.now() }] });
    await settle(ctx, vote._id);
    return (await ctx.db.get(vote._id))!.state;
  },
});

/** The asker takes their change back; the vote closes when no change is left on it. */
export const withdraw = mutation({
  args: { voteId: v.id("choiceVotes"), userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { voteId }) => {
    const vote = await ctx.db.get(voteId);
    const seat = vote && (await seatOf(ctx, vote.spaceId));
    const userId = seat?.userId;
    const o = userId && vote?.options.find((x) => x.op && x.byUserId === userId);
    if (!vote || vote.state !== "open" || !o) return false;
    const left = vote.options.filter((x) => x !== o);
    if (left.every((x) => !x.op)) {
      await close(ctx, vote, "withdrawn", `${o.by?.toLowerCase() ?? "the asker"} withdrew it · nothing changed`);
      return true;
    }
    await ctx.db.patch(vote._id, { options: left, answers: vote.answers.filter((x) => x.option !== o.id) });
    if (o.writeId) await ctx.db.patch(o.writeId, { outcome: JSON.stringify({ state: "withdrawn", ms: Date.now() - vote.at, on: vote.stake, why: "you withdrew it", at: Date.now() }) });
    await settle(ctx, vote._id);
    return true;
  },
});

export const expire = internalMutation({
  args: { voteId: v.id("choiceVotes") },
  returns: v.null(),
  handler: async (ctx, { voteId }) => {
    await settle(ctx, voteId, true);
    return null;
  },
});

const voteV = v.object({
  id: v.id("choiceVotes"), widgetId: v.id("widgets"), key: v.string(), stake: v.string(),
  voters: v.array(v.object({ id: v.optional(v.string()), name: v.string(), why: v.string() })),
  options: v.array(v.object({ id: v.string(), ask: v.string(), changed: v.optional(v.string()), by: v.optional(v.string()), byUserId: v.optional(v.string()), writeId: v.optional(v.id("aiWrites")) })),
  answers: v.array(v.object({ voter: v.string(), option: v.string(), at: v.number() })),
  state: v.string(), why: v.optional(v.string()), note: v.optional(v.string()), landed: v.optional(v.string()),
  at: v.number(), endsAt: v.number(), closedAt: v.optional(v.number()),
});

/** Every screen: the open votes on the room's cards, and the last few that closed (their notes). */
export const room = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(voteV),
  handler: async (ctx, { spaceId }) => {
    if (!(await canRead(ctx, spaceId))) return [];
    const rows = await ctx.db.query("choiceVotes").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(24);
    const open = rows.filter((r) => r.state === "open");
    const closed = rows.filter((r) => r.state !== "open").slice(0, 6);
    return [...open, ...closed].map((r) => ({
      id: r._id, widgetId: r.widgetId, key: r.key, stake: r.stake, voters: r.voters,
      options: r.options.map(({ op: _op, ...o }) => o), answers: r.answers, state: r.state,
      ...(r.why ? { why: r.why } : {}), ...(r.note ? { note: r.note } : {}), ...(r.landed ? { landed: r.landed } : {}),
      at: r.at, endsAt: r.endsAt, ...(r.closedAt ? { closedAt: r.closedAt } : {}),
    }));
  },
});
