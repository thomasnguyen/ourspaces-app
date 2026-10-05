import type { RoomFacts } from "./deck/resolve";

/**
 * "What this space knows": the room brief as a page anyone in the room can
 * read and correct. Every line is built by code in `convex/roomBrief.ts` from
 * rows the room already has (no model), carries the cards it came from, and
 * has a stable `key` so a person can cross it out. A fact a person tells the
 * space is kept next to them and wins over anything noticed.
 *
 * Pure and shared: the server applies the corrections to the facts a voice
 * ask reads (`applyCorrections`), the panel draws the same lists.
 */

export type KnowSection = "who" | "soon" | "decided" | "habits" | "made";

export type KnowLine = {
  /** Stable name of the fact ("payer:Jules", "date:maya's bday"): what a cross-out stores. */
  key: string;
  section: KnowSection;
  /** The fact in plain words. */
  text: string;
  /** Where it came from, in a few words. */
  why: string;
  /** The cards it came from (widget ids), for the camera. */
  src: string[];
  /** A number worth setting big (days left). */
  n?: number;
  /** For a made card: what happened to it. */
  status?: "kept" | "edited" | "removed";
};

/** A fact a person told the space. */
export type Told = { id: string; text: string; by: string; color: string; at: number };
/** A noticed line a person crossed out (its text kept, so the page can still show it struck). */
export type Forgot = { key: string; text: string; by: string; color: string; at: number };

export type RoomKnows = {
  room: string;
  /** When the facts were last rebuilt from the board. */
  at: number;
  people: { name: string; color: string; away?: boolean }[];
  lines: KnowLine[];
  told: Told[];
  forgot: Forgot[];
};

/** Told facts are capped so the ask's extra lines stay small. */
export const TOLD_MAX = 8;
export const TOLD_CHARS = 90;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The facts a voice ask reads, after people have had their say: a crossed-out
 * line is taken out of the data it came from, and told facts ride along as
 * `told` (the ask sends them as a line of their own, `promptV2.ts`).
 */
export function applyCorrections(room: RoomFacts, told: Told[], forgot: Forgot[]): RoomFacts {
  const out: RoomFacts = { ...room };
  for (const f of forgot) {
    const at = f.key.indexOf(":");
    const kind = at < 0 ? f.key : f.key.slice(0, at);
    const what = at < 0 ? "" : f.key.slice(at + 1);
    if (kind === "who") {
      out.people = out.people.filter((p) => !same(p, what));
      out.away = out.away.filter((a) => !same(a.name, what));
    } else if (kind === "away") out.away = out.away.filter((a) => !same(a.name, what));
    else if (kind === "date") out.dates = out.dates.filter((d) => !same(d.title, what));
    else if (kind === "poll") out.polls = out.polls.filter((p) => !same(p.title, what));
    else if (kind === "rsvp") out.rsvps = out.rsvps.filter((r) => !same(r.title, what));
    else if (kind === "split") out.splits = out.splits.filter((s) => !same(s.title, what));
    else if (kind === "payer") out.splits = out.splits.map((s) => (s.payer && same(s.payer, what) ? { ...s, payer: null, paid: 0 } : s));
    else if (kind === "places") out.places = [];
    else if (kind === "wheel") out.wheels = out.wheels.map((w) => (same(w.title, what) ? { ...w, last: null } : w));
    else if (kind === "zones") out.clocks = [];
    else if (kind === "lowercase") out.lowercase = false;
  }
  const lines = toldLines(told);
  if (lines.length) out.told = lines;
  else delete out.told;
  return out;
}

/** Told facts as the ask gets them: newest first, each with who said it, capped. */
export function toldLines(told: Told[]): string[] {
  return [...told]
    .sort((a, b) => b.at - a.at)
    .slice(0, TOLD_MAX)
    .map((t) => `${t.text.replace(/\s+/g, " ").trim().slice(0, TOLD_CHARS)} (${t.by} said)`);
}

/** The lines still standing (not crossed out), for the opener's count. */
export function standing(k: RoomKnows): number {
  const gone = new Set(k.forgot.map((f) => f.key));
  return k.lines.filter((l) => l.section !== "made" && !gone.has(l.key)).length + k.told.length;
}

/** "Maya, Jules and Sam". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
