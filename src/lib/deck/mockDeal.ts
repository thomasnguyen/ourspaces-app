/**
 * SIMULATED, NOT A MODEL. Mock mode (`?mock=1`) has no backend, so a voice ask
 * there is answered here: a stand-in card written from the words, handed over
 * piece by piece at the latencies we measured on the live path
 * (src/lib/voiceTimings.ts, one row per number, each with its source).
 * Nothing is sent anywhere and no model runs; the dev readout says
 * "simulated from measurements". The room still runs its real path on the
 * answer (guess, skeleton, route, parse → resolve → applyCard → placeCards).
 *
 * Like the live model on the brain route, the stand-in never writes a room
 * fact's value: when the call's fact menu offers a token the words need
 * (`@places`, `@date(…)`, `@coming(…)`, `@on-trip(…)`), it writes the token and
 * the real resolver fills it in on screen and notes where it came from.
 * There is no simulated pick: with no card word the type arrives with the
 * answer's first field, and "already here" is the room's own stand-in rule
 * (code's match alone, src/live/useVoiceBuild.ts).
 */
import { beat } from "../voiceTimings";
import type { CardId } from "./catalog";
import { guessCard, titleFromWords } from "./guess";

type StandIn = { card: CardId | "challenge"; settings: Record<string, string | number | string[]> };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "on November 14" → the next November 14; nothing said → two weeks out. */
function dateFromWords(said: string) {
  const now = new Date();
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(said);
  if (!m) return iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
  const d = new Date(now.getFullYear(), MONTHS.indexOf(m[1].toLowerCase()), Number(m[2]));
  if (d.getTime() < now.getTime()) d.setFullYear(d.getFullYear() + 1);
  return iso(d);
}

/** "tacos or pho", "chips, salsa and drinks" → the things named. */
function listFromWords(said: string): string[] {
  const tail = said.includes(":") ? said.slice(said.indexOf(":") + 1) : (/([\w' ]+(,| or | and )[\w', ]+)$/i.exec(said)?.[1] ?? "");
  if (!/,| or | and /.test(tail)) return [];
  const last = tail.split(/,|\bor\b|\band\b/).map((s) => s.trim().split(" ").slice(-2).join(" ")).filter(Boolean);
  return last.length >= 2 ? last.slice(0, 5) : [];
}

const lower = (s: string) => s.toLowerCase().replace(/[.,!]+$/, "");

/** The asks the takes script, word for word, and what the stand-in answers. */
export const SCRIPTED_ASKS: Array<{ id: string; say: string; label: string; answer: StandIn }> = [
  {
    id: "poll",
    say: "add a poll for Saturday dinner",
    label: "Poll Saturday dinner",
    answer: { card: "poll", settings: { question: "saturday dinner?", options: ["tacos", "pho", "pizza"] } },
  },
  {
    id: "countdown",
    say: "countdown to Holly's birthday on November 14",
    label: "Count down to a birthday",
    answer: { card: "countdown", settings: { event: "holly's birthday", date: dateFromWords("november 14") } },
  },
  {
    id: "checklist",
    say: "who's bringing what for the potluck",
    label: "Who's bringing what",
    answer: { card: "checklist", settings: { title: "potluck", items: ["chips and salsa", "drinks", "dessert", "plates and cups"] } },
  },
  {
    id: "split",
    say: "split the cabin, 640",
    label: "Split the cabin",
    answer: { card: "split", settings: { title: "cabin", total: 640 } },
  },
  {
    // "where should we" is a card word in deck/guess.ts: the poll is known by the third word
    id: "where",
    say: "where should we eat Saturday",
    label: "Where to eat",
    answer: { card: "poll", settings: { question: "where should we eat saturday?", options: ["tacos", "pho", "pizza"] } },
  },
  {
    // no card word anywhere: the type arrives from the pick, after the words
    id: "nokey",
    say: "dinner Saturday, tacos or pho",
    label: "No card word",
    answer: { card: "poll", settings: { question: "dinner saturday?", options: ["tacos", "pho"] } },
  },
  {
    // the hero ask: a recipe, one line; code builds the linked group
    id: "challenge",
    say: "set up a push-up challenge for the four of us",
    label: "A challenge (recipe)",
    answer: { card: "challenge", settings: { activity: "push-ups", unit: "push-ups", who: "@all" } },
  },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

const FOOD = /\b(eat|dinner|lunch|brunch|breakfast|food|restaurant)\b/i;
/** The first token of this name the call's fact menu offers: "@date(maya's bday)". */
const offered = (menu: string | undefined, name: string) => new RegExp(`@${name}(\\([^()=]*?\\))?(?= =|, also| ·)`).exec(menu ?? "")?.[0].replace(/, also.*$/, ")") ?? null;

/** Words that name a card and nothing to put in it ("add a poll"): no card comes back. */
export const isBare = (said: string) => {
  const card = guessCard(said);
  return card !== null && !titleFromWords(said, card) && !listFromWords(said).length;
};

/** A stand-in card for any words: the scripted ones above, else written from
    the words, with the room's tokens where the fact menu offers one. */
export function standInFor(said: string, menu?: string): StandIn | null {
  const scripted = SCRIPTED_ASKS.find((a) => norm(a.say) === norm(said));
  const named = listFromWords(said);
  const card = scripted?.answer.card ?? guessCard(said) ?? (named.length ? "poll" : "note");
  if (isBare(said)) return null;
  const title = lower(titleFromWords(said, card as CardId)) || lower(said);
  const places = offered(menu, "places");
  const date = offered(menu, "date");
  const coming = offered(menu, "coming");
  const trip = offered(menu, "on-trip");
  const all = offered(menu, "all");
  const base = scripted?.answer.settings ?? {};
  // a challenge between people: the recipe, its activity from the words
  if (card === "challenge" || /\bchallenge\b/i.test(said)) {
    const activity = (base.activity as string) ?? (/(?:\b(?:a|an|the)\s+)?([\w-]+)\s+challenge/i.exec(said)?.[1] ?? "steps").toLowerCase();
    const days = Number(/(\d+|a)\s*(day|week)/i.exec(said)?.[0].replace(/^a/, "1").replace(/\s*week/, "*7").replace(/\s*days?/, "").split("*").reduce((a, b) => String(Number(a) * Number(b)))) || undefined;
    return { card: "challenge", settings: { activity: activity.replace(/^push-?up$/, "push-ups"), ...(days ? { days } : {}), ...(all && !base.who ? { who: all } : base.who ? { who: base.who } : {}) } };
  }
  switch (card) {
    case "poll": {
      const question = (base.question as string) ?? `${title.replace(/\?$/, "")}?`.slice(0, 80);
      // the group's own places when the words are about where to eat; else what the words named
      if (places && FOOD.test(said) && !named.length) return { card, settings: { question, options: [places, "somewhere else"] } };
      return { card, settings: { question, options: (base.options as string[]) ?? (named.length ? named : FOOD.test(said) ? ["tacos", "pho", "pizza"] : ["yes", "no", "maybe"]) } };
    }
    case "checklist":
      return { card, settings: { title: (base.title as string) ?? title.slice(0, 40), items: (base.items as string[]) ?? (named.length ? named : ["snacks", "drinks", "playlist"]) } };
    case "countdown":
      // a date the room already knows comes from the room, never retyped
      return { card, settings: { event: (base.event as string) ?? title.replace(/\s+on\s+\w+\.? \d+.*$/i, "").slice(0, 32), date: date && !/\d/.test(said) ? date : ((base.date as string) ?? dateFromWords(said)) } };
    case "split": {
      const settings: StandIn["settings"] = { title: (base.title as string) ?? (title.replace(/[, ]*\$?\d[\d,.]*.*$/, "").slice(0, 32) || "the bill"), total: (base.total as number) ?? (Number(/\d[\d,]*/.exec(said)?.[0].replace(/,/g, "")) || 100) };
      if (trip) settings.among = trip;
      return { card, settings };
    }
    case "rsvp":
      return { card, settings: { title: title.slice(0, 40) } };
    case "wheel":
      return { card, settings: { title: title.slice(0, 32), options: named.length ? named : coming ? [coming] : ["jules", "sam", "maya"] } };
    case "question":
      return { card, settings: { question: title.slice(0, 90) } };
    default:
      return { card: "note", settings: { text: said.slice(0, 140) } };
  }
}

/** The answer as it would stream: one string per piece that has closed. The
    first is the card id alone, the last is the whole object. */
function pieces(a: StandIn): string[] {
  const out = [`{"card":"${a.card}"`];
  const done: string[] = [];
  const head = () => `{"card":"${a.card}","settings":{${done.join(",")}`;
  for (const [key, value] of Object.entries(a.settings)) {
    if (Array.isArray(value)) {
      value.forEach((_, i) => out.push(`${head()}${done.length ? "," : ""}"${key}":[${value.slice(0, i + 1).map((v) => JSON.stringify(v)).join(",")}`));
      done.push(`"${key}":${JSON.stringify(value)}`);
    } else {
      done.push(`"${key}":${JSON.stringify(value)}`);
      out.push(head());
    }
  }
  out.push(JSON.stringify({ card: a.card, settings: a.settings }));
  return out;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, Math.max(0, ms)));

/**
 * One simulated call. `said` are the words it went out with; `onPartial`
 * gets the answer so far, on the measured clock, counted from when the call
 * leaves: the first card closes at `fastFirstCard`, or at `brainFinal` when
 * the room routed the call to the brain (the words point at a room fact: the
 * last word's call leaves at the last word, so that is the measured final); its fields stream over the `streamWindow` before that.
 */
export async function mockDeal(call: { said: string; route?: "fast" | "brain"; menu?: string }, onPartial: (answer: string) => void): Promise<string> {
  const answer = standInFor(call.said, call.route === "brain" ? call.menu : undefined);
  const started = performance.now();
  const until = (ms: number) => wait(ms - (performance.now() - started));
  const complete = beat(call.route === "brain" ? "brainFinal" : "fastFirstCard");
  if (!answer) {
    await until(complete);
    return `{"card":"none"}`;
  }
  const parts = pieces(answer);
  const first = complete - beat("streamWindow");
  // every piece between the first field and the closed object, evenly through the stream window
  const fields = parts.slice(1, -1);
  for (let i = 0; i < fields.length; i++) {
    await until(first + ((complete - first) * i) / fields.length);
    onPartial(fields[i]);
  }
  await until(complete);
  return parts[parts.length - 1];
}

