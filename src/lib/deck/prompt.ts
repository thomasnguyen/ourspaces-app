/**
 * The deal's wire format, as the speed spike validated it (prompt v2, 96% valid
 * on Lightning): a fixed system prompt carrying the deck plus one worked
 * example, and an answer of one compact `{"card":"id","settings":{…}}` per line.
 */
import { CATALOG } from "./catalog";
import { RECIPES } from "./recipes";
import { checkCard } from "./apply";
import { describeSettings, type Schema } from "./schema";
import type { DealtCard } from "./catalog";

/** The catalog as the prompt carries it: id, use, settings shapes. */
/** The catalog as the prompt carries it: id, use, settings shapes. Recipes come last: one line deals a linked group. */
export function catalogJson() {
  return [
    ...CATALOG.map((c) => ({ id: c.id, use: c.use, settings: describeSettings(c.settings as Schema) })),
    ...RECIPES.map((r) => ({ id: r.id, use: r.use, settings: describeSettings(r.slots as Schema) })),
  ];
}

const EXAMPLE = `EXAMPLE
Room: the group chat · today 2026-10-04 · Thomas, Holly, Sam, Priya
Said: "potluck at Sam's on the 18th, who's bringing what, and a countdown"
{"card":"checklist","settings":{"title":"Potluck at Sam's","items":["mains","salad","dessert","drinks"]}}
{"card":"countdown","settings":{"event":"Potluck at Sam's","date":"2026-10-18"}}`;

/** The system prompt. `cards`: only these deck cards (the per-ask shortlist, `shortlist.ts`); without, the whole deck. */
export function deckPrompt(opts: { cards?: string[] } = {}): string {
  const deck = catalogJson()
    .filter((c) => !opts.cards || opts.cards.includes(c.id))
    .map((c) => `${c.id}: ${c.use}. settings ${JSON.stringify(c.settings)}`)
    .join("\n");
  return `You place cards in a shared space for a group of friends. You never write UI, layout or prose.
Pick cards from the deck below and fill their settings. Answer with one card per line, each line compact JSON:
{"card":"<id>","settings":{...}}
A chain of related cards (a trip, a party) is several lines, most important first.${!opts.cards || opts.cards.includes("challenge") ? " A challenge between people is the challenge recipe: one line." : ""} Keep settings short. A field marked ? can be left out.
If no card fits, answer exactly {"card":"none"}.

DECK
${deck}

${EXAMPLE}

Every line is one complete JSON object that closes before the newline. Only deck ids are valid cards. Settings values are plain strings, numbers or arrays, never strings holding JSON.`;
}

/** The room as the model sees it, trimmed to what matters. Everything the
    model is told about the room is this one string (the dev drawer shows it
    verbatim), so richer room context only ever changes what goes in here. */
export function roomContext(r: { room: string; today: string; people: string[]; selected?: string }): string {
  const sel = r.selected ? ` · selected: ${r.selected}` : "";
  return `Room: ${r.room} · today ${r.today} · ${r.people.join(", ")}${sel}`;
}

/** The user turn: the room context, then the words. */
export function dealTurn(r: { context: string; said: string }): string {
  return `${r.context}\nSaid: "${r.said}"`;
}

export type DealItem =
  | { ok: true; card: DealtCard; notes: string[]; raw: string }
  | { ok: false; reason: string; raw: string };

export type Deal = {
  /** Every complete object so far, in order. A longer prefix only appends. */
  items: DealItem[];
  /** The model said `{"card":"none"}`. */
  none: boolean;
  /** The unfinished tail, if an object is still open. */
  rest: string;
};

/**
 * Parses a streamed answer as far as it goes. Call it with the growing buffer
 * and commit `items` past the ones you already placed: an object counts the
 * moment its closing brace arrives, before the newline or the end. Prose, code
 * fences and blank lines between objects are skipped. Never throws.
 */
export function parseDeal(text: string, done = false): Deal {
  const items: DealItem[] = [];
  let none = false;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (depth === 0) {
      if (ch === "{") {
        depth = 1;
        start = i;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      const raw = text.slice(start, i + 1);
      start = -1;
      let obj: unknown;
      try {
        obj = JSON.parse(raw);
      } catch {
        try {
          obj = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
        } catch {
          items.push({ ok: false, reason: "not valid JSON", raw });
          continue;
        }
      }
      if ((obj as { card?: unknown })?.card === "none") {
        none = true;
        continue;
      }
      const c = checkCard(obj);
      items.push(c.ok ? { ...c, raw } : { ok: false, reason: c.reason, raw });
    }
  }

  const rest = start >= 0 ? text.slice(start) : "";
  if (done && rest) items.push({ ok: false, reason: "cut off before the object closed", raw: rest });
  return { items, none: none && !items.some((i) => i.ok), rest };
}
