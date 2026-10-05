/**
 * "answer to see" — one lock, used by anything that hides what the group
 * said until it's fair to show it: a game round, the scoreboard, and later
 * standings, polls and trivia. Pure: the caller hands in what it knows and
 * gets back whether it's open and the one line to print on the cover.
 *
 * One shape for every card that hides something: the family's standings
 * ("log yours to see", opens at the reveal), a game round (opens at the
 * server's reveal write), the hot seat's right answer, the scoreboard.
 * The server reads the same lock before it sends a pick (convex/games.ts
 * `redact`), so a closed lock is enforced, not just drawn.
 */

export type SeeLock = {
  /** what has to be true before it opens */
  until: {
    /** this person has given theirs */
    answered?: boolean;
    /** everyone playing has given theirs */
    everyone?: boolean;
    /** a moment (ms since epoch): a round timer, friday 9:00 */
    at?: number;
    /** another card or write resolves it: a round's reveal, a challenge's final day */
    resolves?: string;
  };
  /** `any` (default): the first condition to hold opens it. `all`: every one set. */
  mode?: "any" | "all";
  /** what stays face down until then */
  hides: "answers" | "ranking" | "right-answer";
  /** only these people may ever open it (a challenge's people); unset = anyone in the room */
  who?: "players";
  /** `each`: opens per person as they qualify. `everyone`: one moment for the room. */
  revealsTo: "each" | "everyone";
};

export type SeeFacts = {
  /** has this person given theirs */
  mine: boolean;
  /** how many have, out of how many */
  answered: number;
  of: number;
  now: number;
  /** names still out, for the cover line */
  waitingOn?: string[];
  /** has the thing named in `until.resolves` happened */
  resolved?: boolean;
  /** with `who: "players"`: is this person one of them */
  player?: boolean;
};

export type SeeState = {
  open: boolean;
  /** which condition opened it */
  by: "yours" | "everyone" | "time" | "resolved" | null;
  /** the cover's one line, in the room's voice */
  line: string;
};

const HIDDEN: Record<SeeLock["hides"], string> = {
  answers: "what everyone said",
  ranking: "the ranking",
  "right-answer": "the answer",
};

function names(list: string[]) {
  const shown = list.map((name) => name.toLowerCase());
  if (shown.length <= 2) return shown.join(" and ");
  return `${shown[0]} and ${shown.length - 1} more`;
}

export function seeState(lock: SeeLock, facts: SeeFacts): SeeState {
  const { until } = lock;
  const checks: Array<[SeeState["by"], boolean]> = [];
  if (until.answered) checks.push(["yours", facts.mine]);
  if (until.everyone) checks.push(["everyone", facts.of > 0 && facts.answered >= facts.of]);
  if (until.at !== undefined) checks.push(["time", facts.now >= until.at]);
  if (until.resolves) checks.push(["resolved", Boolean(facts.resolved)]);
  const held = checks.filter(([, ok]) => ok);
  /* someone outside it never sees it open, except once it is resolved for everyone */
  if (lock.who === "players" && !facts.player && !held.some(([by]) => by === "time" || by === "resolved")) return { open: false, by: null, line: "only the people in it can look" };
  const open = checks.length === 0 || (lock.mode === "all" ? held.length === checks.length : held.length > 0);
  if (open) return { open, by: held[0]?.[0] ?? null, line: "" };

  /* the line says the nearest thing that would open it */
  let line: string;
  if (until.answered && !facts.mine) {
    line = lock.revealsTo === "each" ? `yours unlocks ${HIDDEN[lock.hides]}` : `${facts.answered} of ${facts.of} in. yours is one of the missing`;
  } else if (until.everyone && facts.waitingOn?.length) {
    line = `${facts.answered} of ${facts.of} in · waiting on ${names(facts.waitingOn)}`;
  } else if (until.everyone) {
    line = `${facts.answered} of ${facts.of} in`;
  } else {
    line = `${HIDDEN[lock.hides]} opens for everyone at once`;
  }
  return { open: false, by: null, line };
}

/** Whole seconds left on a timed lock, never below zero. */
export function seeSecondsLeft(lock: SeeLock, now: number): number | undefined {
  if (lock.until.at === undefined) return undefined;
  return Math.max(0, Math.ceil((lock.until.at - now) / 1000));
}

/** Every lock in the product, in one place. The server reads `round` and
    `rightAnswer` before it sends a pick or an answer (convex/games.ts). */
export const LOCKS = {
  /** the family's standings: log today's to see, or the challenge's reveal opens it for all */
  standings: { until: { answered: true, resolves: "the challenge's reveal" }, who: "players", hides: "ranking", revealsTo: "each" },
  /** a game round: what everyone said, until the server writes the reveal (everyone in, or the timer) */
  round: { until: { resolves: "the round's reveal" }, hides: "answers", revealsTo: "everyone" },
  /** the hot seat: the right answer, until the reveal (the person it's about knows it already) */
  rightAnswer: { until: { resolves: "the round's reveal" }, hides: "right-answer", revealsTo: "everyone" },
  /** the room's scoreboard: play one this week to see the ranking */
  scoreboard: { until: { answered: true }, hides: "ranking", revealsTo: "each" },
} satisfies Record<string, SeeLock>;
