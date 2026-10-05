/**
 * The game frame's data. Every game is the same four-beat life on one card:
 * invite → round → reveal → (next round | done). Written as plain rows so a
 * later task can store them in Convex without a rewrite; the table each type
 * would become is named on it (see features/games.md "live version").
 */

export type GameKind = "most-likely";

export type GamePhase = "invite" | "round" | "reveal" | "done";

/** Someone the room's data names: enough to draw their sticker. */
export type GamePerson = { name: string; color: string };

/** table `gamePlayers` (by game): who is in, and from which round. */
export type GamePlayer = GamePerson & {
  joinedAt: number;
  /** a late joiner enters at the round that was on when they joined */
  fromRound: number;
};

/** What one round asks. Each one names the room fact it was written from. */
export type GamePrompt = {
  id: string;
  /** after the game's verb: "forget the balloons" */
  text: string;
  /** the sticker the round's winner wears: "balloon duty" */
  award: string;
  /** the sticker's mark */
  glyph: string;
  /** a key on "what this space knows" (`payer:Jules`, `places`, `told:…`) */
  fact: string;
  /** that fact in a few words, printed small under the prompt */
  from: string;
};

/** table `gameAnswers` (by round): kept apart from the round so a query can
    hold `pick` back until the reveal. */
export type GameAnswer = { by: string; pick: string; at: number };

/** table `gameRounds` (by game). */
export type GameRound = {
  n: number;
  prompt: GamePrompt;
  answers: GameAnswer[];
  /** the round's timer; the reveal happens here if not everyone is in */
  endsAt?: number;
  revealedAt?: number;
  /** set at the reveal: the most-picked (two can share; a wider tie is no one) */
  winners: string[];
};

/** table `games` (by room). */
export type Game = {
  id: string;
  room: string;
  kind: GameKind;
  /** "most likely to", or "more likely to" for a room of two */
  name: string;
  startedBy: GamePerson;
  startedAt: number;
  phase: GamePhase;
  /** index into `rounds` */
  round: number;
  /** when the current phase moves on by itself (lobby count, reveal hold) */
  phaseEndsAt?: number;
  players: GamePlayer[];
  /** the people who can be picked: the room's members */
  cast: GamePerson[];
  rounds: GameRound[];
};

/** table `awards` (by room, by week): what stays after a game. */
export type Award = {
  id: string;
  room: string;
  gameId: string;
  to: string;
  title: string;
  glyph: string;
  /** the prompt it was won on, with the game's verb */
  prompt: string;
  /** 0–5, picks the sticker's colour */
  tone: number;
  at: number;
};

/** One line of the room's scoreboard for this week. */
export type ScoreRow = GamePerson & {
  /** rounds where their pick was the room's pick */
  points: number;
  awards: Award[];
  played: number;
};
