/**
 * The third answer to an ask, besides a card or none: the thing already
 * exists. "add a poll for cake flavor" when "cake flavor?" is on the board,
 * "who's on dishes tonight" when the dishes wheel is. The model's yes/no
 * ("is a card already on the board that does what the request asks?", the
 * decide fan-out) is only the signal; this file is the code check that a
 * widget of that kind with a matching title really is on the board. Without
 * a match here the model is never asked, and its yes never swallows an ask
 * on its own: a false "it exists" is worse than a duplicate.
 */
import type { Widget } from "../../data/types";
import { CATALOG } from "./catalog";
import { guessCard } from "./guess";

/** One widget on the board, as the check sees it. */
export type BoardItem = { id: string; card: string; title: string; by: string | null };

export type ExistingCheck =
  | { ok: true; item: BoardItem; shared: string[]; why: string }
  | { ok: false; why: string };

const CARD_OF = new Map(CATALOG.map((c) => [c.type as string, c.id as string]));

/** A widget's title the way the room reads it (poll question, countdown event, …). */
export function titleOfWidget(w: Pick<Widget, "data">): string {
  const d = w.data as Record<string, unknown>;
  for (const k of ["title", "question", "event", "label", "kicker", "text"]) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v.replace(/\s+/g, " ").trim().slice(0, 60);
  }
  return "";
}

/** The board's deck cards with a title, for the check. `by` names who made each, when known. */
export function boardItems(widgets: Widget[], by: (id: string) => string | null = () => null): BoardItem[] {
  return widgets.flatMap((w) => {
    const card = CARD_OF.get(w.type);
    const title = titleOfWidget(w);
    if (!card || !title || w.id.startsWith("voice-draft-")) return [];
    return [{ id: w.id, card, title, by: by(w.id) }];
  });
}

/** Words that ask for a new one, even when one exists. */
const WANTS_NEW = /\b(another|new|second|2nd|extra|fresh|separate|different|one more|more|next (week|weekend|month|time|year))\b/i;
/** Words that carry no topic: card names, verbs of making, "who", time words. */
const GENERIC = new Set(
  ("a an the of for to on in at is are do does did who whos what whats which s our we us this that it and or with my me i you " +
    "add make put start create set up get have let lets can could please need want some " +
    "poll polls vote list checklist wheel spin card note countdown rsvp question tonight today tomorrow week weekend now " +
    "again still all everyone everybody one whose turn").split(" "),
);
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/['’]s\b/g, "").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
const topic = (s: string) => new Set(norm(s).split(" ").filter((w) => w && !GENERIC.has(w)).map((w) => w.replace(/(es|s)$/, "")));

/**
 * The widget these words already have, if code can see one: the same kind
 * when the words name a kind, the widget's topic words in the words (all of
 * a one- or two-word topic, two thirds of a longer one), and two thirds of
 * the words' own topic in the title: more topic than that is a new ask ("who's coming to game night" is not the
 * rsvp "who's coming").
 */
export function existingFor(said: string, items: BoardItem[]): ExistingCheck {
  if (!items.length) return { ok: false, why: "the board has no titled cards" };
  if (WANTS_NEW.test(said)) return { ok: false, why: `the words ask for a new one ("${WANTS_NEW.exec(said)![0]}")` };
  const kind = guessCard(said);
  const want = topic(said);
  let best: { item: BoardItem; shared: string[]; score: number } | null = null;
  for (const item of items) {
    if (kind && item.card !== kind) continue;
    const have = [...topic(item.title)];
    if (!have.length) continue;
    const shared = have.filter((w) => want.has(w));
    const score = shared.length / have.length;
    if (score < (have.length <= 2 ? 1 : 2 / 3) || shared.length < (want.size * 2) / 3) continue;
    if (!best || score > best.score || (score === best.score && shared.length > best.shared.length)) best = { item, shared, score };
  }
  if (!best) return { ok: false, why: kind ? `no ${kind} on the board with these words in its title` : "no card on the board with these words in its title" };
  return {
    ok: true,
    item: best.item,
    shared: best.shared,
    why: `${best.item.card} "${best.item.title}" shares ${best.shared.join(", ")}${kind ? `; the words name a ${kind}` : "; the words name no kind"}`,
  };
}
