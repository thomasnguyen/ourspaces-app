import { placeCards, type Rect } from "../deck/place";

/** The games corner: the game card's slot and the scoreboard beside it, placed
    like any card (`placeCards`) inside the board, never past its edge. Both
    slots are reserved at full size once per room, so starting a game never
    moves the scoreboard. */
export const GAME_CARD = { w: 400, h: 560 };
export const SCOREBOARD_CARD = { w: 300, h: 560 };

/** Rooms whose corner has a spot of its own: the crew's is right of the challenge corner (convex/seed.ts CREW_CANVAS
    widens the board for it), so a hero ask still finds that corner clear. There the scoreboard comes first, hugging
    the challenge, and a game opens beyond it (not a blank slot between them). */
const GAME_CORNERS: Record<string, { x: number; y: number }> = { "the-crew": { x: 1690, y: 48 } };

const spots = new Map<string, { card: { x: number; y: number }; board: { x: number; y: number } }>();

export function gameSpots(key: string, widgets: ReadonlyArray<Rect & { id: string }>, canvas: { w: number; h: number }) {
  const known = spots.get(key);
  if (known) return known;
  const room = { x: 0, y: 0, w: canvas.w, h: canvas.h };
  const anchor = GAME_CORNERS[key];
  const [card, board] = anchor
    ? placeCards([SCOREBOARD_CARD, GAME_CARD], { widgets, view: room, bounds: room, anchor }).reverse()
    : placeCards([GAME_CARD, SCOREBOARD_CARD], { widgets, view: room, bounds: room });
  const out = { card, board };
  if (widgets.length) spots.set(key, out);
  return out;
}
