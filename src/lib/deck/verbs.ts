/**
 * What kind of ask this is, before any card is picked (path-to-win §3 "What
 * the orb can do"). Seven verbs: make (the deck, as before), answer, recap,
 * do my part, go, start a game, edit. Code routes the obvious ones at 0 ms
 * from the words' shape; a question is answered from the room's facts by code
 * when it can; the decide's verb letter only breaks a tie (a question that
 * names a card the room doesn't have), and when it isn't sure the stage shows
 * both readings instead of guessing. Pure: no React, no Convex.
 */
import type { BoardItem } from "./existing";
import { guessCards } from "./guess";
import type { RoomFacts } from "./resolve";

export type Verb = "make" | "answer" | "recap" | "mine" | "go" | "game" | "edit";
export const VERBS: Verb[] = ["make", "answer", "recap", "mine", "go", "game", "edit"];

export type VerbPick = {
  verb: Verb;
  /** False: a question code can't place (make or answer); the decide breaks the tie at the pause. */
  sure: boolean;
  why: string;
  /** Do my part for somebody else: refused, with their name. */
  refuse?: string;
};

type W = { id: string; type: string; data: Record<string, unknown> };

const clean = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/[?.!]+\s*$/, "").replace(/\s+/g, " ").trim()
    .replace(/^((hey|ok|okay|so|um|uh|yeah|yes|please|alright|orb),?\s+)+/, "");

const RECAP = /\b(catch me up|catch up|what did i miss|what have i missed|what'?s new|what'?s been (happening|going on)|what happened|fill me in|recap|bring me up to (speed|date))\b/;
const GAME = /\b(let'?s play|play (a |some )?(game|most likely|would you rather|two truths|never have i ever|trivia)|start a game|most likely to|would you rather|truth or dare|never have i ever|two truths)\b/;
const GO = /^(take me (to|back to)|go (back )?to|show me|open( up)?|bring up|jump to|switch to|head to|find me)\b/;
const MINE =
  /^(i'?m (in|out|down|coming|not coming|not going|going|bringing|game)\b|i am (in|out|coming|not coming)\b|count me (in|out)\b|put me (down )?(for|on|in)\b|sign me up\b|i'?ll (bring|take|do|grab|handle|cover|be there|come)\b|i (can'?t|cannot|won'?t) (make it|come|go|do)\b|i (did|ran|walked|swam|logged|got) \d|i did it\b|i vote\b|my vote\b|vote$|vote (?!on\b|about\b|for (a|an|the|what|where|which|who)\b)(for )?\w|i (pick|choose)\b|i can (make it|come)\b)/;
const CARD_NOUN = /\b(poll|list|checklist|wheel|card|rsvp|countdown|split|sheet|sign-?up|note|question)\b/;
const EDIT_LEAD = /^(change|rename|remove|delete|edit|update|swap|take .+ off)\b/;
const QUESTION = /^(who|who'?s|whose|what|what'?s|whats|when|when'?s|where|where'?s|which|how|is|are|did|does|do|has|have|was|were|will|can|could|should|any)\b/;
/** Question-shaped words that ask for a tool to decide with: a card. */
const MAKE_Q =
  /\b(who'?s bringing what|bringing what|what (is|are) (everyone|people) bringing|who'?s (driving|cooking|hosting|picking|on (dishes|trash|bins|duty))|whose turn|when can (we|everyone)|when (are|is) (we|everyone) (all )?free|which (day|night|weekend|date) works|where should we|what should we|should we|who wants to|can (you|we) (add|make|set up|put|start|get|do))\b/;
/** Question words only an answer satisfies: status, the past, a count. */
const ANSWER_Q =
  /\b(did we|have we|hasn'?t|haven'?t|didn'?t|paid|owes?|how much|how many|winning|ahead|behind|leading|when'?s|when is|when does|what'?s the|what is the|who said|away|anyone|left|still|decided|decide|picked|landed|what are we doing|where are we|what time)\b/;

/** The people named in the words, other than the speaker. */
const othersNamed = (t: string, people: string[], me: string) =>
  people.filter((p) => p.toLowerCase() !== me.toLowerCase() && new RegExp(`\\b${p.toLowerCase()}\\b`).test(t));

/** Code's verb for these words (0 ms). */
export function routeVerb(said: string, ctx: { people: string[]; me: string }): VerbPick {
  const t = clean(said);
  if (!t) return { verb: "make", sure: false, why: "no words" };
  if (RECAP.test(t)) return { verb: "recap", sure: true, why: `"${RECAP.exec(t)![0]}"` };
  if (GAME.test(t)) return { verb: "game", sure: true, why: `"${GAME.exec(t)![0]}"` };
  // Do my part for somebody else: put maya down, jules is in, vote matcha for sam
  for (const name of othersNamed(t, ctx.people, ctx.me)) {
    const n = name.toLowerCase();
    const forThem = new RegExp(
      `^(put|sign|count|mark) ${n} (down|up|in|out|as|for)\\b|^${n}('s| is| will| can'?t| won'?t| did| votes?) (in|out|coming|not|bringing|be there|make it|\\d|for)|^(vote|rsvp|log) .+ (for|as) ${n}$|^(put|sign) (down )?${n}\\b`,
    );
    if (forThem.test(t)) return { verb: "mine", sure: true, why: `do my part for ${name}`, refuse: name };
  }
  if (MINE.test(t)) return { verb: "mine", sure: true, why: `first person: "${MINE.exec(t)![0]}"` };
  if (GO.test(t) && !/^show me (who|what|when|where|how)\b/.test(t)) return { verb: "go", sure: true, why: `"${GO.exec(t)![0]}"` };
  if (/^(where'?s|where is) (the|our|my) /.test(t) && CARD_NOUN.test(t)) return { verb: "go", sure: true, why: "where's the <card>" };
  if (/\b(what this (space|room) knows|knows page)\b/.test(t)) return { verb: "go", sure: true, why: "the knows page" };
  // Edit: "add ramen to the dinner poll" (not "add a poll to the board")
  const edit = /^(add|put) (.+?) (to|on|onto|in|into) (the|our|my) (.+)$/.exec(t);
  if (edit && !/^(a|an|another|one|some|new) /.test(edit[2]) && !CARD_NOUN.test(edit[2]) && CARD_NOUN.test(edit[5]))
    return { verb: "edit", sure: true, why: `"${edit[2]}" into the ${edit[5]}` };
  if (EDIT_LEAD.test(t) && CARD_NOUN.test(t)) return { verb: "edit", sure: true, why: `"${EDIT_LEAD.exec(t)![0]}" a card` };
  const question = QUESTION.test(t) || /\?\s*$/.test(said) || /^show me (who|what|when|where|how)\b/.test(t);
  if (question && !/^(can|could|will|would) you\b/.test(t) && !/^do (a|an|the|us|another)\b/.test(t)) {
    if (MAKE_Q.test(t)) return { verb: "make", sure: true, why: `asks for a tool: "${MAKE_Q.exec(t)![0]}"` };
    if (ANSWER_Q.test(t)) return { verb: "answer", sure: true, why: `a question: "${ANSWER_Q.exec(t)![0]}"` };
    // A question that names no card is a question; one that names a card the room may not have is the tie.
    const cue = guessCards(t);
    return cue.length
      ? { verb: "answer", sure: false, why: `a question naming a ${cue[0]}` }
      : { verb: "answer", sure: true, why: "a question, no card word" };
  }
  return { verb: "make", sure: true, why: guessCards(t).length ? `names a ${guessCards(t)[0]}` : "not a question" };
}

/* ---------- Answer from the room's facts (code, no model) ---------- */

export type Answer = {
  text: string;
  /** Where it came from, in a person's words: "the cake flavor? poll". */
  source: string;
  widgetId?: string;
  /** The fact lines (or snippets) it was read from, for the drawer. */
  facts: string[];
};

const STOP = new Set(
  ("a an the of for to on in at is are was were be do does did who whos whose what whats when whens where wheres which how " +
    "our we us it this that and or with my me i you your has have hasnt havent didnt not yet still left any anyone " +
    "s going coming doing paid pay owes owe bringing bring winning ahead behind leading decide decided pick picked about " +
    "day tell show know there their they them so far one").split(" "),
);
const topic = (s: string) =>
  new Set(clean(s).replace(/'s\b/g, "").replace(/'/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(es|s)$/, "")));
const shares = (a: Set<string>, title: string) => [...topic(title)].filter((w) => a.has(w));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const lower = (x: unknown) => String(x ?? "").toLowerCase();
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const nice = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const titleOf = (w: W) => lower(w.data.title ?? w.data.question ?? w.data.event ?? w.data.label ?? w.data.kicker ?? "");

/** Words that can't carry a match alone ("karaoke night" is not "game night"). */
const WEAK = new Set("night day party dinner lunch week weekend trip plan time thing card list poll friday saturday sunday monday tuesday wednesday thursday".split(" "));

/** The card among these that the words point at: by topic words (one that isn't weak), else the only one when the words name none. */
function pick(ws: W[], q: Set<string>, extra: (w: W) => string = () => ""): W | null {
  let best: { w: W; n: number } | null = null;
  for (const w of ws) {
    const both = shares(q, `${titleOf(w)} ${extra(w)}`);
    // a weak word alone ("night") is no match: one of the question's strong words must be on the card
    const strong = [...q].filter((x) => !WEAK.has(x));
    const n = !strong.length || strong.some((x) => both.includes(x)) ? both.length : 0;
    if (n && (!best || n > best.n)) best = { w, n };
  }
  if (best) return best.w;
  return ws.length === 1 && q.size === 0 ? ws[0] : null;
}

/**
 * A short true answer from the room's facts and the board's own cards, or
 * null when code can't. Every name, date and number is read off a row.
 */
export function answerFor(said: string, f: RoomFacts | null, widgets: W[], frames: (w: W) => string = () => ""): Answer | null {
  const t = clean(said);
  const q = topic(t);
  const of = (type: string) => widgets.filter((w) => w.type === type);

  // a running challenge: who leads, who hasn't logged
  if (/\b(winning|ahead|behind|leading|leader|first|last place|standings|score|logged|log today|streak)\b/.test(t) || (f?.challenges ?? []).some((c) => shares(q, `${c.title} ${c.unit}`).length)) {
    const c = f?.challenges?.[0];
    const w = of("checkIn").find((x) => !c || titleOf(x).includes(c.title.toLowerCase())) ?? of("checkIn")[0];
    if (c && c.totals.length) {
      const [a, b] = c.totals;
      const lead = b ? (a.total === b.total ? `${a.name.toLowerCase()} and ${b.name.toLowerCase()} are tied on ${a.total}` : `${a.name.toLowerCase()} leads with ${a.total} · ${b.name.toLowerCase()} ${a.total - b.total} behind`) : `${a.name.toLowerCase()} has ${a.total}`;
      const text = /\b(logged|log today|hasn'?t|haven'?t)\b/.test(t)
        ? c.waiting.length ? `${list(c.waiting.map((x) => x.toLowerCase()))} ${c.waiting.length === 1 ? "hasn't" : "haven't"} logged today` : "everyone's logged today"
        : `${lead} · day ${c.day} of ${c.days}`;
      return { text, source: `the ${c.title} check-in`, widgetId: w?.id, facts: [`challenge "${c.title}": ${c.totals.map((x) => `${x.name} ${x.total}`).join(", ")}; logged ${c.logged.join(", ") || "nobody"}`] };
    }
  }

  // a date: "when's maya's birthday", "how long till the party"
  if (/\b(when'?s|when is|when does|how long|how many days|what day)\b/.test(t)) {
    const ws = of("countdown");
    const w = pick(ws, q, (x) => lower(x.data.event));
    if (w) {
      const d = f?.dates.find((x) => x.title.toLowerCase() === lower(w.data.event));
      const iso = String(w.data.targetDate ?? "");
      const days = d?.days;
      const event = lower(w.data.event).replace(/\p{Extended_Pictographic}/gu, "").trim();
      const when = days === undefined ? "" : days < 0 ? ` · ${-days} days ago` : days === 0 ? " · today" : ` · in ${days} day${days === 1 ? "" : "s"}`;
      return { text: `${event} is ${nice(iso)}${when}`, source: `the ${event} countdown`, widgetId: w.id, facts: [`countdown "${event}" = ${iso}`] };
    }
  }

  // who paid / who still owes
  if (/\b(paid|pay|owes?|owe|money)\b/.test(t)) {
    const ws = of("expenseSplit");
    const w = pick(ws, q, (x) => lower((x.data.lastEmail as { label?: string } | undefined)?.label));
    if (w) {
      const rows = (w.data.splits as { name: string; owes: number; paid: number }[] | undefined) ?? [];
      const owe = rows.filter((r) => r.owes > 0);
      const title = titleOf(w).split(" · ")[0];
      const text = /\b(who paid|who'?s paid|has paid)\b/.test(t)
        ? `${list(rows.filter((r) => r.paid > 0).map((r) => `${r.name.toLowerCase()} $${r.paid}`))} paid`
        : owe.length
          ? `${list(owe.map((r) => `${r.name.toLowerCase()} ($${r.owes})`))} still ${owe.length === 1 ? "owes" : "owe"}`
          : "everyone's square";
      return { text, source: `the ${title} split`, widgetId: w.id, facts: rows.map((r) => `${r.name}: paid ${r.paid}, owes ${r.owes}`) };
    }
  }

  // who's bringing X / what's still open
  if (/\b(bringing|bring|got|claimed|taking|doing|has|left|open)\b/.test(t)) {
    for (const w of of("potluck")) {
      const items = (w.data.items as { name: string; by: string | null; claimed: boolean }[] | undefined) ?? [];
      const hit = items.find((it) => shares(q, it.name).length && shares(q, it.name).length >= topic(it.name).size / 2);
      if (hit) {
        const title = titleOf(w) || "the sign-up";
        return {
          text: hit.claimed && hit.by ? `${hit.by.toLowerCase()} has ${hit.name}` : `nobody has ${hit.name} yet`,
          source: `the ${title} list`,
          widgetId: w.id,
          facts: [`${title}: ${hit.name} = ${hit.by ?? "open"}`],
        };
      }
      if (/\b(left|open|still need)\b/.test(t) && (shares(q, `${titleOf(w)} ${frames(w)}`).length || of("potluck").length === 1)) {
        const open = items.filter((it) => !it.claimed).map((it) => it.name);
        return { text: open.length ? `still open: ${list(open)}` : "everything's taken", source: `the ${titleOf(w) || "sign-up"} list`, widgetId: w.id, facts: items.map((it) => `${it.name} = ${it.by ?? "open"}`) };
      }
    }
  }

  // who's coming / who's in
  if (/\b(coming|going|who'?s in|in for|said yes|rsvp|make it|who'?s out|can'?t come)\b/.test(t)) {
    const ws = of("rsvp");
    const w = pick(ws, q, (x) => frames(x)) ?? (q.size === 0 ? ws[0] : null);
    if (w) {
      const rows = (w.data.responses as { name: string; status: string }[] | undefined) ?? [];
      const by = (s: string) => rows.filter((r) => r.status === s).map((r) => r.name.toLowerCase());
      const r = f?.rsvps.find((x) => x.title.toLowerCase() === titleOf(w));
      const parts = [by("yes").length ? `${list(by("yes"))} ${by("yes").length === 1 ? "is" : "are"} in` : "nobody's in yet", by("no").length && `${list(by("no"))} can't`, by("maybe").length && `${list(by("maybe"))} maybe`, r?.waiting.length && `${list(r.waiting.map((x) => x.toLowerCase()))} hasn't said`].filter(Boolean);
      const name = frames(w) || titleOf(w);
      return { text: parts.join(" · "), source: `the ${name} rsvp`, widgetId: w.id, facts: rows.map((x) => `${x.name}: ${x.status}`) };
    }
  }

  // a decision or a poll: what did we pick, where are we eating
  if (/\b(decide|decided|pick|picked|going with|winning|won|vote|votes|leading|doing|eating|plan|chose|where are we|what are we)\b/.test(t)) {
    const dec = pick(of("decision"), q, (x) => lower(x.data.detail));
    if (dec) return { text: `${titleOf(dec)}: ${lower(dec.data.detail)}`, source: "the decision card", widgetId: dec.id, facts: [`decision "${titleOf(dec)}": ${lower(dec.data.detail)}`] };
    const w = pick(of("poll"), q, (x) => frames(x));
    if (w) return pollAnswer(w);
  }

  // who's away
  if (/\b(away|out of town|back|around|home)\b/.test(t) && f?.away.length) {
    const a = f.away.find((x) => q.has(x.name.toLowerCase())) ?? (f.away.length === 1 || /\b(who|anyone)\b/.test(t) ? f.away[0] : null);
    if (a) {
      const frame = widgets.find((w) => w.type === "frame" && titleOf(w).includes(a.name.toLowerCase()));
      const why = a.why.toLowerCase();
      return { text: why.startsWith(a.name.toLowerCase()) ? why : `${a.name.toLowerCase()} ${why.startsWith("is ") ? why : `is ${why}`}`, source: "the board", widgetId: frame?.id, facts: [`away: ${a.name} (${a.why})`] };
    }
  }

  // whose turn: where the wheel landed
  if (/\b(whose turn|landed|who got|wheel)\b/.test(t)) {
    const w = pick(of("wheel"), q);
    if (w && w.data.spunBy) {
      const slices = (w.data.slices as { label: string }[] | undefined) ?? [];
      const at = slices[Number(w.data.resultIndex ?? 0)]?.label;
      if (at) return { text: `the wheel landed on ${lower(at)}`, source: `the ${titleOf(w) || "wheel"}`, widgetId: w.id, facts: [`wheel "${titleOf(w)}": landed on ${at}, spun by ${w.data.spunBy}`] };
    }
  }

  // a pinned fact: the wifi, a code, an address
  if (/\b(what'?s the|what is the|password|code|wifi|address|rule)\b/.test(t) && q.size) {
    for (const w of widgets.filter((x) => x.type === "note" || x.type === "quote")) {
      const text = lower(w.data.text);
      if (shares(q, `${text} ${lower(w.data.kicker)}`).length) return { text: text.slice(0, 90), source: `${w.data.author ? `${lower(w.data.author)}'s ` : "a "}${w.type}`, widgetId: w.id, facts: [`${w.type}: ${text}`] };
    }
  }
  return null;
}

/** A poll's standing, counted by code. */
function pollAnswer(w: W): Answer {
  const opts = ((w.data.options as { label: string; votes?: number; voters?: string[] }[] | undefined) ?? []).map((o) => ({ label: lower(o.label), n: o.voters?.length ?? o.votes ?? 0 }));
  const sorted = [...opts].sort((a, b) => b.n - a.n);
  const total = opts.reduce((a, o) => a + o.n, 0);
  const text = !total
    ? "nobody's voted yet"
    : sorted[1] && sorted[0].n === sorted[1].n
      ? `it's tied: ${sorted.filter((o) => o.n === sorted[0].n).map((o) => `${o.label} ${o.n}`).join(", ")}`
      : `${sorted[0].label} leads · ${sorted[0].n} of ${total} votes`;
  return { text, source: `the ${titleOf(w)} poll`, widgetId: w.id, facts: opts.map((o) => `${o.label}: ${o.n}`) };
}

/**
 * Retrieval pointed at a card code can count itself: code's reading wins over
 * the model's words (live, the model named the losing option of a poll).
 */
export function cardAnswer(w: W): Answer | null {
  return w.type === "poll" ? pollAnswer(w) : null;
}

/* ---------- Go: a room, a card, the knows page ---------- */

const KIND_OF: Array<[RegExp, string]> = [
  [/\b(sign-?up|list|checklist)\b/, "checklist"],
  [/\bpoll\b/, "poll"],
  [/\bwheel\b/, "wheel"],
  [/\brsvp\b/, "rsvp"],
  [/\bcountdown\b/, "countdown"],
  [/\bsplit\b/, "split"],
];

export type GoTarget = { kind: "room"; slug: string; name: string } | { kind: "card"; item: BoardItem } | { kind: "knows" };

export function goFor(said: string, rooms: { slug: string; name: string; also?: string[] }[], board: BoardItem[], here: string): GoTarget | null {
  const t = clean(said);
  if (/\b(what (this|the) (space|room) knows|knows page|its brain|the brain)\b/.test(t)) return { kind: "knows" };
  const rest = t.replace(GO, "").replace(/^(where'?s|where is)\s+/, "").replace(/^(the|our|my)\s+/, "").trim();
  const q = topic(rest);
  if (CARD_NOUN.test(rest) || !rooms.some((r) => q.has(r.slug))) {
    let best: { item: BoardItem; n: number } | null = null;
    for (const item of board) {
      const n = shares(q, `${item.title} ${item.card}`).length;
      if (n && (!best || n > best.n)) best = { item, n };
    }
    if (best) return { kind: "card", item: best.item };
    // "the sign-up list": the one card of that kind
    const kind = KIND_OF.find(([re]) => re.test(rest))?.[1];
    const ofKind = kind ? board.filter((b) => b.card === kind) : [];
    if (ofKind.length === 1) return { kind: "card", item: ofKind[0] };
  }
  for (const r of rooms) {
    if (r.slug === here) continue;
    const names = [r.slug, r.name, ...(r.also ?? [])].map((x) => clean(x).replace(/^(the|us) /, ""));
    if (names.some((n) => n && new RegExp(`\\b${n}\\b`).test(rest))) return { kind: "room", slug: r.slug, name: r.name };
  }
  return null;
}

/* ---------- Do my part: the speaker's own answer on a card waiting on them ---------- */

export type MineAct =
  | { kind: "rsvp"; widgetId: string; title: string; status: "yes" | "no" | "maybe" }
  | { kind: "vote"; widgetId: string; title: string; optionId: string; label: string }
  | { kind: "claim"; widgetId: string; title: string; item: string };

export type MinePlan =
  | { kind: "do"; act: MineAct; text: string }
  | { kind: "offers"; acts: { act: MineAct; label: string }[]; why: string }
  | { kind: "none"; text: string };

const isMe = (name: unknown, me: string, userId?: unknown, myId?: string) => (myId && userId ? userId === myId : lower(name) === me.toLowerCase());

/**
 * What "i'm in for friday" / "vote matcha" / "put me down for balloons" does,
 * as the speaker only. Every act is the tap the card itself offers (your RSVP
 * row, your vote, an open slot for you). Two cards fit: offers, never a guess.
 */
export function mineFor(said: string, widgets: W[], me: string, myId?: string, frames: (w: W) => string = () => ""): MinePlan | null {
  const t = clean(said);
  const titled = (w: W) => frames(w) || titleOf(w) || w.type;

  // a vote: "vote matcha", "i vote for tacos", "my vote is pho"
  const v = /^(?:i vote(?: for)?|my vote(?: is| goes to)?|vote(?: for)?|i pick|i choose)\s+(.+)$/.exec(t);
  if (v) {
    const want = topic(v[1]);
    const acts: { act: MineAct; label: string }[] = [];
    for (const w of widgets.filter((x) => x.type === "poll")) {
      const restWords = new Set([...want].filter((x) => !topic(lower((w.data.options as { label: string }[])?.map((o) => o.label).join(" "))).has(x)));
      for (const o of (w.data.options as { id: string; label: string }[] | undefined) ?? []) {
        const n = shares(want, o.label).length;
        // the option's words, and any leftover words must point at this poll ("vote matcha on the cake poll")
        if (n && n >= topic(o.label).size / 2 && (![...restWords].length || shares(restWords, `${titleOf(w)} ${frames(w)}`).length))
          acts.push({ act: { kind: "vote", widgetId: w.id, title: titleOf(w), optionId: o.id, label: lower(o.label) }, label: `${lower(o.label)} · ${titleOf(w)}` });
      }
    }
    if (acts.length === 1) return { kind: "do", act: acts[0].act, text: `voted ${(acts[0].act as { label: string }).label} for you` };
    if (acts.length > 1) return { kind: "offers", acts, why: `"${v[1]}" is an option on ${acts.length} polls` };
    return { kind: "none", text: `no poll has "${v[1]}"` };
  }

  // a slot: "put me down for balloons", "i'll bring chips", "i'm bringing ice"
  const c = /^(?:put me (?:down )?(?:for|on)|sign me up for|i'?ll (?:bring|take|grab|do|handle|cover)|i'?m bringing|i'?ve got|i got)\s+(?:the |some )?(.+)$/.exec(t);
  if (c) {
    const want = topic(c[1]);
    const acts: { act: MineAct; label: string }[] = [];
    let taken: string | null = null;
    for (const w of widgets.filter((x) => x.type === "potluck")) {
      for (const it of (w.data.items as { name: string; by: string | null; claimed: boolean; byUserId?: string }[] | undefined) ?? []) {
        const n = shares(want, it.name).length;
        if (!n || n < topic(it.name).size / 2) continue;
        if (it.claimed && !isMe(it.by, me, it.byUserId, myId)) {
          taken = `${lower(it.by)} already has ${it.name}`;
          continue;
        }
        if (it.claimed) return { kind: "none", text: `you already have ${it.name}` };
        acts.push({ act: { kind: "claim", widgetId: w.id, title: titled(w), item: it.name }, label: `${it.name} · ${titled(w)}` });
      }
    }
    if (acts.length === 1) return { kind: "do", act: acts[0].act, text: `you're down for ${(acts[0].act as { item: string }).item}` };
    if (acts.length > 1) return { kind: "offers", acts, why: `"${c[1]}" is open on ${acts.length} lists` };
    return { kind: "none", text: taken ?? `no open slot for "${c[1]}"` };
  }

  // an rsvp: "i'm in for friday", "i can't make it", "maybe for game night"
  const status: "yes" | "no" | "maybe" | null = /\b(can'?t|cannot|won'?t|not (coming|going)|i'?m out|count me out)\b/.test(t)
    ? "no"
    : /\b(maybe|might)\b/.test(t)
      ? "maybe"
      : /\b(i'?m in|i am in|count me in|i'?m (coming|going|down)|i'?ll (be there|come)|i can (make it|come))\b/.test(t)
        ? "yes"
        : null;
  if (status) {
    const rest = t.replace(/^(i'?m (in|out|down|coming|not coming|not going|going)|i am (in|out|coming)|count me (in|out)|i'?ll (be there|come)|i (can'?t|cannot|won'?t) (make it|come|go)|i can (make it|come)|maybe)\b/, "");
    const want = topic(rest);
    const rsvps = widgets.filter((x) => x.type === "rsvp");
    const mine = (w: W) => ((w.data.responses as { name: string; userId?: string; status: string }[] | undefined) ?? []).find((r) => isMe(r.name, me, r.userId, myId));
    const named = want.size ? rsvps.filter((w) => shares(want, `${titleOf(w)} ${frames(w)}`).length) : [];
    const cands = want.size ? named : rsvps.filter((w) => !mine(w));
    const word = status === "yes" ? "in" : status === "no" ? "out" : "a maybe";
    if (cands.length === 1) {
      const w = cands[0];
      if (mine(w)?.status === status) return { kind: "none", text: `you're already ${word} for ${titled(w)}` };
      return { kind: "do", act: { kind: "rsvp", widgetId: w.id, title: titled(w), status }, text: `you're ${word} · ${titled(w)}` };
    }
    if (cands.length > 1) return { kind: "offers", acts: cands.map((w) => ({ act: { kind: "rsvp", widgetId: w.id, title: titled(w), status }, label: `${word} · ${titled(w)}` })), why: `${cands.length} rsvps fit` };
    return { kind: "none", text: want.size ? `no rsvp for ${[...want].join(" ")} on the board` : "no rsvp is waiting on you" };
  }
  return null;
}

/** The verb question for the decide (one letter), only when code can't place a question. */
export const VERB_LETTERS = ["A", "B"];
export const VERB_CHOICES: Verb[] = ["make", "answer"];
export const VERB_Q =
  "Does the speaker want a new card on the board, or an answer from what the space already knows?\nA make: put a new card on the board (a poll, a list, an rsvp, a wheel)\nB answer: tell them something the space already knows";
