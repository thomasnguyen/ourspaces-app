// The deck pulls in src/lib/radio.ts, which reads import.meta.env inside a function never called here.
/// <reference types="vite/client" />
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { streamChat } from "./nebius";
import { applyCard, deckPrompt, dealTurn, footprint, parseDeal, placeCards } from "../src/lib/deck";
import type { Placement, Rect } from "../src/lib/deck";

/**
 * Say it → it builds (path-to-win §3 "The engine"). One spoken ask goes to
 * Nemotron Lightning with the deck prompt; the model answers with cards only,
 * one per line. Each card is checked (`applyCard`), placed by code
 * (`placeCards`, never the model) and committed through `widgets.createWidget`
 * the moment its line closes, so Convex sync puts it on every screen in the
 * room before the rest of the answer is written.
 *
 * The numbers behind the receipt are kept in `deals` (one JSON row per ask):
 * server ms from the action starting to the first committed card, the model's
 * own first-line and total ms, and, once the asker's screen shows the card,
 * the client's end-of-speech → card-on-screen ms (`noteLanded`).
 */

const MODEL = "lightning" as const;
const MODEL_NAME = "Lightning";
const MAX_TOKENS = 220;

const rect = v.object({ x: v.number(), y: v.number(), w: v.number(), h: v.number() });

type Committed = { card: string; widgetId: Id<"widgets">; ms: number };
type DealResult = {
  ok: boolean;
  dealId: Id<"deals"> | null;
  model: string;
  cards: Committed[];
  firstCommitMs: number | null;
  firstLineMs: number | null;
  totalMs: number;
  none: boolean;
  invalid: string[];
  error: string | null;
};

export const deal = action({
  args: {
    spaceId: v.id("spaces"),
    said: v.string(),
    room: v.string(),
    today: v.string(),
    by: v.string(),
    people: v.array(v.string()),
    createdBy: v.string(),
    /** A one-line label of the selected object, for the model. */
    selected: v.optional(v.string()),
    selectedId: v.optional(v.string()),
    /** The asker's board as drawn, view and canvas, in canvas coordinates. */
    board: v.array(v.object({ id: v.string(), x: v.number(), y: v.number(), w: v.number(), h: v.number() })),
    view: rect,
    bounds: rect,
    /** Where the shell already sits: the first card lands as close to it as fits. */
    anchor: v.optional(v.object({ x: v.number(), y: v.number() })),
    z: v.number(),
  },
  returns: v.object({
    ok: v.boolean(),
    dealId: v.union(v.id("deals"), v.null()),
    model: v.string(),
    cards: v.array(v.object({ card: v.string(), widgetId: v.id("widgets"), ms: v.number() })),
    firstCommitMs: v.union(v.number(), v.null()),
    firstLineMs: v.union(v.number(), v.null()),
    totalMs: v.number(),
    none: v.boolean(),
    invalid: v.array(v.string()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<DealResult> => {
    const t0 = Date.now();
    const said = args.said.trim().slice(0, 240);
    const people = args.people.slice(0, 12);
    const cardCtx = { by: args.by, people: people.length ? people : [args.by], today: args.today };
    const placed: Array<Rect & { id: string }> = args.board.slice(0, 400);
    const committed: Committed[] = [];
    const invalid: string[] = [];
    let anchor: Placement | undefined = args.anchor;
    let handled = 0;
    let z = args.z;

    /* Commits run one after another, in answer order, off a promise chain:
       the stream's line callback is synchronous and must not wait. */
    let chain: Promise<void> = Promise.resolve();
    const commitNew = (text: string, done: boolean) => {
      const { items } = parseDeal(text, done);
      const fresh = items.slice(handled);
      handled = items.length;
      for (const item of fresh) {
        chain = chain.then(async () => {
          if (!item.ok) {
            invalid.push(item.reason);
            return;
          }
          const applied = applyCard(item.card, cardCtx, { z: ++z });
          if (!applied.ok) {
            invalid.push(applied.reason);
            return;
          }
          const w = applied.widget;
          const [spot] = placeCards([footprint(w)], {
            widgets: placed,
            view: args.view,
            bounds: args.bounds,
            selected: args.selectedId ?? null,
            anchor,
          });
          const widgetId = await ctx.runMutation(api.widgets.createWidget, {
            spaceId: args.spaceId,
            type: w.type,
            x: spot.x,
            y: spot.y,
            w: w.w,
            h: w.h,
            z: w.z,
            ...(w.rotate !== undefined ? { rotate: w.rotate } : {}),
            data: w.data as never,
            createdBy: args.createdBy,
          });
          committed.push({ card: item.card.card, widgetId, ms: Date.now() - t0 });
          placed.push({ id: widgetId, x: spot.x, y: spot.y, ...footprint(w) });
          anchor = { x: spot.x, y: spot.y };
        });
      }
    };

    let buffer = "";
    const result = await streamChat({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      messages: [
        { role: "system", content: deckPrompt() },
        {
          role: "user",
          content: dealTurn({ room: args.room, today: args.today, people: cardCtx.people, selected: args.selected, said }),
        },
      ],
      onLine: (line) => {
        buffer += `${line}\n`;
        commitNew(buffer, false);
      },
    });
    commitNew(result.content, true);
    await chain;

    const none = !committed.length && parseDeal(result.content, true).none;
    const error = result.error ? `${result.status || "fetch"}: ${result.error.slice(0, 160)}` : null;
    const out = {
      ok: committed.length > 0,
      model: MODEL_NAME,
      cards: committed,
      firstCommitMs: committed[0]?.ms ?? null,
      firstLineMs: result.firstLineMs,
      totalMs: Date.now() - t0,
      none,
      invalid,
      error,
    };
    const dealId: Id<"deals"> | null = await ctx.runMutation(internal.voiceBuild.record, {
      spaceId: args.spaceId,
      run: JSON.stringify({
        at: t0,
        said,
        ...out,
        modelTotalMs: result.totalMs,
        finish: result.finish,
        usage: result.usage,
        answer: result.content.slice(0, 600),
      }),
    });
    return { ...out, dealId };
  },
});

export const record = internalMutation({
  args: { spaceId: v.id("spaces"), run: v.string() },
  returns: v.id("deals"),
  handler: async (ctx, args) => await ctx.db.insert("deals", args),
});

/** The asker's screen saw the first card: end of speech → card on screen. */
export const noteLanded = mutation({
  args: { dealId: v.id("deals"), landedMs: v.number() },
  returns: v.null(),
  handler: async (ctx, { dealId, landedMs }) => {
    const row = await ctx.db.get(dealId);
    if (!row || !(landedMs > 0 && landedMs < 120_000)) return null;
    const run = JSON.parse(row.run) as Record<string, unknown>;
    if (run.landedMs !== undefined) return null;
    await ctx.db.patch(dealId, { run: JSON.stringify({ ...run, landedMs: Math.round(landedMs) }) });
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
