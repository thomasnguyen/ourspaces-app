import { useEffect, useState, type RefObject } from "react";

const EDGE_SIZE = 52;
const EDGE_DWELL_MS = 220;
const MIN_SPEED = 4;
const MAX_SPEED = 17;

type EdgeState = {
  right: boolean;
  bottom: boolean;
};

const INACTIVE_EDGES: EdgeState = {
  right: false,
  bottom: false,
};

const BLOCKER_SELECTOR = [
  ".space-rail",
  ".space-header",
  ".action-dock",
  ".canvas-navigator",
  ".global-chat-panel",
  ".global-chat-tab",
  ".widget-editor-panel",
  ".space-editor-panel",
  ".widget-picker",
  ".widget-management",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
].join(", ");

function edgeSpeed(distance: number) {
  const intensity = Math.max(0, Math.min(1, (EDGE_SIZE - distance) / EDGE_SIZE));
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * intensity * intensity;
}

export function CanvasEdgePan({
  viewportRef,
  disabled = false,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}) {
  const [activeEdges, setActiveEdges] = useState<EdgeState>(INACTIVE_EDGES);

  useEffect(() => {
    if (disabled) {
      setActiveEdges(INACTIVE_EDGES);
      return;
    }

    let animationFrame = 0;
    let edgeKey = "";
    let edgeEnteredAt = 0;
    let lastFrameAt = 0;
    let pointerX = 0;
    let pointerY = 0;
    let panRight = false;
    let panBottom = false;
    let visualRight = false;
    let visualBottom = false;

    const updateVisualState = (right: boolean, bottom: boolean) => {
      if (right === visualRight && bottom === visualBottom) return;
      visualRight = right;
      visualBottom = bottom;
      setActiveEdges({ right, bottom });
    };

    const stop = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      edgeKey = "";
      edgeEnteredAt = 0;
      lastFrameAt = 0;
      panRight = false;
      panBottom = false;
      updateVisualState(false, false);
    };

    const tick = (time: number) => {
      const viewport = viewportRef.current;
      if (!viewport || (!panRight && !panBottom)) {
        stop();
        return;
      }

      if (time - edgeEnteredAt < EDGE_DWELL_MS) {
        animationFrame = window.requestAnimationFrame(tick);
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const frameScale = Math.min(2, (time - (lastFrameAt || time - 16.67)) / 16.67);
      lastFrameAt = time;

      const canMoveRight =
        panRight &&
        viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
      const canMoveBottom =
        panBottom &&
        viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;

      updateVisualState(canMoveRight, canMoveBottom);

      if (canMoveRight) {
        viewport.scrollLeft +=
          edgeSpeed(Math.max(0, rect.right - pointerX)) * frameScale;
      }
      if (canMoveBottom) {
        viewport.scrollTop +=
          edgeSpeed(Math.max(0, rect.bottom - pointerY)) * frameScale;
      }

      if (!canMoveRight && !canMoveBottom) {
        stop();
        return;
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const viewport = viewportRef.current;
      if (!viewport || event.pointerType !== "mouse") {
        stop();
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const draggingWidget = Boolean(target?.closest(".widget-drag-handle"));
      if (!draggingWidget && target?.closest(BLOCKER_SELECTOR)) {
        stop();
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const insideViewport =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!insideViewport) {
        stop();
        return;
      }

      pointerX = event.clientX;
      pointerY = event.clientY;
      panRight =
        rect.right - pointerX <= EDGE_SIZE &&
        viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
      panBottom =
        rect.bottom - pointerY <= EDGE_SIZE &&
        viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;

      const nextEdgeKey = `${panRight ? "r" : ""}${panBottom ? "b" : ""}`;
      if (!nextEdgeKey) {
        stop();
        return;
      }

      if (nextEdgeKey !== edgeKey) {
        edgeKey = nextEdgeKey;
        edgeEnteredAt = performance.now();
        lastFrameAt = 0;
        updateVisualState(false, false);
      }

      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    const onPointerOut = (event: globalThis.PointerEvent) => {
      if (!event.relatedTarget) stop();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerout", onPointerOut);
    window.addEventListener("blur", stop);

    return () => {
      stop();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("blur", stop);
    };
  }, [disabled, viewportRef]);

  return (
    <div className="canvas-edge-pan-cues" aria-hidden="true">
      <span
        className={`canvas-edge-pan-cue canvas-edge-pan-cue-right ${
          activeEdges.right ? "is-active" : ""
        }`}
      />
      <span
        className={`canvas-edge-pan-cue canvas-edge-pan-cue-bottom ${
          activeEdges.bottom ? "is-active" : ""
        }`}
      />
    </div>
  );
}
