/**
 * A poll's two optional rules (the league's card): `closesAt`, a local
 * datetime ("2026-10-08T21:00", like a check-in's `revealAt`) after which
 * nobody votes and the result is stamped; `needs`, the votes an option must
 * reach to pass ("8 of 12"). Pure: the words → the rules, and a poll's data
 * + a clock → its outcome. No model anywhere: the model may fill the words
 * ("24 hours", "wednesday", "majority"), code turns them into a time and a
 * number.
 */

import type { PollRules } from "../data/types";

export type PollOption = { id: string; label: string; votes: number; voters?: string[] };
export type Stamp = { kind: "passed" | "failed" | "won" | "tie"; label: string; sub: string };
export type PollOutcome = {
  closesAt: Date | null;
  needs: number | null;
  closed: boolean;
  /** the option the count is for: "yes" when there is one, else the leader */
  toward: PollOption | null;
  /** closed, or an option reached `needs`: no more votes, the stamp is on */
  done: boolean;
  stamp: Stamp | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** A Date as the card stores it: local "YYYY-MM-DDTHH:MM". */
export const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ISO_AT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/** The stored local datetime as a Date on this clock. */
export function closesDate(iso: unknown): Date | null {
  const m = typeof iso === "string" ? ISO_AT.exec(iso.trim()) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 21, m[5] ? Number(m[5]) : 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, "twenty-four": 24, "forty-eight": 48 };
const numOf = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM[s] ?? NaN);
const N = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|twenty-four|forty-eight)";
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY = "(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?";
const TIME = "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?|noon|midnight";

/** "9pm", "7", "noon" → [h, m]; a bare hour under 12 is the evening (a vote closes at 9, not 9 am). */
function timeOf(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t === "noon") return [12, 0];
  if (t === "midnight") return [23, 59];
  const m = new RegExp(`^(?:${TIME})$`).exec(t);
  if (!m || !m[1]) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && h < 12) h += 12;
  return h < 24 && min < 60 ? [h, min] : null;
}

/** Up to the next five minutes: "24 hours" from 3:17 reads "3:20", not "3:17". */
const ceil5 = (d: Date) => {
  const x = new Date(d);
  x.setSeconds(0, 0);
  x.setMinutes(Math.ceil(x.getMinutes() / 5) * 5);
  return x;
};

/**
 * When voting closes, from the words ("24 hours", "till wednesday", "friday
 * at 9", "tomorrow", "in 3 days"), as the card's local datetime. A day with
 * no time closes at 9 pm. An ISO datetime is taken as it is (already resolved).
 */
export function closesFromWords(words: string, now: Date = new Date()): string | null {
  const iso = words.trim().toUpperCase();
  if (ISO_AT.test(iso)) return closesDate(iso) ? (iso.length > 10 ? iso : `${iso}T21:00`) : null;
  const t = words.trim().toLowerCase().replace(/[.,!?]+$/, "");
  if (!t) return null;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`\\b${N}\\s*-?\\s*(h|hrs?|hours?|days?|weeks?|wks?|mins?|minutes?)\\b`).exec(t))) {
    const n = numOf(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = m[2][0] === "h" ? 3_600_000 : m[2][0] === "d" ? 86_400_000 : m[2][0] === "w" ? 7 * 86_400_000 : 60_000;
    return localIso(ceil5(new Date(now.getTime() + n * unit)));
  }
  const at = new RegExp(`(?:at\\s+|by\\s+)?(${TIME})\\s*$`).exec(t.replace(/\s*(?:night|evening)$/, ""));
  const hm = timeOf(at?.[1]) ?? [21, 0];
  const day = (plus: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + plus, hm[0], hm[1]);
    return localIso(d);
  };
  if (/\b(tonight|today|end of (the )?day|eod)\b/.test(t)) return day(0);
  if (/\btomorrow\b/.test(t)) return day(1);
  if ((m = new RegExp(`\\b(?:(this|next)\\s+)?(${WEEKDAY})\\b`).exec(t))) {
    const i = DAYS.findIndex((x) => m![2].startsWith(x));
    let plus = (i - now.getDay() + 7) % 7;
    // today, but its hour has gone: next week's
    if (plus === 0 && new Date(now.getFullYear(), now.getMonth(), now.getDate(), hm[0], hm[1]) <= now) plus = 7;
    return day(plus);
  }
  // a time alone ("by 9"): today, or tomorrow when it has passed
  if (at && timeOf(at[1])) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hm[0], hm[1]);
    return day(today <= now ? 1 : 0);
  }
  return null;
}

/**
 * The votes it needs, from the words ("8", "8 of 12", "majority", "two
 * thirds", "unanimous"); `people` = how many vote when the words don't say
 * ("of 12" does).
 */
export function needsFromWords(words: string, people: number): number | null {
  const t = words.trim().toLowerCase();
  if (!t) return null;
  const of = new RegExp(`(?:of|out of)\\s+(?:the\\s+)?${N}`).exec(t);
  const total = of ? numOf(of[1]) : people;
  const n = /\bmajority\b|\bhalf\b/.test(t)
    ? Math.floor(total / 2) + 1
    : /\b(unanimous|everyone|all of us|every(?:one|body))\b/.test(t)
      ? total
      : /\b(two[-\s]thirds|2\/3)\b/.test(t)
        ? Math.ceil((total * 2) / 3)
        : numOf(new RegExp(`^(?:needs?\\s+)?${N}\\b`).exec(t)?.[1] ?? "");
  return Number.isFinite(n) && n >= 1 ? Math.min(50, Math.round(n)) : null;
}

const CLOSES_SAID = new RegExp(
  `\\b(?:${N}\\s*-?\\s*(?:h|hrs?|hours?|days?|weeks?)\\b|(?:till|until|til|by|through|thru|closes?|closing|ends?|ending|vote ends)\\s+(?:on\\s+)?(?:(?:this|next)\\s+)?(?:${WEEKDAY}|tomorrow|tonight|today)(?:\\s+(?:night|evening))?(?:\\s+(?:at\\s+)?(?:${TIME}))?)`,
  "i",
);
const NEEDS_SAID = new RegExp(
  `\\b(?:needs?\\s+(?:a\\s+)?(?:two[-\\s]thirds|2/3|${N}(?:\\s+(?:of|out of)\\s+${N})?|majority(?:\\s+of\\s+${N})?|everyone)|${N}\\s+(?:of|out of)\\s+${N}\\s+(?:to pass|needed|votes)|(?:simple\\s+)?majority(?:\\s+(?:vote|wins|rules))?|unanimous)\\b`,
  "i",
);

/** The rules said anywhere in an ask ("put the trade up for a vote, 24 hours"): the phrases, and the words without them. */
export function rulesSaid(said: string): { closes?: string; needs?: string; rest: string } {
  let rest = said;
  const c = CLOSES_SAID.exec(said);
  if (c) rest = rest.replace(c[0], " ");
  const n = NEEDS_SAID.exec(rest);
  if (n) rest = rest.replace(n[0], " ");
  rest = rest.replace(/\s*,\s*(,\s*)*/g, ", ").replace(/(,\s*)+$/, "").replace(/\s+/g, " ").trim();
  return { ...(c ? { closes: c[0].replace(/^(till|until|til|by|through|thru|closes?|closing|ends?|ending|vote ends)\s+(on\s+)?/i, "") } : {}), ...(n ? { needs: n[0] } : {}), rest };
}

/**
 * A dealt poll's rules on the asker's screen, before it is drawn or sent:
 * a rule stands only when the words carry one (a model's guess at a deadline
 * nobody said is dropped), the model's words for it first, else the words'
 * own phrase; `closes` becomes this clock's local time, so the server's clock
 * (UTC) never resolves it.
 */
export function pinPollRules(settings: Record<string, unknown>, said: string, now: Date = new Date()): Record<string, unknown> {
  const r = rulesSaid(said);
  const given = (v: unknown) => (typeof v === "string" && v.trim()) || (typeof v === "number" && v > 0) ? String(v) : undefined;
  const { closes: c, needs: n, ...out } = settings;
  const closes = r.closes ? closesFromWords(given(c) ?? r.closes, now) ?? closesFromWords(r.closes, now) : null;
  const needs = r.needs ? given(n) ?? r.needs : undefined;
  return { ...out, ...(closes ? { closes } : {}), ...(needs ? { needs } : {}) };
}

const NO = /^(no|nope|nah|nay|reject|against|keep it)\b/i;
const YES = /^(yes|yeah|yep|yea|aye|approve|pass|do it|for)\b/i;

/** Where a poll stands under its rules on this clock. A poll without rules is never done. */
export function pollOutcome(data: Record<string, unknown> & PollRules, options: PollOption[], now: Date = new Date()): PollOutcome {
  const closesAt = closesDate(data.closesAt);
  const needs = typeof data.needs === "number" && data.needs > 0 ? data.needs : null;
  const closed = !!closesAt && now.getTime() >= closesAt.getTime();
  const top = Math.max(0, ...options.map((o) => o.votes));
  const leaders = options.filter((o) => o.votes === top && top > 0);
  const toward = options.find((o) => YES.test(o.label)) ?? leaders[0] ?? options[0] ?? null;
  const reached = needs ? options.find((o) => o.votes >= needs) : undefined;
  let stamp: Stamp | null = null;
  if (needs && reached) {
    const no = NO.test(reached.label);
    stamp = no ? { kind: "failed", label: "failed", sub: `${reached.votes} said ${reached.label.toLowerCase()}` } : { kind: "passed", label: "passed", sub: YES.test(reached.label) ? `${reached.votes} of ${needs}` : `${reached.label.toLowerCase()} · ${reached.votes} of ${needs}` };
  } else if (closed && needs) {
    stamp = { kind: "failed", label: "failed", sub: `${toward?.votes ?? 0} of ${needs}` };
  } else if (closed) {
    stamp = leaders.length === 1 ? { kind: "won", label: leaders[0].label.toLowerCase(), sub: "won" } : { kind: "tie", label: leaders.length ? "tie" : "no votes", sub: leaders.length ? leaders.map((o) => o.label.toLowerCase()).join(" · ") : "closed" };
  }
  return { closesAt, needs, closed, toward, done: closed || !!(needs && reached), stamp };
}

/** "closes in 3h", "closes wed 9:00 pm", "closed wed 9:00 pm" — lowercase house voice. */
export function closesLabel(at: Date, now: Date = new Date()): string {
  const ms = at.getTime() - now.getTime();
  const h = at.getHours();
  const clock = `${h % 12 || 12}:${pad(at.getMinutes())} ${h < 12 ? "am" : "pm"}`;
  if (ms <= 0) return `closed ${DAYS[at.getDay()]} ${clock}`;
  if (ms < 60 * 60_000) return `closes in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 12 * 3_600_000) return `closes in ${Math.round(ms / 3_600_000)}h`;
  return `closes ${DAYS[at.getDay()]} ${clock}`;
}
