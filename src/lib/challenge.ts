/**
 * A challenge a group is in together: the check-in card holds the data (who,
 * which days, what each person logged), the standings card only points at a
 * check-in and ranks it. Everything here is pure, so the same maths can run
 * in a Convex mutation later. No model writes any of it.
 */

export type ChallengePerson = { name: string; color: string; userId?: string };

/** `number`: "I did 40". `done`: a tick, stored as 1. */
export type CheckInKind = "number" | "done";

/** The check-in card's settings and state: `widget.data` for type `checkIn`. */
export type CheckInData = {
  title: string;
  kind: CheckInKind;
  /** What is counted, lowercase plural: "push-ups", "walks". */
  unit: string;
  /** Local `YYYY-MM-DD` of day one. */
  start: string;
  /** How many days can be logged. */
  days: number;
  /** Local `YYYY-MM-DDTHH:mm`: the standings open to everyone at this moment. */
  revealAt?: string;
  /** A group total to reach (number kind). */
  goal?: number;
  people: ChallengePerson[];
  /** Person name → one slot per day; `null` (or a short array) = nothing logged. */
  logs: Record<string, (number | null)[]>;
};

/** The standings card's settings: `widget.data` for type `standings`. */
export type StandingsData = {
  title: string;
  /** Widget id of the check-in it ranks. */
  source: string;
  /** What's riding on it, one line. */
  stake?: string;
};

export type StandingRow = {
  name: string;
  color: string;
  rank: number;
  total: number;
  today: number | null;
  streak: number;
  /** Logged before, but not yesterday. */
  missedYesterday: boolean;
  /** Every day so far. */
  perfect: boolean;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function localDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function readCheckIn(raw: Record<string, unknown>): CheckInData {
  const people = Array.isArray(raw.people)
    ? (raw.people as ChallengePerson[]).filter((p) => typeof p?.name === "string" && p.name.trim())
    : [];
  return {
    title: String(raw.title ?? "check-in"),
    kind: raw.kind === "done" ? "done" : "number",
    unit: String(raw.unit ?? "done"),
    start: String(raw.start ?? new Date().toISOString().slice(0, 10)),
    days: Math.max(1, Math.min(14, Number(raw.days) || 7)),
    revealAt: typeof raw.revealAt === "string" && raw.revealAt ? raw.revealAt : undefined,
    goal: Number(raw.goal) > 0 ? Number(raw.goal) : undefined,
    people,
    logs: (raw.logs && typeof raw.logs === "object" ? raw.logs : {}) as CheckInData["logs"],
  };
}

export function readStandings(raw: Record<string, unknown>): StandingsData {
  return {
    title: String(raw.title ?? "standings"),
    source: String(raw.source ?? ""),
    stake: typeof raw.stake === "string" && raw.stake ? raw.stake : undefined,
  };
}

/** Which day of the challenge `now` is: 0 = day one, may run past the end. */
export function dayIndexOf(data: CheckInData, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - localDay(data.start).getTime()) / DAY_MS);
}

/** The day slot `now` can still write to, or -1 before the start / after the end. */
export function loggableDay(data: CheckInData, now = new Date()): number {
  const i = dayIndexOf(data, now);
  return i >= 0 && i < data.days ? i : -1;
}

export function weekdayOf(data: CheckInData, index: number): string {
  const d = localDay(data.start);
  d.setDate(d.getDate() + index);
  return WEEKDAYS[d.getDay()];
}

export function revealDate(data: CheckInData): Date | null {
  if (!data.revealAt) return null;
  const d = localDay(data.revealAt);
  const [h, min] = (data.revealAt.split("T")[1] ?? "09:00").split(":").map(Number);
  d.setHours(h || 0, min || 0, 0, 0);
  return d;
}

/** "fri 9:00", lowercase house voice. */
export function revealLabel(data: CheckInData): string {
  const d = revealDate(data);
  if (!d) return "";
  return `${WEEKDAYS[d.getDay()]} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function isRevealed(data: CheckInData, now = new Date()): boolean {
  const d = revealDate(data);
  return d ? now.getTime() >= d.getTime() : dayIndexOf(data, now) >= data.days;
}

export const logOf = (data: CheckInData, name: string, day: number): number | null =>
  data.logs[name]?.[day] ?? null;

export const totalOf = (data: CheckInData, name: string): number =>
  (data.logs[name] ?? []).reduce<number>((sum, v) => sum + (v ?? 0), 0);

export const groupTotal = (data: CheckInData): number =>
  data.people.reduce((sum, p) => sum + totalOf(data, p.name), 0);

/** Days in a row up to `day`; a day not logged yet today doesn't break it. */
export function streakOf(data: CheckInData, name: string, day: number): number {
  const last = Math.min(day, data.days - 1);
  let i = logOf(data, name, last) == null ? last - 1 : last;
  let n = 0;
  while (i >= 0 && logOf(data, name, i) != null) {
    n += 1;
    i -= 1;
  }
  return n;
}

/** A copy with one person's slot for one day set. */
export function withLog(data: CheckInData, name: string, day: number, value: number | null): CheckInData {
  const row = Array.from({ length: data.days }, (_, i) => data.logs[name]?.[i] ?? null);
  row[day] = value;
  return { ...data, logs: { ...data.logs, [name]: row } };
}

/** Ranked by total, ties by streak, then sign-up order. */
export function rank(data: CheckInData, day: number): StandingRow[] {
  const last = Math.min(Math.max(day, 0), data.days - 1);
  const rows = data.people.map((p) => {
    const streak = streakOf(data, p.name, last);
    const logged = (data.logs[p.name] ?? []).slice(0, last + 1).filter((v) => v != null).length;
    return {
      name: p.name,
      color: p.color,
      rank: 0,
      total: totalOf(data, p.name),
      today: day < data.days ? logOf(data, p.name, last) : null,
      streak,
      missedYesterday: last > 0 && logged > 0 && logOf(data, p.name, last - 1) == null,
      perfect: logged === last + 1 || (logged === last && logOf(data, p.name, last) == null && last > 0),
    };
  });
  const order = new Map(data.people.map((p, i) => [p.name, i]));
  rows.sort((a, b) => b.total - a.total || b.streak - a.streak || order.get(a.name)! - order.get(b.name)!);
  rows.forEach((row, i) => (row.rank = i + 1));
  return rows;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function findPerson(data: CheckInData, name: string | null | undefined): ChallengePerson | undefined {
  return name ? data.people.find((p) => same(p.name, name)) : undefined;
}

export type StandingLine = {
  text: string;
  /** A number the viewer can log today to answer this row: "beat 40". */
  beat?: number;
};

/**
 * One line per row, written to invite a move rather than report one. `viewer`
 * is the row of whoever is looking (they have logged, or it's after the reveal).
 */
export function lineFor(row: StandingRow, rows: StandingRow[], data: CheckInData, day: number, viewer?: StandingRow): StandingLine {
  const name = row.name.toLowerCase();
  const done = data.kind === "done";
  // every day is in: the line is where they finished, nobody has anything left to log
  if (day >= data.days) {
    const above = rows[row.rank - 2];
    const every = row.streak >= data.days ? " · every day" : "";
    if (!above) return { text: rows[1] ? `first, ${row.total - rows[1].total} up on ${rows[1].name.toLowerCase()}${every}` : `all ${data.days} days${every}` };
    if (row.rank === rows.length) return { text: `last place${every}` };
    return { text: `${above.total - row.total} behind ${above.name.toLowerCase()}${every}` };
  }
  if (viewer && same(row.name, viewer.name)) {
    const above = rows[row.rank - 2];
    const below = rows[row.rank];
    if (!above) return { text: below ? `you're ${row.total - below.total} up on ${below.name.toLowerCase()} · don't blink` : "just you so far" };
    const gap = above.total - row.total;
    return { text: gap === 0 ? `level with ${above.name.toLowerCase()}` : `${gap + 1} more and you pass ${above.name.toLowerCase()}`, beat: done ? undefined : (row.today ?? 0) + gap + 1 };
  }
  if (row.today != null) {
    const youToday = viewer?.today ?? null;
    if (!done && viewer && (youToday == null || youToday <= row.today)) {
      return { text: `${name} did ${row.today} today`, beat: row.today + 1 };
    }
    if (row.perfect && row.streak > 1) return { text: `${row.streak} for ${row.streak} · hasn't missed a day` };
    return { text: done ? `${name} is in today` : `${name} did ${row.today} today` };
  }
  if (row.missedYesterday) return { text: `missed ${weekdayOf(data, Math.max(0, Math.min(day, data.days - 1) - 1))} · back on it today` };
  return { text: `nothing from ${name} yet today` };
}

/* ---------- do my part: "i did 40" ---------- */

const I_DID = /\b(?:i(?:'ve|\s+have|\s+just)?\s+(?:did|done|logged|got|hit|ran|walked|swam)|log(?:ged)?|put me down for)\s+(\d{1,4})\b/i;
const I_DID_IT = /\b(?:i\s+(?:did|done)\s+(?:it|mine|today'?s?)|done for today|i'?m done today)\b/i;

/**
 * "i did 40" in a room with a running check-in the speaker is in: which card,
 * which day, what number. Code only (no model): only the speaker's own row,
 * only today. Null when the words aren't a log or nothing is running for them.
 */
export function myPartFor(
  said: string,
  widgets: { id: string; type: string; data: Record<string, unknown> }[],
  me: string,
  now = new Date(),
): { widgetId: string; day: number; value: number; title: string; name: string } | null {
  const n = I_DID.exec(said)?.[1];
  const tick = !n && I_DID_IT.test(said);
  if (!n && !tick) return null;
  for (const w of [...widgets].reverse()) {
    if (w.type !== "checkIn") continue;
    const data = readCheckIn(w.data);
    const person = findPerson(data, me);
    const day = loggableDay(data, now);
    if (!person || day < 0 || isRevealed(data, now)) continue;
    if (tick && data.kind !== "done") continue;
    return { widgetId: w.id, day, value: data.kind === "done" ? 1 : Number(n), title: data.title, name: person.name };
  }
  return null;
}
