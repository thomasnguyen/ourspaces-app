/**
 * Code's half of "starts while you speak" (path-to-win §3 "Faster still"):
 * guess the card from the words as they arrive (0 ms, no model), build that
 * card's real widget as an empty skeleton, and read a model line that is
 * still streaming so the skeleton fills field by field. The model's answer
 * always wins; a guess only decides what shows while it's on its way.
 */
import type { Widget } from "../../data/types";
import { cardSize, getCard, type CardContext, type CardId } from "./catalog";
import type { Field, Schema } from "./schema";

const POLL_ROW = 42; // same as apply.ts: one poll option row past three

/** Per card, the words that point at it. Earliest match in the sentence wins. */
const CUES: Array<[CardId, RegExp]> = [
  ["poll", /\b(poll|vote|voting|which (one|day|place|restaurant)|where should we|what should we)\b/],
  ["checklist", /\b(who'?s bringing|bringing what|packing|pack list|checklist|check ?list|to-?do|chores|shopping list|grocery list|groceries)\b/],
  ["countdown", /\b(count ?down|days (until|till|to)|how long (until|till))\b/],
  ["rsvp", /\b(rsvp|who'?s (in|coming)|who is coming|in or out)\b/],
  // Picking one person is a wheel's job: "who's driving", "whose turn".
  ["wheel", /\b(wheel|spin|pick (someone|who|a random)|randomly pick|who'?s (driving|cooking|hosting|picking (it )?up|on (dishes|trash|bins|duty))|whose turn)\b/],
  ["note", /\b(note|remind|reminder|remember|sticky)\b/],
  ["question", /\b(question of the day|ask everyone|daily question)\b/],
  ["availability", /\b(availability|which days? works?|when (is|are) (everyone|we all) free|schedule)\b/],
  ["split", /\b(split|owes?|pay ?back|expenses?|the bill|\d+ (dollars|bucks))\b/],
  ["itinerary", /\b(itinerary|day by day|plan (our|the|a) (trip|weekend|day))\b/],
  ["messages", /\b(message wall|messages for|leave a message|card for)\b/],
  ["jokes", /\b(inside jokes?|jokes?)\b/],
  ["quote", /\b(quote|word for word)\b/],
  ["decision", /\b(we decided|decision|it'?s decided|we'?re going with)\b/],
  ["clocks", /\b(time ?zones?|clocks?)\b/],
  ["photos", /\b(photos?|pictures|pics|photo roll|album)\b/],
  ["radio", /\b(radio|music|station|songs?)\b/],
  // a challenge is the recipe; its lead card (the check-in) is the skeleton while you talk
  ["checkin", /\b(challenge|check-?ins?|streaks?)\b/],
  ["standings", /\b(standings|leaderboard|rankings?|who'?s winning)\b/],
];

/** The card the words point at, or null when nothing does yet. */
export function guessCard(said: string): CardId | null {
  const words = said.toLowerCase();
  let best: { id: CardId; at: number } | null = null;
  for (const [id, re] of CUES) {
    const m = re.exec(words);
    if (m && (!best || m.index < best.at)) best = { id, at: m.index };
  }
  return best?.id ?? null;
}

/** Words a sentence doesn't end on: "add a poll for…" is still going. */
const DANGLING = new Set(
  "a an the for to of and or but with about on at in into from by my our your their his her some any is are was be that this which who what where when how should can could let's lets um uh like called named add make put start create set give get plus than".split(" "),
);

/** True when the words stop mid-thought (a hesitation, not the end). */
export function sentenceHangs(said: string): boolean {
  const t = said.trim().toLowerCase();
  if (!t || /[,:;-]$/.test(t)) return true;
  const last = t.split(/\s+/).pop()!.replace(/[^a-z']/g, "");
  return DANGLING.has(last);
}

const LEAD = /^(hey |ok |okay |so |um |uh |can you |could you |please |let'?s |we need |i want |give us |)(add|make|start|create|set up|put up|put|do|get|have)?\s*(a|an|the|us a|us an|another)?\s*/i;

/** What the words say the card is about, for the skeleton's title before the
    model answers: "add a poll for Saturday dinner" → "Saturday dinner". */
export function titleFromWords(said: string, card: CardId): string {
  let t = said.trim().replace(LEAD, "");
  const cue = CUES.find(([id]) => id === card)?.[1];
  const m = cue?.exec(t.toLowerCase());
  if (m && m.index < 4) t = t.slice(m.index + m[0].length);
  t = t.replace(/^\s*(for|about|on|to|of|called|named|with)(\s+|$)/i, "").replace(/^(the|our|a)(\s+|$)/i, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

const BLANK = "\u00a0";

function placeholder(f: Field, ctx: CardContext): unknown {
  if (f.default !== undefined) return f.default;
  switch (f.kind) {
    case "text":
      return "";
    case "number":
      return f.min;
    case "enum":
      return f.values[0];
    // Empty slots read blank but stay distinct: widgets key their rows by label.
    case "list":
      return Array.from({ length: Math.max(f.min, 3) }, (_, i) => BLANK.repeat(i + 1));
    case "rows":
      return Array.from({ length: Math.max(f.min, 2) }, (_, i) => Object.fromEntries(f.keys.map((k) => [k, BLANK.repeat(i + 1)])));
    case "date":
      return ctx.today;
    case "zone":
      return "UTC";
  }
}

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false;
  }
}

/** A partial value the model already wrote, if it has the field's shape. */
function partialValue(f: Field, v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  switch (f.kind) {
    case "text":
    case "date":
      return typeof v === "string" ? v.slice(0, 200) : undefined;
    // A zone still being written ("", "America/Los_") would throw in the clock widget.
    case "zone":
      return typeof v === "string" && validZone(v) ? v : undefined;
    case "number":
      return typeof v === "number" ? v : typeof v === "string" && Number(v) ? Number(v) : undefined;
    case "enum":
      return typeof v === "string" && (f.values as readonly string[]).includes(v) ? v : undefined;
    case "list":
      return Array.isArray(v) && v.length ? v.filter((x) => typeof x === "string").slice(0, f.max) : undefined;
    case "rows":
      return Array.isArray(v) && v.length ? v.filter((x) => x && typeof x === "object").slice(0, f.max) : undefined;
  }
}

/**
 * The card's real widget, as far as anyone knows yet: the model's fields where
 * it has written them, the title from the words where it hasn't, empty slots
 * for the rest. Rendered by the same WidgetCard as the finished card.
 * `filled` counts the fields that came from the model.
 */
export function skeletonWidget(
  cardId: CardId,
  o: { id: string; ctx: CardContext; said?: string; partial?: Record<string, unknown>; z?: number },
): { widget: Widget; filled: number } {
  const def = getCard(cardId)!;
  const schema = def.settings as Schema;
  const settings: Record<string, unknown> = {};
  let filled = 0;
  let titled = false;
  for (const [key, f] of Object.entries(schema)) {
    const got = partialValue(f, o.partial?.[key]);
    if (got !== undefined) {
      settings[key] = got;
      filled++;
    } else if (f.kind === "text" && !titled && !f.optional && o.said) {
      settings[key] = titleFromWords(o.said, cardId).slice(0, f.max);
    } else if (!f.optional) settings[key] = placeholder(f, o.ctx);
    if (f.kind === "text" && !f.optional) titled = true;
  }
  const build = def.build as (s: unknown, c: CardContext) => Widget["data"];
  const data = build(settings, o.ctx);
  const size = cardSize(def);
  const options = def.type === "poll" ? (data as { options?: unknown[] }).options?.length ?? 0 : 0;
  return {
    filled,
    widget: {
      id: o.id,
      type: def.type,
      x: 0,
      y: 0,
      w: size.w,
      h: size.h + Math.max(0, options - 3) * POLL_ROW,
      z: o.z ?? 1000,
      ...("rotate" in def ? { rotate: def.rotate } : {}),
      data,
    },
  };
}

/**
 * The first card in a model answer that may still be streaming: its id and
 * whichever settings have closed so far (a string counts once its closing
 * quote is in, a list item the same). Null until the card id is readable.
 */
export function parsePartialCard(text: string): { card: string; settings: Record<string, unknown> } | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const s = text.slice(start);
  // Every point where a value just closed, with the brackets still open there.
  const cuts: Array<{ at: number; open: string }> = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        cuts.push({ at: i + 1, open: stack.join("") });
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      stack.pop();
      cuts.push({ at: i + 1, open: stack.join("") });
      if (!stack.length) break;
    } else if (/[0-9]/.test(ch) && !/[0-9.]/.test(s[i + 1] ?? "")) cuts.push({ at: i + 1, open: stack.join("") });
  }
  for (let k = cuts.length - 1; k >= 0 && k >= cuts.length - 12; k--) {
    const { at, open } = cuts[k];
    const close = [...open].reverse().map((b) => (b === "{" ? "}" : "]")).join("");
    try {
      const obj = JSON.parse(s.slice(0, at).replace(/,\s*$/, "") + close) as Record<string, unknown>;
      if (typeof obj.card !== "string") continue;
      const { card, settings, ...flat } = obj;
      const set = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : flat;
      return { card: card.trim().toLowerCase(), settings: set as Record<string, unknown> };
    } catch {
      // A key without its value: try the cut before.
    }
  }
  return null;
}
