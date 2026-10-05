import { v } from "convex/values";
import { canRead } from "./seat";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { answer, awardsOf, beginRound, everyoneIn, isIn, joinGame, nextRound, react as reactTo, reveal, scoreRows, REVEAL_MS } from "../src/lib/games/engine";
import { dealSeat, seatPicks, type SeatRoom } from "../src/lib/games/hotSeat";
import { asPrompt, dealLikely, HOUSE_PROMPTS, likelyFacts, readSeatWording, readWording, seatWordingAsk, wordingAsk, type LikelyFact } from "../src/lib/games/facts";
import type { Award, Game, GameKind, GamePerson, GamePhase, GameRound, HotQuestion, SeatReaction } from "../src/lib/games/types";
import { LOCKS, seeState } from "../src/lib/answerToSee";
import { dayIndexOf, isRevealed, rank, readCheckIn } from "../src/lib/challenge";
import type { RoomKnows } from "../src/lib/roomKnows";
import { buildBrief } from "./roomBrief";
import { rightOfWay } from "./rightOfWay";
import { streamChat } from "./nebius";

/**
 * Games, live (features/games.md). The rules are the same pure functions
 * mock mode runs (src/lib/games/engine.ts); here they run inside mutations,
 * and the clocks are scheduled functions (`tick`), never a client's timer.
 *
 * - Anyone with a seat in the room joins and plays; starting one takes a
 *   joined member (a silent guest can play, not start).
 * - A round's reveal is one mutation: every screen flips on the same sync.
 * - "answer to see" on the server: `forRoom` sends no pick and no right
 *   answer of a round whose reveal hasn't been written (`redact`, the same
 *   `LOCKS` the cards draw), except your own.
 * - The prompts: code picks the room's facts (facts.ts / hotSeat.ts), one
 *   small model call per game words them (`word`), templates stand if it fails.
 */

/** How long a reveal holds before the room moves on by itself (everyone pressing next is sooner). */
const HOLD_MS = REVEAL_MS + 8_000;
/** A lobby nobody else joins closes itself. */
const LOBBY_EXPIRE_MS = 180_000;
const MAX_CAST = 8;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type Who = { userId: string; name: string; color: string; guest: boolean };

/** The caller's seat in this room: the signed-in id first, the tab's id otherwise (as votes and check-ins do). */
export async function caller(ctx: QueryCtx, spaceId: Id<"spaces">, tabId: string): Promise<Who | null> {
  const seat = (userId: string) => ctx.db.query("members").withIndex("by_space_user", (q) => q.eq("spaceId", spaceId).eq("userId", userId)).first();
  const authId = await getAuthUserId(ctx);
  // the signed-in seat only: a tab id the client sends could name anyone (convex/seat.ts)
  void tabId;
  const row = authId ? await seat(authId) : null;
  if (!row) return null;
  const user = authId ? await ctx.db.get("users", authId) : null;
  return { userId: row.userId, name: row.name, color: row.color, guest: !user || user.isAnonymous === true };
}

/** Games know players by name: the name you play under in this game (a second "juno" in it plays as "juno 2"). */
async function asPlayer(ctx: QueryCtx, gameId: Id<"games">, me: Who): Promise<Who> {
  const players = await ctx.db.query("gamePlayers").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(40);
  const mine = players.find((p) => p.userId === me.userId);
  if (mine) return { ...me, name: mine.name };
  const twins = players.filter((p) => same(p.name, me.name) || same(p.name.replace(/ \d+$/, ""), me.name)).length;
  return twins ? { ...me, name: `${me.name} ${twins + 1}` } : me;
}

type Loaded = { doc: Doc<"games">; game: Game; rounds: Doc<"gameRounds">[] };

async function load(ctx: QueryCtx, doc: Doc<"games">): Promise<Loaded> {
  const [players, rounds, answers] = await Promise.all([
    ctx.db.query("gamePlayers").withIndex("by_game", (q) => q.eq("gameId", doc._id)).take(40),
    ctx.db.query("gameRounds").withIndex("by_game", (q) => q.eq("gameId", doc._id)).take(12),
    ctx.db.query("gameAnswers").withIndex("by_game", (q) => q.eq("gameId", doc._id)).take(400),
  ]);
  const game: Game = {
    id: doc._id,
    room: String(doc.spaceId),
    kind: doc.kind as GameKind,
    name: doc.name,
    startedBy: { name: doc.startedBy.name, color: doc.startedBy.color },
    startedAt: doc.startedAt,
    phase: doc.phase as GamePhase,
    round: doc.round,
    phaseEndsAt: doc.phaseEndsAt,
    players: players.map((p) => ({ name: p.name, color: p.color, joinedAt: p.joinedAt, fromRound: p.fromRound })),
    cast: doc.cast,
    rounds: rounds.map(
      (r): GameRound => ({
        n: r.n,
        prompt: r.prompt,
        answers: answers.filter((a) => a.n === r.n).map((a) => ({ by: a.by, pick: a.pick, at: a.at })),
        endsAt: r.endsAt,
        revealedAt: r.revealedAt,
        winners: r.winners,
        ...(r.asks ? { asks: JSON.parse(r.asks) as HotQuestion[] } : {}),
        ...(r.reactions ? { reactions: r.reactions as GameRound["reactions"] } : {}),
        ...(r.ready?.length ? { ready: r.ready } : {}),
      }),
    ),
    ...(doc.seat ? { seat: doc.seat } : {}),
    ...(doc.seatWhy ? { seatWhy: doc.seatWhy } : {}),
    ...(doc.known !== undefined ? { known: doc.known } : {}),
  };
  return { doc, game, rounds };
}

const roundKey = (r: GameRound) => JSON.stringify([r.endsAt, r.revealedAt, r.winners, r.reactions]);

/** Write what a rule changed, and set the clock for what comes next. `actor` owns any new answer or player row. */
async function persist(ctx: MutationCtx, before: Loaded, after: Game, actor?: { userId: string }) {
  const g = before.game;
  const id = before.doc._id;
  const now = Date.now();
  await ctx.db.patch("games", id, { phase: after.phase, round: after.round, phaseEndsAt: after.phaseEndsAt, cast: after.cast });
  for (const r of after.rounds) {
    const old = g.rounds.find((x) => x.n === r.n);
    const row = before.rounds.find((x) => x.n === r.n);
    if (!old || !row) continue;
    if (roundKey(old) !== roundKey(r)) await ctx.db.patch("gameRounds", row._id, { endsAt: r.endsAt, revealedAt: r.revealedAt, winners: r.winners, reactions: r.reactions });
    for (const a of r.answers.slice(old.answers.length)) await ctx.db.insert("gameAnswers", { gameId: id, n: r.n, userId: actor?.userId ?? "", by: a.by, pick: a.pick, at: a.at });
  }
  for (const p of after.players.slice(g.players.length)) await ctx.db.insert("gamePlayers", { gameId: id, userId: actor?.userId ?? "", name: p.name, color: p.color, joinedAt: p.joinedAt, fromRound: p.fromRound });

  /* the clocks: a scheduled function per deadline, and it checks it is still the moment it was set for */
  const tick = (at: number, phase: string) => ctx.scheduler.runAt(Math.max(now, at), internal.games.tick, { gameId: id, phase, n: after.round });
  const round = after.rounds[after.round];
  if (after.phase === "invite" && after.phaseEndsAt && after.phaseEndsAt !== g.phaseEndsAt) await tick(after.phaseEndsAt, "invite");
  if (after.phase === "round" && round?.endsAt && (g.phase !== "round" || g.round !== after.round)) await tick(round.endsAt, "round");
  if (after.phase === "reveal" && g.phase !== "reveal") {
    await tick(now + HOLD_MS, "reveal");
    /* most likely to: the round's sticker is the room's from this moment */
    if (after.kind === "most-likely") for (const a of awardsOf(after).filter((x) => x.id.startsWith(`${id}:${after.round}:`))) await award(ctx, before.doc, a);
  }
  if (after.phase === "done" && g.phase !== "done" && after.kind === "hot-seat") for (const a of awardsOf(after)) await award(ctx, before.doc, a);
}

async function award(ctx: MutationCtx, doc: Doc<"games">, a: Award) {
  await ctx.db.insert("awards", { spaceId: doc.spaceId, gameId: doc._id, to: a.to, title: a.title, glyph: a.glyph, prompt: a.prompt, tone: a.tone, at: a.at });
}

async function step(ctx: MutationCtx, gameId: Id<"games">, rule: (game: Game, now: number) => Game, actor?: { userId: string }): Promise<boolean> {
  const doc = await ctx.db.get("games", gameId);
  if (!doc) return false;
  const loaded = await load(ctx, doc);
  const after = rule(loaded.game, Date.now());
  if (after === loaded.game) return false;
  await persist(ctx, loaded, after, actor);
  return true;
}

/* ---------- "answer to see", enforced ---------- */

/** What a client may see of a game: no pick and no right answer before the reveal is written, except your own. */
export function redact(game: Game, me: string | null): Game {
  return {
    ...game,
    rounds: game.rounds.map((r) => {
      const facts = { mine: false, answered: r.answers.length, of: game.players.length, now: 0, resolved: r.revealedAt !== undefined };
      const answersOpen = seeState(LOCKS.round, facts).open;
      const rightOpen = seeState(LOCKS.rightAnswer, facts).open;
      return {
        ...r,
        answers: answersOpen ? r.answers : r.answers.map((a) => (me && same(a.by, me) ? a : { ...a, pick: "" })),
        ...(r.asks ? { asks: rightOpen ? r.asks : r.asks.map((q) => (me && same(q.about, me) ? q : { ...q, right: "" })) } : {}),
      };
    }),
  };
}

/* ---------- the room's facts, as the games read them ---------- */

type Knows = Pick<RoomKnows, "people" | "lines" | "forgot" | "told">;

async function knowsOf(ctx: QueryCtx, spaceId: Id<"spaces">): Promise<Knows> {
  const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
  if (row) {
    const s = JSON.parse(row.facts) as { knows?: Pick<RoomKnows, "people" | "lines">; told?: RoomKnows["told"]; forgot?: RoomKnows["forgot"] };
    return { people: s.knows?.people ?? [], lines: s.knows?.lines ?? [], told: s.told ?? [], forgot: s.forgot ?? [] };
  }
  const brief = await buildBrief(ctx, spaceId);
  return { people: brief?.knows.people ?? [], lines: brief?.knows.lines ?? [], told: [], forgot: [] };
}

function weekStart(now: number): number {
  const d = new Date(now);
  d.setUTCHours(16, 0, 0, 0); // sun 9:00 pacific, near enough
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime() > now ? d.getTime() - 7 * 86_400_000 : d.getTime();
}

async function seatRoomOf(ctx: QueryCtx, spaceId: Id<"spaces">, knows: Knows, now: number): Promise<SeatRoom> {
  const widgets = await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(300);
  const awards = await ctx.db.query("awards").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("at", weekStart(now))).take(100);
  return {
    people: knows.people,
    lines: knows.lines,
    forgot: knows.forgot,
    cards: widgets.map((w) => ({ id: String(w._id), type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, data: w.data as Record<string, unknown> })),
    today: new Date(now - 7 * 3_600_000).toISOString().slice(0, 10),
    awards: awards.map((a) => ({ to: a.to })),
    points: {},
  };
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

/* ---------- reads ---------- */

/** The room's game (the open one, or the last one, its result still on the board), this week's scoreboard,
    the stickers, and a running challenge's standings for the same card. */
export const forRoom = query({
  args: { spaceId: v.id("spaces"), userId: v.string() },
  returns: v.any(),
  handler: async (ctx, { spaceId, userId }) => {
    const now = Date.now();
    const me = await caller(ctx, spaceId, userId);
    const recent = await ctx.db.query("games").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(12);
    const week = recent.filter((g) => g.startedAt >= weekStart(now) && g.kind !== "jigsaw");
    const loaded = await Promise.all(week.map((g) => load(ctx, g)));
    const knows = await knowsOf(ctx, spaceId);
    const cast: GamePerson[] = knows.people.map(({ name, color }) => ({ name, color }));
    const rows = scoreRows({ cast, seed: {}, seedAwards: [], games: loaded.map((l) => l.game) });
    const awardRows = await ctx.db.query("awards").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("at", weekStart(now))).take(100);
    const awards: Award[] = awardRows.map((a, i) => ({ id: String(a._id), room: String(spaceId), gameId: String(a.gameId), to: a.to, title: a.title, glyph: a.glyph, prompt: a.prompt, tone: a.tone ?? i % 6, at: a.at }));
    for (const row of rows) row.awards = awards.filter((a) => same(a.to, row.name));
    const latest = recent.find((g) => g.kind !== "jigsaw");
    const game = latest ? (loaded.find((l) => l.doc._id === latest._id) ?? (await load(ctx, latest))).game : null;
    const meIn = me && latest ? await asPlayer(ctx, latest._id, me) : me;
    return { game: game ? redact(game, meIn?.name ?? null) : null, rows, awards, me: meIn, played: Boolean(me && loaded.some((l) => isIn(l.game, me.name) && l.game.rounds.some((r) => r.revealedAt !== undefined))) };
  },
});

/** A running challenge on the scoreboard (the family's push-ups), behind the standings' own lock. Its own query: it reads
    the board, and a query that reads the board re-runs on every card write. */
export const challenge = query({
  args: { spaceId: v.id("spaces"), userId: v.string() },
  returns: v.any(),
  handler: async (ctx, { spaceId, userId }) => {
    const now = Date.now();
    const me = await caller(ctx, spaceId, userId);
    const checkIn = (await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(300)).find((w) => w.type === "checkIn");
    let challenge = null;
    if (checkIn) {
      const data = readCheckIn(checkIn.data as Record<string, unknown>);
      const day = dayIndexOf(data, new Date(now - 7 * 3_600_000));
      const mine = me ? data.logs[data.people.find((p) => same(p.name, me.name))?.name ?? ""]?.[Math.max(0, day)] : undefined;
      const open = seeState(LOCKS.standings, { mine: mine != null, answered: 0, of: data.people.length, now, resolved: isRevealed(data, new Date(now)), player: Boolean(me && data.people.some((p) => same(p.name, me.name))) }).open;
      challenge = { widgetId: String(checkIn._id), title: data.title, unit: data.unit, day: Math.min(day, data.days - 1) + 1, days: data.days, open, rows: open ? rank(data, Math.max(0, day)).map((r) => ({ name: r.name, color: r.color, total: r.total, streak: r.streak })) : data.people.map(() => null) };
    }
    return challenge;
  },
});

/** Who the space would put in the hot seat here, best offer first. Read once per visit (not subscribed): it deals
    every person's questions from the whole board, too heavy to re-run on every card write. */
export const offer = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ name: v.string(), color: v.string(), why: v.optional(v.string()), known: v.number(), away: v.optional(v.boolean()) })),
  handler: async (ctx, { spaceId }) => {
    if (!(await canRead(ctx, spaceId))) return [];
    const now = Date.now();
    const knows = await knowsOf(ctx, spaceId);
    return seatPicks(await seatRoomOf(ctx, spaceId, knows, now), seeded(3), now).map((p) => ({ name: p.name, color: p.color, known: p.known, ...(p.why ? { why: p.why } : {}), ...(p.away ? { away: true } : {}) }));
  },
});

/* ---------- writes ---------- */

const result = v.object({ ok: v.boolean(), gameId: v.optional(v.id("games")), name: v.optional(v.string()), reason: v.optional(v.string()) });

/** Start a game, by a tap or by voice. One open game per room: asking again goes to the one that's on. */
export const start = mutation({
  args: {
    spaceId: v.id("spaces"),
    userId: v.string(),
    kind: v.union(v.literal("most-likely"), v.literal("hot-seat")),
    about: v.optional(v.string()),
    /** the spoken ask, when it came by voice */
    said: v.optional(v.string()),
  },
  returns: result,
  handler: async (ctx, { spaceId, userId, kind, about, said }) => {
    const me = await caller(ctx, spaceId, userId);
    if (!me) return { ok: false, reason: "enter the space to play" };
    // the tour rooms are public, so a drive-by guest can't start one there; a made room is only people with its link
    const madeRoom = Boolean((await ctx.db.get(spaceId))?.ownerId);
    if (me.guest && !madeRoom) return { ok: false, reason: "join the space to start a game. you can still play one" };
    const on = await ctx.db.query("games").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(5);
    const open = on.find((g) => g.phase !== "done" && g.kind !== "jigsaw");
    if (open) return { ok: true, gameId: open._id, name: open.name, reason: "already on" };
    const now = Date.now();
    const knows = await knowsOf(ctx, spaceId);
    const people = knows.people.filter((p) => !same(p.name, me.name));
    const cast: GamePerson[] = [{ name: me.name, color: me.color }, ...people.map(({ name, color }) => ({ name, color }))].slice(0, MAX_CAST);
    if (madeRoom && cast.length < 2) return { ok: false, reason: "games need at least two of you. send the invite link, then ask again" };
    const dealt = on.length;
    let fields: Partial<Doc<"games">> & { name: string };
    let prompts: Array<{ prompt: GameRound["prompt"]; asks?: HotQuestion[] }>;
    if (kind === "most-likely") {
      const facts = dealLikely(likelyFacts(knows.lines, knows.forgot, knows.told), dealt);
      const all: LikelyFact[] = facts.length >= 3 ? facts : [...facts, ...HOUSE_PROMPTS].slice(0, 3);
      fields = { name: cast.length === 2 ? "more likely to" : "most likely to" };
      prompts = all.map((f, n) => ({ prompt: asPrompt(f, n) }));
    } else {
      const room = await seatRoomOf(ctx, spaceId, knows, now);
      const picks = seatPicks(room, seeded(3), now);
      const wanted = about ? room.people.find((p) => same(p.name, about) || same(p.name.split(" ")[0], about)) : undefined;
      if (about && !wanted) return { ok: false, reason: `this space doesn't know anyone called ${about.toLowerCase()}` };
      const seat = wanted ?? picks.find((p) => !p.away && p.known > 1);
      if (!seat) return { ok: false, reason: "this space doesn't know enough about anyone yet" };
      const deal = dealSeat(room, [seat.name], seeded(11 + dealt), now);
      if (deal.asks.length === 0) return { ok: false, reason: `this space doesn't know enough about ${seat.name.toLowerCase()} yet` };
      fields = { name: `how well do you know ${seat.name.toLowerCase()}`, seat: [{ name: seat.name, color: seat.color }], seatWhy: picks.find((p) => same(p.name, seat.name))?.why, known: deal.known };
      prompts = deal.asks.map((asks) => ({ asks, prompt: { id: asks[0].id, text: asks[0].text, award: "", glyph: "", fact: asks[0].fact.key, from: asks[0].fact.from } }));
    }
    /* starting a game is a write like any other: through the one door */
    await rightOfWay(ctx, { kind: "game", spaceId, by: { name: me.name, userId: me.userId }, fields: [{ field: "game", old: null, new: `${kind}: ${fields.name}` }], text: said ?? `started ${fields.name}` });
    const gameId = await ctx.db.insert("games", {
      spaceId, kind, phase: "invite", round: 0, startedBy: { userId: me.userId, name: me.name, color: me.color }, startedAt: now, cast, worded: "templates (wording…)",
      ...fields,
    });
    await ctx.db.insert("gamePlayers", { gameId, userId: me.userId, name: me.name, color: me.color, joinedAt: now, fromRound: 0 });
    for (const [n, p] of prompts.entries()) await ctx.db.insert("gameRounds", { gameId, n, prompt: p.prompt, winners: [], ...(p.asks ? { asks: JSON.stringify(p.asks) } : {}) });
    await ctx.scheduler.runAfter(0, internal.games.word, { gameId });
    await ctx.scheduler.runAfter(LOBBY_EXPIRE_MS, internal.games.tick, { gameId, phase: "expire", n: 0 });
    return { ok: true, gameId, name: fields.name };
  },
});

/** Anyone with a seat in the room may join, late too: they enter at the round that's on. */
export const join = mutation({
  args: { gameId: v.id("games"), userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { gameId, userId }) => {
    const doc = await ctx.db.get("games", gameId);
    if (!doc) return false;
    const seat = await caller(ctx, doc.spaceId, userId);
    if (!seat) return false;
    const me = await asPlayer(ctx, gameId, seat);
    return await step(ctx, gameId, (g, now) => {
      const joined = joinGame(g, { name: me.name, color: me.color }, now);
      if (joined === g) return g;
      return g.cast.some((p) => same(p.name, me.name)) ? joined : { ...joined, cast: [...g.cast, { name: me.name, color: me.color }].slice(-MAX_CAST) };
    }, me);
  },
});

/** The lobby's `start →`: anyone in it, once there are two. */
export const begin = mutation({
  args: { gameId: v.id("games"), userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { gameId, userId }) => {
    const doc = await ctx.db.get("games", gameId);
    const seat = doc && (await caller(ctx, doc.spaceId, userId));
    if (!seat) return false;
    const me = await asPlayer(ctx, gameId, seat);
    return await step(ctx, gameId, (g, now) => (g.phase === "invite" && isIn(g, me.name) && g.players.length >= 2 ? beginRound(g, now, 0) : g));
  },
});

/** One answer per round, yours only; the first one stands. Everyone in = the reveal, in this same write. */
export const pick = mutation({
  args: { gameId: v.id("games"), userId: v.string(), pick: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { gameId, userId, pick }) => {
    const doc = await ctx.db.get("games", gameId);
    const seat = doc && (await caller(ctx, doc.spaceId, userId));
    if (!seat) return false;
    const me = await asPlayer(ctx, gameId, seat);
    return await step(ctx, gameId, (g, now) => {
      const a = answer(g, me.name, pick.slice(0, 80), now);
      return a !== g && everyoneIn(a) ? reveal(a, now) : a;
    }, me);
  },
});

/** `next →` after a reveal: the round moves on once everyone in has pressed it (or the hold runs out). */
export const next = mutation({
  args: { gameId: v.id("games"), userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { gameId, userId }) => {
    const doc = await ctx.db.get("games", gameId);
    const seat = doc && (await caller(ctx, doc.spaceId, userId));
    if (!doc || !seat || doc.phase !== "reveal") return false;
    const me = await asPlayer(ctx, gameId, seat);
    const row = await ctx.db.query("gameRounds").withIndex("by_game", (q) => q.eq("gameId", gameId).eq("n", doc.round)).unique();
    if (!row) return false;
    const ready = [...new Set([...(row.ready ?? []), me.name])];
    await ctx.db.patch("gameRounds", row._id, { ready });
    const players = await ctx.db.query("gamePlayers").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(40);
    if (!players.every((p) => ready.some((r) => same(r, p.name)))) return true;
    return await step(ctx, gameId, (g, now) => nextRound(g, now));
  },
});

/** The hot seat: the person it's about gets one tap after each reveal. */
export const react = mutation({
  args: { gameId: v.id("games"), userId: v.string(), kind: v.union(v.literal("ha"), v.literal("wrong"), v.literal("who-told-you")) },
  returns: v.boolean(),
  handler: async (ctx, { gameId, userId, kind }) => {
    const doc = await ctx.db.get("games", gameId);
    const seat = doc && (await caller(ctx, doc.spaceId, userId));
    if (!seat) return false;
    const me = await asPlayer(ctx, gameId, seat);
    return await step(ctx, gameId, (g, now) => reactTo(g, me.name, kind as SeatReaction, now));
  },
});

/** Every deadline lands here, and does nothing if the game has moved on since it was set. */
export const tick = internalMutation({
  args: { gameId: v.id("games"), phase: v.string(), n: v.number() },
  returns: v.null(),
  handler: async (ctx, { gameId, phase, n }) => {
    const doc = await ctx.db.get("games", gameId);
    if (!doc) return null;
    if (phase === "expire") {
      if (doc.phase === "invite") await ctx.db.patch("games", gameId, { phase: "done", phaseEndsAt: undefined });
      return null;
    }
    if (doc.phase !== phase || doc.round !== n) return null;
    await step(ctx, gameId, (g, now) => {
      if (g.phase === "invite") return g.phaseEndsAt && now >= g.phaseEndsAt - 50 ? beginRound(g, now, 0) : g;
      if (g.phase === "round") return reveal(g, now);
      if (g.phase === "reveal") return nextRound(g, now);
      return g;
    });
    return null;
  },
});

/* ---------- the one model call: wording ---------- */

export const wordingInput = internalQuery({
  args: { gameId: v.id("games") },
  returns: v.any(),
  handler: async (ctx, { gameId }) => {
    const doc = await ctx.db.get("games", gameId);
    if (!doc) return null;
    const rounds = await ctx.db.query("gameRounds").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(12);
    return { kind: doc.kind, name: doc.name, names: doc.cast.map((p) => p.name), rounds: rounds.map((r) => ({ n: r.n, prompt: r.prompt, asks: r.asks ? (JSON.parse(r.asks) as HotQuestion[]) : undefined })) };
  },
});

export const word = internalAction({
  args: { gameId: v.id("games") },
  returns: v.null(),
  handler: async (ctx, { gameId }) => {
    const input = (await ctx.runQuery(internal.games.wordingInput, { gameId })) as {
      kind: string; name: string; names: string[]; rounds: Array<{ n: number; prompt: GameRound["prompt"]; asks?: HotQuestion[] }>;
    } | null;
    if (!input) return null;
    const seat = input.kind === "hot-seat";
    const facts: LikelyFact[] = input.rounds.map((r) => ({ key: r.prompt.fact, kind: r.prompt.fact.split(":")[0], fact: r.prompt.from, from: r.prompt.from, template: { text: r.prompt.text, award: r.prompt.award, glyph: r.prompt.glyph } }));
    const asks = input.rounds.map((r) => r.asks?.[0]).filter((q): q is HotQuestion => Boolean(q));
    const live = facts.filter((f) => !f.key.startsWith("house:"));
    if (!seat && live.length === 0) {
      await ctx.runMutation(internal.games.setWording, { gameId, rounds: [], worded: "templates (house prompts only)" });
      return null;
    }
    const ask = seat ? seatWordingAsk(asks.map((q) => ({ text: q.text, about: q.about, from: q.fact.from }))) : wordingAsk(facts, input.names, input.name);
    // past the day's model ceiling the game keeps its templates (S3, convex/guard.ts)
    if (!(await ctx.runQuery(internal.guard.underCeiling, {}))) {
      await ctx.runMutation(internal.games.setWording, { gameId, rounds: [], worded: "templates (the day's model ceiling)" });
      return null;
    }
    const res = await streamChat({ model: "super", messages: [{ role: "system", content: ask.system }, { role: "user", content: ask.user }], maxTokens: 320 });
    await ctx.runMutation(internal.guard.noteSpend, { calls: [{ model: "super", prompt: res.usage?.prompt_tokens ?? 0, completion: res.usage?.completion_tokens ?? 0 }] });
    if (res.error || !res.content.trim()) {
      await ctx.runMutation(internal.games.setWording, { gameId, rounds: [], worded: `templates (model failed: ${(res.error ?? "empty").slice(0, 60)})` });
      return null;
    }
    if (seat) {
      const read = readSeatWording(res.content, asks.map((q) => ({ text: q.text, about: q.about, right: q.right, options: q.options })));
      const rounds = input.rounds.map((r, i) => ({ n: r.n, text: read.texts[i] ?? r.prompt.text, award: "", glyph: "" }));
      await ctx.runMutation(internal.games.setWording, { gameId, rounds, worded: `model ${read.kept}/${asks.length} · ${res.totalMs} ms${read.why.length ? ` · kept templates: ${read.why.join(", ")}` : ""}` });
    } else {
      const read = readWording(res.content, facts, input.names);
      const rounds = input.rounds.map((r, i) => ({ n: r.n, ...read.words[i] }));
      await ctx.runMutation(internal.games.setWording, { gameId, rounds, worded: `model ${read.kept}/${facts.length} · ${res.totalMs} ms${read.why.length ? ` · kept templates: ${read.why.join(", ")}` : ""}` });
    }
    return null;
  },
});

/** The model's words land only on rounds nobody has seen yet. The fact each came from never changes. */
export const setWording = internalMutation({
  args: { gameId: v.id("games"), rounds: v.array(v.object({ n: v.number(), text: v.string(), award: v.string(), glyph: v.string() })), worded: v.string() },
  returns: v.null(),
  handler: async (ctx, { gameId, rounds, worded }) => {
    const doc = await ctx.db.get("games", gameId);
    if (!doc) return null;
    await ctx.db.patch("games", gameId, { worded });
    for (const w of rounds) {
      const row = await ctx.db.query("gameRounds").withIndex("by_game", (q) => q.eq("gameId", gameId).eq("n", w.n)).unique();
      if (!row || row.endsAt !== undefined || (doc.phase !== "invite" && w.n <= doc.round)) continue;
      if (row.asks) {
        const asks = (JSON.parse(row.asks) as HotQuestion[]).map((q, i) => (i === 0 ? { ...q, text: w.text } : q));
        await ctx.db.patch("gameRounds", row._id, { asks: JSON.stringify(asks), prompt: { ...row.prompt, text: w.text } });
      } else await ctx.db.patch("gameRounds", row._id, { prompt: { ...row.prompt, text: w.text, award: w.award, glyph: w.glyph } });
    }
    return null;
  },
});

/** Dev cleanup: remove the named games and everything under them (players, rounds, answers, stickers, pieces). Ids only, never a sweep by time or name. */
export const sweep = internalMutation({
  args: { gameIds: v.array(v.id("games")) },
  returns: v.number(),
  handler: async (ctx, { gameIds }) => {
    let n = 0;
    for (const gameId of gameIds) {
      const game = await ctx.db.get("games", gameId);
      if (!game) continue;
      const rows = [
        ...(await ctx.db.query("gamePlayers").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(200)),
        ...(await ctx.db.query("gameRounds").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(50)),
        ...(await ctx.db.query("gameAnswers").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(500)),
        ...(await ctx.db.query("puzzlePieces").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(100)),
        ...(await ctx.db.query("awards").withIndex("by_space", (q) => q.eq("spaceId", game.spaceId)).take(500)).filter((a) => a.gameId === gameId),
      ];
      for (const r of rows) await ctx.db.delete(r._id);
      await ctx.db.delete(gameId);
      n += rows.length + 1;
    }
    return n;
  },
});
