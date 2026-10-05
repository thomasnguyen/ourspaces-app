/**
 * `?deck=<n>` on a mock space: the first n cards of a canned answer go through
 * the real path (parseDeal → applyCard → placeCards) and drop onto the board.
 * `&deckSel=<widget id>` selects an object first; `&deckHeld=<id,id>` marks held ones.
 * No model call, nothing written anywhere.
 */
import type { Widget } from "../../data/types";
import { applyCard } from "./apply";
import { footprint, type CardContext } from "./catalog";
import { placeCards, type Rect } from "./place";
import { parseDeal } from "./prompt";

export type DeckLab = { n: number; selected: string | null; held: Set<string> };

export function deckLabRequested(): DeckLab | null {
  const q = new URLSearchParams(window.location.search);
  const n = Math.min(8, Math.max(0, Math.round(Number(q.get("deck")) || 0)));
  if (!n) return null;
  const held = (q.get("deckHeld") ?? "").split(",").filter(Boolean);
  return { n, selected: q.get("deckSel"), held: new Set(held) };
}

const isoIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A canned eight-card answer, shaped like the model's: "plan our Tahoe weekend". */
function demoAnswer() {
  return [
    `{"card":"poll","settings":{"question":"where do we eat saturday?","options":["tacos","pho","pizza"]}}`,
    `{"card":"checklist","settings":{"title":"tahoe packing","items":["sleeping bags","cooler","speaker","sunscreen"]}}`,
    `{"card":"countdown","settings":{"event":"tahoe weekend","date":"${isoIn(12)}"}}`,
    `{"card":"wheel","settings":{"title":"who drives?","options":["Maya","Jules","Sam","Kenji"]}}`,
    `{"card":"itinerary","settings":{"title":"tahoe · 2 nights","days":[{"day":"fri","plan":"drive up, late tacos"},{"day":"sat","plan":"lake + hike"},{"day":"sun","plan":"brunch, home"}]}}`,
    `{"card":"split","settings":{"title":"cabin","total":640}}`,
    `{"card":"rsvp","settings":{"title":"tahoe weekend","when":"fri 5pm"}}`,
    `{"card":"note","settings":{"text":"cabin code is 4471, don't lose it this time","label":"pinned"}}`,
  ].join("\n");
}

export function dealDemo(
  lab: DeckLab,
  ctx: CardContext,
  board: ReadonlyArray<Rect & { id: string }>,
  view: Rect,
  bounds: Rect,
): Widget[] {
  const { items } = parseDeal(demoAnswer(), true);
  const widgets = items
    .slice(0, lab.n)
    .flatMap((item, i) => {
      const r = item.ok ? applyCard(item.card, ctx, { id: `deck-lab-${i}`, z: 40 + i }) : null;
      return r?.ok ? [r.widget] : [];
    });
  const spots = placeCards(widgets.map(footprint), { widgets: board, view, bounds, selected: lab.selected, held: lab.held });
  return widgets.map((w, i) => ({ ...w, ...spots[i] }));
}
