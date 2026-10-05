/* Fill plans: how each kind of card fills in on the voice stage.

   A card is not handed over whole. Its parts arrive on their own: the title
   from your own words while you are still talking, the rest from the answer,
   a few worked out by code from the room. A plan lists a card's parts as
   data: which there are, in what order (`wave`), and which may land in the
   same frame (parts that share a wave, unless `each` spreads a list over
   one beat per row).

   A part is read out of, and written back into, the card's own widget data
   (`read` / `write`), so the stage can show the real widget with exactly the
   parts that have landed and a skeleton row for each one that hasn't.
   Unknown kinds fall back to title-then-body. */

import type { Widget } from "../data/types";
import type { CardId } from "./deck";

export type PartValue = string | number;
type Data = Record<string, unknown>;

export type FillStep = {
  /** "question", "option", … (a list's parts are `option-0`, `option-1`, …) */
  id: string;
  /** What a person would call it. */
  label: string;
  /** Waves land in order. Steps that share a wave land together. */
  wave: number;
  /** Where the value comes from: your words (shown while you talk, not yet
      settled), the answer, or code working from the room. */
  from: "words" | "answer" | "room";
  /** A list: one part per row, each on its own beat. */
  each?: true;
  /** A number that counts up to its value as it lands. */
  tick?: true;
  /** The values in the build's widget right now; null = not there yet. */
  read: (d: Data, complete: boolean) => Array<PartValue | null>;
  /** The widget data with these values showing; null = leave a skeleton.
      `before` is the data as it stood before the card was complete. */
  write: (d: Data, shown: Array<PartValue | null>, before: Data | null) => Data;
};

export type FillPlan = {
  card: CardId | "*";
  /** What the stage asks when the card was named with nothing to put in it. */
  ask: string;
  steps: FillStep[];
};

const BLANK = " ";
/** Empty rows stay distinct: widgets key their rows by label. */
const blank = (i: number) => BLANK.repeat(i + 1);
const text = (v: unknown): string | null => (typeof v === "string" && v.replace(/[\s ]/g, "") ? v : null);
const rows = (v: unknown): Data[] => (Array.isArray(v) ? (v as Data[]) : []);
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const plusDays = (from: string, n: number) => new Date(Date.parse(from) + n * 86_400_000).toISOString().slice(0, 10);

/** One text field of the card, by key. */
const field = (id: string, label: string, key: string, wave: number, from: FillStep["from"]): FillStep => ({
  id,
  label,
  wave,
  from,
  read: (d) => [text(d[key])],
  write: (d, [v]) => ({ ...d, [key]: v ?? "" }),
});

/** A list of rows, one part per row, named by `name`. */
const list = (id: string, label: string, key: string, name: string, wave: number, from: FillStep["from"], empty: Data = {}): FillStep => ({
  id,
  label,
  wave,
  from,
  each: true,
  read: (d) => rows(d[key]).map((r) => text(r[name])),
  write: (d, shown) => ({ ...d, [key]: rows(d[key]).map((r, i) => (shown[i] == null ? { ...r, ...empty, [name]: blank(i) } : r)) }),
});

export const FILL_PLANS: FillPlan[] = [
  {
    // the question lands from your words; then each option on its own beat
    card: "poll",
    ask: "what's it about?",
    steps: [field("question", "question", "question", 0, "words"), list("option", "option", "options", "label", 1, "answer")],
  },
  {
    // title, then the things one at a time, then who's on it (open spots)
    card: "checklist",
    ask: "what's the list for?",
    steps: [
      field("title", "title", "title", 0, "words"),
      list("item", "item", "items", "name", 1, "answer"),
      {
        id: "who",
        label: "who",
        wave: 2,
        from: "room",
        read: (d, complete) => [complete ? Number(d.openCount) || rows(d.items).length : null],
        write: (d, [v]) => ({ ...d, openCount: v == null ? 0 : d.openCount }),
      },
    ],
  },
  {
    // the event from your words; then the date and the day count together, the count ticking up
    card: "countdown",
    ask: "counting down to what?",
    steps: [
      field("event", "event", "event", 0, "words"),
      {
        id: "date",
        label: "date",
        wave: 1,
        from: "answer",
        read: (d) => [d.targetDate !== d.startDate ? text(d.targetDate) : null],
        write: (d, [v]) => (v == null ? { ...d, targetDate: d.startDate } : d),
      },
      {
        id: "days",
        label: "days",
        wave: 1,
        from: "room",
        tick: true,
        read: (d) => [d.targetDate !== d.startDate && text(d.targetDate) ? days(String(d.startDate), String(d.targetDate)) : null],
        // never 0 on the way up: day 0 is the widget's "today" face, a different layout
        write: (d, [v]) => (typeof v === "number" ? { ...d, targetDate: plusDays(String(d.startDate), Math.max(1, Math.round(v))) } : d),
      },
    ],
  },
  {
    // title, then the total counting up, then each person's share
    card: "split",
    ask: "what are we splitting?",
    steps: [
      field("title", "title", "title", 0, "words"),
      {
        id: "total",
        label: "total",
        wave: 1,
        from: "answer",
        tick: true,
        read: (d) => [typeof d.total === "number" && d.total > 1 ? d.total : null],
        write: (d, [v]) => ({ ...d, total: typeof v === "number" ? Math.round(v) : 0 }),
      },
      {
        ...list("person", "person", "splits", "name", 2, "room", { owes: 0, paid: 0 }),
        read: (d, complete) => rows(d.splits).map((r) => (complete || (typeof d.total === "number" && d.total > 1) ? text(r.name) : null)),
      },
    ],
  },
  {
    // the title from your words, then what's counted, then each person's row (from the room), then the length
    card: "checkin",
    ask: "a check-in for what?",
    steps: [
      field("title", "title", "title", 0, "words"),
      field("unit", "unit", "unit", 1, "answer"),
      {
        ...list("person", "person", "people", "name", 2, "room", { color: "#d8d2c4" }),
        // a row with no name yet stays out: the card draws its people, not blanks
        write: (d, shown) => ({ ...d, people: rows(d.people).filter((_, i) => shown[i] != null) }),
      },
      {
        id: "days",
        label: "days",
        wave: 3,
        from: "answer",
        tick: true,
        read: (d, complete) => [complete && typeof d.days === "number" ? d.days : null],
        write: (d, [v]) => ({ ...d, days: typeof v === "number" ? Math.max(1, Math.round(v)) : d.days }),
      },
    ],
  },
  {
    // the title, then the stake; the rows are its check-in's (face down until you log)
    card: "standings",
    ask: "standings for which check-in?",
    steps: [field("title", "title", "title", 0, "words"), field("stake", "stake", "stake", 1, "answer")],
  },
  {
    // anything else: its title, then everything under it at once
    card: "*",
    ask: "what's it about?",
    steps: [
      {
        id: "title",
        label: "title",
        wave: 0,
        from: "words",
        read: (d) => [text(d.title) ?? text(d.question) ?? text(d.event) ?? text(d.text)],
        write: (d) => d,
      },
      {
        id: "body",
        label: "body",
        wave: 1,
        from: "answer",
        read: (_d, complete) => [complete ? 1 : null],
        write: (d, [v], before) => (v == null && before ? before : d),
      },
    ],
  },
];

export function fillPlan(card: CardId | null): FillPlan {
  return FILL_PLANS.find((p) => p.card === card) ?? FILL_PLANS[FILL_PLANS.length - 1];
}

/** The widget's data with only these parts showing (`shown`: part id → value). */
export function showParts(widget: Widget, plan: FillPlan, shown: Record<string, PartValue | undefined>, complete: boolean, before: Data | null): Widget {
  let data = widget.data as Data;
  for (const step of plan.steps) {
    const have = step.read(data, complete);
    data = step.write(
      data,
      have.map((_, i) => shown[partId(step, i)] ?? null),
      before,
    );
  }
  return { ...widget, data: data as Widget["data"] };
}

export const partId = (step: FillStep, i: number) => (step.each ? `${step.id}-${i}` : step.id);
