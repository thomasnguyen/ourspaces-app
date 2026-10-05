/**
 * The deck a fill is shown, per ask (eval: nebius/eval/v1-verbs.md). The
 * prompt carries only the 6–8 cards the words could plausibly mean, and only
 * their worked examples, so it stops growing with the deck. Code picks them,
 * no model: the cards the words name (every cue, `guessCards`), the decide's
 * pick when it ran, the cards the room facts the words point at feed (people
 * → wheel, a cost → split, places → poll, a date → countdown, …), the kinds
 * of the board's own cards that share a word with the ask, then the common
 * cards until there are six. A recipe is in only when its words are.
 */
import { CATALOG } from "./catalog";
import { guessCards } from "./guess";
import { flowFor, RECIPES } from "./recipes";

const KNOWN = new Set<string>([...CATALOG.map((c) => c.id), ...RECIPES.map((r) => r.id)]);
const MAX = 8;
/** The cards most asks mean when the words name none. */
const COMMON = ["poll", "checklist", "note", "rsvp", "wheel", "countdown"];

/** Room facts (the brain's menu lines) → the cards that use them. */
const FROM_FACT: Array<[RegExp, string[]]> = [
  [/^@(home|all|coming|everyone-but)\b/, ["wheel", "checklist"]],
  [/^@on-trip|^@payer/, ["split"]],
  [/^@places/, ["poll"]],
  [/^@date/, ["countdown"]],
  [/^@leader/, ["poll"]],
  [/^wheel "/, ["wheel"]],
  [/^@zones/, ["availability", "clocks"]],
  [/^@chores|^list "|^their lists/, ["checklist"]],
  [/^challenge "/, ["challenge", "standings"]],
];

const words = (s: string) => new Set(s.toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2).map((w) => w.replace(/s$/, "")));

/** `focus`: the cards with a reason beyond "common"; only theirs get worked examples. */
export type Shortlist = { cards: string[]; focus: string[]; why: string[] };

export function shortlistDeck(r: {
  said: string;
  /** The decide's pick (and runners-up) when it ran. */
  decided?: string[];
  /** The fact lines the brain route would send. */
  facts?: string[];
  /** The board's own cards, by deck card and title. */
  board?: { card: string; title: string }[];
  /** The flow code picked with the room's facts (null: none); unset = from the words alone. */
  flow?: string | null;
}): Shortlist {
  const out: string[] = [];
  const why: string[] = [];
  const add = (ids: string[], because: string) => {
    for (const id of ids) {
      if (!KNOWN.has(id) || out.includes(id) || out.length >= MAX) continue;
      out.push(id);
      why.push(`${id}: ${because}`);
    }
  };
  const named = guessCards(r.said);
  // a flow's words name it (code): it leads, its two cards follow
  const flow = r.flow !== undefined ? r.flow : flowFor(r.said);
  if (flow) add([flow], "the words name a flow");
  // "challenge" names the recipe; its lead card (the check-in) is the cue
  if (/\bchallenge\b/i.test(r.said)) add(["challenge"], "the words say challenge");
  add(named, "named in the words");
  add(r.decided ?? [], "the decide's pick");
  for (const line of r.facts ?? []) for (const [re, ids] of FROM_FACT) if (re.test(line)) add(ids, `a room fact (${line.split(/ = |: /)[0]})`);
  const said = words(r.said);
  for (const b of r.board ?? []) if ([...words(b.title)].some((w) => said.has(w))) add([b.card], `the board's "${b.title}"`);
  const focus = [...out];
  add(COMMON, "common");
  const keep = (c: string) => c !== "challenge" || /\b(challenge|streak|check-?in)\b/i.test(r.said);
  return { cards: out.filter(keep), focus: focus.filter(keep), why };
}
