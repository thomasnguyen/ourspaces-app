// The deck pulls in src/lib/radio.ts, which reads import.meta.env inside a function never called here.
/// <reference types="vite/client" />
import { v, type Infer } from "convex/values";
import { canRead, seatOf } from "./seat";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { chooseLetter, pingTokenFactory, streamChat } from "./nebius";
import { touchSpace } from "./activity";
import { addLink } from "./links";
import { isFlow } from "../src/lib/deck/recipes";
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
import { VERB_CHOICES, VERB_LETTERS, VERB_Q } from "../src/lib/deck/verbs";
import { rightOfWay } from "./rightOfWay";
import { lookupAfterBuild } from "./tavily";
import { noteSpendIn, type Gate } from "./guard";

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
    /** The deck cards this ask could mean (the asker's shortlist, src/lib/deck/shortlist.ts); the prompt shows only these. */
    deck: v.optional(v.array(v.string())),
    /** The shortlisted cards the words point at (not just common): only their worked examples go in. */
    focus: v.optional(v.array(v.string())),
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
    const card = args.card && (DECIDE_CHOICES.includes(args.card) || isFlow(args.card)) && args.card !== "none" && args.card !== "several" ? args.card : undefined;
    const context = brain
      ? args.menu!.slice(0, 1600)
      : roomContext({
          room: args.room,
          today: args.today,
          people: args.people.slice(0, 12),
          selected: args.selected,
        });
    // Only the shortlisted cards (and the told card) go in the prompt; without a list, the whole deck.
    const deck = args.deck?.length ? [...new Set([...args.deck.slice(0, 10), ...(card ? [card] : [])])] : undefined;
    const user = brain ? dealTurnV2({ menu: context, said, card }) : `${dealTurn({ context, said })}${card ? `\n${cardLine(card)}` : ""}`;
    // The door (convex/guard.ts): a seat in this room, the person's and the room's limits, the day's ceiling. It opens the ask's row too.
    const gate: Gate = await ctx.runMutation(internal.guard.voice, {
      spaceId: args.spaceId,
      calls: 1,
      run: JSON.stringify({ at: t0, nonce: args.nonce, said, spec: args.spec, model: M.name, route: brain ? "brain" : "fast", card: card ?? null, deck: deck ?? null, context, answer: "", done: false }),
    });
    if (!gate.ok || !gate.dealId) {
      const why = gate.ok ? "limit" : gate.why;
      return { dealId: null, model: M.name, route: brain ? "brain" : "fast", usage: null, context, answer: "", none: true, error: `${why}: ${refusal(why)}`, firstTokenMs: null, firstLineMs: null, totalMs: Date.now() - t0 };
    }
    const opened: Promise<Id<"deals">> = Promise.resolve(gate.dealId);

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
        { role: "system", content: brain ? deckPromptV2({ cards: deck, ...(deck && args.focus ? { focus: [...args.focus, ...(card ? [card] : [])] } : {}) }) : deckPrompt({ cards: deck }) },
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
        model: M.model,
        usage: out.usage ?? undefined,
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
  args: {
    dealId: v.id("deals"),
    patch: v.string(),
    // the call's tokens, for the day's spend (convex/guard.ts)
    model: v.optional(v.union(v.literal("lightning"), v.literal("ultra"))),
    usage: v.optional(v.object({ prompt: v.number(), completion: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, { dealId, patch, model, usage }) => {
    await patchRun(ctx, dealId, JSON.parse(patch) as Record<string, unknown>);
    if (model) await noteSpendIn(ctx, [{ model, usage: usage ? { prompt_tokens: usage.prompt, completion_tokens: usage.completion } : null }]);
    return null;
  },
});

/** What the asker's screen says when the door says no (src/live/useVoiceBuild.ts reads the prefix). */
function refusal(why: "limit" | "spent") {
  return why === "limit" ? "that's a lot of asks; try again in a minute" : "the space's AI is resting until tomorrow; edits and answers from the board still work";
}

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
    if (!(await canRead(ctx, spaceId))) return null;
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
        /** A recipe's link (convex/links.ts): this card waits on `from`, written earlier in the same ask, and fills `fill` from it. */
        link: v.optional(v.object({ from: v.string(), when: v.string(), fill: v.string(), value: v.string(), tag: v.optional(v.string()), at: v.optional(v.number()) })),
        /** A setting left empty for a link or a person to fill; `unfinished`: its slot is marked and the asker gets a "your turn" (src/lib/deck/needs.ts). */
        blank: v.optional(v.string()),
        unfinished: v.optional(v.boolean()),
        /** A recipe part's own size and tilt inside its group (code's layout, src/lib/deck/recipes.ts). */
        w: v.optional(v.number()),
        h: v.optional(v.number()),
        rotate: v.optional(v.number()),
      }),
    ),
  },
  returns: v.array(v.id("widgets")),
  handler: async (ctx, a) => {
    // the asker is the caller's own seat, never a name the client sends
    const me = await seatOf(ctx, a.spaceId);
    if (!me) return [];
    const args = { ...a, by: me.name, createdBy: me.userId };
    const people = args.people.slice(0, 12);
    const cardCtx = { by: args.by, people: people.length ? people : [args.by], today: args.today, colors: await colorsFor(ctx, args.spaceId, args.cards) };
    const ids: Id<"widgets">[] = [];
    const now = Date.now();
    for (const c of args.cards.slice(0, 8)) {
      let raw: unknown;
      try {
        raw = JSON.parse(c.card);
      } catch {
        continue;
      }
      // A standings card alone ranks the newest check-in; in a recipe, its link fills `source` below.
      const source = /"standings"/.test(c.card) && !c.link ? await checkInFor(ctx, args.spaceId) : undefined;
      const applied = applyCard(raw, { ...(c.people ? { ...cardCtx, people: c.people.slice(0, 12) } : cardCtx), ...(source ? { source } : {}) }, {
        z: c.z,
        assignees: c.assignees?.slice(0, 8),
        ...(c.blank ? { blank: c.blank } : {}),
        ...(c.blank && c.unfinished ? { unfinished: { by: args.by, byUserId: args.createdBy } } : {}),
      });
      if (!applied.ok) continue;
      const w = applied.widget;
      // a wheel that deals what nobody claimed (the potluck flow) remembers who it deals to
      if (c.link?.value === "unclaimed") w.data = { ...w.data, dealTo: cardCtx.people } as typeof w.data;
      // the one door every AI write passes (rightOfWay.ts): a new card, all its fields new
      const size = { w: Math.round(Math.min(1600, Math.max(80, c.w ?? w.w))), h: Math.round(Math.min(1200, Math.max(60, c.h ?? w.h))) };
      let spot = { x: Math.round(c.x), y: Math.round(c.y) };
      const door = await rightOfWay(ctx, { kind: "build", spaceId: args.spaceId, by: { name: args.by, userId: args.createdBy }, fields: [{ field: "card", old: null, new: { type: w.type, title: (w.data as Record<string, unknown>).title ?? (w.data as Record<string, unknown>).question ?? (w.data as Record<string, unknown>).event ?? null } }], rect: { ...spot, ...size } });
      // never on a held card: the asker's screen placed it with the live leases, so this is a race; it goes below the held card instead
      if (door.verdict === "never" && door.onThing) {
        const held = ctx.db.normalizeId("widgets", door.onThing);
        const h = held && (await ctx.db.get(held));
        if (h) spot = { x: spot.x, y: h.y + h.h + 64 };
      } else if (door.verdict !== "go") continue;
      const rotate = c.rotate ?? w.rotate;
      // What widgets.createWidget does, without a nested mutation in the hot path.
      const id = await ctx.db.insert("widgets", {
        spaceId: args.spaceId,
        type: w.type,
        ...spot,
        ...size,
        z: w.z,
        ...(rotate !== undefined ? { rotate: Math.max(-6, Math.min(6, rotate)) } : {}),
        data: w.data as never,
        createdBy: args.createdBy,
        createdAt: now,
      });
      ids.push(id);
      const from = c.link ? ctx.db.normalizeId("widgets", c.link.from) : null;
      const fromRow = from ? await ctx.db.get(from) : null;
      if (c.link && fromRow && fromRow.spaceId === args.spaceId) await addLink(ctx, args.spaceId, fromRow._id, id, { when: c.link.when, fill: c.link.fill, value: c.link.value, ...(c.link.tag ? { tag: c.link.tag } : {}), ...(c.link.at ? { at: c.link.at } : {}) });
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

/** Each person's colour by name, the seeded cast first (only when a check-in is written). */
async function colorsFor(ctx: MutationCtx, spaceId: Id<"spaces">, cards: { card: string }[]): Promise<Record<string, string> | undefined> {
  if (!cards.some((c) => /"checkin"/.test(c.card))) return undefined;
  const rows = await ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(300);
  const out: Record<string, string> = {};
  for (const m of [...rows].sort((a, b) => Number(b.userId.startsWith("seed:")) - Number(a.userId.startsWith("seed:")))) out[m.name] ??= m.color;
  return out;
}

/** The check-in a standings card dealt on its own ranks: the newest on the board. */
async function checkInFor(ctx: MutationCtx, spaceId: Id<"spaces">): Promise<string | undefined> {
  const all = await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(300);
  return all.find((w) => w.type === "checkIn")?._id;
}

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
    // Tavily, the lookup: a "where should we eat …" poll gets real places under the house's own (tavily.ts)
    await lookupAfterBuild(ctx, { spaceId: args.spaceId, dealId, run: row.run, ids: args.ids });
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
  handler: async (ctx, a) => {
    const me = await seatOf(ctx, a.spaceId);
    if (!me) return false;
    const args = { ...a, by: me.name, createdBy: me.userId };
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
    const door = await rightOfWay(ctx, { kind: "build", spaceId: args.spaceId, widgetId: args.widgetId, by: { name: args.by, userId: args.createdBy }, fields: [{ field: "data", old: widget.data, new: w.data }] });
    if (door.verdict !== "go") return false;
    await ctx.db.patch(args.widgetId, { type: w.type, w: w.w, h: w.h, data: w.data as never });
    return true;
  },
});

const decideOut = v.object({
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
  verb: v.union(
    v.null(),
    v.object({ verb: v.string(), conf: v.union(v.number(), v.null()), ms: v.number(), usage: v.union(v.null(), v.object({ prompt: v.number(), completion: v.number() })) }),
  ),
  card: v.union(v.string(), v.null()),
  conf: v.union(v.number(), v.null()),
  top: v.array(v.object({ card: v.string(), p: v.number() })),
  ms: v.number(),
  usage: v.union(v.null(), v.object({ prompt: v.number(), completion: v.number() })),
  error: v.union(v.string(), v.null()),
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
    /** The room asked in: the caller needs a seat there (convex/guard.ts). */
    spaceId: v.id("spaces"),
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
    /** Ask the card letter (default). False when code's guess is already sure: only the yes/no goes out. */
    card: v.optional(v.boolean()),
    /** Also ask make-or-answer (a question code can't place; lib/deck/verbs.ts). */
    verb: v.optional(v.boolean()),
  },
  returns: decideOut,
  handler: async (ctx, args): Promise<Infer<typeof decideOut>> => {
    const context = roomContext({ room: args.room, today: args.today, people: args.people.slice(0, 12) });
    const prefix = { context, board: args.board.slice(0, 24).map((t) => t.slice(0, 40)), said: args.said.trim().slice(0, 240) };
    const skipped: Awaited<ReturnType<typeof chooseLetter>> = { status: 0, letter: null, conf: null, top: [], usage: null, ms: 0 };
    const calls = (args.card === false ? 0 : 1) + (args.onBoard && prefix.board.length ? 1 : 0) + (args.verb ? 1 : 0);
    const gate: Gate = await ctx.runMutation(internal.guard.voice, { spaceId: args.spaceId, calls });
    if (!gate.ok) return { verb: null, onBoard: null, card: null, conf: null, top: [], ms: 0, usage: null, error: `${gate.why}: ${refusal(gate.why)}` };
    const verbQ = args.verb
      ? chooseLetter({
          model: "ultra",
          messages: [
            decideMessages(prefix)[0],
            { role: "user" as const, content: `${prefix.context}${prefix.board.length ? `\nOn the board: ${prefix.board.join(" · ")}` : ""}\nSaid: "${prefix.said}"\n\n${VERB_Q}` },
          ],
          letters: VERB_LETTERS,
        })
      : null;
    const [r, b, vq] = await Promise.all([
      args.card === false ? skipped : chooseLetter({ model: "ultra", messages: decideMessages(prefix), letters: DECIDE_LETTERS }),
      args.onBoard && prefix.board.length
        ? chooseLetter({
            model: "ultra",
            messages: decideMessages({ ...prefix, ...(args.match ? { match: args.match.slice(0, 60) } : {}), q: "board" }),
            letters: BOARD_LETTERS,
          })
        : null,
      verbQ,
    ]);
    const spent = [r === skipped ? null : r, b, vq].flatMap((x) => (x ? [{ model: "ultra" as const, prompt: x.usage?.prompt_tokens ?? 0, completion: x.usage?.completion_tokens ?? 0 }] : []));
    if (spent.length) await ctx.runMutation(internal.guard.noteSpend, { calls: spent });
    const cardOf = (l: string) => DECIDE_CHOICES[DECIDE_LETTERS.indexOf(l)] ?? l;
    const usageOf = (u: typeof r.usage) => (u ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0 } : null);
    return {
      verb: vq && vq.letter ? { verb: VERB_CHOICES[VERB_LETTERS.indexOf(vq.letter)] ?? vq.letter, conf: vq.conf, ms: vq.ms, usage: usageOf(vq.usage) } : null,
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

/* ---------- Answer: "what did we decide for saturday?" when the room's facts don't cover it ---------- */

const ASK_STOP = new Set("a an the of for to on in at is are was were be do does did who whos whose what whats when where which how our we us it this that and or with my me i you has have hasnt any anyone s".split(" "));
const DAY_SHORT: Record<string, string> = { monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu", friday: "fri", saturday: "sat", sunday: "sun" };
const askWords = (x: string) =>
  new Set(x.toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !ASK_STOP.has(w)).map((w) => DAY_SHORT[w] ?? w.replace(/(es|s)$/, "")));
/** A card the snapshot doesn't summarise (an itinerary, a note): its title and every short string in it. */
const flatText = (data: unknown): string => {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (out.join(" ").length > 220) return;
    if (typeof x === "string" && x.length < 120 && !/^(https?:|\/|#)/.test(x)) out.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(data);
  return out.join(" · ").slice(0, 220);
};

/**
 * Ask the space, as a slip: the board's cards and the chat (the same snapshot
 * ask-the-space grounds on), ranked by the question's words in code, the top
 * six numbered, then one short Ultra call that may only answer from them and
 * must say which one. Code checks the answer: every number and every name in
 * it must be in that snippet, or it's "doesn't know". Writes nothing.
 */
type AnswerOut = {
  answer: { text: string; source: string; widgetId?: string; facts: string[] } | null;
  why: string;
  ms: number;
  usage: { prompt: number; completion: number } | null;
  snippets: string[];
};
export const answer = action({
  args: { spaceId: v.id("spaces"), question: v.string() },
  returns: v.object({
    answer: v.union(v.null(), v.object({ text: v.string(), source: v.string(), widgetId: v.optional(v.string()), facts: v.array(v.string()) })),
    why: v.string(),
    ms: v.number(),
    usage: v.union(v.null(), v.object({ prompt: v.number(), completion: v.number() })),
    snippets: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<AnswerOut> => {
    const t0 = Date.now();
    const q = args.question.trim().slice(0, 200);
    // Only the room the caller is seated in (the gate throws for anyone else), one Ultra call.
    const gate: Gate = await ctx.runMutation(internal.guard.voice, { spaceId: args.spaceId, calls: 1 });
    if (!gate.ok) return { answer: null, why: `${gate.why}: ${refusal(gate.why)}`, ms: Date.now() - t0, usage: null, snippets: [] };
    const snap: { widgets: { id: string; type: string; summary: string }[]; chat: { from: string; text: string }[] } = await ctx.runQuery(internal.recap.snapshot, { spaceId: args.spaceId });
    const want = askWords(q);
    const summarised = new Set(snap.widgets.map((w) => w.id));
    const rest: { _id: string; type: string; data: unknown }[] = (await ctx.runQuery(internal.widgets.board, { spaceId: args.spaceId })).filter(
      (w: { _id: string; type: string }) => !summarised.has(w._id) && !["sticker", "media", "frame", "weather"].includes(w.type),
    );
    const pool = [
      ...rest.map((w) => ({ text: `${w.type}: ${flatText(w.data)}`, widgetId: w._id as string | undefined, source: `the ${w.type} card` })),
      ...snap.widgets.map((w) => ({ text: w.summary.slice(0, 220), widgetId: w.id as string | undefined, source: `the ${w.type} card` })),
      ...snap.chat.map((m) => ({ text: `${m.from}: ${m.text}`.slice(0, 220), widgetId: undefined, source: `${m.from.toLowerCase()} in the chat` })),
    ];
    const ranked = pool
      .map((p) => ({ ...p, n: [...askWords(p.text)].filter((w) => want.has(w)).length }))
      .filter((p) => p.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const snippets = ranked.map((p, i) => `[${i + 1}] ${p.text}`);
    if (!ranked.length) return { answer: null, why: "nothing on the board or in the chat shares a word with the question", ms: Date.now() - t0, usage: null, snippets };
    const result = await streamChat({
      model: "ultra",
      maxTokens: 60,
      messages: [
        {
          role: "system",
          content:
            'You answer a question about a group of friends\' shared space using only the numbered snippets. Reply with one JSON line: {"answer":"<at most 14 words, lowercase, plain>","from":<snippet number>}. If the snippets don\'t say, reply {"answer":null}. Never guess a name, date, place or amount.',
        },
        { role: "user", content: `${snippets.join("\n")}\n\nQuestion: ${q}` },
      ],
    });
    const usage = result.usage ? { prompt: result.usage.prompt_tokens ?? 0, completion: result.usage.completion_tokens ?? 0 } : null;
    await ctx.runMutation(internal.guard.noteSpend, { calls: [{ model: "ultra", prompt: usage?.prompt ?? 0, completion: usage?.completion ?? 0 }] });
    let parsed: { answer?: unknown; from?: unknown } = {};
    try {
      parsed = JSON.parse(/\{[\s\S]*\}/.exec(result.content)?.[0] ?? "{}");
    } catch {
      return { answer: null, why: `unreadable: ${result.content.slice(0, 80)}`, ms: Date.now() - t0, usage, snippets };
    }
    const from = ranked[Number(parsed.from) - 1];
    if (typeof parsed.answer !== "string" || !parsed.answer.trim() || !from) return { answer: null, why: "the model says the snippets don't say", ms: Date.now() - t0, usage, snippets };
    const text = parsed.answer.trim().toLowerCase().slice(0, 120);
    // The truth check: every number and every capitalised word of the snippet's people must come from that snippet.
    const src = from.text.toLowerCase();
    const numbers = text.match(/\d+/g) ?? [];
    const people = [...new Set(snap.chat.map((m) => m.from.toLowerCase()))];
    const named = people.filter((p) => new RegExp(`\\b${p}\\b`).test(text));
    const bad = [...numbers.filter((n) => !src.includes(n)), ...named.filter((p) => !src.includes(p))];
    if (bad.length) return { answer: null, why: `answer said ${bad.join(", ")}, not in snippet ${parsed.from}`, ms: Date.now() - t0, usage, snippets };
    return { answer: { text, source: from.source, ...(from.widgetId ? { widgetId: from.widgetId } : {}), facts: [from.text] }, why: `snippet ${parsed.from}`, ms: Date.now() - t0, usage, snippets };
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
  const run = JSON.parse(row.run) as { committed?: string[]; outcome?: { kind: string; id?: string; afterMs: number; field?: string }[] };
  if (!run.committed?.includes(id)) return;
  // id: which card of the ask it was (convex/pilot.ts counts kept / edited / deleted per card)
  const outcome = [...(run.outcome ?? []), { kind: what.kind, id, afterMs: now - widget.createdAt, ...(what.kind === "edited" ? { field: what.field } : {}) }].slice(-8);
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
  // a signed-in person, a few a minute (convex/guard.ts): it costs nothing, but it is not an open relay
  handler: async (ctx): Promise<{ status: number; ms: number }> => ((await ctx.runMutation(internal.guard.warm, {})) ? await pingTokenFactory() : { status: 429, ms: 0 }),
});

/** The asker's screen saw the card: ms from the last word, plus every stage mark. */
export const noteLanded = mutation({
  args: { dealId: v.id("deals"), landedMs: v.number(), trace: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { dealId, landedMs, trace }) => {
    const row = await ctx.db.get(dealId);
    if (!row || !(landedMs > -60_000 && landedMs < 120_000)) return null;
    if (!(await seatOf(ctx, row.spaceId))) return null;
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
