/**
 * "most likely to" in a live room: code picks the facts, the model only words
 * them. Pure and shared (convex/games.ts runs it on the server).
 *
 *   likelyFacts(lines, people)  the room's lines that are fair game, each with
 *                               a template prompt (the fallback wording)
 *   dealLikely(facts, seed)     five of them, one per kind first
 *   wordingAsk / readWording    the one small model call per game, validated
 *                               line by line; a bad line keeps its template
 *
 * Kind, not prying: only habits, claims, places, dates, poll leaders and
 * running jokes are eligible. Money (`payer:`, `split:`), what the AI made,
 * and anything that names a body, a debt or who likes whom never is.
 */
import type { KnowLine } from "../roomKnows";
import { isKind } from "./hotSeat";
import type { GamePrompt } from "./types";

export type LikelyFact = {
  key: string;
  kind: string;
  /** the fact in the room's words, for the model */
  fact: string;
  /** printed small under the prompt */
  from: string;
  /** the template wording: the fallback, and the model's example */
  template: Pick<GamePrompt, "text" | "award" | "glyph">;
};

/** Which knows-page keys a game may read. Everything else is not eligible. */
const ELIGIBLE = ["away", "poll", "rsvp", "day", "time", "places", "claims", "words", "date", "lowercase", "told"];
const NEVER = ["payer", "split", "made", "who"];

const low = (s: string) => s.trim().toLowerCase();
const plain = (s: string) => s.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") : s);

export function eligible(line: Pick<KnowLine, "key" | "text" | "why">): boolean {
  const kind = line.key.split(":")[0];
  return ELIGIBLE.includes(kind) && !NEVER.includes(kind) && isKind(line.key, line.text, line.why);
}

/** One knows-page line → one template prompt, or nothing if the line can't carry one. */
function template(line: KnowLine): LikelyFact | null {
  const kind = line.key.split(":")[0];
  const rest = line.key.slice(kind.length + 1);
  const t = low(plain(line.text));
  const base = { key: line.key, kind, fact: line.text };
  switch (kind) {
    case "away": {
      const who = low(rest);
      return { ...base, from: `${who} is away`, template: { text: "be away the week the plan finally lands", award: "out of office", glyph: "🧳" } };
    }
    case "poll": {
      const m = /^(.*?):\s*(.+?) is ahead, (\d+) of (\d+)/.exec(t);
      if (!m) return null;
      const leader = clip(m[2], 22);
      return { ...base, from: `${leader} is ahead in “${clip(m[1], 28)}”`, template: { text: `vote ${leader} for everything`, award: `${clip(leader, 14)} lobby`, glyph: "📊" } };
    }
    case "rsvp": {
      const m = /(\w+) hasn'?t answered/.exec(t);
      if (!m) return null;
      return { ...base, from: `${m[1]} hasn't answered “${clip(low(rest), 24)}”`, template: { text: "answer “who's coming” the morning of", award: "morning-of rsvp", glyph: "⏰" } };
    }
    case "day": {
      const d = low(rest);
      return { ...base, from: `${d} is our usual day`, template: { text: `say “${d}?” before anyone asks`, award: `${d} person`, glyph: "🪩" } };
    }
    case "time": {
      const at = low(rest);
      return { ...base, from: `${at} is our usual time`, template: { text: `show up at ${at} on the dot`, award: "on the dot", glyph: "⏱️" } };
    }
    case "places": {
      const first = t.replace(/^[^:]*:\s*/, "").split(/,\s*/)[0];
      if (!first) return null;
      return { ...base, from: `our places: ${clip(t.replace(/^[^:]*:\s*/, ""), 40)}`, template: { text: `pick ${clip(first, 24)} again`, award: `${clip(first, 16)} regular`, glyph: "🍜" } };
    }
    case "claims": {
      const item = t.replace(/^[^:]*:\s*/, "").split(/,\s*/)[0];
      if (!item) return null;
      return { ...base, from: `${low(rest)} takes things on`, template: { text: `claim the ${clip(item, 22)} again`, award: `${clip(item, 14)} rep`, glyph: "🙋" } };
    }
    case "words": {
      const words = t.replace(/^[^:]*:\s*/, "").split(/,\s*/).filter(Boolean);
      const w = words[1] ?? words[0];
      if (!w) return null;
      return { ...base, from: `${w}: a word we use a lot`, template: { text: `bring up ${w} unprompted`, award: `${clip(w, 14)} mention`, glyph: "💬" } };
    }
    case "date": {
      const title = low(plain(rest));
      return { ...base, from: `the ${clip(title, 28)} countdown`, template: { text: `count down to ${clip(title, 26)} out loud`, award: "the countdown", glyph: "📆" } };
    }
    case "lowercase":
      return { ...base, from: "we write titles in lowercase", template: { text: "type everything in lowercase", award: "lowercase", glyph: "⌨️" } };
    case "told": {
      const said = clip(t, 40);
      return { ...base, from: `someone told the space: ${said}`, template: { text: `say “${said}” again`, award: "said it first", glyph: "🗣️" } };
    }
  }
  return null;
}

/** Every eligible line of the room, as a fact with its template. Crossed-out lines are gone. */
export function likelyFacts(lines: KnowLine[], forgot: Array<{ key: string }> = [], told: Array<{ id: string; text: string }> = []): LikelyFact[] {
  const gone = new Set(forgot.map((f) => f.key));
  const all: KnowLine[] = [...lines, ...told.map((t) => ({ key: `told:${t.id}`, section: "habits" as const, text: t.text, why: "told", src: [] }))];
  return all.filter((l) => !gone.has(l.key) && eligible(l)).map(template).filter((f): f is LikelyFact => f !== null);
}

/** Five facts for a game: one per kind first (the dealt-before ones last), then seconds. */
export function dealLikely(facts: LikelyFact[], seed: number, max = 5): LikelyFact[] {
  const kinds = [...new Set(facts.map((f) => f.kind))];
  const rot = kinds.length ? seed % kinds.length : 0;
  const order = [...kinds.slice(rot), ...kinds.slice(0, rot)];
  const out: LikelyFact[] = [];
  for (let pass = 0; out.length < max && pass < 3; pass += 1)
    for (const kind of order) {
      const f = facts.filter((x) => x.kind === kind)[pass];
      if (f && out.length < max) out.push(f);
    }
  return out;
}

export const asPrompt = (f: LikelyFact, n: number, w = f.template): GamePrompt => ({ id: `${f.key}#${n}`, text: w.text, award: w.award, glyph: w.glyph, fact: f.key, from: f.from });

/* ---------- the one model call: wording only ---------- */

export function wordingAsk(facts: LikelyFact[], names: string[], game: string): { system: string; user: string } {
  return {
    system:
      `You word prompts for a party game called "${game}" in a friend group's shared board. ` +
      `For each numbered fact, write one line: n|prompt|award|emoji. The prompt finishes "${game}…", lowercase, 3 to 9 words, playful and kind, true to the fact. ` +
      `The award is a 1 to 3 word sticker title. One emoji. Never mention bodies, money, debts, dating or who likes whom. ` +
      `Don't name anyone; the players pick the person. No other text.`,
    user:
      `people: ${names.join(", ")}\n` +
      facts.map((f, i) => `${i + 1}. fact: ${f.fact} (example: ${i + 1}|${f.template.text}|${f.template.award}|${f.template.glyph})`).join("\n"),
  };
}

const EMOJI = /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*$/u;

/** The model's lines, checked one by one. A line that fails any check keeps its template. */
export function readWording(content: string, facts: LikelyFact[], names: string[]): { words: Array<LikelyFact["template"]>; kept: number; why: string[] } {
  const words = facts.map((f) => f.template);
  const why: string[] = [];
  let kept = 0;
  for (const raw of content.split("\n")) {
    const parts = raw.split("|").map((s) => s.trim());
    const n = Number(parts[0].replace(/\D/g, "")) - 1;
    if (parts.length !== 4 || !(n >= 0 && n < facts.length)) continue;
    const [text, award, glyph] = [low(parts[1]).replace(/^(most|more) likely to\s*/, "").replace(/[.…]+$/, ""), low(parts[2]), parts[3]];
    const bad =
      text.length < 8 || text.length > 60 ? "length" :
      award.length < 2 || award.length > 24 || award.split(/\s+/).length > 3 ? "award" :
      !EMOJI.test(glyph) ? "emoji" :
      !isKind(text, award) || /\b(money|paid|pay|owe|debt|bill|crush|date|fat|weight)\b/.test(text) ? "unkind" :
      names.some((name) => new RegExp(`\\b${low(name).replace(/[^a-z0-9]/g, "")}\\b`).test(text)) ? "names someone" : "";
    if (bad) { why.push(`${n + 1}:${bad}`); continue; }
    words[n] = { text, award, glyph };
    kept += 1;
  }
  return { words, kept, why };
}

/* ---------- the hot seat: the model rewords the question line only ---------- */

export function seatWordingAsk(asks: Array<{ text: string; about: string; from: string }>): { system: string; user: string } {
  return {
    system:
      "You reword quiz questions about a friend for a party game on a group's shared board. For each numbered question, write one line: n|question. " +
      "Keep the friend's name and the meaning, lowercase, end with a question mark, under 60 characters, warm and playful. Never give away the answer. No other text.",
    user: asks.map((a, i) => `${i + 1}. ${a.text} (about ${a.about.toLowerCase()}; from ${a.from})`).join("\n"),
  };
}

/** The reworded lines, each checked: names the person, a question, no answer in it, kind. Else the template stays. */
export function readSeatWording(content: string, asks: Array<{ text: string; about: string; right: string; options: string[] }>): { texts: string[]; kept: number; why: string[] } {
  const texts = asks.map((a) => a.text);
  const why: string[] = [];
  let kept = 0;
  for (const raw of content.split("\n")) {
    const at = raw.indexOf("|");
    const n = Number(raw.slice(0, at).replace(/\D/g, "")) - 1;
    if (at < 0 || !(n >= 0 && n < asks.length)) continue;
    const text = low(raw.slice(at + 1)).replace(/\s+/g, " ");
    const a = asks[n];
    const bad =
      text.length < 10 || text.length > 70 || !text.endsWith("?") ? "shape" :
      !text.includes(low(a.about)) ? "lost the name" :
      [a.right, ...a.options].some((o) => o && low(o).length > 1 && text.includes(low(o))) ? "gives an answer away" :
      !isKind(text) ? "unkind" : "";
    if (bad) { why.push(`${n + 1}:${bad}`); continue; }
    texts[n] = text;
    kept += 1;
  }
  return { texts, kept, why };
}

/** When a room knows fewer than three fair facts: house prompts, marked as not from this room. */
export const HOUSE_PROMPTS: LikelyFact[] = [
  { key: "house:reply", kind: "house", fact: "a house prompt", from: "a house prompt, not from this room", template: { text: "reply to the chat a day late", award: "fashionably late", glyph: "🐌" } },
  { key: "house:plan", kind: "house", fact: "a house prompt", from: "a house prompt, not from this room", template: { text: "plan the next thing on the board", award: "the planner", glyph: "🗓️" } },
  { key: "house:snacks", kind: "house", fact: "a house prompt", from: "a house prompt, not from this room", template: { text: "show up with snacks nobody asked for", award: "snack drop", glyph: "🍿" } },
];
