/**
 * placeCards: where dealt cards land. Pure, no model — coordinates never come
 * from the model's answer (path-to-win §3 "Fast by construction").
 *
 * Rules, in order:
 * 1. All cards from one ask land as one tidy cluster, in reading order
 *    (rows left to right, tops aligned).
 * 2. Next to the selected object if there is one (right, then below, left, above);
 *    else the clear spot nearest the anchor (a shell already on screen, or the
 *    card dealt just before), else nearest the middle of the speaker's view.
 * 3. Inside the view if the cluster fits there, else inside the canvas, else
 *    past the content (always succeeds).
 * 4. Never on top of a widget; objects someone holds get a wider berth.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export type PlaceRoom = {
  /** Everything already on the board, in canvas coordinates. */
  widgets: ReadonlyArray<Rect & { id: string }>;
  /** The speaker's visible part of the canvas, in canvas coordinates. */
  view: Rect;
  /** Id of the selected object, if any. */
  selected?: string | null;
  /** Ids of objects a person is holding (Right of Way). */
  held?: ReadonlySet<string>;
  /** The canvas itself; cards stay at or right/below its origin. */
  bounds?: Rect;
  /** Land as close to this top-left as fits (ignored when something is selected). */
  anchor?: Placement;
};

export type Placement = { x: number; y: number };

const GAP = 24; // between cards in a cluster, and from any widget
const HELD_GAP = 64; // from an object someone is holding
const PAD = 16; // inset from the view edge
const STEP = 16; // search grid

type Layout = { w: number; h: number; at: Placement[] };

/** Rows of `cols` cards in reading order, tops aligned. */
function layout(sizes: ReadonlyArray<{ w: number; h: number }>, cols: number): Layout {
  const at: Placement[] = [];
  let y = 0;
  let w = 0;
  for (let i = 0; i < sizes.length; i += cols) {
    const row = sizes.slice(i, i + cols);
    let x = 0;
    for (const s of row) {
      at.push({ x, y });
      x += s.w + GAP;
    }
    w = Math.max(w, x - GAP);
    y += Math.max(...row.map((s) => s.h)) + GAP;
  }
  return { w, h: y - GAP, at };
}

const hits = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const inside = (a: Rect, b: Rect) =>
  a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

function rectGap(a: Rect, b: Rect) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Lower is better: next to the selection (right > below > left > above, edges aligned). */
function besideScore(c: Rect, s: Rect) {
  const side =
    c.x >= s.x + s.w ? 0 : c.y >= s.y + s.h ? 1 : c.x + c.w <= s.x ? 2 : 3;
  const align = side === 0 || side === 2 ? Math.abs(c.y - s.y) : Math.abs(c.x - s.x);
  return rectGap(c, s) + side * 40 + align * 0.25;
}

function nearScore(c: Rect, v: Rect) {
  return Math.hypot(c.x + c.w / 2 - (v.x + v.w / 2), c.y + c.h / 2 - (v.y + v.h / 2));
}

export function placeCards(
  cards: ReadonlyArray<{ w: number; h: number }>,
  room: PlaceRoom,
): Placement[] {
  if (!cards.length) return [];
  const held = room.held ?? new Set<string>();
  const view = {
    x: room.view.x + PAD,
    y: room.view.y + PAD,
    w: Math.max(0, room.view.w - PAD * 2),
    h: Math.max(0, room.view.h - PAD * 2),
  };
  const bounds = room.bounds ?? { x: 0, y: 0, w: room.view.x + room.view.w, h: room.view.y + room.view.h };
  const selected = room.selected ? room.widgets.find((w) => w.id === room.selected) : undefined;
  const obstacles = room.widgets.map((w) => ({ r: w as Rect, gap: held.has(w.id) ? HELD_GAP : GAP }));

  // Candidate shapes: widest first, down to one column.
  const layouts = Array.from({ length: Math.min(cards.length, 4) }, (_, i) => layout(cards, Math.min(cards.length, 4) - i));

  // Search area: the canvas, the view, and enough room past the content that a spot always exists.
  const right = Math.max(bounds.x + bounds.w, view.x + view.w, ...room.widgets.map((w) => w.x + w.w));
  const bottom = Math.max(bounds.y + bounds.h, view.y + view.h, ...room.widgets.map((w) => w.y + w.h));
  const minX = bounds.x + PAD;
  const minY = bounds.y + PAD;

  let best: { score: number; x: number; y: number; l: Layout } | null = null;
  for (const [li, l] of layouts.entries()) {
    const xs = new Set<number>();
    const ys = new Set<number>();
    for (let x = minX; x <= right + GAP; x += STEP) xs.add(x);
    for (let y = minY; y <= bottom + GAP; y += STEP) ys.add(y);
    if (selected) {
      // Exact edge-aligned spots beside the selection, on top of the grid.
      xs.add(selected.x + selected.w + GAP).add(selected.x).add(selected.x - l.w - GAP);
      ys.add(selected.y).add(selected.y + selected.h + GAP).add(selected.y - l.h - GAP);
    }
    // Exact spot hugging the view's top-left too, so a near-empty view uses its corner.
    xs.add(view.x);
    ys.add(view.y).add(bottom + HELD_GAP);
    if (room.anchor) {
      xs.add(room.anchor.x);
      ys.add(room.anchor.y);
    }
    for (const x of xs) {
      if (x < minX) continue;
      for (const y of ys) {
        if (y < minY) continue;
        const c = { x, y, w: l.w, h: l.h };
        if (obstacles.some((o) => hits(c, o.r, o.gap))) continue;
        const tier = inside(c, view) ? 0 : inside(c, bounds) ? 1 : 2;
        const near = selected
          ? besideScore(c, selected)
          : room.anchor
            ? Math.hypot(c.x - room.anchor.x, c.y - room.anchor.y)
            : nearScore(c, view);
        const score = tier * 1e6 + near + li * 20;
        if (!best || score < best.score) best = { score, x, y, l };
      }
    }
  }

  // Unreachable: the area past `bottom` is always clear. Keeps the type honest.
  const pick = best ?? { x: minX, y: bottom + HELD_GAP, l: layouts[0] };
  return pick.l.at.map((p) => ({ x: Math.round(pick.x + p.x), y: Math.round(pick.y + p.y) }));
}
