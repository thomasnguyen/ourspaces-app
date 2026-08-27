import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";

const MAP_WIDTH = 224;
const MAP_HEIGHT = 136;
const MAP_PADDING = 7;

type MapShape = {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type MapPoint = {
  id: string;
  x: number;
  y: number;
  color: string;
};

type MapMetrics = {
  worldWidth: number;
  worldHeight: number;
  viewportX: number;
  viewportY: number;
  viewportWidth: number;
  viewportHeight: number;
  shapes: MapShape[];
  cursors: MapPoint[];
};

const EMPTY_METRICS: MapMetrics = {
  worldWidth: 1,
  worldHeight: 1,
  viewportX: 0,
  viewportY: 0,
  viewportWidth: 1,
  viewportHeight: 1,
  shapes: [],
  cursors: [],
};

function widgetKind(group: HTMLElement) {
  const shell = group.querySelector<HTMLElement>(".widget-shell");
  if (!shell) return "widget";
  return (
    Array.from(shell.classList).find(
      (className) => className.startsWith("widget-") && className !== "widget-shell",
    ) ?? "widget"
  );
}

function motionBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function CanvasNavigator({
  viewportRef,
  spaceName,
  focusedTargetId = "",
  onHome,
  onRoomNavigate,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  spaceName: string;
  focusedTargetId?: string;
  onHome?: () => void;
  onRoomNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<MapMetrics>(EMPTY_METRICS);
  const mapRef = useRef<HTMLButtonElement>(null);
  const mapDragging = useRef<number | null>(null);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = viewport?.querySelector<HTMLElement>(".space-canvas");
    if (!viewport || !canvas) return;

    const viewportRect = viewport.getBoundingClientRect();
    const worldWidth = Math.max(viewport.scrollWidth, 1);
    const worldHeight = Math.max(viewport.scrollHeight, 1);

    const shapes = Array.from(
      canvas.querySelectorAll<HTMLElement>(".widget-group"),
    )
      .map((group, index): MapShape => {
        const rect = group.getBoundingClientRect();
        return {
          id: group.dataset.widgetId ?? group.dataset.frameId ?? `frame-${index}`,
          kind: widgetKind(group),
          x: rect.left - viewportRect.left + viewport.scrollLeft,
          y: rect.top - viewportRect.top + viewport.scrollTop,
          width: rect.width,
          height: rect.height,
        };
      })
      .sort((a, b) => (a.kind === "widget-frame" ? -1 : b.kind === "widget-frame" ? 1 : 0));

    const cursors = Array.from(
      canvas.querySelectorAll<HTMLElement>("[data-cursor-style]"),
    ).map((cursor, index): MapPoint => {
      const rect = cursor.getBoundingClientRect();
      const colorSource = cursor.querySelector<HTMLElement>(
        ".cs-pill, .cs-sticker-tag, .cs-chip-body, .cs-orb-core, [style*='background-color']",
      );
      return {
        id: `cursor-${index}`,
        x: rect.left - viewportRect.left + viewport.scrollLeft,
        y: rect.top - viewportRect.top + viewport.scrollTop,
        color: colorSource
          ? window.getComputedStyle(colorSource).backgroundColor
          : "#c9ff3d",
      };
    });

    setMetrics({
      worldWidth,
      worldHeight,
      viewportX: viewport.scrollLeft,
      viewportY: viewport.scrollTop,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      shapes,
      cursors,
    });
  }, [viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvas = viewport?.querySelector<HTMLElement>(".space-canvas");
    if (!viewport || !canvas) return;

    let frame = 0;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    viewport.addEventListener("scroll", scheduleMeasure, { passive: true });

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(canvas);

    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(canvas, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", scheduleMeasure);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [measure, viewportRef, spaceName]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [measure, open]);

  useEffect(() => {
    if (focusedTargetId) setOpen(false);
  }, [focusedTargetId]);

  const scale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / metrics.worldWidth,
    (MAP_HEIGHT - MAP_PADDING * 2) / metrics.worldHeight,
  );
  const contentWidth = metrics.worldWidth * scale;
  const contentHeight = metrics.worldHeight * scale;
  const offsetX = (MAP_WIDTH - contentWidth) / 2;
  const offsetY = (MAP_HEIGHT - contentHeight) / 2;

  const mapStyle = (
    x: number,
    y: number,
    width: number,
    height: number,
  ): CSSProperties => ({
    left: offsetX + x * scale,
    top: offsetY + y * scale,
    width: Math.max(2, width * scale),
    height: Math.max(2, height * scale),
  });

  const moveFromMap = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const rect = map.getBoundingClientRect();
    const mapX = ((clientX - rect.left) / rect.width) * MAP_WIDTH;
    const mapY = ((clientY - rect.top) / rect.height) * MAP_HEIGHT;
    const worldX = (mapX - offsetX) / scale;
    const worldY = (mapY - offsetY) / scale;
    const xRatio = Math.max(0, Math.min(1, worldX / metrics.worldWidth));
    const yRatio = Math.max(0, Math.min(1, worldY / metrics.worldHeight));

    onRoomNavigate?.();
    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        left: xRatio * viewport.scrollWidth - viewport.clientWidth / 2,
        top: yRatio * viewport.scrollHeight - viewport.clientHeight / 2,
        behavior: "auto",
      });
    });
  };

  const finishMapDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    mapDragging.current = null;
  };

  const goHome = () => {
    if (onHome) {
      onHome();
      return;
    }

    viewportRef.current?.scrollTo({
      left: 0,
      top: 0,
      behavior: motionBehavior(),
    });
  };

  const panWithKeyboard = (left: number, top: number) => {
    onRoomNavigate?.();
    window.requestAnimationFrame(() => {
      viewportRef.current?.scrollBy({
        left,
        top,
        behavior: motionBehavior(),
      });
    });
  };

  return (
    <>
      {open && (
        <section className="canvas-map-panel" id="canvas-room-map" aria-label="Room map">
          <header className="canvas-map-header">
            <div>
              <strong>room map</strong>
              <span>{spaceName}</span>
            </div>
            <button
              type="button"
              className="canvas-map-close"
              onClick={() => setOpen(false)}
              aria-label="Hide room map"
            >
              ×
            </button>
          </header>

          <button
            ref={mapRef}
            type="button"
            className="canvas-map-stage"
            onPointerDown={(event) => {
              event.preventDefault();
              mapDragging.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              moveFromMap(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (mapDragging.current !== event.pointerId) return;
              moveFromMap(event.clientX, event.clientY);
            }}
            onPointerUp={finishMapDrag}
            onPointerCancel={finishMapDrag}
            onKeyDown={(event) => {
              const distance = event.shiftKey ? 260 : 120;
              const moves: Partial<Record<string, [number, number]>> = {
                ArrowLeft: [-distance, 0],
                ArrowRight: [distance, 0],
                ArrowUp: [0, -distance],
                ArrowDown: [0, distance],
              };
              const move = moves[event.key];
              if (move) {
                event.preventDefault();
                panWithKeyboard(move[0], move[1]);
              }
              if (event.key === "Home") {
                event.preventDefault();
                goHome();
              }
            }}
            aria-label="Navigate the room map. Drag to move, or use the arrow keys."
          >
            <span
              className="canvas-map-world"
              style={{
                left: offsetX,
                top: offsetY,
                width: contentWidth,
                height: contentHeight,
              }}
              aria-hidden="true"
            />
            {metrics.shapes.map((shape) => (
              <span
                key={shape.id}
                className="canvas-map-shape"
                data-kind={shape.kind}
                style={mapStyle(shape.x, shape.y, shape.width, shape.height)}
                aria-hidden="true"
              />
            ))}
            {metrics.cursors.map((cursor) => (
              <span
                key={cursor.id}
                className="canvas-map-cursor"
                style={{
                  left: offsetX + cursor.x * scale,
                  top: offsetY + cursor.y * scale,
                  backgroundColor: cursor.color,
                }}
                aria-hidden="true"
              />
            ))}
            <span
              className="canvas-map-viewport"
              style={mapStyle(
                metrics.viewportX,
                metrics.viewportY,
                metrics.viewportWidth,
                metrics.viewportHeight,
              )}
              aria-hidden="true"
            />
          </button>

          <p className="canvas-map-hint">click or drag to move around</p>
        </section>
      )}

      <button type="button" className="canvas-nav-home" onClick={goHome}>
        <span aria-hidden="true">↖</span>
        reset view
      </button>
      <span className="action-dock-divider" aria-hidden="true" />
      <button
        type="button"
        className={`canvas-nav-map-toggle ${open ? "is-active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="canvas-room-map"
      >
        <span className="canvas-nav-map-icon" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {open ? "hide map" : "map"}
      </button>
    </>
  );
}
