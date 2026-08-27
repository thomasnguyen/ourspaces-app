import { useEffect, useRef, useState, type RefObject } from "react";

export type CanvasPoint = { x: number; y: number };

function canvasPointFromClient(
  clientX: number,
  clientY: number,
  canvas: HTMLElement,
  canvasScale: number,
): CanvasPoint {
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: (clientX - canvasRect.left) / canvasScale,
    y: (clientY - canvasRect.top) / canvasScale,
  };
}

export function FirstRunSticky({
  active,
  viewportRef,
  onPlace,
  canvasScale = 1,
}: {
  active: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  onPlace: (point: CanvasPoint) => void;
  canvasScale?: number;
}) {
  const [cursor, setCursor] = useState<CanvasPoint>({ x: 480, y: 360 });
  const placingRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    const onMove = (event: PointerEvent) => {
      const viewport = viewportRef.current;
      const canvas = viewport?.querySelector<HTMLElement>(".space-canvas");
      if (!viewport || !canvas) return;

      setCursor(
        canvasPointFromClient(event.clientX, event.clientY, canvas, canvasScale),
      );
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [active, canvasScale, viewportRef]);

  useEffect(() => {
    if (!active) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || placingRef.current) return;

      const target = event.target as HTMLElement;
      if (
        target.closest(
          ".widget-group[data-widget-id], button, a, input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }

      const canvas = viewport.querySelector<HTMLElement>(".space-canvas");
      if (!canvas) return;

      placingRef.current = true;
      event.preventDefault();
      event.stopPropagation();

      onPlace(
        canvasPointFromClient(event.clientX, event.clientY, canvas, canvasScale),
      );
    };

    viewport.addEventListener("pointerdown", onPointerDown, true);
    return () => viewport.removeEventListener("pointerdown", onPointerDown, true);
  }, [active, canvasScale, onPlace, viewportRef]);

  if (!active) return null;

  return (
    <div
      className="first-run-sticky widget-shell widget-sticky pointer-events-none absolute z-40"
      style={{
        left: cursor.x + 18,
        top: cursor.y + 12,
        width: 240,
        height: 140,
        rotate: "-2deg",
      }}
      aria-live="polite"
    >
      <span className="sticky-tape" aria-hidden="true" />
      <span className="sticky-mark">“</span>
      <p>write something…</p>
      <span className="first-run-hint">click to place</span>
    </div>
  );
}
