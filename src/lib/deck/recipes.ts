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
import { list, num, text, type Infer, type Schema } from "./schema";
import { revealOf, type CardContext } from "./catalog";
import { checkSettings } from "./schema";

/**
 * A link between two parts, as data (applied by code in a mutation,
 * convex/links.ts): the target waits on `from` ("waiting on <card>") until
 * `when` holds, then `fill` gets `value` from it.
 * when: "always" | "closed" | "winner" | "time" | "threshold"
 * value: "id" | "winner" | "yes" | "unclaimed" | "date"
 */
export type RecipeLink = { from: string; to: string; when: string; fill: string; value: string };

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
};
const recipe = <S extends Schema>(def: RecipeDef<S>) => def;

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const COUNT = ["", "just one of us", "the two of us", "the three of us", "the four of us", "the five of us", "the six of us", "the seven of us", "the eight of us"];
const plural = (s: string) => (/s$/i.test(s) ? s : `${s}s`);

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
] as const;

export type RecipeId = (typeof RECIPES)[number]["id"];
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
    return l ? { ...p, link: { from: l.from, when: l.when, fill: l.fill, value: l.value } } : p;
  });
}

/** What the stage shows for a recipe still streaming: its lead card. */
export function recipeLead(id: string, slots: Record<string, unknown>) {
  return (getRecipe(id)!.lead as (s: unknown) => { card: string; settings: Record<string, unknown> })(slots);
}
