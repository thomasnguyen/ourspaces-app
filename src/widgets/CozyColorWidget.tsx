import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { MemberFace } from "../components/MemberFace";
import type { Widget } from "../data/types";
import { playSound } from "../lib/sounds";

export type CozyColorTone =
  | "berry"
  | "orange"
  | "blue"
  | "violet"
  | "teal"
  | "lime";

export type CozyColorPoint = { x: number; y: number };

export type CozyColorStroke = {
  id: string;
  userId: string;
  authorName: string;
  authorColor: string;
  tone: CozyColorTone;
  size: number;
  points: CozyColorPoint[];
  createdAt: number;
};

export type CozyColorIdentity = {
  userId: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
};

const TONES: CozyColorTone[] = [
  "berry",
  "orange",
  "blue",
  "violet",
  "teal",
  "lime",
];

const TONE_PROPERTIES: Record<CozyColorTone, string> = {
  berry: "--paint-berry",
  orange: "--paint-orange",
  blue: "--paint-blue",
  violet: "--paint-violet",
  teal: "--paint-teal",
  lime: "--paint-lime",
};

const BRUSHES = [
  { label: "small brush", value: 0.022 },
  { label: "medium brush", value: 0.04 },
  { label: "big brush", value: 0.066 },
] as const;

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Pick<CozyColorStroke, "tone" | "size" | "points">,
  width: number,
  height: number,
  color: string,
) {
  if (!stroke.points.length) return;
  context.beginPath();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.size * Math.min(width, height);

  const first = stroke.points[0];
  const firstX = first.x * width;
  const firstY = first.y * height;
  if (stroke.points.length === 1) {
    context.arc(firstX, firstY, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.moveTo(firstX, firstY);
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x * width, point.y * height);
  }
  context.stroke();
}

export function CozyColorWidget({
  widget,
  style,
  strokes,
  identity,
  onStroke,
  onClear,
}: {
  widget: Widget;
  style: CSSProperties;
  strokes?: CozyColorStroke[];
  identity?: CozyColorIdentity;
  onStroke?: (stroke: Omit<CozyColorStroke, "id" | "createdAt">) => Promise<unknown> | void;
  onClear?: () => Promise<unknown> | void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tone, setTone] = useState<CozyColorTone>("berry");
  const [brush, setBrush] = useState(0.04);
  const [currentPoints, setCurrentPoints] = useState<CozyColorPoint[]>([]);
  const [localStrokes, setLocalStrokes] = useState<CozyColorStroke[]>([]);
  const activePointer = useRef<number | null>(null);
  const currentPointsRef = useRef<CozyColorPoint[]>([]);
  const shownStrokes = useMemo(
    () => [...(strokes ?? []), ...localStrokes],
    [localStrokes, strokes],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const computed = window.getComputedStyle(canvas);
    for (const stroke of shownStrokes) {
      drawStroke(
        context,
        stroke,
        width,
        height,
        computed.getPropertyValue(TONE_PROPERTIES[stroke.tone]).trim(),
      );
    }
    if (currentPoints.length) {
      drawStroke(
        context,
        { tone, size: brush, points: currentPoints },
        width,
        height,
        computed.getPropertyValue(TONE_PROPERTIES[tone]).trim(),
      );
    }
  }, [brush, currentPoints, shownStrokes, tone]);

  const pointFromEvent = (event: PointerEvent<HTMLDivElement>): CozyColorPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const beginStroke = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    const firstPoint = pointFromEvent(event);
    currentPointsRef.current = [firstPoint];
    setCurrentPoints(currentPointsRef.current);
  };

  const moveStroke = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const next = pointFromEvent(event);
    const last = currentPointsRef.current.at(-1);
    if (last && Math.hypot(next.x - last.x, next.y - last.y) < 0.006) return;
    currentPointsRef.current = [...currentPointsRef.current, next];
    setCurrentPoints(currentPointsRef.current);
  };

  const finishStroke = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointer.current = null;
    const points = currentPointsRef.current;
    currentPointsRef.current = [];
    setCurrentPoints([]);
    if (!points.length) return;

    const localId = `paint-${crypto.randomUUID()}`;
    const next: CozyColorStroke = {
      id: localId,
      userId: identity?.userId ?? "local-you",
      authorName: identity?.name ?? "you",
      authorColor: identity?.color ?? "var(--color-couple)",
      tone,
      size: brush,
      points,
      createdAt: Date.now(),
    };
    setLocalStrokes((existing) => [...existing, next]);
    playSound("tap");

    if (onStroke) {
      void Promise.resolve(
        onStroke({
          userId: next.userId,
          authorName: next.authorName,
          authorColor: next.authorColor,
          tone: next.tone,
          size: next.size,
          points: next.points,
        }),
      ).then(() => {
        window.setTimeout(() => {
          setLocalStrokes((existing) => existing.filter((stroke) => stroke.id !== localId));
        }, 550);
      });
    }
  };

  const clear = () => {
    currentPointsRef.current = [];
    setCurrentPoints([]);
    setLocalStrokes([]);
    playSound("tap");
    void onClear?.();
  };

  const artists = useMemo(() => {
    const entries = new Map<string, CozyColorIdentity>();
    if (identity) entries.set(identity.userId, identity);
    for (const stroke of shownStrokes) {
      entries.set(stroke.userId, {
        userId: stroke.userId,
        name: stroke.authorName,
        color: stroke.authorColor,
      });
    }
    return [...entries.values()].slice(-3);
  }, [identity, shownStrokes]);

  return (
    <section className="widget-shell widget-cozy-color" style={style}>
      <header className="cozy-color-heading">
        <div>
          <span className="cozy-color-kicker"><i /> coloring together</span>
          <h3>{String(widget.data.title ?? "same moon, both windows")}</h3>
        </div>
        <div className="cozy-color-artists" aria-label={`${artists.length} people coloring`}>
          {artists.map((artist) => (
            <MemberFace
              key={artist.userId}
              name={artist.name}
              emoji={artist.emoji}
              avatarUrl={artist.avatarUrl}
              color={artist.color}
              size="xs"
            />
          ))}
          <span>{shownStrokes.length ? `${shownStrokes.length} strokes` : "start here"}</span>
        </div>
      </header>

      <div
        className="cozy-color-stage"
        onPointerDown={beginStroke}
        onPointerMove={moveStroke}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onClick={(event) => event.stopPropagation()}
        role="button"
        tabIndex={0}
        aria-label="Color the shared airport lounge picture"
      >
        <img
          src={String(widget.data.src ?? "/assets/cozy-color-same-moon.png")}
          alt="Two airport lounge seats, travel mugs, suitcases, and one moon beyond the windows"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className="cozy-color-paint-layer"
          aria-hidden="true"
        />
        {!shownStrokes.length && !currentPoints.length && (
          <span className="cozy-color-nudge">drag a color onto the picture</span>
        )}
      </div>

      <footer className="cozy-color-tools" onClick={(event) => event.stopPropagation()}>
        <div className="cozy-color-palette" aria-label="Paint colors">
          {TONES.map((value) => (
            <button
              type="button"
              key={value}
              className={`cozy-color-swatch tone-${value}${tone === value ? " is-active" : ""}`}
              onClick={() => {
                setTone(value);
                playSound("tap");
              }}
              aria-label={`${value} paint`}
              aria-pressed={tone === value}
            />
          ))}
        </div>
        <div className="cozy-color-brushes" aria-label="Brush size">
          {BRUSHES.map((size) => (
            <button
              type="button"
              key={size.value}
              className={brush === size.value ? "is-active" : ""}
              onClick={() => setBrush(size.value)}
              aria-label={size.label}
              aria-pressed={brush === size.value}
            >
              <i style={{ "--brush-dot": `${Math.round(size.value * 180)}px` } as CSSProperties} />
            </button>
          ))}
        </div>
        <button type="button" className="cozy-color-clear" onClick={clear} disabled={!shownStrokes.length}>
          start over
        </button>
      </footer>
    </section>
  );
}
