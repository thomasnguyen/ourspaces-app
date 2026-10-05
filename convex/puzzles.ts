import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { caller, type Who } from "./games";
import { rightOfWay as door } from "./rightOfWay";
import { rightOfWay } from "../src/lib/rightOfWay";
import { holdThing, leasesFrom, letGoThing } from "./leases";

/**
 * The group-photo jigsaw, live (features/jigsaw.md). A puzzle is a `games`
 * row (kind "jigsaw", `known` = how many pieces, `photo` = which one); a
 * piece is a `puzzlePieces` row once someone has touched it (untouched pieces
 * lie where the shared seed scattered them on every screen).
 *
 * Holding a piece is a lease (leases.ts, the same table cards use; thing =
 * "piece:<game>:<i>"), renewed while you drag, gone by itself a few seconds
 * after you stop (a closed laptop never locks a piece). Every grab asks the
 * Right of Way gate (src/lib/rightOfWay.ts) with the live leases.
 *
 * The space's helper hand (`helper`, a scheduled function, every 7 s while
 * a puzzle is on): code picks the next loose piece, no model. It asks the
 * one door to place it; if a person holds that piece the placement waits as
 * a ghost at its home and lands when they let go (or is dropped if they
 * placed it themselves). It never places the last piece.
 */

const LEASE_MS = 4_000;
const HELPER_EVERY_MS = 7_000;

const pieceOf = (gameId: Id<"games">, i: number) => `piece:${gameId}:${i}`;
/** The game's live piece leases. */
async function heldIn(ctx: MutationCtx, game: Doc<"games">) {
  const now = Date.now();
  return (await leasesFrom(ctx, game.spaceId, `piece:${game._id}:`)).filter((l) => l.until > now);
}

async function pieces(ctx: MutationCtx, gameId: Id<"games">) {
  return await ctx.db.query("puzzlePieces").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(64);
}

async function seatIn(ctx: MutationCtx, gameId: Id<"games">, userId: string): Promise<{ game: Doc<"games">; me: Who } | null> {
  const game = await ctx.db.get("games", gameId);
  if (!game || game.kind !== "jigsaw" || game.phase === "done") return null;
  const me = await caller(ctx, game.spaceId, userId);
  if (!me) return null;
  /* touching it is joining it */
  const players = await ctx.db.query("gamePlayers").withIndex("by_game", (q) => q.eq("gameId", gameId)).take(40);
  if (!players.some((p) => p.userId === me.userId)) await ctx.db.insert("gamePlayers", { gameId, userId: me.userId, name: me.name, color: me.color, joinedAt: Date.now(), fromRound: 0 });
  return { game, me };
}

/** The room's puzzle (open, or the last one) and every touched piece. Leases are sent with their end; screens drop the stale ones. */
export const forRoom = query({
  args: { spaceId: v.id("spaces") },
  returns: v.any(),
  handler: async (ctx, { spaceId }) => {
    const game = (await ctx.db.query("games").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(12)).find((g) => g.kind === "jigsaw");
    if (!game) return null;
    const [rows, players, held] = await Promise.all([
      ctx.db.query("puzzlePieces").withIndex("by_game", (q) => q.eq("gameId", game._id)).take(64),
      ctx.db.query("gamePlayers").withIndex("by_game", (q) => q.eq("gameId", game._id)).take(40),
      leasesFrom(ctx, spaceId, `piece:${game._id}:`),
    ]);
    const holderOf = (i: number) => held.find((l) => l.thing === pieceOf(game._id, i) && l.letGoAt === undefined);
    const waiting = await ctx.db.query("pending").withIndex("by_thing", (q) => q.eq("spaceId", spaceId).gte("thing", `piece:${game._id}:`).lt("thing", `piece:${game._id}:\uffff`)).take(4);
    return {
      id: game._id, phase: game.phase, photo: game.photo ?? "friday", pieces: game.known ?? 20, startedAt: game.startedAt,
      startedBy: { name: game.startedBy.name, color: game.startedBy.color },
      helper: waiting.length ? { piece: Number(waiting[0].thing.split(":")[2]), on: (JSON.parse(waiting[0].on) as { name: string }).name } : null,
      players: players.map((p) => ({ name: p.name, color: p.color, userId: p.userId })),
      rows: rows.map((r) => {
        const h = holderOf(r.i);
        return { i: r.i, x: r.x, y: r.y, placed: r.placed, by: r.by ?? null, holder: h?.name ?? null, holderId: h?.userId ?? null, until: h?.until ?? 0 };
      }),
    };
  },
});

export const start = mutation({
  args: { spaceId: v.id("spaces"), userId: v.string(), photo: v.string(), pieces: v.number(), said: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), gameId: v.optional(v.id("games")), reason: v.optional(v.string()) }),
  handler: async (ctx, { spaceId, userId, photo, pieces: n, said }) => {
    const me = await caller(ctx, spaceId, userId);
    if (!me) return { ok: false, reason: "enter the space to play" };
    if (me.guest) return { ok: false, reason: "join the space to start a puzzle. you can still help with one" };
    const open = (await ctx.db.query("games").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(12)).find((g) => g.kind === "jigsaw" && g.phase !== "done");
    if (open) return { ok: true, gameId: open._id, reason: "already on" };
    await door(ctx, { kind: "game", spaceId, by: { name: me.name, userId: me.userId }, fields: [{ field: "game", old: null, new: `jigsaw: ${photo}` }], text: said ?? `started a puzzle of ${photo}` });
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      spaceId, kind: "jigsaw", name: "a puzzle", phase: "round", round: 0, startedBy: { userId: me.userId, name: me.name, color: me.color }, startedAt: now,
      cast: [{ name: me.name, color: me.color }], known: [12, 20, 30].includes(n) ? n : 20, photo: photo.slice(0, 40),
    });
    await ctx.db.insert("gamePlayers", { gameId, userId: me.userId, name: me.name, color: me.color, joinedAt: now, fromRound: 0 });
    await ctx.scheduler.runAfter(HELPER_EVERY_MS, internal.puzzles.helper, { gameId });
    return { ok: true, gameId };
  },
});

/** Pick a piece up: the rule decides with the live leases. `wait` names who has it. */
export const grab = mutation({
  args: { gameId: v.id("games"), userId: v.string(), i: v.number(), x: v.number(), y: v.number() },
  returns: v.object({ kind: v.string(), on: v.optional(v.string()) }),
  handler: async (ctx, { gameId, userId, i, x, y }) => {
    const seat = await seatIn(ctx, gameId, userId);
    if (!seat) return { kind: "never" };
    const rows = await pieces(ctx, gameId);
    const row = rows.find((r) => r.i === i);
    if (row?.placed) return { kind: "never" };
    const held = await heldIn(ctx, seat.game);
    const thing = pieceOf(gameId, i);
    const d = rightOfWay({ thing, by: { kind: "person", id: seat.me.userId, name: seat.me.name } }, held.map((l) => ({ thing: l.thing, by: { kind: "person" as const, id: l.userId, name: l.name }, kind: "piece" as const })));
    if (d.kind !== "go") return d.kind === "wait" ? { kind: "wait", on: d.on.by.kind === "person" ? d.on.by.name : "the space" } : { kind: "never" };
    /* one piece per hand: anything else you held goes back down where it is */
    for (const l of held) if (l.userId === seat.me.userId && l.thing !== thing) await letGoThing(ctx, seat.game.spaceId, l.thing, seat.me.userId);
    await holdThing(ctx, { spaceId: seat.game.spaceId, thing, kind: "piece", userId: seat.me.userId, name: seat.me.name, color: seat.me.color }, LEASE_MS);
    if (row) await ctx.db.patch("puzzlePieces", row._id, { x, y });
    else await ctx.db.insert("puzzlePieces", { gameId, i, placed: false, x, y });
    return { kind: "go" };
  },
});

/** Carry it (renews the lease). Only the holder's moves land. */
export const move = mutation({
  args: { gameId: v.id("games"), userId: v.string(), i: v.number(), x: v.number(), y: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { gameId, userId, i, x, y }) => {
    const row = (await pieces(ctx, gameId)).find((r) => r.i === i);
    const game = await ctx.db.get("games", gameId);
    const me = game && (await caller(ctx, game.spaceId, userId));
    if (!row || !me || row.placed) return false;
    const mine = (await heldIn(ctx, game)).find((l) => l.thing === pieceOf(gameId, i) && l.userId === me.userId && l.letGoAt === undefined);
    if (!mine) return false;
    await holdThing(ctx, { spaceId: game.spaceId, thing: mine.thing, kind: "piece", userId: me.userId, name: me.name, color: me.color }, LEASE_MS);
    await ctx.db.patch("puzzlePieces", row._id, { x, y });
    return true;
  },
});

/** Put it down, or in its place. The last one in finishes the puzzle for everyone. */
export const drop = mutation({
  args: { gameId: v.id("games"), userId: v.string(), i: v.number(), x: v.number(), y: v.number(), placed: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, { gameId, userId, i, x, y, placed }) => {
    const seat = await seatIn(ctx, gameId, userId);
    if (!seat) return false;
    const rows = await pieces(ctx, gameId);
    const row = rows.find((r) => r.i === i);
    const thing = pieceOf(gameId, i);
    if (!row || row.placed || !(await heldIn(ctx, seat.game)).some((l) => l.thing === thing && l.userId === seat.me.userId)) return false;
    await ctx.db.patch("puzzlePieces", row._id, { x, y, placed, ...(placed ? { by: seat.me.name } : {}) });
    await letGoThing(ctx, seat.game.spaceId, thing, seat.me.userId);
    if (placed && rows.filter((r) => r.placed).length + 1 >= (seat.game.known ?? 20)) await ctx.db.patch("games", gameId, { phase: "done" });
    return true;
  },
});

/** The space's hand: one piece per tick through the one door. Code picks it (the lowest loose piece), never a model. */
export const helper = internalMutation({
  args: { gameId: v.id("games") },
  returns: v.null(),
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game || game.kind !== "jigsaw" || game.phase === "done") return null;
    const total = game.known ?? 20;
    const rows = await pieces(ctx, gameId);
    const placed = rows.filter((r) => r.placed).length;
    // the last one belongs to a person: stop one short
    if (placed >= total - 1) return null;
    const waiting = await ctx.db.query("pending").withIndex("by_thing", (q) => q.eq("spaceId", game.spaceId).gte("thing", `piece:${gameId}:`).lt("thing", `piece:${gameId}:\uffff`)).take(1);
    if (!waiting.length) {
      const i = [...Array(total).keys()].find((k) => !rows.some((r) => r.i === k && r.placed))!;
      const thing = pieceOf(gameId, i);
      const d = await door(ctx, {
        kind: "puzzle", spaceId: game.spaceId, thing, by: { name: "the space" }, fields: [{ field: "piece", old: i, new: "placed" }],
        text: `placed piece ${i + 1}`, finishes: placed + 1 >= total, replay: { kind: "puzzle", gameId, i, x: 0, y: 0 },
      });
      if (d.verdict === "go") {
        const row = rows.find((r) => r.i === i);
        if (row) await ctx.db.patch("puzzlePieces", row._id, { placed: true, by: "the space" });
        else await ctx.db.insert("puzzlePieces", { gameId, i, x: 0, y: 0, placed: true, by: "the space" });
      }
    }
    await ctx.scheduler.runAfter(HELPER_EVERY_MS, internal.puzzles.helper, { gameId });
    return null;
  },
});
