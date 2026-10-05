/**
 * STAND-IN, NOT A MODEL. Mock mode (`?mock=1`) has no backend, so a voice ask
 * there gets this one fixed answer instead of a Nemotron call. It still runs
 * the real path (parseDeal → applyCard → placeCards), so shots and takes work
 * without a key. Its receipt names no model and no latency: nothing was measured.
 */
import type { Widget } from "../../data/types";
import { applyCard } from "./apply";
import { footprint, type CardContext } from "./catalog";
import { placeCards, type Placement, type Rect } from "./place";
import { parseDeal } from "./prompt";

const STAND_IN_ANSWER = `{"card":"poll","settings":{"question":"saturday dinner?","options":["tacos","pho","pizza"]}}`;

export function standInDeal(
  ctx: CardContext,
  room: { board: ReadonlyArray<Rect & { id: string }>; view: Rect; bounds: Rect; anchor: Placement },
): Widget[] {
  const { items } = parseDeal(STAND_IN_ANSWER, true);
  const widgets = items.flatMap((item, i) => {
    const r = item.ok ? applyCard(item.card, ctx, { id: `voice-standin-${Date.now().toString(36)}-${i}`, z: 1000 + i }) : null;
    return r?.ok ? [r.widget] : [];
  });
  const spots = placeCards(widgets.map(footprint), { widgets: room.board, view: room.view, bounds: room.bounds, anchor: room.anchor });
  return widgets.map((w, i) => ({ ...w, ...spots[i] }));
}
