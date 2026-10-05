/**
 * It asks for what's missing (C1). Each deck card declares the fields it
 * can't do without and the question for each (`needs` in catalog.ts and
 * recipes.ts). Code reads what the words already give (`saidOf`), asks for
 * the first field nothing stands on, maps a spoken answer onto that field
 * only (`mapAnswer`), and, if the person walks away, builds the card with its
 * empty slot marked (`apply.ts` `unfinished`), which `fillSlot` fills later
 * from a tap or a sentence. Pure; no model anywhere in here.
 */
import { getCard } from "./catalog";
import { cueOf } from "./guess";
import { getRecipe } from "./recipes";
import type { RoomFacts } from "./resolve";
import type { Need, Said } from "./schema";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH = `(?:${MONTHS.join("|")})[a-z]*\\.?`;
const WEEKDAY = "(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?";
/** A date phrase in words, longest forms first. */
const DATE_PHRASE = new RegExp(
  `\\b(?:on\\s+)?(?:${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?|(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+of\\s+${MONTH}|\\d{1,2}/\\d{1,2}|(?:this\\s+|next\\s+)?${WEEKDAY}|tomorrow|tonight|in\\s+(?:\\d+|a|one|two|three)\\s+(?:days?|weeks?)|the\\s+\\d{1,2}(?:st|nd|rd|th))\\b`,
  "i",
);
const WORD_NUM: Record<string, number> = { a: 1, one: 1, two: 2, three: 3 };

/** A date in the words, as the next such day from `today` (YYYY-MM-DD), and the phrase it came from. */
export function dateIn(text: string, today: string): { iso: string; phrase: string } | null {
  // a plain date ("2026-10-09", a day-finder's column) is itself
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (iso && !Number.isNaN(Date.parse(`${iso[1]}T12:00:00Z`))) return { iso: iso[1], phrase: iso[0] };
  const m = DATE_PHRASE.exec(text.toLowerCase());
  if (!m) return null;
  // "last sat" is a day that's gone, not one to count to
  if (/\blast\s*$/.test(text.toLowerCase().slice(0, m.index))) return null;
  const t = m[0].replace(/^on\s+/, "").trim();
  const base = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const plus = (n: number) => new Date(base.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const out = (iso: string | null) => (iso ? { iso, phrase: m[0] } : null);
  if (t === "tonight") return out(plus(0));
  if (t === "tomorrow") return out(plus(1));
  const rel = /^in\s+(\d+|a|one|two|three)\s+(day|week)/.exec(t);
  if (rel) return out(plus((Number(rel[1]) || WORD_NUM[rel[1]] || 1) * (rel[2] === "week" ? 7 : 1)));
  const wd = /^(?:(this|next)\s+)?([a-z]+)$/.exec(t);
  if (wd) {
    const i = DAYS.findIndex((d) => wd[2].startsWith(d));
    if (i >= 0) return out(plus((((i - base.getUTCDay() + 7) % 7) || 7) + (wd[1] === "next" && ((i - base.getUTCDay() + 7) % 7) > 0 ? 0 : 0)));
  }
  let y = base.getUTCFullYear();
  let mo = base.getUTCMonth();
  let dd = 0;
  const md = new RegExp(`^(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})`).exec(t);
  const dm = new RegExp(`^(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${MONTHS.join("|")})`).exec(t);
  const sl = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  const th = /^the\s+(\d{1,2})/.exec(t);
  if (md) [mo, dd] = [MONTHS.indexOf(md[1]), Number(md[2])];
  else if (dm) [mo, dd] = [MONTHS.indexOf(dm[2]), Number(dm[1])];
  else if (sl) [mo, dd] = [Number(sl[1]) - 1, Number(sl[2])];
  else if (th) dd = Number(th[1]);
  else return null;
  let d = new Date(Date.UTC(y, mo, dd, 12));
  if (d < base) d = th ? new Date(Date.UTC(y, mo + 1, dd, 12)) : new Date(Date.UTC(++y, mo, dd, 12));
  return out(Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10));
}

/** A number in the words: "640", "$1,200", "1.2k". */
export function numberIn(text: string): number | null {
  const m = /\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "the choices are tacos, pho or pizza" → the three. Fewer than two items is no list. */
export function listIn(text: string): string[] {
  const t = text.replace(/^.*?\b(?:are|is|between|from|choices?:?|options?:?)\s+/i, (m) => (/,| or | and /.test(text.slice(m.length)) ? "" : m)).replace(/[.!?]+$/, "");
  const tail = t.includes(":") ? t.slice(t.indexOf(":") + 1) : t;
  if (!/,| or | and /i.test(tail)) return [];
  const items = tail.split(/\s*,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+/i).map((s) => s.trim().replace(/^(?:the|a|an|maybe)\s+/i, "")).filter(Boolean);
  return items.length >= 2 ? items.slice(0, 8) : [];
}

const LEAD = /^(?:(?:hey|ok|okay|so|um|uh|alright|please|can you|could you|let'?s|we need|i want|give us)\b[\s,]*)+/i;
const FILLER = /\b(?:add|make|start|create|set up|put up|put|do|get|have|new|another|a|an|the|us|one|up|card|thing|please|for|about|on|of|to|with|called|named|our|my|some|it|poll|wheel|list|checklist|countdown|note|split|rsvp|question|challenge|check-?in|plan|vote)\b/gi;

/** What the words are about once the card's own words are gone: "add a poll" → "". */
export function topicOf(text: string, card: string): string {
  let t = text.toLowerCase().replace(LEAD, "");
  const cue = cueOf(card === "challenge" ? "checkin" : card);
  if (cue) t = t.replace(new RegExp(cue.source, "gi"), " ");
  return t.replace(FILLER, " ").replace(/[^\p{L}\p{N}'$ ]+/gu, " ").replace(/\s+/g, " ").trim();
}

const wordsOf = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

/** What the words (and the answers so far) give this card. */
export function saidOf(text: string, card: string, facts: RoomFacts | null, today: string): Said {
  const date = dateIn(text, today);
  const raw = topicOf(text, card);
  const topic = (date ? raw.replace(new RegExp(date.phrase.replace(/^on\s+/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ") : raw).replace(/\b(?:on|in|this|next)\b/g, " ").replace(/\s+/g, " ").trim();
  const tw = wordsOf(topic);
  const roomDate = !!facts?.dates.some((d) => d.days >= 0 && wordsOf(d.title).some((w) => tw.includes(w) || tw.includes(w.replace(/'s$/, ""))));
  return { text, topic, list: listIn(text), date: date?.iso ?? null, number: numberIn(text), roomDate, roomPlaces: !!facts?.places.length };
}

/** A card's (or a recipe's) must-have fields. */
export const needsOf = (card: string): Need[] => (getCard(card) as { needs?: Need[] } | undefined)?.needs ?? (getRecipe(card) as { needs?: Need[] } | undefined)?.needs ?? [];

/** The fields nothing stands on yet, in the deck's order. `answers` are the fields already answered. */
export function missingNeeds(card: string, text: string, facts: RoomFacts | null, today: string, answers: Record<string, unknown> = {}): Need[] {
  const w = saidOf(text, card, facts, today);
  return needsOf(card).filter((n) => !(n.field in answers) && !n.has(w));
}

/** Words people put in front of an answer: "it's", "the choices are". */
const ANSWER_LEAD = /^(?:(?:um|uh|so|ok|okay|well|hmm)[\s,]+)*(?:(?:it'?s|it is|its|about|for|on|to|that'?s|the (?:question|choices?|options?|total|date|list|title) (?:is|are)|(?:choices?|options?) are|make it|let'?s say|say)\s+)?/i;

/**
 * A spoken answer onto the field it was asked for, by code. Null when the
 * words aren't that kind of answer (no list, no date, no number), so the
 * question stands. A "what and when" question also takes the date.
 */
export function mapAnswer(n: Need, answer: string, today: string): Record<string, unknown> | null {
  const a = answer.trim().replace(ANSWER_LEAD, "").replace(/[.!]+$/, "").trim();
  if (!a) return null;
  switch (n.as) {
    case "text": {
      const date = n.alsoDate ? dateIn(a, today) : null;
      const text = (date ? a.replace(date.phrase, " ") : a).replace(/\s+(?:on|in)\s*$/i, "").replace(/\s+/g, " ").trim();
      if (!text) return null;
      return { [n.field]: text.toLowerCase(), ...(date && n.alsoDate ? { [n.alsoDate]: date.iso } : {}) };
    }
    case "list": {
      const items = listIn(a);
      return items.length >= 2 ? { [n.field]: items.map((s) => s.toLowerCase()) } : null;
    }
    case "date": {
      const d = dateIn(a, today);
      return d ? { [n.field]: d.iso } : null;
    }
    case "number": {
      const x = numberIn(a);
      return x !== null ? { [n.field]: x } : null;
    }
  }
}

/** The question for a field, as a poll's question reads ("the team name" → "the team name?"). */
export const asQuestion = (s: string) => (/[?]$/.test(s) ? s : `${s}?`);

/**
 * An answered field as the card's setting: a poll's question gets its
 * question mark, the rest go in as code mapped them.
 */
export function pinsFor(card: string, answers: Record<string, unknown>): Record<string, unknown> {
  const out = { ...answers };
  if (card === "poll" && typeof out.question === "string") out.question = asQuestion(out.question);
  return out;
}

/** The card's settings the words alone give (the topic as its title-like field). For a card that lands unfinished. */
export function settingsFromWords(card: string, text: string, facts: RoomFacts | null, today: string): Record<string, unknown> {
  const w = saidOf(text, card, facts, today);
  const first = needsOf(card)[0];
  const out: Record<string, unknown> = {};
  if (first?.as === "text" && w.topic) out[first.field] = card === "poll" ? asQuestion(w.topic) : w.topic;
  if (card === "countdown" && w.date) out.date = w.date;
  if (card === "split" && w.number !== null) out.total = w.number;
  if (w.list.length >= 2 && needsOf(card).some((n) => n.as === "list")) out[needsOf(card).find((n) => n.as === "list")!.field] = w.list;
  return out;
}

/* ---------- The empty slot on the board ---------- */

/** What an unfinished card carries in its data: the field, the mark, the question, who asked. */
export type Unfinished = { field: string; slot: string; ask: string; by: string; byUserId?: string; card: string };

/** The data keys a setting lands in, per widget type (the slot is blank in these). */
function blank(type: string, data: Record<string, unknown>, field: string): Record<string, unknown> {
  const d = { ...data };
  if (type === "poll" && field === "options") d.options = [];
  else if (type === "poll" && field === "question") d.question = "";
  else if (type === "countdown" && field === "date") Object.assign(d, { targetDate: "", value: "?", unit: "days to go", date: "when?" });
  else if (type === "countdown" && field === "event") d.event = "";
  else if (type === "expenseSplit" && field === "total") {
    d.total = 0;
    d.splits = ((d.splits as { name: string }[]) ?? []).map((r) => ({ name: r.name, owes: 0, paid: 0 }));
  } else if (type === "potluck" && field === "items") Object.assign(d, { items: [], openCount: 0 });
  else if (type === "wheel" && field === "options") d.slices = [];
  else if (type === "note" && field === "text") d.text = "";
  else if (field === "title" || field === "question") d[field] = "";
  return d;
}
export const blankSlot = blank;

/**
 * Fill an unfinished card's slot from what was typed or said: code maps the
 * words onto that one field. Null when the words aren't that kind of answer.
 */
export function fillSlot(w: { type: string; data: Record<string, unknown> }, said: string, today: string): Record<string, unknown> | null {
  const u = w.data.unfinished as Unfinished | undefined;
  if (!u) return null;
  const n = needsOf(u.card).find((x) => x.field === u.field);
  if (!n) return null;
  const got = mapAnswer(n, said, today);
  if (!got) return null;
  const { unfinished: _u, ...d } = w.data;
  const v = got[u.field];
  if (w.type === "poll" && u.field === "options") return { ...d, options: (v as string[]).slice(0, 5).map((label, i) => ({ id: "abcdefgh"[i], label, votes: 0, total: 0, voters: [] })) };
  if (w.type === "poll" && u.field === "question") return { ...d, question: asQuestion(String(v)) };
  if (w.type === "countdown" && u.field === "date") return { ...d, targetDate: v };
  if (w.type === "countdown" && u.field === "event") return { ...d, event: v, ...(got.date ? { targetDate: got.date } : {}) };
  if (w.type === "expenseSplit" && u.field === "total") {
    const rows = (d.splits as { name: string }[]) ?? [];
    const total = Number(v);
    const share = Math.round(total / Math.max(1, rows.length));
    const payer = String(u.by);
    return { ...d, total, splits: rows.map((r) => (r.name === payer ? { name: r.name, owes: 0, paid: total } : { name: r.name, owes: share, paid: 0 })) };
  }
  if (w.type === "potluck" && u.field === "items") return { ...d, items: (v as string[]).map((name) => ({ name, by: null, claimed: false })), openCount: (v as string[]).length };
  if (w.type === "wheel" && u.field === "options") return { ...d, slices: (v as string[]).map((label, i) => ({ id: "abcdefgh"[i], label })) };
  return { ...d, [u.field]: v };
}

/** Each offer for a question: words the room knows, what they fill, where they're from. */
export type NeedOffer = { label: string; from: string; fills: Record<string, unknown> };

const spoken = (s: string) => s.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/**
 * Offers that answer a question outright (no model): a countdown's what and
 * when from a date the room already has, a wheel's people from who said yes.
 * No facts, no offers.
 */
export function needOffers(f: RoomFacts | null, card: string, n: Need | undefined): NeedOffer[] {
  if (!f || !n) return [];
  const out: NeedOffer[] = [];
  if (card === "countdown" && (n.field === "event" || n.field === "date")) {
    // a date someone said on a card that isn't counted down to yet, then the board's own countdowns
    for (const r of [...f.rsvps.map((x) => ({ title: x.title, from: `who's in for “${spoken(x.title)}”` })), ...f.polls.map((x) => ({ title: x.title, from: `the “${spoken(x.title)}” poll` }))]) {
      const d = dateIn(r.title, f.today);
      const what = spoken(r.title.replace(d?.phrase ?? "", "")).replace(/[·?\s]+$/, "");
      if (d && what && out.length < 3) out.push({ label: `${what} · ${shortDate(d.iso)}`, from: r.from, fills: { event: what, date: d.iso } });
    }
    for (const d of f.dates.filter((x) => x.days > 0).sort((a, b) => a.days - b.days)) {
      if (out.length >= 3) break;
      out.push({ label: `${spoken(d.title)} · ${shortDate(d.date)}`, from: `the “${spoken(d.title)}” countdown`, fills: { event: spoken(d.title), date: d.date } });
    }
  }
  if (card === "wheel" && n.field === "options") {
    const r = f.rsvps.find((x) => x.yes.length >= 2);
    if (r) out.push({ label: r.yes.map((x) => x.toLowerCase()).join(", "), from: `who said yes to “${spoken(r.title)}”`, fills: { options: r.yes } });
    if (f.people.length >= 2) out.push({ label: "everyone here", from: "who's in the room", fills: { options: f.people } });
  }
  // asked only "when is it?": an offer gives the day, never another event's name
  if (n.field === "date") return out.slice(0, 3).map((o) => ({ label: `${shortDate(String(o.fills.date))} (${o.fills.event})`, from: o.from, fills: { date: o.fills.date } }));
  return out.slice(0, 3);
}
