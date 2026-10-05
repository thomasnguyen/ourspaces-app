/**
 * The game frame's rules, as pure functions over `Game`. Mock mode calls them
 * from a timer (`useMockGames`); a live version calls the same ones inside
 * mutations. Nothing here knows about React, clocks or who is simulated.
 */
import type { Award, Game, GamePerson, GamePrompt, GameRound, ScoreRow } from "./types";

export const ROUND_MS = 14_000;
export const LOBBY_MS = 7_000;
export const REVEAL_MS = 7_000;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function newGame(o: {
  id: string;
  room: string;
  name: string;
  by: GamePerson;
  cast: GamePerson[];
  prompts: GamePrompt[];
  now: number;
}): Game {
  return {
    id: o.id,
    room: o.room,
    kind: "most-likely",
    name: o.name,
    startedBy: o.by,
    startedAt: o.now,
    phase: "invite",
    round: 0,
    players: [{ ...o.by, joinedAt: o.now, fromRound: 0 }],
    cast: o.cast,
    rounds: o.prompts.map((prompt, n) => ({ n, prompt, answers: [], winners: [] })),
  };
}

export const isIn = (game: Game, name: string) => game.players.some((p) => same(p.name, name));

/** Joining is always allowed until the game is done; late is fine. */
export function joinGame(game: Game, who: GamePerson, now: number): Game {
  if (game.phase === "done" || isIn(game, who.name)) return game;
  const lobby = game.phase === "invite";
  return {
    ...game,
    players: [...game.players, { ...who, joinedAt: now, fromRound: lobby ? 0 : game.round }],
    /* the short count starts once there are two */
    phaseEndsAt: lobby ? (game.phaseEndsAt ?? now + LOBBY_MS) : game.phaseEndsAt,
  };
}

const withRound = (game: Game, patch: (round: GameRound) => GameRound): Game => ({
  ...game,
  rounds: game.rounds.map((round) => (round.n === game.round ? patch(round) : round)),
});

export function beginRound(game: Game, now: number, n = game.round): Game {
  if (n >= game.rounds.length) return { ...game, phase: "done", phaseEndsAt: undefined };
  return withRound({ ...game, phase: "round", round: n, phaseEndsAt: undefined }, (round) => ({ ...round, endsAt: now + ROUND_MS }));
}

/** Who is expected to answer this round: everyone who is in. */
export const roundPlayers = (game: Game) => game.players;

export const currentRound = (game: Game): GameRound | undefined => game.rounds[game.round];

/** One answer each; the first one stands. The AI can't change it either. */
export function answer(game: Game, by: string, pick: string, now: number): Game {
  const round = currentRound(game);
  if (game.phase !== "round" || !round || !isIn(game, by) || round.answers.some((a) => same(a.by, by))) return game;
  return withRound(game, (r) => ({ ...r, answers: [...r.answers, { by, pick, at: now }] }));
}

export function everyoneIn(game: Game): boolean {
  const round = currentRound(game);
  return Boolean(round) && roundPlayers(game).every((p) => round!.answers.some((a) => same(a.by, p.name)));
}

/** Votes per person in a round, most first; the cast's order breaks ties. */
export function tally(game: Game, round: GameRound): Array<{ person: GamePerson; voters: string[] }> {
  return game.cast
    .map((person) => ({ person, voters: round.answers.filter((a) => same(a.pick, person.name)).map((a) => a.by) }))
    .sort((a, b) => b.voters.length - a.voters.length);
}

/** The most-picked. Two can share a sticker; a wider tie means nobody did. */
function winnersOf(game: Game, round: GameRound): string[] {
  const rows = tally(game, round);
  const top = rows[0]?.voters.length ?? 0;
  if (top === 0) return [];
  const tied = rows.filter((row) => row.voters.length === top).map((row) => row.person.name);
  /* in a room of two, a split is one vote each: nobody takes it */
  if (tied.length > 2 || (tied.length === 2 && top === 1)) return [];
  return tied;
}

/** Turn the round over, for everyone at the same moment. */
export function reveal(game: Game, now: number): Game {
  const round = currentRound(game);
  if (game.phase !== "round" || !round) return game;
  return withRound({ ...game, phase: "reveal", phaseEndsAt: now + REVEAL_MS }, (r) => ({
    ...r,
    revealedAt: now,
    winners: winnersOf(game, r),
  }));
}

export function nextRound(game: Game, now: number): Game {
  if (game.phase !== "reveal") return game;
  return beginRound(game, now, game.round + 1);
}

/** The stickers a game has handed out so far. */
export function awardsOf(game: Game): Award[] {
  return game.rounds
    .filter((round) => round.revealedAt !== undefined)
    .flatMap((round) =>
      round.winners.map((to) => ({
        id: `${game.id}:${round.n}:${to}`,
        room: game.room,
        gameId: game.id,
        to,
        title: round.prompt.award,
        glyph: round.prompt.glyph,
        prompt: `${game.name} ${round.prompt.text}`,
        tone: round.n % 6,
        at: round.revealedAt ?? game.startedAt,
      })),
    );
}

/** A point for each round where your pick was the room's pick. */
export function pointsOf(game: Game): Record<string, number> {
  const out: Record<string, number> = {};
  for (const round of game.rounds) {
    if (round.revealedAt === undefined) continue;
    for (const a of round.answers) {
      if (round.winners.some((w) => same(w, a.pick))) out[a.by] = (out[a.by] ?? 0) + 1;
    }
  }
  return out;
}

/** The round the room agreed on least: the funniest thing to print after. */
export function closestCall(game: Game): { round: GameRound; line: string } | undefined {
  let best: { round: GameRound; gap: number; line: string } | undefined;
  for (const round of game.rounds) {
    if (round.revealedAt === undefined || round.answers.length < 2) continue;
    const rows = tally(game, round).filter((row) => row.voters.length > 0);
    const gap = (rows[0]?.voters.length ?? 0) - (rows[1]?.voters.length ?? 0);
    const line = rows.map((row) => `${row.person.name.toLowerCase()} ${row.voters.length}`).join(" · ");
    if (rows.length > 1 && (!best || gap < best.gap)) best = { round, gap, line };
  }
  return best && { round: best.round, line: best.line };
}

/** The week's scoreboard: what the room had before, plus the games given. */
export function scoreRows(o: {
  cast: GamePerson[];
  seed: Record<string, number>;
  seedAwards: Award[];
  games: Game[];
  extra?: GamePerson[];
}): ScoreRow[] {
  const people = [...o.cast];
  for (const game of o.games) for (const p of [...game.players, ...(o.extra ?? [])]) if (!people.some((q) => same(q.name, p.name))) people.push({ name: p.name, color: p.color });
  const rows = people.map((person) => {
    let points = o.seed[person.name] ?? 0;
    let played = points > 0 ? 1 : 0;
    const awards = o.seedAwards.filter((a) => same(a.to, person.name));
    for (const game of o.games) {
      points += pointsOf(game)[person.name] ?? 0;
      if (isIn(game, person.name) && game.rounds.some((r) => r.revealedAt !== undefined)) played += 1;
      awards.push(...awardsOf(game).filter((a) => same(a.to, person.name)));
    }
    return { ...person, points, awards, played };
  });
  return rows.sort((a, b) => b.points - a.points || b.awards.length - a.awards.length);
}
