/**
 * "answer to see" — one lock, used by anything that hides what the group
 * said until it's fair to show it: a game round, the scoreboard, and later
 * standings, polls and trivia. Pure: the caller hands in what it knows and
 * gets back whether it's open and the one line to print on the cover.
 *
 * NOTE (merge): the family room's standings card has its own copy of this
 * idea ("log yours to see"). The two should become this one.
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
  };
  /** `any` (default): the first condition to hold opens it. `all`: every one set. */
  mode?: "any" | "all";
  /** what stays face down until then */
  hides: "answers" | "ranking" | "right-answer";
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
};

export type SeeState = {
  open: boolean;
  /** which condition opened it */
  by: "yours" | "everyone" | "time" | null;
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
  const held = checks.filter(([, ok]) => ok);
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
