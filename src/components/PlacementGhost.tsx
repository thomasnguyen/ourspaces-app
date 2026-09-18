import { useEffect, useState, type RefObject } from "react";
import { canvasPointFromClient, type CanvasPoint } from "./FirstRunSticky";
import { getStickerDefinition } from "../data/stickers";
import { WIDGET_CATALOG } from "../data/templates";
import type { WidgetType } from "../data/types";
import { getWidgetBlueprint, WIDGET_SIZES } from "../lib/widgetDefaults";
import { clampToBoard, visibleCanvasCenter } from "../lib/canvasPlacement";

/* Pick it up, then put it down.

   Adding used to drop the thing at a fixed spot — the bottom corner of a board
   bigger than the screen — so it landed somewhere you weren't looking. Now the
   picked thing rides the cursor at its real footprint and sticks where you
   click. Shift-click keeps it in hand for another; esc or right-click drops it. */

export type PlacingItem =
  | { kind: "sticker"; stickerId: string }
  | { kind: "widget"; type: WidgetType };

export function placingSize(item: PlacingItem) {
  if (item.kind === "sticker") {
    const sticker = getStickerDefinition(item.stickerId);
    return { w: sticker?.width ?? 140, h: sticker?.height ?? 140 };
  }
  const blueprint = getWidgetBlueprint(item.type);
  return (
    WIDGET_SIZES[item.type] ?? {
      w: blueprint?.w ?? 280,
      h: blueprint?.h ?? 180,
    }
  );
}

export function PlacementGhost({
  item,
  origin,
  viewportRef,
  canvasScale = 1,
  onPlace,
  onCancel,
}: {
  item: PlacingItem;
  origin?: { x: number; y: number };
  viewportRef: RefObject<HTMLDivElement | null>;
  canvasScale?: number;
  onPlace: (point: CanvasPoint, keepPlacing: boolean) => void;
  onCancel: () => void;
}) {
  const size = placingSize(item);
  const sticker =
    item.kind === "sticker" ? getStickerDefinition(item.stickerId) : undefined;
  const template =
    item.kind === "widget"
      ? WIDGET_CATALOG.find((entry) => entry.type === item.type)
      : undefined;

  // Seed at the tray button you clicked, so it reads as lifted off that spot.
  const [point, setPoint] = useState<CanvasPoint>(() => {
    const canvas = document.querySelector<HTMLElement>(".space-canvas");
    if (origin && canvas) {
      return canvasPointFromClient(origin.x, origin.y, canvas, canvasScale);
    }
    return visibleCanvasCenter(size, canvasScale);
  });
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const canvasOf = () => viewport.querySelector<HTMLElement>(".space-canvas");

    const onMove = (event: PointerEvent) => {
      const canvas = canvasOf();
      if (!canvas) return;
      setTracking(true);
      setPoint(
        canvasPointFromClient(event.clientX, event.clientY, canvas, canvasScale),
      );
    };

    // Capture: while you're holding something, a click on the board places it —
    // it never reaches the widget under the cursor.
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const canvas = canvasOf();
      if (!canvas) return;
      event.preventDefault();
      event.stopPropagation();
      const landed = canvasPointFromClient(
        event.clientX,
        event.clientY,
        canvas,
        canvasScale,
      );
      onPlace(clampToBoard(landed, size, canvas), event.shiftKey);
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      onCancel();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerdown", onPointerDown, true);
    viewport.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      viewport.removeEventListener("pointerdown", onPointerDown, true);
      viewport.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canvasScale, onCancel, onPlace, size.h, size.w, viewportRef]);

  const tilt = sticker?.rotate ?? -1.5;
  const hint = tracking
    ? item.kind === "sticker"
      ? "click to stick it down"
      : "click to drop it here"
    : "tap where it goes";

  return (
    <div
      className={`placement-ghost ${
        item.kind === "sticker" ? "is-sticker" : "is-widget"
      }`}
      style={{
        left: point.x - size.w / 2,
        top: point.y - size.h / 2,
        width: size.w,
        height: size.h,
        rotate: `${tilt}deg`,
      }}
      aria-hidden="true"
    >
      {sticker ? (
        <img src={sticker.src} alt={sticker.label} draggable={false} decoding="async" />
      ) : (
        <span className="placement-ghost-card">
          <span className="placement-ghost-emoji">{template?.emoji ?? "▢"}</span>
          <span className="placement-ghost-label">{template?.label ?? "widget"}</span>
        </span>
      )}
      <span className="placement-ghost-hint" style={{ rotate: `${-tilt}deg` }}>
        {hint}
      </span>
    </div>
  );
}
