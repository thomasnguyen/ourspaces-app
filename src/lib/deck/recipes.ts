/**
 * Recipes: a known chain of linked cards, wired by code (path-to-win §3 "Fast
 * by construction"). The model picks a recipe and fills a few slots; it never
 * composes the cards or the links. Code turns the slots into the parts (each
 * an ordinary deck card), lays them out as one tidy group inside a frame, and
 * says which part points at which (standings → its check-in) and in what
 * order they are written, so they stream onto every screen one at a time.
 *
 * A second recipe is one more entry in RECIPES: slots, a size, and `parts`.
 */
import { list, num, text, type Infer, type Need, type Said, type Schema } from "./schema";
import { cardSize, getCard, revealOf, type CardContext } from "./catalog";
import { checkSettings } from "./schema";

/**
 * A link between two parts, as data (applied by code in a mutation,
 * convex/links.ts): the target waits on `from` ("waiting on <card>") until
 * `when` holds, then `fill` gets `value` from it.
 * when: "always" | "closed" | "winner" | "time" | "threshold"
 * value: "id" | "winner" | "yes" | "unclaimed" | "date"
 */
export type RecipeLink = { from: string; to: string; when: string; fill: string; value: string; tag?: string; at?: number };

/** One card of a recipe, frame-relative. `batch` = which write it goes out in. */
export type RecipePart = {
  /** The part's name inside the recipe, for links ("checkin", "standings"). */
  key: string;
  card: string;
  settings: Record<string, unknown>;
  at: { x: number; y: number };
  size: { w: number; h: number };
  z: number;
  rotate?: number;
  batch: number;
  /** This part waits on another (from `links`): written after it, linked to its id. */
  link?: Omit<RecipeLink, "to">;
  /** A field left empty for its link to fill (a countdown's date before the day is picked). */
  blank?: string;
  /** Its people, when not the room's (a split among whoever says yes starts with nobody). */
  people?: string[];
};

type RecipeDef<S extends Schema> = {
  id: string;
  use: string;
  slots: S;
  /** The whole group's footprint (the frame), for placing it. */
  size: { w: number; h: number };
  /** The card the stage shows while the answer streams (from the slots so far). */
  lead: (s: Partial<Infer<S>>) => { card: string; settings: Record<string, unknown> };
  parts: (s: Infer<S>, ctx: CardContext) => Omit<RecipePart, "link">[];
  /** Which part feeds which: the flow. A target is written after its source. */
  links: RecipeLink[];
  /** What it can't do without (lib/deck/needs.ts): asked for before it builds. */
  needs?: Need[];
  /** A flow (W2): two cards, the second fed by the first. `cue` = the words that pick it, by code. */
  flow?: { cue: RegExp };
};
const recipe = <S extends Schema>(def: RecipeDef<S>) => def;

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const COUNT = ["", "just one of us", "the two of us", "the three of us", "the four of us", "the five of us", "the six of us", "the seven of us", "the eight of us"];
const plural = (s: string) => (/s$/i.test(s) ? s : `${s}s`);

/** Two cards side by side with room for the thread between them: each card's spot and the pair's footprint. */
const GAP = 150;
function pair(a: string, b: string) {
  const sa = cardSize(getCard(a)!);
  const sb = cardSize(getCard(b)!);
  const h = Math.max(sa.h, sb.h);
  return {
    a: { at: { x: 0, y: Math.round((h - sa.h) / 2) }, size: sa },
    b: { at: { x: sa.w + GAP, y: Math.round((h - sb.h) / 2) + 24 }, size: sb },
    size: { w: sa.w + GAP + sb.w, h: h + 24 },
  };
}
const whereFor = (s: { meal?: string; day?: string }) => `where for ${(s.meal ?? "dinner").toLowerCase()}${s.day ? ` ${s.day.toLowerCase()}` : ""}?`;
/** What the hangout is for, when the words said one ("a movie"); the ask itself ("when can we all hang out") isn't one. */
const hangWhat = (s: { what?: string }) => (s.what && !/\b(when|hang|free|meet|get together)\b/i.test(s.what) ? s.what.toLowerCase() : null);
const hangTitle = (s: { what?: string }) => (hangWhat(s) ? `when can we all do ${hangWhat(s)}` : "when can we all hang out");

export const RECIPES = [
  recipe({
    id: "challenge",
    use: "RECIPE: a group challenge, already linked: who's in (filled), a daily check-in, standings that rank it, the deal, a countdown to the reveal. For any \"challenge\" between people",
    slots: {
      activity: text(24),
      unit: text(20, { optional: true }),
      days: num(1, 14, { optional: true }),
      stake: text(90, { optional: true }),
      who: list(1, 12, { optional: true, itemMax: 32 }),
    },
    size: { w: 1266, h: 650 },
    links: [{ from: "checkin", to: "standings", when: "always", fill: "source", value: "id" }],
    needs: [{ field: "activity", ask: "a challenge of what?", slot: "add the activity", as: "text", has: (w: Said) => !!w.topic }],
    lead: (s) => ({ card: "checkin", settings: { ...(s.activity ? { title: s.activity } : {}), ...(s.unit ? { unit: s.unit } : {}), ...(s.days ? { days: s.days } : {}) } }),
    parts: (s, ctx) => {
      const days = s.days ?? 7;
      const unit = (s.unit ?? plural(s.activity)).toLowerCase();
      const title = s.activity.toLowerCase();
      const reveal = revealOf(ctx.today, days);
      const at = new Date(`${reveal.slice(0, 10)}T12:00:00Z`);
      const when = `${WEEKDAYS[at.getUTCDay()]} 9:00`;
      const stake = s.stake?.trim();
      return [
        { key: "frame", card: "frame", settings: { title: `${title} till ${WEEKDAYS[at.getUTCDay()]}`, subtitle: COUNT[ctx.people.length] ?? `${ctx.people.length} of us` }, at: { x: 0, y: 0 }, size: { w: 1266, h: 650 }, z: 2, batch: 0 },
        { key: "signup", card: "signup", settings: { title: "who's in" }, at: { x: 1054, y: 48 }, size: { w: 190, h: 250 }, z: 6, rotate: -1.5, batch: 0 },
        { key: "checkin", card: "checkin", settings: { title, unit, kind: "number", days }, at: { x: 24, y: 62 }, size: { w: 600, h: 420 }, z: 7, rotate: -0.6, batch: 1 },
        { key: "standings", card: "standings", settings: { title: "standings", ...(stake ? { stake } : {}) }, at: { x: 658, y: 56 }, size: { w: 372, h: 430 }, z: 7, rotate: 1, batch: 2 },
        { key: "deal", card: "note", settings: { label: "the deal", text: stake ? `${stake}. log before bed or it didn't happen.` : `one number a day. log before bed or it didn't happen. most ${unit} by ${when} wins.` }, at: { x: 24, y: 504 }, size: { w: 400, h: 128 }, z: 6, rotate: -1, batch: 3 },
        { key: "reveal", card: "countdown", settings: { event: `the reveal · ${when}`, date: reveal.slice(0, 10) }, at: { x: 1058, y: 320 }, size: { w: 182, h: 262 }, z: 6, rotate: 2, batch: 4 },
      ];
    },
  }),
  /* ---- Flows (W2): one ask, two cards, the second waits on the first. Code makes the pair, the link and the layout. ---- */
  recipe({
    id: "dinner",
    use: "FLOW: plan a meal out: a poll on where, then who's in, which takes the winning place when the poll is called. For \"plan dinner\" asks",
    flow: { cue: /\bplan (?:a |the |our |some )?(?:dinner|lunch|brunch|breakfast|drinks)\b|\b(?:dinner|lunch|brunch) plans?\b/i },
    slots: { meal: text(12, { optional: true }), day: text(16, { optional: true }), options: list(2, 5, { itemMax: 32 }) },
    size: pair("poll", "rsvp").size,
    links: [{ from: "poll", to: "rsvp", when: "closed|everyone", fill: "title", value: "winner", tag: "winner names it" }],
    // a new room has no saved places to choose from, so it asks (N1); a room with places fills the poll from them
    needs: [{ field: "options", ask: "where are we choosing between?", slot: "add the places", as: "list", has: (w: Said) => w.list.length >= 2 || !!w.roomPlaces }],
    lead: (s) => ({ card: "poll", settings: { question: whereFor(s), ...(s.options ? { options: s.options } : {}) } }),
    parts: (s) => {
      const at = pair("poll", "rsvp");
      return [
        { key: "poll", card: "poll", settings: { question: whereFor(s), options: s.options }, ...at.a, z: 7, rotate: -1, batch: 0 },
        { key: "rsvp", card: "rsvp", settings: { title: "who's in", ...(s.day ? { when: s.day.toLowerCase() } : {}) }, ...at.b, z: 7, rotate: 1.5, batch: 1 },
      ];
    },
  }),
  recipe({
    id: "hangout",
    use: "FLOW: find the day that works for everyone, then a countdown that starts counting to the day that wins. For \"when can we all hang out\" asks",
    flow: { cue: /\bwhen (?:can|could|are) we (?:all )?(?:hang ?out|meet up|get together|see each other|be free)\b|\bfind (?:a|the) day (?:to|we|for)\b/i },
    slots: { what: text(24, { optional: true }), days: list(2, 7, { itemMax: 10 }) },
    size: pair("availability", "countdown").size,
    links: [{ from: "availability", to: "countdown", when: "everyone|closed", fill: "targetDate", value: "date", tag: "the best day sets it" }],
    lead: (s) => ({ card: "availability", settings: { title: hangTitle(s), ...(s.days ? { days: s.days } : {}) } }),
    parts: (s) => {
      const at = pair("availability", "countdown");
      return [
        { key: "availability", card: "availability", settings: { title: hangTitle(s), days: s.days }, ...at.a, z: 7, rotate: -0.6, batch: 0 },
        { key: "countdown", card: "countdown", settings: { event: hangWhat(s) ?? "hanging out", date: "2000-01-01" }, blank: "date", ...at.b, z: 7, rotate: 2, batch: 1 },
      ];
    },
  }),
  recipe({
    id: "cabin",
    use: "FLOW: split a cost among whoever says yes: who's in, then a split among the yeses that updates as they answer. For \"split the X\" while people are still deciding",
    flow: { cue: /\bsplit (?:the |our )?[\w' -]{2,30}?\b(?:(?:with|among|between) (?:whoever|anyone|everyone who)|(?:whoever|if|once|when) (?:is |comes|says|people)|still deciding|who'?s in)\b|\bsplit (?:the |our )?(?:cabin|airbnb|house|rental|villa|lake house|beach house)\b/i },
    slots: { title: text(32), total: num(1, 100000, { optional: true }) },
    size: pair("rsvp", "split").size,
    links: [{ from: "rsvp", to: "split", when: "live", fill: "splits", value: "yes", tag: "whoever says yes splits it" }],
    needs: [{ field: "total", ask: "split how much?", slot: "add the total", as: "number", has: (w: Said) => w.number !== null }],
    lead: (s) => ({ card: "rsvp", settings: { title: s.title ? `who's in · ${s.title.toLowerCase()}` : "who's in" } }),
    parts: (s) => {
      const at = pair("rsvp", "split");
      return [
        { key: "rsvp", card: "rsvp", settings: { title: `who's in · ${s.title.toLowerCase()}` }, ...at.a, z: 7, rotate: -1.5, batch: 0 },
        { key: "split", card: "split", settings: { title: s.title.toLowerCase(), total: s.total ?? 1 }, ...(s.total ? {} : { blank: "total" }), people: [], ...at.b, z: 7, rotate: 1, batch: 1 },
      ];
    },
  }),
  recipe({
    id: "potluck",
    use: "FLOW: a sign-up list people claim from, then a wheel that deals whatever nobody claimed by the deadline. For \"who's bringing what\" asks",
    flow: { cue: /\bwho'?s bringing what\b|\bbringing what\b|\bpotluck sign-?ups?\b|\bsign-?ups? for the potluck\b/i },
    slots: { title: text(40), items: list(2, 8, { itemMax: 28 }), by: text(16, { optional: true }) },
    size: pair("checklist", "wheel").size,
    links: [{ from: "checklist", to: "wheel", when: "time|tap", fill: "slices", value: "unclaimed", tag: "deals what's left" }],
    lead: (s) => ({ card: "checklist", settings: { ...(s.title ? { title: s.title.toLowerCase() } : {}), ...(s.items ? { items: s.items } : {}) } }),
    parts: (s) => {
      const at = pair("checklist", "wheel");
      return [
        { key: "checklist", card: "checklist", settings: { title: s.title.toLowerCase(), items: s.items }, ...at.a, z: 7, rotate: -0.8, batch: 0 },
        { key: "wheel", card: "wheel", settings: { title: s.by ? `the rest · ${s.by.toLowerCase()}` : "the rest", options: ["…", "…"] }, blank: "options", ...at.b, z: 7, rotate: 1.5, batch: 1 },
      ];
    },
  }),
] as const;

export type RecipeId = (typeof RECIPES)[number]["id"];

/** The flow these words name, by code (its cue), or null. A flow is never the decide's pick: the words pick it. */
export function flowFor(said: string, facts?: { splits: { title: string; also: string[] }[]; rsvps: { title: string; yes: string[] }[] } | null): string | null {
  for (const r of RECIPES) {
    if (!(r as { flow?: { cue: RegExp } }).flow?.cue.test(said)) continue;
    // a cost whose people are already settled (a trip, a yes list for it) is a plain split among them, not a flow
    if (r.id === "cabin" && facts) {
      const w = said.toLowerCase().replace(/\bsplit\b|\bthe\b|\bour\b/g, " ").split(/[^a-z0-9]+/).filter((x) => x.length > 3);
      const hit = (t: string) => w.some((x) => t.toLowerCase().includes(x));
      if (facts.splits.some((x) => hit(x.title) || x.also.some(hit)) || facts.rsvps.some((x) => x.yes.length > 0 && hit(x.title))) continue;
    }
    return r.id;
  }
  return null;
}
/** Is this a flow (two cards, a thread) rather than a framed group like the challenge? */
export const isFlow = (id: string | null | undefined) => !!id && !!(getRecipe(id) as { flow?: unknown } | undefined)?.flow;
const BY_ID = new Map<string, (typeof RECIPES)[number]>(RECIPES.map((r) => [r.id, r]));
export const getRecipe = (id: string) => BY_ID.get(id);
export const isRecipe = (id: string | null | undefined) => !!id && BY_ID.has(id);

/** A recipe line from the model: its slots checked like a card's settings. */
export function checkRecipe(id: string, raw: unknown) {
  const def = getRecipe(id)!;
  return checkSettings(def.slots as Schema, raw);
}

/** The recipe's parts, for these slots and these people. Pure. */
export function expandRecipe(id: string, slots: Record<string, unknown>, ctx: CardContext): RecipePart[] {
  const def = getRecipe(id);
  if (!def) return [];
  const parts = (def.parts as (s: unknown, c: CardContext) => RecipePart[])(slots, ctx);
  return parts.map((p) => {
    const l = def.links.find((x) => x.to === p.key);
    return l ? { ...p, link: { from: l.from, when: l.when, fill: l.fill, value: l.value, ...(l.tag ? { tag: l.tag } : {}), ...(l.at ? { at: l.at } : {}) } } : p;
  });
}

/** What the stage shows for a recipe still streaming: its lead card. */
export function recipeLead(id: string, slots: Record<string, unknown>) {
  return (getRecipe(id)!.lead as (s: unknown) => { card: string; settings: Record<string, unknown> })(slots);
}
