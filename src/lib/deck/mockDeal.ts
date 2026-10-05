/**
 * SIMULATED, NOT A MODEL. Mock mode (`?mock=1`) has no backend, so a voice ask
 * there is answered here: a stand-in card written from the words, handed over
 * piece by piece at the latencies we measured on the live path
 * (src/lib/voiceTimings.ts, one row per number, each with its source).
 * Nothing is sent anywhere and no model runs; the dev readout says
 * "simulated from measurements". The room still runs its real path on the
 * answer (guess, skeleton, parseDeal → applyCard → placeCards).
 */
import { beat, voiceSlow, VOICE_TIMINGS } from "../voiceTimings";
import type { CardId } from "./catalog";
import { guessCard, titleFromWords } from "./guess";

type StandIn = { card: CardId; settings: Record<string, string | number | string[]>; room?: boolean };

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
    answer: { card: "checklist", settings: { title: "potluck", items: ["chips and salsa", "drinks", "dessert", "plates and cups"] }, room: true },
  },
  {
    id: "split",
    say: "split the cabin, 640",
    label: "Split the cabin",
    answer: { card: "split", settings: { title: "cabin", total: 640 }, room: true },
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
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** A stand-in card for any words: the scripted ones above, else written from the words. */
export function standInFor(said: string): StandIn {
  const scripted = SCRIPTED_ASKS.find((a) => norm(a.say) === norm(said));
  if (scripted) return scripted.answer;
  const named = listFromWords(said);
  const card = guessCard(said) ?? (named.length ? "poll" : "note");
  const title = lower(titleFromWords(said, card)) || lower(said);
  switch (card) {
    case "poll":
      return { card, settings: { question: `${title.replace(/\?$/, "")}?`.slice(0, 80), options: named.length ? named : ["tacos", "pho", "pizza"] } };
    case "checklist":
      return { card, settings: { title: title.slice(0, 40), items: named.length ? named : ["snacks", "drinks", "playlist"] }, room: true };
    case "countdown":
      return { card, settings: { event: title.replace(/\s+on\s+\w+\.? \d+.*$/i, "").slice(0, 32), date: dateFromWords(said) } };
    case "split":
      return { card, settings: { title: title.replace(/[, ]*\$?\d[\d,.]*.*$/, "").slice(0, 32) || "the bill", total: Number(/\d[\d,]*/.exec(said)?.[0].replace(/,/g, "")) || 100 }, room: true };
    case "rsvp":
      return { card, settings: { title: title.slice(0, 40) } };
    case "wheel":
      return { card, settings: { title: title.slice(0, 32), options: named.length ? named : ["jules", "sam", "maya"] } };
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
 * gets the answer so far, on the measured clock:
 *
 * - a card word in the words: first field at `callToFirstField`, the whole
 *   card by `callToComplete` (`roomFillFirstCard` when the answer leans on
 *   the room);
 * - no card word: the card id alone at `typeByDecide`, the card by
 *   `decideThenFill`.
 *
 * The room sends a call `steady` ms after the words stop moving; that wait
 * is the room's own (not slowed by `?slow=`), so it is made up here.
 */
export async function mockDeal(said: string, onPartial: (answer: string) => void): Promise<string> {
  const answer = standInFor(said);
  const parts = pieces(answer);
  const keyword = guessCard(said) !== null;
  const slowDebt = VOICE_TIMINGS.steady.ms * (voiceSlow() - 1);
  const complete = keyword ? beat(answer.room ? "roomFillFirstCard" : "callToComplete") : beat("decideThenFill");
  const first = keyword && !answer.room ? beat("callToFirstField") : complete - beat("streamWindow");
  const started = performance.now();
  const until = (ms: number) => wait(slowDebt + ms - (performance.now() - started));

  if (!keyword) {
    await until(beat("typeByDecide"));
    onPartial(parts[0]);
  }
  // every piece between the first field and the closed object, evenly through the stream window
  const fields = parts.slice(1, -1);
  for (let i = 0; i < fields.length; i++) {
    await until(first + ((complete - first) * i) / fields.length);
    onPartial(fields[i]);
  }
  await until(complete);
  return parts[parts.length - 1];
}
