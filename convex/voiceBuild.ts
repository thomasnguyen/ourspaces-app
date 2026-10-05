// The deck pulls in src/lib/radio.ts, which reads import.meta.env inside a function never called here.
/// <reference types="vite/client" />
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { chooseLetter, pingTokenFactory, streamChat } from "./nebius";
import { touchSpace } from "./activity";
import { widgetsCounter } from "./stats";
import {
  applyCard,
  cardLine,
  deckPrompt,
  deckPromptV2,
  dealTurn,
  dealTurnV2,
  BOARD_LETTERS,
  decideMessages,
  DECIDE_CHOICES,
  DECIDE_LETTERS,
  parseDeal,
  roomContext,
} from "../src/lib/deck";

/**
 * Say it → it builds (path-to-win §3 "The engine"), split in two so the room
 * can start while you're still talking:
 *
 * - `deal` asks Nemotron Lightning for cards and only returns them. It can run
 *   speculatively on a phrase that may still grow, so it never writes a
 *   widget. While the model writes, the answer so far is mirrored into the
 *   ask's `deals` row and `live` streams it to the asker, who fills the
 *   skeleton field by field.
 * - `commit` takes the cards the asker kept, checks each again (`applyCard`)
 *   and creates them where the asker's code placed them (`placeCards` runs on
 *   the client, which can see the board as drawn), in one mutation. Convex
 *   sync puts them on every screen in the room. The asker sends it the moment
 *   the first card closes in the stream, before `deal` has returned, so it
 *   finds the ask's row by the call's nonce.
 * - `amend` rewrites a card just committed when a late word changed the ask
 *   ("…dinner" after the pause): same widget, same spot, never a second card.
 *
 * Two fills, picked per call by the asker's code (`routeAsk`, from the room
 * brief's facts): words that point at no room fact get today's fast fill on
 * Lightning; words that do get the token prompt (`deckPromptV2`, only the
 * facts they point at) on Ultra, and the asker's code resolves the tokens.
 * `decide` is the one-letter Ultra pick of the card, fired while you talk.
 *
 * The model answers with cards only; coordinates, HTML and code never come
 * from it. One `deals` row per call (JSON in `run`): the words, whether it was
 * speculative, the context sent, the raw answer, the model's own timings, and
 * later what was committed and the asker's measured stage times.
 */

const FAST = { model: "lightning", name: "Lightning", maxTokens: 220 } as const;
/** The brain route: Ultra (nebius/eval/brief/v2.md; Super failed 2 of 10 guard asks on the same prompt). */
const BRAIN = { model: "ultra", name: "Ultra", maxTokens: 300 } as const;

type DealOut = {
  dealId: Id<"deals"> | null;
  model: string;
  context: string;
  answer: string;
  none: boolean;
  error: string | null;
  firstTokenMs: number | null;
  firstLineMs: number | null;
  totalMs: number;
};

export const deal = action({
  args: {
    spaceId: v.id("spaces"),
    said: v.string(),
    room: v.string(),
    today: v.string(),
    people: v.array(v.string()),
    /** A one-line label of the selected object, for the model. */
    selected: v.optional(v.string()),
    /** The asker's id for this call: `live` finds the streaming answer by it. */
    nonce: v.string(),
    /** Fired on a phrase that may still grow (the asker hadn't paused yet). */
    spec: v.boolean(),
    /** "brain": the token prompt with `menu` (the room facts these words point at), on Ultra. */
    route: v.optional(v.union(v.literal("fast"), v.literal("brain"))),
    menu: v.optional(v.string()),
    /** The card the decide pass picked, when it had: the fill deals that one. */
    card: v.optional(v.string()),
  },
  returns: v.object({
    dealId: v.union(v.id("deals"), v.null()),
    model: v.string(),
    context: v.string(),
    answer: v.string(),
    none: v.boolean(),
    error: v.union(v.string(), v.null()),
    firstTokenMs: v.union(v.number(), v.null()),
    firstLineMs: v.union(v.number(), v.null()),
    totalMs: v.number(),
    route: v.string(),
    usage: v.union(v.null(), v.object({ prompt: v.number(), completion: v.number() })),
  }),
  handler: async (ctx, args): Promise<DealOut & { route: string; usage: { prompt: number; completion: number } | null }> => {
    const t0 = Date.now();
    const said = args.said.trim().slice(0, 240);
    const brain = args.route === "brain" && !!args.menu;
    const M = brain ? BRAIN : FAST;
    const card = args.card && DECIDE_CHOICES.includes(args.card) && args.card !== "none" && args.card !== "several" ? args.card : undefined;
    const context = brain
      ? args.menu!.slice(0, 1600)
      : roomContext({
          room: args.room,
          today: args.today,
          people: args.people.slice(0, 12),
          selected: args.selected,
        });
    const user = brain ? dealTurnV2({ menu: context, said, card }) : `${dealTurn({ context, said })}${card ? `\n${cardLine(card)}` : ""}`;
    // The row opens alongside the model call, never in front of it.
    const opened: Promise<Id<"deals">> = ctx.runMutation(internal.voiceBuild.record, {
      spaceId: args.spaceId,
      run: JSON.stringify({ at: t0, nonce: args.nonce, said, spec: args.spec, model: M.name, route: brain ? "brain" : "fast", card: card ?? null, context, answer: "", done: false }),
    });

    /* Mirror the answer into the row as it grows: one write in flight at a
       time, the newest text wins, so a fast stream costs a handful of writes. */
    let latest = "";
    let written = "";
    let writing: Promise<void> | null = null;
    const flush = () => {
      if (writing || latest === written) return;
      const text = latest;
      writing = opened
        .then((dealId) => ctx.runMutation(internal.voiceBuild.stream, { dealId, answer: text }))
        .catch(() => {})
        .then(() => {
          written = text;
          writing = null;
          flush();
        });
    };

    const result = await streamChat({
      model: M.model,
      maxTokens: M.maxTokens,
      messages: [
        { role: "system", content: brain ? deckPromptV2() : deckPrompt() },
        { role: "user", content: user },
      ],
      onText: (content) => {
        latest = content;
        flush();
      },
    });
    while (writing) await writing;

    const parsed = parseDeal(result.content, true);
    const none = parsed.none && !parsed.items.some((i) => i.ok);
    const error = result.error ? `${result.status || "fetch"}: ${result.error.slice(0, 160)}` : null;
    const out = {
      model: M.name,
      route: brain ? "brain" : "fast",
      usage: result.usage ? { prompt: result.usage.prompt_tokens ?? 0, completion: result.usage.completion_tokens ?? 0 } : null,
      context,
      answer: result.content.slice(0, 2000),
      none,
      error,
      firstTokenMs: result.firstTokenMs,
      firstLineMs: result.firstLineMs,
      totalMs: Date.now() - t0,
    };
    const dealId: Id<"deals"> | null = await opened.catch(() => null);
    if (dealId) {
      await ctx.runMutation(internal.voiceBuild.finish, {
        dealId,
        patch: JSON.stringify({
          ...out,
          done: true,
          modelTotalMs: result.totalMs,
          finish: result.finish,
          usage: result.usage,
          invalid: parsed.items.flatMap((i) => (i.ok ? [] : [i.reason])),
        }),
      });
    }
    return { ...out, dealId };
  },
});

export const record = internalMutation({
  args: { spaceId: v.id("spaces"), run: v.string() },
  returns: v.id("deals"),
  handler: async (ctx, args) => await ctx.db.insert("deals", args),
});

/** Merge fields into a row's JSON. */
async function patchRun(
  ctx: MutationCtx,
  dealId: Id<"deals">,
  fields: Record<string, unknown>,
) {
  const row = await ctx.db.get(dealId);
  if (!row) return;
  await ctx.db.patch(dealId, { run: JSON.stringify({ ...(JSON.parse(row.run) as object), ...fields }) });
}

export const stream = internalMutation({
  args: { dealId: v.id("deals"), answer: v.string() },
  returns: v.null(),
  handler: async (ctx, { dealId, answer }) => {
    await patchRun(ctx, dealId, { answer: answer.slice(0, 2000) });
    return null;
  },
});

export const finish = internalMutation({
  args: { dealId: v.id("deals"), patch: v.string() },
  returns: v.null(),
  handler: async (ctx, { dealId, patch }) => {
    await patchRun(ctx, dealId, JSON.parse(patch) as Record<string, unknown>);
    return null;
  },
});

/** One call's row, by the asker's nonce (among the room's newest). */
async function rowByNonce(ctx: QueryCtx, spaceId: Id<"spaces">, nonce: string) {
  const rows = await ctx.db
    .query("deals")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .order("desc")
    .take(40);
  for (const row of rows) {
    if (!row.run.includes(nonce)) continue;
    const run = JSON.parse(row.run) as { nonce?: string; answer?: string; done?: boolean };
    if (run.nonce === nonce) return { row, run };
  }
  return null;
}

/** The answer so far for one call (by the asker's nonce), while it streams. */
export const live = query({
  args: { spaceId: v.id("spaces"), nonce: v.string() },
  returns: v.union(v.null(), v.object({ answer: v.string(), done: v.boolean() })),
  handler: async (ctx, { spaceId, nonce }) => {
    const found = await rowByNonce(ctx, spaceId, nonce);
    return found ? { answer: found.run.answer ?? "", done: found.run.done === true } : null;
  },
});

/**
 * Create the cards the asker kept, where the asker's code placed them. Each
 * card is the model's own JSON, checked again here; nothing else is trusted
 * from the client but the spot and the stacking order.
 */
export const commit = mutation({
  args: {
    spaceId: v.id("spaces"),
    dealId: v.optional(v.id("deals")),
    /** The call's nonce, when the asker commits before `deal` has returned its row id. */
    nonce: v.optional(v.string()),
    by: v.string(),
    people: v.array(v.string()),
    today: v.string(),
    createdBy: v.string(),
    cards: v.array(
      v.object({
        card: v.string(),
        x: v.number(),
        y: v.number(),
        z: v.number(),
        /** Room tokens: who this card is among (a split's `among`), replacing the room's people. */
        people: v.optional(v.array(v.string())),
        /** Room tokens: one person per checklist item (`for`). */
        assignees: v.optional(v.array(v.string())),
      }),
    ),
  },
  returns: v.array(v.id("widgets")),
  handler: async (ctx, args) => {
    const people = args.people.slice(0, 12);
    const cardCtx = { by: args.by, people: people.length ? people : [args.by], today: args.today };
    const ids: Id<"widgets">[] = [];
    const now = Date.now();
    for (const c of args.cards.slice(0, 8)) {
      let raw: unknown;
      try {
        raw = JSON.parse(c.card);
      } catch {
        continue;
      }
      const applied = applyCard(raw, c.people?.length ? { ...cardCtx, people: c.people.slice(0, 12) } : cardCtx, {
        z: c.z,
        assignees: c.assignees?.slice(0, 8),
      });
      if (!applied.ok) continue;
      const w = applied.widget;
      // What widgets.createWidget does, without a nested mutation in the hot path.
      const id = await ctx.db.insert("widgets", {
        spaceId: args.spaceId,
        type: w.type,
        x: Math.round(c.x),
        y: Math.round(c.y),
        w: w.w,
        h: w.h,
        z: w.z,
        ...(w.rotate !== undefined ? { rotate: w.rotate } : {}),
        data: w.data as never,
        createdBy: args.createdBy,
        createdAt: now,
      });
      ids.push(id);
    }
    // The rest goes in its own transaction right after: the counter, the
    // room's activity stamp (every query reading the space doc would re-run
    // before this write reaches anyone) and the log line (the ask's row may
    // still be streaming). This write is only the card.
    if (ids.length)
      await ctx.scheduler.runAfter(0, internal.voiceBuild.noteCommitted, {
        spaceId: args.spaceId,
        ...(args.dealId ? { dealId: args.dealId } : {}),
        ...(args.nonce ? { nonce: args.nonce } : {}),
        ids,
        at: Date.now(),
      });
    return ids;
  },
});

export const noteCommitted = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    dealId: v.optional(v.id("deals")),
    nonce: v.optional(v.string()),
    ids: v.array(v.id("widgets")),
    at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (let i = 0; i < args.ids.length; i++) await widgetsCounter.inc(ctx);
    await touchSpace(ctx, args.spaceId, args.at);
    if (!args.dealId && !args.nonce) return null;
    const dealId = args.dealId ?? (args.nonce ? (await rowByNonce(ctx, args.spaceId, args.nonce))?.row._id : undefined);
    const row = dealId ? await ctx.db.get(dealId) : null;
    if (!dealId || !row) return null;
    const before = (JSON.parse(row.run) as { committed?: string[] }).committed ?? [];
    await patchRun(ctx, dealId, { committed: [...before, ...args.ids], committedAt: args.at });
    return null;
  },
});

/** A late word changed the ask: rewrite the card it just wrote, in place. */
export const amend = mutation({
  args: {
    spaceId: v.id("spaces"),
    widgetId: v.id("widgets"),
    nonce: v.string(),
    by: v.string(),
    people: v.array(v.string()),
    today: v.string(),
    createdBy: v.string(),
    card: v.string(),
    cardPeople: v.optional(v.array(v.string())),
    assignees: v.optional(v.array(v.string())),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    // Only a card this asker wrote moments ago; anything else stays as it is.
    if (!widget || widget.spaceId !== args.spaceId || widget.createdBy !== args.createdBy) return false;
    if (Date.now() - widget.createdAt > 60_000) return false;
    let raw: unknown;
    try {
      raw = JSON.parse(args.card);
    } catch {
      return false;
    }
    const people = args.people.slice(0, 12);
    const room = args.cardPeople?.length ? args.cardPeople.slice(0, 12) : people.length ? people : [args.by];
    const applied = applyCard(raw, { by: args.by, people: room, today: args.today }, { z: widget.z, assignees: args.assignees?.slice(0, 8) });
    if (!applied.ok) return false;
    const w = applied.widget;
    await ctx.db.patch(args.widgetId, { type: w.type, w: w.w, h: w.h, data: w.data as never });
    return true;
  },
});

/**
 * The decide pass (nebius/eval/decide): Ultra answers one letter, which card
 * these words want, with its probability. Fired while the asker talks; their
 * code shows that card's skeleton when the words named none (or a different
 * one) and the pick is sure (≥ 0.8), and passes it to the fill.
 *
 * With `onBoard` (the asker's code found a widget whose kind and title match
 * the words), the same prefix also goes out, in parallel, with a yes/no
 * about that widget: "this card is already on the board: poll "cake
 * flavor?". Does it already do what the request asks?". A yes is only a
 * signal: the asker's code already holds the widget it means.
 */
export const decide = action({
  args: {
    said: v.string(),
    room: v.string(),
    today: v.string(),
    people: v.array(v.string()),
    /** The room's card titles (the board), from the room brief. */
    board: v.array(v.string()),
    /** Also ask whether the board already has it (code found a matching widget). */
    onBoard: v.optional(v.boolean()),
    /** That widget, `poll "cake flavor?"`: the yes/no asks about it by name (the plain question drowned it in a long board, nebius/eval/b3-existing.md). */
    match: v.optional(v.string()),
  },
  returns: v.object({
    onBoard: v.union(
      v.null(),
      v.object({
        yes: v.boolean(),
        conf: v.union(v.number(), v.null()),
        ms: v.number(),
        usage: v.union(v.null(), v.object({ prompt: v.number(), completion: v.number() })),
        error: v.union(v.string(), v.null()),
      }),
    ),
    card: v.union(v.string(), v.null()),
    conf: v.union(v.number(), v.null()),
    top: v.array(v.object({ card: v.string(), p: v.number() })),
    ms: v.number(),
    usage: v.union(v.null(), v.object({ prompt: v.number(), completion: v.number() })),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (_ctx, args) => {
    const context = roomContext({ room: args.room, today: args.today, people: args.people.slice(0, 12) });
    const prefix = { context, board: args.board.slice(0, 24).map((t) => t.slice(0, 40)), said: args.said.trim().slice(0, 240) };
    const [r, b] = await Promise.all([
      chooseLetter({ model: "ultra", messages: decideMessages(prefix), letters: DECIDE_LETTERS }),
      args.onBoard && prefix.board.length
        ? chooseLetter({
            model: "ultra",
            messages: decideMessages({ ...prefix, ...(args.match ? { match: args.match.slice(0, 60) } : {}), q: "board" }),
            letters: BOARD_LETTERS,
          })
        : null,
    ]);
    const cardOf = (l: string) => DECIDE_CHOICES[DECIDE_LETTERS.indexOf(l)] ?? l;
    const usageOf = (u: typeof r.usage) => (u ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0 } : null);
    return {
      onBoard: b
        ? {
            yes: b.letter === "A",
            conf: b.conf,
            ms: b.ms,
            usage: usageOf(b.usage),
            error: b.error ? `${b.status || "fetch"}: ${b.error.slice(0, 160)}` : null,
          }
        : null,
      card: r.letter ? cardOf(r.letter) : null,
      conf: r.conf,
      top: r.top.map((t) => ({ card: cardOf(t.letter), p: t.p })),
      ms: r.ms,
      usage: r.usage ? { prompt: r.usage.prompt_tokens ?? 0, completion: r.usage.completion_tokens ?? 0 } : null,
      error: r.error ? `${r.status || "fetch"}: ${r.error.slice(0, 160)}` : null,
    };
  },
});

/** What the group did with a dealt card soon after: deleted it, or changed
 * its options or items. Written onto the ask's `deals` row (`outcome`) for
 * the room brief to count later. Called from `widgets` deletes and edits. */
export async function noteOutcome(
  ctx: MutationCtx,
  widget: { _id: Id<"widgets">; spaceId: Id<"spaces">; createdAt: number },
  what: { kind: "deleted" } | { kind: "edited"; field: string },
) {
  const now = Date.now();
  // Only a card dealt minutes ago: deleted within 10, edited within 30.
  if (now - widget.createdAt > (what.kind === "deleted" ? 10 : 30) * 60_000) return;
  const rows = await ctx.db
    .query("deals")
    .withIndex("by_space", (q) => q.eq("spaceId", widget.spaceId))
    .order("desc")
    .take(60);
  const id = String(widget._id);
  const row = rows.find((r) => r.run.includes(id));
  if (!row) return;
  const run = JSON.parse(row.run) as { committed?: string[]; outcome?: { kind: string; afterMs: number; field?: string }[] };
  if (!run.committed?.includes(id)) return;
  const outcome = [...(run.outcome ?? []), { kind: what.kind, afterMs: now - widget.createdAt, ...(what.kind === "edited" ? { field: what.field } : {}) }].slice(-8);
  await ctx.db.patch(row._id, { run: JSON.stringify({ ...run, outcome }) });
}

/** The labels a person edits on a dealt card (votes and claims don't count). */
export function editedLabels(type: string, before: unknown, after: unknown): string | null {
  const labels = (d: unknown): [string, string[]] | null => {
    const x = (d ?? {}) as Record<string, unknown>;
    const pick = (key: string, of: (it: Record<string, unknown>) => unknown) =>
      Array.isArray(x[key]) ? (x[key] as Record<string, unknown>[]).map((it) => String(of(it) ?? "")) : [];
    if (type === "poll") return ["options", pick("options", (o) => o.label)];
    if (type === "potluck") return ["items", pick("items", (o) => o.name)];
    if (type === "wheel") return ["options", pick("slices", (o) => o.label)];
    if (type === "availability") return ["days", Array.isArray(x.days) ? (x.days as unknown[]).map(String) : []];
    return null;
  };
  const a = labels(before);
  const b = labels(after);
  if (!a || !b) return null;
  return JSON.stringify(a[1]) === JSON.stringify(b[1]) ? null : a[0];
}

/** Orb tapped: wake the action runtime and the Token Factory connection. */
export const warm = action({
  args: {},
  returns: v.object({ status: v.number(), ms: v.number() }),
  handler: async () => await pingTokenFactory(),
});

/** The asker's screen saw the card: ms from the last word, plus every stage mark. */
export const noteLanded = mutation({
  args: { dealId: v.id("deals"), landedMs: v.number(), trace: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { dealId, landedMs, trace }) => {
    const row = await ctx.db.get(dealId);
    if (!row || !(landedMs > -60_000 && landedMs < 120_000)) return null;
    const run = JSON.parse(row.run) as Record<string, unknown>;
    if (run.landedMs !== undefined) return null;
    await ctx.db.patch(dealId, {
      run: JSON.stringify({ ...run, landedMs: Math.round(landedMs), ...(trace ? { client: JSON.parse(trace) as unknown } : {}) }),
    });
    return null;
  },
});

/** Recent asks for one room, newest first (read with `npx convex run`). */
export const recent = internalQuery({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  returns: v.array(v.string()),
  handler: async (ctx, { spaceId, limit }) => {
    const rows = await ctx.db
      .query("deals")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(Math.min(limit ?? 20, 100));
    return rows.map((r) => r.run);
  },
});
