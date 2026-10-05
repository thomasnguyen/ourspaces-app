/**
 * Room tokens: the model points at room facts instead of copying them. A
 * setting may hold `@coming`, `@everyone-but(Maya)`, `@leader(cake flavor?)`,
 * … and code expands them after the answer, from the same rows the room brief
 * is built from (`convex/roomBrief.ts` → `RoomFacts`). Names, dates and
 * filtering are code, so they can't be invented; the model only picks which
 * fact a setting should follow.
 *
 * Pure: room facts and the words in, the expanded card and a note per token
 * out. An unknown or empty token falls back to a plain value and says so.
 * Two rules run after the model too: the subject of a surprise or gift never
 * gets a job, and a card that repeats one on the board is flagged.
 */

/** What the room knows, as data. Built by `convex/roomBrief.ts` from rows. */
export type RoomFacts = {
  room: string;
  /** YYYY-MM-DD in the room's first clock zone (UTC without clocks). */
  today: string;
  people: string[];
  away: { name: string; why: string }[];
  rsvps: { title: string; yes: string[]; no: string[]; maybe: string[]; waiting: string[] }[];
  polls: { title: string; options: string[]; leader: string | null; lead: number; votes: number }[];
  /** Shared costs: who was on it, who paid most, other labels it went by (a mail's "tahoe cabin"). */
  splits: { title: string; also: string[]; total: number; people: string[]; payer: string | null; paid: number }[];
  wheels: { title: string; options: string[]; last: string | null }[];
  lists: { title: string; items: string[] }[];
  /** Saved links that are places (maps links, "… place"), by label. */
  places: string[];
  /** Countdown dates, `days` from today (negative = past). */
  dates: { title: string; date: string; days: number }[];
  clocks: { label: string; tz: string }[];
  /** The group's cards by deck name and title, for duplicate checks. */
  board: { card: string; title: string }[];
  lowercase: boolean;
  /** Facts a person told the space (`src/lib/roomKnows.ts`), each with who said it. They win over anything noticed. */
  told?: string[];
};

/** Facts plus who this ask's surprise or gift is for, if anyone. */
type Facts = RoomFacts & { subject?: string | null };

export type TokenName =
  | "home" | "coming" | "everyone-but" | "on-trip" | "payer" | "leader"
  | "places" | "date" | "last" | "zones" | "call-times" | "headcount" | "chores";

export const TOKENS: Record<TokenName, string> = {
  home: "people not marked away",
  coming: "who said yes on the RSVP (optional arg: its title)",
  "everyone-but": "people minus the names given",
  "on-trip": "people on a shared cost, by its title",
  payer: "who usually pays (most paid across shared costs; optional arg: a title)",
  leader: "the leading option of a poll, by its title",
  places: "the group's saved places",
  date: "a countdown's date, optionally shifted: @date(title, -2d)",
  last: "who a wheel last landed on, by its title",
  zones: "both people with their clock cities",
  "call-times": "this week's days with a good call time in both zones",
  headcount: "how many said yes",
  chores: "the chores this room already tracks (its wheels and lists)",
};

const CHORE = /\b(dish\w*|grocer\w*|trash|bins?|recycl\w*|laundry|vacuum\w*|clean\w*|sweep\w*|mop\w*|bathroom|kitchen|plants?|litter|dog walk\w*|cook\w*|shopping|errands?)\b/i;

/** The chores a room already tracks, by name: its chore wheels ("who does dishes" → dishes), lists ("grocery run · saturday" → grocery run), and the items of a chore list. */
export function choresOf(f: RoomFacts): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const name = t.split(/\s+[·:–-]\s+/)[0].replace(/^(who'?s|who|whose turn)\s+(does|is|on|to do|for)?\s*(the\s+)?/i, "").trim();
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  for (const w of f.wheels) if (CHORE.test(w.title)) add(w.title);
  for (const l of f.lists) {
    if (/\bchores?\b/i.test(l.title)) l.items.forEach(add);
    else if (CHORE.test(l.title)) add(l.title);
  }
  for (const b of f.board) if ((b.card === "note" || b.card === "checklist") && CHORE.test(b.title)) add(b.title);
  return out.slice(0, 8);
}

export type ResolveNote = {
  token: string;
  kind: "expanded" | "fallback" | "unknown" | "rule" | "unlisted-name";
  detail: string;
};

/** A raw card from the model: `{card, settings}` with tokens still in it. */
export type RawCard = { card: string; settings?: Record<string, unknown> };

export type Resolved = {
  card: string;
  /** Tokens expanded, `for` and `among` lifted out. Still unchecked: `checkCard` runs next. */
  settings: Record<string, unknown>;
  /** Who a split divides among (`among`): replaces the room's people when the card is applied. */
  people?: string[];
  /** One person per checklist item (`for`), in item order. */
  assignees?: string[];
  /** The card already on the board that this one repeats. */
  duplicateOf?: { card: string; title: string };
  notes: ResolveNote[];
};

type Value = string | string[];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("a an the of for to on in at is are does do did who whos what whats which s our we us this that tonight week".split(" "));
const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w && !STOP.has(w)).map((w) => w.replace(/s$/, "")));

/** Best fuzzy title match: shared words over the smaller set (`strict`: over the larger). */
function match<T>(items: T[], title: string | undefined, key: (t: T) => string[], strict = false): T | undefined {
  if (!items.length) return undefined;
  if (!title) return items[0];
  const want = words(title);
  let best: T | undefined;
  let score = 0;
  for (const it of items) {
    for (const k of key(it)) {
      const have = words(k);
      const shared = [...want].filter((w) => have.has(w)).length;
      const s = shared / Math.max(1, strict ? Math.max(want.size, have.size) : Math.min(want.size, have.size));
      if (s > score) [best, score] = [it, s];
    }
  }
  return score >= 0.5 ? best : undefined;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const without = (list: string[], drop: string[]) => list.filter((n) => !drop.some((d) => sameName(n, d)));
const member = (f: RoomFacts, name: string) => f.people.find((p) => sameName(p, name.replace(/['’]s$/i, "")));

const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const CITY: Record<string, string> = { Los_Angeles: "LA", New_York: "NY", Sao_Paulo: "São Paulo" };
const city = (tz: string) => {
  const last = tz.split("/").pop() ?? tz;
  return CITY[last] ?? last.replace(/_/g, " ");
};

function hourIn(tz: string, utcMs: number): { day: string; h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utcMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: get("weekday"), h: Number(get("hour")), m: Number(get("minute")) };
}
const short = (h: number, m: number) => `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;

/** Five days from tomorrow: the first clock's 7pm (or the evening hour that is daytime for the second), "Mon 7p·11a". */
export function callTimes(f: RoomFacts): string[] {
  const [a, b] = f.clocks;
  if (!a || !b) return [];
  const out: string[] = [];
  for (let d = 1; d <= 5; d++) {
    const base = Date.parse(`${isoOf(dayNo(f.today) + d)}T12:00:00Z`);
    // Find the UTC instant where `a` reads 17..21h on that local day and `b` is 8..22h.
    let pick: string | null = null;
    for (const want of [19, 20, 18, 21, 17]) {
      for (let off = -36; off <= 36 && !pick; off++) {
        const t = base + off * 3_600_000;
        const ha = hourIn(a.tz, t);
        if (ha.h !== want || ha.m !== 0) continue;
        if (ha.day !== hourIn(a.tz, base).day) continue;
        const hb = hourIn(b.tz, t);
        if (hb.h >= 8 && hb.h <= 22) pick = `${ha.day} ${short(ha.h, ha.m)}·${short(hb.h, hb.m)}`;
      }
      if (pick) break;
    }
    if (pick) out.push(pick);
  }
  return out;
}

/** Splits `a, b(c, d), e` on top-level commas. */
function args(s: string | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** `@name` or `@name(args)`, one nested level of parentheses in the args. */
const TOKEN_RE = /@([a-z][a-z-]*)(?:\(((?:[^()]|\([^()]*\))*)\))?/gi;

/**
 * One token → its value from the facts. Lists stay lists; scalars are strings.
 * `null` means unknown token name; an empty list or "" means the fact is missing.
 */
function expand(name: string, rawArgs: string | undefined, f: Facts, notes: ResolveNote[]): Value | null {
  const v = expandRaw(name, rawArgs, f, notes);
  // Rule: whoever a surprise or gift is for is in no people token of that ask.
  if (Array.isArray(v) && f.subject && PEOPLE_TOKENS.has(name.toLowerCase()) && v.some((n) => sameName(n, f.subject!))) {
    notes.push({ token: `@${name}`, kind: "rule", detail: `${f.subject} is who it's for, taken off` });
    return without(v, [f.subject]);
  }
  return v;
}

const PEOPLE_TOKENS = new Set(["home", "coming", "everyone-but", "on-trip"]);

function expandRaw(name: string, rawArgs: string | undefined, f: Facts, notes: ResolveNote[]): Value | null {
  const a = args(rawArgs).map((x) => {
    const inner = x.match(/^@([a-z][a-z-]*)(?:\((.*)\))?$/i);
    const v = inner ? expand(inner[1].toLowerCase(), inner[2], f, notes) : x;
    return Array.isArray(v) ? v : v ?? x;
  });
  const flat = a.flat();
  const awayNames = f.away.map((x) => x.name);
  switch (name.toLowerCase() as TokenName) {
    case "home":
      return without(f.people, awayNames);
    case "coming": {
      const r = match(f.rsvps, flat[0], (x) => [x.title]);
      return r?.yes.length ? r.yes : [];
    }
    case "everyone-but": {
      for (const n of flat) if (!member(f, n)) notes.push({ token: `@everyone-but(${n})`, kind: "unlisted-name", detail: `${n} is not in the room` });
      return without(f.people, flat.map((n) => n.replace(/['’]s$/i, "")));
    }
    case "on-trip":
      return match(f.splits, flat[0], (x) => [x.title, ...x.also])?.people ?? [];
    case "payer": {
      if (flat[0]) return match(f.splits, flat[0], (x) => [x.title, ...x.also])?.payer ?? "";
      const paid = new Map<string, number>();
      for (const s of f.splits) if (s.payer) paid.set(s.payer, (paid.get(s.payer) ?? 0) + s.paid);
      return [...paid].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
    }
    case "leader":
      return match(f.polls, flat[0], (x) => [x.title])?.leader ?? "";
    case "places":
      return f.places;
    case "date": {
      const c = match(f.dates, flat[0], (x) => [x.title]);
      if (!c) return "";
      const shift = Number((flat[1] ?? "0").replace(/d$/i, "")) || 0;
      const when = dayNo(c.date) + shift;
      if (when < dayNo(f.today)) {
        notes.push({ token: `@date(${flat.join(", ")})`, kind: "fallback", detail: `${isoOf(when)} is past, left out` });
        return "";
      }
      return isoOf(when);
    }
    case "last":
      return match(f.wheels, flat[0], (x) => [x.title])?.last ?? "";
    case "zones":
      return f.clocks.length >= 2 ? f.clocks.slice(0, 2).map((c) => `${c.label} ${city(c.tz)}`).join(" · ") : "";
    case "call-times":
      return callTimes(f);
    case "chores":
      return choresOf(f);
    case "headcount": {
      const r = match(f.rsvps, flat[0], (x) => [x.title]);
      return r?.yes.length ? String(r.yes.length) : "";
    }
    default:
      return null;
  }
}

/** The plain value an empty token falls back to, by token. */
function fallback(name: string, f: Facts): Value {
  switch (name.toLowerCase()) {
    case "coming":
    case "on-trip":
    case "home":
      return without(f.people, f.away.map((x) => x.name));
    default:
      return "";
  }
}

/** Expands every token in one string. A string that is a single list token stays a list. */
function expandString(s: string, f: Facts, notes: ResolveNote[]): Value {
  const whole = s.trim().match(new RegExp(`^${TOKEN_RE.source}$`, "i"));
  const one = (name: string, a: string | undefined, text: string): Value => {
    const before = notes.length;
    const v = expand(name, a, f, notes);
    if (v === null) {
      notes.push({ token: text, kind: "unknown", detail: "not a room token, left out" });
      return "";
    }
    if (v.length === 0) {
      const fb = fallback(name, f);
      if (notes.length > before) return fb;
      notes.push({ token: text, kind: "fallback", detail: fb.length ? `no such fact; used ${[fb].flat().join(", ")}` : "no such fact; left out" });
      return fb;
    }
    notes.push({ token: text, kind: "expanded", detail: [v].flat().join(", ") });
    return v;
  };
  if (whole) return one(whole[1], whole[2], s.trim());
  if (!s.includes("@")) return s;
  const GONE = "\u0000";
  const out = s.replace(TOKEN_RE, (text, name: string, a: string | undefined) => [one(name, a, text)].flat().join(", ") || GONE);
  // A dropped value takes its lead-in with it: "…, order by @date(…)" → "…".
  return out
    .replace(/\s*[,·;:–-]?\s*(?:(?:order|done|ready|due|bake|book)\s+)?(?:by|on|before|until|for|at)?\s*\u0000/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Settings that are lists in the deck; a list token there splices in. */
const LIST_KEYS = new Set(["options", "items", "days", "jokes", "for", "among"]);

function expandValue(v: unknown, f: Facts, notes: ResolveNote[]): unknown {
  if (typeof v === "string") return expandString(v, f, notes);
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (const x of v) {
      const e = expandValue(x, f, notes);
      if (Array.isArray(e) && typeof x === "string") out.push(...e);
      else if (e !== "") out.push(e);
    }
    // A list token can repeat a name the model also wrote out.
    return out.filter((x, i) => typeof x !== "string" || out.findIndex((y) => typeof y === "string" && sameName(y, x)) === i);
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => {
        const e = expandValue(x, f, notes);
        // A list token in a text setting reads as "a, b, c".
        return [k, Array.isArray(e) && typeof x === "string" && !LIST_KEYS.has(k) ? e.join(", ") : e];
      }),
    );
  }
  return v;
}

const asPeople = (v: unknown, f: RoomFacts, key: string, notes: ResolveNote[]): string[] => {
  const list = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\s*,\s*/) : []).filter((x): x is string => typeof x === "string" && !!x.trim());
  const kept: string[] = [];
  for (const n of list) {
    const m = member(f, n);
    if (m) kept.push(m);
    else notes.push({ token: `${key}: ${n}`, kind: "unlisted-name", detail: `${n} is not in the room, left out` });
  }
  return kept;
};

/** The deck name of each widget the duplicate check compares against. */
const TITLE_KEY: Record<string, string> = {
  poll: "question", checklist: "title", countdown: "event", rsvp: "title", wheel: "title", note: "label",
  question: "question", availability: "title", split: "title", itinerary: "title", messages: "title",
};

function duplicateOf(card: string, settings: Record<string, unknown>, f: RoomFacts): Resolved["duplicateOf"] {
  const title = settings[TITLE_KEY[card] ?? "title"];
  if (typeof title !== "string" || !title.trim()) return undefined;
  // A title naming someone the board's card doesn't ("ash's birthday" vs "birthday messages") is a new card.
  const named = (t: string) => f.people.filter((p) => words(t).has(norm(p).replace(/s$/, ""))).join();
  const same = f.board.filter((b) => b.card === card && named(b.title) === named(title));
  const hit = match(same, title, (b) => [b.title], true);
  return hit && { card: hit.card, title: hit.title };
}

/** Words that give a date by themselves: a month, a number, a day, or a day everyone knows. */
const WORDS_DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\d|\b(today|tonight|tomorrow|weekend|week|month|year|mon|tues?|wed|thur?s?|fri|sat|sun)[a-z]*\b|\b(new year|nye|christmas|xmas|halloween|thanksgiving|valentine|easter|hanukkah|diwali|eid|juneteenth|independence day|labor day|memorial day)/i;

/** A list people claim from themselves, and words that ask for the jobs to be handed out. */
const SIGN_UP = /\b(bring\w*|sign[- ]?ups?|potluck|pack\w*|volunteer\w*|claim\w*|grab)\b/i;
const HAND_OUT = /\b(assign\w*|give (everyone|each|every ?body|people)|hand (out|them)|split (it|them|up)|divide|chores?|jobs?|tasks?|rota|roster|who does what)\b/i;

/** Who a surprise or gift is for: a member named next to the occasion. */
export function giftSubject(said: string, f: RoomFacts): string | null {
  if (!/\b(surprise|gift|present|birthday|bday|b-day)\b/i.test(said)) return null;
  for (const p of f.people) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:['’]s)?\\b`, "i");
    if (re.test(said)) return p;
  }
  return null;
}

/** One card: tokens expanded, people settings checked against the room, the rules applied. */
export function resolveCard(raw: RawCard, room: RoomFacts, said: string): Resolved {
  const notes: ResolveNote[] = [];
  const subject = giftSubject(said, room);
  const f: Facts = { ...room, subject };
  const { for: forRaw, among: amongRaw, ...rest } = raw.settings ?? {};
  const settings = expandValue(rest, f, notes) as Record<string, unknown>;
  const out: Resolved = { card: raw.card, settings, notes };

  if (amongRaw !== undefined) out.people = asPeople(expandValue(amongRaw, f, notes), f, "among", notes);
  let pool = forRaw !== undefined ? asPeople(expandValue(forRaw, f, notes), f, "for", notes) : undefined;
  if (typeof settings.paidBy === "string") {
    if (!settings.paidBy) delete settings.paidBy;
    else if (!member(f, settings.paidBy)) {
      notes.push({ token: `paidBy: ${settings.paidBy}`, kind: "unlisted-name", detail: "not in the room, left out" });
      delete settings.paidBy;
    }
  }

  // Rule: the subject of a surprise or gift is never handed a job or a share,
  // even when the model wrote the names out instead of a token.
  if (subject) {
    const drop = (list: string[] | undefined, where: string) => {
      if (!list?.some((n) => sameName(n, subject))) return list;
      notes.push({ token: where, kind: "rule", detail: `${subject} is who it's for, taken off` });
      return without(list, [subject]);
    };
    pool = drop(pool, "for");
    out.people = drop(out.people, "among");
    if (raw.card === "wheel" && Array.isArray(settings.options)) settings.options = drop(settings.options as string[], "wheel options");
    if (typeof settings.paidBy === "string" && sameName(settings.paidBy, subject)) {
      notes.push({ token: "paidBy", kind: "rule", detail: `${subject} is who it's for, taken off` });
      delete settings.paidBy;
    }
  }

  // Rule: a sign-up sheet arrives with open slots, unless the words ask to hand the jobs out.
  if (pool?.length && raw.card === "checklist" && SIGN_UP.test(said) && !HAND_OUT.test(said)) {
    notes.push({ token: "for", kind: "rule", detail: "a sign-up: slots left open to claim" });
    pool = undefined;
  }

  if (pool?.length && Array.isArray(settings.items)) {
    out.assignees = (settings.items as unknown[]).map((_, i) => pool![i % pool!.length]);
  }

  // Rule: a plain date the words don't give (no month, number, day or holiday) is the model's guess, not a fact.
  const rawDate = raw.settings?.date;
  if (raw.card === "countdown" && typeof rawDate === "string" && !rawDate.includes("@") && !WORDS_DATE.test(said)) {
    notes.push({ token: "date", kind: "rule", detail: `${rawDate} isn't in the words or the room, left out` });
    delete settings.date;
  }
  // A countdown with no date the room or the words gave: this Saturday, said so.
  if (raw.card === "countdown" && !(typeof settings.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(settings.date))) {
    const t = dayNo(f.today);
    const sat = t + ((6 - new Date(`${f.today}T12:00:00Z`).getUTCDay() + 7) % 7 || 7);
    settings.date = isoOf(sat);
    notes.push({ token: "date", kind: "fallback", detail: `no date known; this Saturday, ${settings.date}, until someone sets it` });
  }

  // A poll needs two options; one fact (a single saved place) gets a plain second.
  if (raw.card === "poll" && Array.isArray(settings.options) && settings.options.length === 1) {
    settings.options = [...settings.options, "something else"];
    notes.push({ token: "options", kind: "fallback", detail: "one option; added \"something else\"" });
  }

  // Rule: a card the board already has is flagged, not silently doubled.
  const dup = duplicateOf(raw.card, settings, f);
  if (dup) {
    out.duplicateOf = dup;
    notes.push({ token: raw.card, kind: "rule", detail: `already on the board: ${dup.card} "${dup.title}"` });
    // Rule: a repeat of a wheel leaves out whoever it last landed on (turns rotate).
    const last = raw.card === "wheel" ? f.wheels.find((w) => w.title === dup.title)?.last : null;
    if (last && Array.isArray(settings.options) && settings.options.length > 2 && (settings.options as string[]).some((o) => sameName(o, last))) {
      settings.options = without(settings.options as string[], [last]);
      notes.push({ token: "options", kind: "rule", detail: `${last} had it last, left out` });
    }
  }
  return out;
}

/** Every card of one answer. */
export function resolveDeal(cards: RawCard[], f: RoomFacts, said: string): Resolved[] {
  return cards.map((c) => resolveCard(c, f, said));
}
