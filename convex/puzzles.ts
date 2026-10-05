import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { caller, type Who } from "./games";
import { rightOfWay as door } from "./rightOfWay";
import { rightOfWay, type Hold } from "../src/lib/games/rightOfWay";

/**
 * The group-photo jigsaw, live (features/jigsaw.md). A puzzle is a `games`
 * row (kind "jigsaw", `known` = how many pieces, `photo` = which one); a
 * piece is a `puzzlePieces` row once someone has touched it (untouched pieces
 * lie where the shared seed scattered them on every screen).
 *
 * Holding a piece is a lease: `heldBy` until `heldUntil`, renewed while you
 * drag, gone by itself a few seconds after you stop (a closed laptop never
 * locks a piece). Every grab asks the same rule the mock's hands ask
 * (src/lib/games/rightOfWay.ts: go | wait | never) with the live leases:
 * the seed of the real Right of Way gate. The space's hand is not here: in
 * a live room only people move pieces.
 */

const LEASE_MS = 4_000;

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
    const [rows, players] = await Promise.all([
      ctx.db.query("puzzlePieces").withIndex("by_game", (q) => q.eq("gameId", game._id)).take(64),
      ctx.db.query("gamePlayers").withIndex("by_game", (q) => q.eq("gameId", game._id)).take(40),
    ]);
    return {
      id: game._id, phase: game.phase, photo: game.photo ?? "friday", pieces: game.known ?? 20, startedAt: game.startedAt,
      startedBy: { name: game.startedBy.name, color: game.startedBy.color },
      players: players.map((p) => ({ name: p.name, color: p.color, userId: p.userId })),
      rows: rows.map((r) => ({ i: r.i, x: r.x, y: r.y, placed: r.placed, by: r.by ?? null, holder: r.heldName ?? null, holderId: r.heldBy ?? null, until: r.heldUntil ?? 0 })),
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
    const now = Date.now();
    const rows = await pieces(ctx, gameId);
    const row = rows.find((r) => r.i === i);
    if (row?.placed) return { kind: "never" };
    const holds: Hold[] = rows.filter((r) => r.heldBy && (r.heldUntil ?? 0) > now).map((r) => ({ thing: String(r.i), by: { kind: "person", name: r.heldBy! } }));
    const d = rightOfWay(holds, { thing: String(i), by: { kind: "person", name: seat.me.userId } });
    if (d.kind !== "go") return d.kind === "wait" ? { kind: "wait", on: row?.heldName ?? "someone" } : { kind: "never" };
    /* one piece per hand: anything else you held goes back down where it is */
    for (const r of rows) if (r.heldBy === seat.me.userId && r.i !== i) await ctx.db.patch("puzzlePieces", r._id, { heldBy: undefined, heldName: undefined, heldUntil: undefined });
    const lease = { heldBy: seat.me.userId, heldName: seat.me.name, heldUntil: now + LEASE_MS, x, y };
    if (row) await ctx.db.patch("puzzlePieces", row._id, lease);
    else await ctx.db.insert("puzzlePieces", { gameId, i, placed: false, ...lease });
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
    if (!row || !me || row.heldBy !== me.userId || row.placed) return false;
    await ctx.db.patch("puzzlePieces", row._id, { x, y, heldUntil: Date.now() + LEASE_MS });
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
    if (!row || row.heldBy !== seat.me.userId || row.placed) return false;
    await ctx.db.patch("puzzlePieces", row._id, { x, y, placed, heldBy: undefined, heldName: undefined, heldUntil: undefined, ...(placed ? { by: seat.me.name } : {}) });
    if (placed && rows.filter((r) => r.placed).length + 1 >= (seat.game.known ?? 20)) await ctx.db.patch("games", gameId, { phase: "done" });
    return true;
  },
});
