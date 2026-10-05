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
import { date, list, num, oneOf, rows, text, zone, type Field, type Infer, type Need, type Said, type Schema } from "./schema";

/** What the room knows when a card turns into a widget. */
export type CardContext = {
  /** Who asked: becomes the author / spinner / payer. */
  by: string;
  /** Everyone in the space, the speaker included. */
  people: string[];
  /** The speaker's today, YYYY-MM-DD. Countdowns start here. */
  today: string;
  /** Each person's colour, by name (a check-in paints its rows with them). */
  colors?: Record<string, string>;
  /** The check-in a standings card ranks (its widget id), when code knows it. */
  source?: string;
};

const FALLBACK_COLORS = ["#ff7c42", "#e9369d", "#13b8a6", "#ffb02e", "#7c5cff", "#3d6eff", "#c6f750", "#ff3b5c"];
const isoPlus = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** A challenge's reveal: the morning after its last day, 9:00 (local). */
export const revealOf = (start: string, days: number) => `${isoPlus(start, days)}T09:00`;
/** Who a card is among, as people with colours, in the room's order. */
export const peopleOf = (ctx: CardContext) =>
  ctx.people.map((name, i) => ({ name, color: ctx.colors?.[name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }));

type CardDef<Id extends string, S extends Schema> = {
  id: Id;
  use: string;
  type: WidgetType;
  settings: S;
  build: (s: Infer<S>, ctx: CardContext) => Widget["data"];
  rotate?: number;
  /** Voice edits (lib/deck/edits.ts): the closed set of changes this card takes, op → its value. Code applies them, never the model. */
  edits?: Record<string, Field>;
  /** What it can't do without, and the question for each (lib/deck/needs.ts). A field the model or the room can fill isn't here. */
  needs?: Need[];
};

/** Words already stand on it: a topic, or a list said outright. */
const topic = (w: Said) => !!w.topic || w.list.length >= 2;
/** Choices only the group can name (a name, a theme): the model would be inventing them. */
const OWN_CHOICES = /\b(names?|called|theme|colou?rs?|logo|jerseys?|mascot|songs?|movies?|films?|books?|gifts?|presents?|costumes?|tattoos?)\b/i;
const need = (field: string, ask: string, slot: string, as: Need["as"], has: (w: Said) => boolean = topic, alsoDate?: string): Need => ({ field, ask, slot, as, has, ...(alsoDate ? { alsoDate } : {}) });

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
    edits: { addOption: text(32), removeOption: text(32), rename: text(80) },
    needs: [
      need("question", "what are we voting on?", "add the question", "text"),
      need("options", "what are the choices?", "add choices", "list", (w) => w.list.length >= 2 || (!!w.topic && !OWN_CHOICES.test(w.topic))),
    ],
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
    edits: { addItem: text(28), removeItem: text(28), rename: text(40) },
    needs: [need("title", "what's the list for?", "add what it's for", "text")],
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
    edits: { setDate: date(), rename: text(32) },
    needs: [
      need("event", "a countdown to what, and when?", "add what it counts to", "text", (w) => !!w.topic, "date"),
      need("date", "when is it?", "add the date", "date", (w) => !!w.date || w.roomDate),
    ],
    build: (s, ctx) => ({ event: s.event, targetDate: s.date, startDate: ctx.today, hyped: [ctx.by] }),
  }),
  card({
    id: "rsvp",
    use: "who's in or out for one event",
    type: "rsvp",
    settings: { title: text(40), when: text(24, { optional: true }) },
    edits: { setWhen: text(24), rename: text(40) },
    needs: [need("title", "who's in for what?", "add what it's for", "text")],
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
    needs: [need("options", "what's on the wheel?", "add what it picks from", "list")],
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
    needs: [need("text", "what should it say?", "add the words", "text")],
    build: (s, ctx) => ({ text: s.text, author: ctx.by, tone: "warm", kicker: s.label ?? "note" }),
  }),
  card({
    id: "question",
    use: "an open question everyone answers in their own words",
    type: "dailyQ",
    settings: { question: text(90) },
    needs: [need("question", "what's the question?", "add the question", "text")],
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
    edits: { addPerson: text(24), removePerson: text(24), rename: text(32) },
    // the title is the model's ("the bill", "the cabin"); the total only the person knows
    needs: [need("total", "split how much?", "add the total", "number", (w) => w.number !== null)],
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
    edits: { setDay: text(36), rename: text(32) },
    needs: [need("title", "a plan for what?", "add what it's for", "text")],
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
    id: "checkin",
    use: "a daily check-in: each person logs a number (or a tick) every day for a few days, with streaks; a habit or a challenge",
    type: "checkIn",
    settings: {
      title: text(32),
      unit: text(20, { optional: true }),
      kind: oneOf(["number", "done"], { default: "number" }),
      days: num(1, 14, { optional: true }),
      goal: num(1, 100000, { optional: true }),
    },
    edits: { setDays: num(1, 30), rename: text(32) },
    needs: [need("title", "a check-in of what?", "add what it counts", "text")],
    build: (s, ctx) => {
      const days = s.days ?? 7;
      return {
        title: s.title,
        kind: s.kind,
        unit: s.unit ?? (s.kind === "done" ? "done" : s.title),
        start: ctx.today,
        days,
        revealAt: revealOf(ctx.today, days),
        ...(s.goal ? { goal: s.goal } : {}),
        people: peopleOf(ctx),
        logs: {},
      };
    },
  }),
  card({
    id: "standings",
    use: "ranks the people on a check-in already on the board, face down until you log yours",
    type: "standings",
    settings: { title: text(32, { default: "standings" }), stake: text(90, { optional: true }) },
    build: (s, ctx) => ({ title: s.title, source: ctx.source ?? "", ...(s.stake ? { stake: s.stake } : {}) }),
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

/**
 * Cards only code deals: parts of a recipe (`recipes.ts`), never listed in a
 * prompt. A frame round a cluster, and a sign-up that arrives already filled
 * with the people the ask named.
 */
export const INTERNAL = [
  card({
    id: "frame",
    use: "a labelled area round a group of cards",
    type: "frame",
    settings: { title: text(40), subtitle: text(40, { optional: true }) },
    build: (s) => ({ title: s.title, ...(s.subtitle ? { subtitle: s.subtitle } : {}) }),
  }),
  card({
    id: "signup",
    use: "who's in, already filled with the people the ask named",
    type: "rsvp",
    settings: { title: text(40) },
    build: (s, ctx) => ({ title: s.title, responses: ctx.people.map((name) => ({ name, status: "yes" as const })), waitingOn: [] }),
  }),
] as const;

export type Card = (typeof CATALOG)[number] | (typeof INTERNAL)[number];
export type CardId = Card["id"];
type CardById<I extends CardId> = Extract<Card, { id: I }>;

/** A card the model dealt, after its settings passed the schema. */
export type DealtCard =
  | {
      [I in CardId]: { card: I; settings: Infer<CardById<I>["settings"]> };
    }[CardId]
  /** A recipe (`recipes.ts`): its slots, expanded into cards by code. */
  | { card: "challenge"; settings: Record<string, unknown> };

const BY_ID = new Map<string, Card>([...CATALOG, ...INTERNAL].map((c) => [c.id, c]));
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
