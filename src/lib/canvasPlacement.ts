import type { CanvasPoint } from "../components/FirstRunSticky";

/* Where a new thing lands. The rule: the middle of what you are LOOKING at,
   never the middle (or the corner) of the board — a widget you can't see is a
   widget you think didn't get added. */

export function visibleCanvasCenter(
  size: { w: number; h: number },
  scale: number,
  nudge = 0,
): CanvasPoint {
  const canvas = document.querySelector<HTMLElement>(".space-canvas");
  const viewport = document.querySelector<HTMLElement>(".space-scroll");
  const canvasRect = canvas?.getBoundingClientRect();
  const viewportRect = viewport?.getBoundingClientRect();

  if (canvasRect && viewportRect) {
    return {
      x:
        (viewportRect.left + viewportRect.width / 2 - canvasRect.left) / scale +
        nudge,
      y:
        (viewportRect.top + viewportRect.height / 2 - canvasRect.top) / scale +
        nudge,
    };
  }

  return {
    x: 420 + size.w / 2 + nudge,
    y: 180 + size.h / 2 + nudge,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Centre point → top-left corner, kept inside the board with a 24px gutter. */
export function canvasSlotFor(
  center: CanvasPoint,
  size: { w: number; h: number },
  bounds: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: Math.round(clamp(center.x - size.w / 2, 24, bounds.w - size.w - 24)),
    y: Math.round(clamp(center.y - size.h / 2, 24, bounds.h - size.h - 24)),
  };
}

/** Keep a peeled sticker's whole body on the board, whatever you clicked. */
export function clampToBoard(
  point: CanvasPoint,
  size: { w: number; h: number },
  canvas: HTMLElement | null,
): CanvasPoint {
  if (!canvas) return point;
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  return {
    x: clamp(point.x, size.w / 2 + 8, width - size.w / 2 - 8),
    y: clamp(point.y, size.h / 2 + 8, height - size.h / 2 - 8),
  };
}
