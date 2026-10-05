import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Games (games.ts; types in src/lib/games/types.ts). A round's answers are their own rows so the
 * query can hold each pick back until the round's reveal is written ("answer to see", server side).
 */

export const games = defineTable({
  spaceId: v.id("spaces"), kind: v.string(), name: v.string(), phase: v.string(), round: v.number(),
  startedBy: v.object({ userId: v.string(), name: v.string(), color: v.string() }), startedAt: v.number(),
  phaseEndsAt: v.optional(v.number()), cast: v.array(v.object({ name: v.string(), color: v.string() })),
  seat: v.optional(v.array(v.object({ name: v.string(), color: v.string() }))), seatWhy: v.optional(v.string()),
  known: v.optional(v.number()), worded: v.optional(v.string()), photo: v.optional(v.string()), // worded: model | templates; jigsaw: known = pieces
}).index("by_space", ["spaceId"]);

export const gamePlayers = defineTable({ gameId: v.id("games"), userId: v.string(), name: v.string(), color: v.string(), joinedAt: v.number(), fromRound: v.number() })
  .index("by_game", ["gameId"]);

// prompt = GamePrompt (fact key + its words); asks = HotQuestion[] JSON (holds the right answer).
export const gameRounds = defineTable({
  gameId: v.id("games"), n: v.number(), prompt: v.object({ id: v.string(), text: v.string(), award: v.string(), glyph: v.string(), fact: v.string(), from: v.string() }),
  asks: v.optional(v.string()), endsAt: v.optional(v.number()), revealedAt: v.optional(v.number()), winners: v.array(v.string()),
  reactions: v.optional(v.array(v.object({ by: v.string(), kind: v.string(), at: v.number() }))), ready: v.optional(v.array(v.string())),
}).index("by_game", ["gameId", "n"]);

export const gameAnswers = defineTable({ gameId: v.id("games"), n: v.number(), userId: v.string(), by: v.string(), pick: v.string(), at: v.number() })
  .index("by_game", ["gameId", "n"]);

export const awards = defineTable({ spaceId: v.id("spaces"), gameId: v.id("games"), to: v.string(), title: v.string(), glyph: v.string(), prompt: v.string(), tone: v.number(), at: v.number() })
  .index("by_space", ["spaceId", "at"]);

// The jigsaw's pieces: where each one is (who holds one is a lease, leases.ts).
export const puzzlePieces = defineTable({ gameId: v.id("games"), i: v.number(), x: v.number(), y: v.number(), placed: v.boolean(), by: v.optional(v.string()) })
  .index("by_game", ["gameId", "i"]);
