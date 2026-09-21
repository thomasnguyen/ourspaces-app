/**
 * "catch me up" ↔ the board. The panel reports what moved; these helpers
 * point at where — chips that name the card, a pan that keeps the card out
 * from behind the panel, and the reading-scan ring while the model reads.
 */
import type { Widget } from "../data/types";
import { widgetLabel } from "./widgetLabels";

export type RecapTarget = { id: string; type: string; label: string };

/** Cards worth pointing at — decoration (frames, stickers) isn't. */
export function recapTargetsOf(widgets: Widget[]): RecapTarget[] {
  return widgets
    .filter((widget) => widget.type !== "frame" && widget.type !== "sticker")
    .map((widget) => ({ id: widget.id, type: widget.type, label: widgetLabel(widget) }));
}

/* Type words an answer uses when it names a card without its title
   ("the cake poll", "the potluck"). Generic words (note, photo) stay out —
   they'd cite a random card. */
const TYPE_WORDS: Record<string, string> = {
  poll: "poll",
  potluck: "potluck",
  rsvp: "rsvp",
  playlist: "playlist",
  countdown: "countdown",
  itinerary: "itinerary",
  wheel: "wheel",
  expenseSplit: "iou",
};

/** The cards an answer names — by title, else by type word. Two at most. */
export function citesIn(text: string, targets: RecapTarget[]): RecapTarget[] {
  const hay = ` ${text.toLowerCase()} `;
  const hits: RecapTarget[] = [];
  for (const target of targets) {
    const key = target.label.toLowerCase().replace(/[^a-z0-9' ]/g, "").trim();
    if (key.length >= 4 && hay.includes(key)) hits.push(target);
  }
  for (const target of targets) {
    const word = TYPE_WORDS[target.type];
    if (!word || hits.includes(target)) continue;
    if (hay.includes(` ${word}`) && !hits.some((hit) => hit.type === target.type)) hits.push(target);
  }
  return hits.slice(0, 2);
}

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY, overflowX } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY + overflowX)) return node;
    node = node.parentElement;
  }
  return null;
}

/** Pan the board so the card lands in the clear — the part of the viewport
    the panel isn't standing in. `scrollIntoView({block: "center"})` used to
    park the cited card exactly behind the panel. The board starts at scroll
    0, so a card left of the panel often can't travel right — either side
    counts as clear; pick the one the scroll range can actually reach. */
export function panToWidget(widgetId: string) {
  const el = document.querySelector<HTMLElement>(`[data-widget-id="${widgetId}"]`);
  const scroll = el && scrollParentOf(el);
  if (!el || !scroll) return;
  const s = scroll.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const cx = r.left - s.left + r.width / 2;
  const cy = r.top - s.top + r.height / 2;
  const maxLeft = scroll.scrollWidth - scroll.clientWidth;
  const panel = document.querySelector(".recap-panel")?.getBoundingClientRect();
  const rail = document.querySelector(".space-rail")?.getBoundingClientRect();
  const railRight = rail ? Math.max(0, rail.right - s.left) : 0;
  // candidate centers, widest clear side first; a phone-wide panel has none
  const sides = panel
    ? [
        { from: panel.right - s.left + 24, to: s.width },
        { from: railRight + 16, to: panel.left - s.left - 24 },
      ]
        .filter((side) => side.to - side.from > 200)
        .sort((a, b) => b.to - b.from - (a.to - a.from))
        .map((side) => (side.from + side.to) / 2)
    : [];
  if (sides.length === 0) sides.push(s.width / 2);
  // the side the scroll range can reach; failing that, the one it misses least
  const clampError = (targetX: number) => {
    const next = scroll.scrollLeft + cx - targetX;
    return Math.max(0, -next, next - maxLeft);
  };
  const targetX = sides.reduce((best, side) => (clampError(side) < clampError(best) ? side : best), sides[0]);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroll.scrollBy({
    left: cx - targetX,
    top: cy - s.height / 2,
    behavior: reduce ? "auto" : "smooth",
  });
}

/** While the model reads the board, the ring hops card to card in reading
    order. Toggles a class straight on the DOM — it's transient, nothing
    else owns it. Returns the stop function. */
export function startBoardScan(targets: { id: string; x: number; y: number }[], stepMs = 210) {
  const ids = [...targets]
    .sort((a, b) => Math.round(a.y / 260) - Math.round(b.y / 260) || a.x - b.x)
    .map((target) => target.id);
  if (ids.length === 0) return () => {};
  const lit = new Set<HTMLElement>();
  let i = 0;
  const tick = () => {
    const el = document
      .querySelector<HTMLElement>(`[data-widget-id="${ids[i % ids.length]}"]`)
      ?.closest<HTMLElement>(".widget-group");
    i += 1;
    if (!el) return;
    el.classList.add("is-recap-scan");
    lit.add(el);
    window.setTimeout(() => {
      el.classList.remove("is-recap-scan");
      lit.delete(el);
    }, 560);
  };
  tick();
  const timer = window.setInterval(tick, stepMs);
  return () => {
    window.clearInterval(timer);
    lit.forEach((el) => el.classList.remove("is-recap-scan"));
  };
}
