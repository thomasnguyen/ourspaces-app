/**
 * The deck: the existing widgets a model may deal, by voice. Each card is an
 * id the model names, a one-line `use` written for the model, 1–5 short
 * settings, the widget type it becomes, and `build` (settings → widget data).
 *
 * Left out on purpose (see docs/code-map.md "lib/deck"): frame (cards don't
 * nest into frames yet), sticker, media and linkCard/linkShelf (need a real
 * photo or URL), weather/sports/backendLive (need live data), chat (the
 * drawer), letter (arrives by mail), cozyColor and the build room's four.
 */
import type { Widget, WidgetType } from "../../data/types";
import { RADIO_STATIONS } from "../radio";
import { WIDGET_SIZES } from "../widgetDefaults";
import { date, list, num, oneOf, rows, text, zone, type Infer, type Schema } from "./schema";

/** What the room knows when a card turns into a widget. */
export type CardContext = {
  /** Who asked: becomes the author / spinner / payer. */
  by: string;
  /** Everyone in the space, the speaker included. */
  people: string[];
  /** The speaker's today, YYYY-MM-DD. Countdowns start here. */
  today: string;
};

type CardDef<Id extends string, S extends Schema> = {
  id: Id;
  use: string;
  type: WidgetType;
  settings: S;
  build: (s: Infer<S>, ctx: CardContext) => Widget["data"];
  rotate?: number;
};

const card = <const Id extends string, S extends Schema>(def: CardDef<Id, S>) => def;

const LETTERS = "abcdefgh";
const others = (ctx: CardContext) => ctx.people.filter((p) => p !== ctx.by);
const RADIO_CHIPS = RADIO_STATIONS.map((s) => s.chip);

export const CATALOG = [
  card({
    id: "poll",
    use: "the group votes on one question",
    type: "poll",
    settings: { question: text(80), options: list(2, 5, { itemMax: 32 }) },
    build: (s, ctx) => ({
      question: s.question,
      options: s.options.map((label, i) => ({ id: LETTERS[i], label, votes: 0, total: 0, voters: [] })),
      waitingOn: others(ctx),
    }),
  }),
  card({
    id: "checklist",
    use: "a shared list people claim or tick off: who's bringing what, packing, chores",
    type: "potluck",
    settings: { title: text(40), items: list(2, 8, { itemMax: 28 }) },
    build: (s) => ({
      title: s.title,
      kicker: "sign-up sheet",
      tone: "mint",
      items: s.items.map((name) => ({ name, by: null, claimed: false })),
      openCount: s.items.length,
    }),
  }),
  card({
    id: "countdown",
    use: "counts down the days to a date",
    type: "countdown",
    settings: { event: text(32), date: date() },
    build: (s, ctx) => ({ event: s.event, targetDate: s.date, startDate: ctx.today, hyped: [ctx.by] }),
  }),
  card({
    id: "rsvp",
    use: "who's in or out for one event",
    type: "rsvp",
    settings: { title: text(40), when: text(24, { optional: true }) },
    build: (s, ctx) => ({
      title: s.when ? `${s.title} · ${s.when}` : s.title,
      responses: [],
      waitingOn: others(ctx),
    }),
  }),
  card({
    id: "wheel",
    use: "spin to pick one option or person at random",
    type: "wheel",
    settings: { title: text(32), options: list(2, 8, { itemMax: 18 }) },
    build: (s) => ({
      title: s.title,
      tone: "mint",
      slices: s.options.map((label, i) => ({ id: LETTERS[i], label })),
      spinNonce: 0,
      resultIndex: 0,
      // nobody has spun it yet ("" = not spun; the maker's name here read as "landed on you" in your turn)
      spunBy: "",
    }),
  }),
  card({
    id: "note",
    use: "a sticky note with words someone wants kept",
    type: "note",
    settings: { text: text(140), label: text(20, { optional: true }) },
    rotate: -2,
    build: (s, ctx) => ({ text: s.text, author: ctx.by, tone: "warm", kicker: s.label ?? "note" }),
  }),
  card({
    id: "question",
    use: "an open question everyone answers in their own words",
    type: "dailyQ",
    settings: { question: text(90) },
    build: (s, ctx) => ({ question: s.question, tone: "butter", streak: 1, answers: [], waitingOn: ctx.people }),
  }),
  card({
    id: "availability",
    use: "find which day works for everyone",
    type: "availability",
    settings: { title: text(40), days: list(2, 7, { itemMax: 10 }) },
    build: (s, ctx) => ({
      title: s.title,
      days: s.days,
      members: ctx.people.map((name) => ({ name, slots: s.days.map(() => false) })),
      best: "",
      tone: "sky",
    }),
  }),
  card({
    id: "split",
    use: "split a shared cost: who paid and who owes",
    type: "expenseSplit",
    settings: { title: text(32), total: num(1, 100000), paidBy: text(24, { optional: true }) },
    build: (s, ctx) => {
      const payer = s.paidBy ?? ctx.by;
      const share = Math.round(s.total / Math.max(1, ctx.people.length));
      return {
        title: s.title,
        total: s.total,
        splits: ctx.people.map((name) =>
          name === payer ? { name, owes: 0, paid: s.total } : { name, owes: share, paid: 0 },
        ),
      };
    },
  }),
  card({
    id: "itinerary",
    use: "a day-by-day plan for a trip or a weekend",
    type: "itinerary",
    settings: { title: text(32), days: rows(["day", "plan"], 1, 6, { itemMax: 36 }) },
    build: (s) => ({ title: s.title, days: s.days }),
  }),
  card({
    id: "messages",
    use: "a wall where everyone leaves a short message for someone or an occasion",
    type: "messageWall",
    settings: { title: text(40) },
    build: (s) => ({ title: s.title, messages: [] }),
  }),
  card({
    id: "jokes",
    use: "a ranked list of the group's inside jokes",
    type: "jokeRegistry",
    settings: { title: text(40, { default: "inside joke hall of fame" }), jokes: list(1, 6) },
    build: (s) => ({ title: s.title, jokes: s.jokes.map((t) => ({ text: t, votes: 0 })) }),
  }),
  card({
    id: "quote",
    use: "pin up something someone said, word for word",
    type: "quote",
    settings: { text: text(120), author: text(24) },
    build: (s) => ({ text: s.text, author: s.author, week: "this week" }),
  }),
  card({
    id: "decision",
    use: "pin a decision the group already made",
    type: "decision",
    settings: { title: text(40), detail: text(60) },
    build: (s, ctx) => ({ title: s.title, detail: s.detail, author: ctx.by, source: "said out loud", tone: "lime" }),
  }),
  card({
    id: "clocks",
    use: "two clocks side by side for people in two time zones",
    type: "dualClock",
    settings: { here: text(14), hereZone: zone(), there: text(14), thereZone: zone() },
    build: (s) => ({
      title: `${s.here} · ${s.there}`,
      left: { label: s.here, tz: s.hereZone },
      right: { label: s.there, tz: s.thereZone },
    }),
  }),
  card({
    id: "photos",
    use: "a shared photo roll people add pictures to",
    type: "photoWall",
    settings: { title: text(40) },
    build: (s) => ({ title: s.title, tone: "blush", photos: [] }),
  }),
  card({
    id: "radio",
    use: "a radio station the whole room listens to together",
    type: "playlist",
    settings: { station: oneOf(RADIO_CHIPS, { default: "indie" }), title: text(32, { default: "room radio" }) },
    build: (s, ctx) => ({
      title: s.title,
      stationId: RADIO_STATIONS.find((r) => r.chip === s.station)?.id ?? RADIO_STATIONS[0].id,
      playedBy: ctx.by,
      playing: false,
      vibes: [],
      tone: "violet",
    }),
  }),
] as const;

export type Card = (typeof CATALOG)[number];
export type CardId = Card["id"];
type CardById<I extends CardId> = Extract<Card, { id: I }>;

/** A card the model dealt, after its settings passed the schema. */
export type DealtCard = {
  [I in CardId]: { card: I; settings: Infer<CardById<I>["settings"]> };
}[CardId];

const BY_ID = new Map<string, Card>(CATALOG.map((c) => [c.id, c]));
export const getCard = (id: string): Card | undefined => BY_ID.get(id);
export const CARD_IDS = CATALOG.map((c) => c.id) as CardId[];

/** The card's footprint on the canvas, the same size the add tray uses. */
export function cardSize(c: Card): { w: number; h: number } {
  return WIDGET_SIZES[c.type] ?? { w: 280, h: 180 };
}

// These grow with their content (WidgetCard `widgetGrows`), so their stored h
// is a floor. Placement reserves a typical filled height instead.
const GROWN_H: Partial<Record<WidgetType, number>> = { dailyQ: 300, availability: 380, playlist: 230 };

/** The room a widget needs on the board: stored size, or the grown height for content-sized types. */
export function footprint(w: Pick<Widget, "type" | "w" | "h">): { w: number; h: number } {
  return { w: w.w, h: Math.max(w.h, GROWN_H[w.type] ?? 0) };
}
