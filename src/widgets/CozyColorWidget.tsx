import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
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
  regionId?: string;
  createdAt: number;
};

export type CozyColorIdentity = {
  userId: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
};

type PaintRegion = {
  id: string;
  number: number;
  tone: CozyColorTone;
  x: number;
  y: number;
  label: string;
};

const TONES: { tone: CozyColorTone; number: number; label: string }[] = [
  { tone: "berry", number: 1, label: "pink" },
  { tone: "orange", number: 2, label: "orange" },
  { tone: "blue", number: 3, label: "blue" },
  { tone: "violet", number: 4, label: "violet" },
  { tone: "teal", number: 5, label: "teal" },
  { tone: "lime", number: 6, label: "lime" },
];

const REGIONS: PaintRegion[] = [
  { id: "sky-left", number: 3, tone: "blue", x: 0.145, y: 0.1, label: "left sky" },
  { id: "sky-mid-left", number: 3, tone: "blue", x: 0.34, y: 0.1, label: "middle left sky" },
  { id: "sky-mid-right", number: 3, tone: "blue", x: 0.64, y: 0.1, label: "middle right sky" },
  { id: "sky-right", number: 3, tone: "blue", x: 0.74, y: 0.12, label: "right sky" },
  { id: "sky-far-right", number: 3, tone: "blue", x: 0.9, y: 0.1, label: "far right sky" },
  { id: "moon", number: 2, tone: "orange", x: 0.5, y: 0.17, label: "moon" },
  { id: "cloud-left", number: 5, tone: "teal", x: 0.35, y: 0.34, label: "left cloud" },
  { id: "cloud-right", number: 5, tone: "teal", x: 0.64, y: 0.36, label: "right cloud" },
  { id: "plant-pot", number: 4, tone: "violet", x: 0.08, y: 0.43, label: "plant pot" },
  { id: "plant-leaf", number: 6, tone: "lime", x: 0.1, y: 0.19, label: "plant leaf" },
  { id: "lamp", number: 1, tone: "berry", x: 0.93, y: 0.34, label: "lamp shade" },
  { id: "left-chair", number: 5, tone: "teal", x: 0.055, y: 0.56, label: "left chair back" },
  { id: "left-seat", number: 5, tone: "teal", x: 0.24, y: 0.7, label: "left chair seat" },
  { id: "left-base", number: 4, tone: "violet", x: 0.27, y: 0.82, label: "left chair base" },
  { id: "right-chair", number: 2, tone: "orange", x: 0.95, y: 0.56, label: "right chair back" },
  { id: "right-seat", number: 2, tone: "orange", x: 0.75, y: 0.7, label: "right chair seat" },
  { id: "right-base", number: 5, tone: "teal", x: 0.73, y: 0.82, label: "right chair base" },
  { id: "left-pillow", number: 2, tone: "orange", x: 0.19, y: 0.58, label: "left pillow" },
  { id: "right-pillow", number: 4, tone: "violet", x: 0.8, y: 0.58, label: "right pillow" },
  { id: "left-blanket", number: 2, tone: "orange", x: 0.31, y: 0.64, label: "left blanket" },
  { id: "right-blanket", number: 1, tone: "berry", x: 0.7, y: 0.64, label: "right blanket" },
  { id: "left-mug", number: 5, tone: "teal", x: 0.45, y: 0.67, label: "left mug" },
  { id: "right-mug", number: 2, tone: "orange", x: 0.54, y: 0.67, label: "right mug" },
  { id: "table", number: 4, tone: "violet", x: 0.5, y: 0.71, label: "table top" },
  { id: "left-suitcase", number: 1, tone: "berry", x: 0.11, y: 0.83, label: "left suitcase" },
  { id: "right-suitcase", number: 3, tone: "blue", x: 0.89, y: 0.84, label: "right suitcase" },
  { id: "floor-left", number: 2, tone: "orange", x: 0.39, y: 0.92, label: "left floor" },
  { id: "floor-right", number: 2, tone: "orange", x: 0.61, y: 0.92, label: "right floor" },
];

const TONE_PROPERTIES: Record<CozyColorTone, string> = {
  berry: "--paint-berry",
  orange: "--paint-orange",
  blue: "--paint-blue",
  violet: "--paint-violet",
  teal: "--paint-teal",
  lime: "--paint-lime",
};

const CANVAS_WIDTH = 1152;
const CANVAS_HEIGHT = 768;

function cssColorToRgba(value: string): [number, number, number, number] {
  const sample = document.createElement("canvas");
  sample.width = 1;
  sample.height = 1;
  const context = sample.getContext("2d");
  if (!context) return [0, 0, 0, 255];
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data] as [number, number, number, number];
}

function floodFill(
  image: ImageData,
  startX: number,
  startY: number,
  fill: [number, number, number, number],
) {
  const { data, width, height } = image;
  const start = (startY * width + startX) * 4;
  const target = [data[start], data[start + 1], data[start + 2]];
  if (target[0] < 190 || target[1] < 190 || target[2] < 190) return;

  const seen = new Uint8Array(width * height);
  const stack = [startY * width + startX];
  while (stack.length) {
    const pixel = stack.pop();
    if (pixel === undefined || seen[pixel]) continue;
    seen[pixel] = 1;
    const offset = pixel * 4;
    const close =
      Math.abs(data[offset] - target[0]) < 42 &&
      Math.abs(data[offset + 1] - target[1]) < 42 &&
      Math.abs(data[offset + 2] - target[2]) < 42;
    if (!close) continue;
    data[offset] = fill[0];
    data[offset + 1] = fill[1];
    data[offset + 2] = fill[2];
    data[offset + 3] = fill[3];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) stack.push(pixel - 1);
    if (x < width - 1) stack.push(pixel + 1);
    if (y > 0) stack.push(pixel - width);
    if (y < height - 1) stack.push(pixel + width);
  }
}

function PaintCanvas({
  src,
  filled,
}: {
  src: string;
  filled: Map<string, CozyColorStroke>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    setImageReady(false);
    const image = new Image();
    image.src = src;
    image.onload = () => {
      imageRef.current = image;
      setImageReady(true);
    };
    return () => {
      image.onload = null;
    };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = imageRef.current;
    if (!canvas || !source || !imageReady) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.drawImage(source, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const pixels = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const styles = window.getComputedStyle(canvas);
    for (const region of REGIONS) {
      const stroke = filled.get(region.id);
      if (!stroke) continue;
      floodFill(
        pixels,
        Math.round(region.x * CANVAS_WIDTH),
        Math.round(region.y * CANVAS_HEIGHT),
        cssColorToRgba(styles.getPropertyValue(TONE_PROPERTIES[stroke.tone]).trim()),
      );
    }
    context.putImageData(pixels, 0, 0);
  }, [filled, imageReady]);

  return (
    <canvas
      ref={canvasRef}
      className="cozy-color-room-canvas"
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      aria-label="Shared paint-by-number airport lounge"
    />
  );
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
  const [roomOpen, setRoomOpen] = useState(false);
  const [activeTone, setActiveTone] = useState<CozyColorTone>("berry");
  const [localStrokes, setLocalStrokes] = useState<CozyColorStroke[]>([]);
  const shownStrokes = useMemo(
    () => [...(strokes ?? []), ...localStrokes],
    [localStrokes, strokes],
  );
  const filled = useMemo(() => {
    const result = new Map<string, CozyColorStroke>();
    for (const stroke of shownStrokes) {
      if (stroke.regionId) result.set(stroke.regionId, stroke);
    }
    return result;
  }, [shownStrokes]);
  const progress = Math.round((filled.size / REGIONS.length) * 100);
  const source = String(widget.data.src ?? "/assets/cozy-color-same-moon.png");

  const artists = useMemo(() => {
    const entries = new Map<string, CozyColorIdentity>();
    if (identity) entries.set(identity.userId, identity);
    for (const stroke of shownStrokes) {
      if (!stroke.regionId) continue;
      entries.set(stroke.userId, {
        userId: stroke.userId,
        name: stroke.authorName,
        color: stroke.authorColor,
      });
    }
    return [...entries.values()].slice(-3);
  }, [identity, shownStrokes]);

  useEffect(() => {
    if (!roomOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRoomOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [roomOpen]);

  const fillRegion = (region: PaintRegion) => {
    if (filled.has(region.id)) return;
    setActiveTone(region.tone);
    const localId = `paint-${crypto.randomUUID()}`;
    const next: CozyColorStroke = {
      id: localId,
      userId: identity?.userId ?? "local-you",
      authorName: identity?.name ?? "you",
      authorColor: identity?.color ?? "var(--color-couple)",
      tone: region.tone,
      size: 0.04,
      points: [{ x: region.x, y: region.y }],
      regionId: region.id,
      createdAt: Date.now(),
    };
    setLocalStrokes((existing) => [...existing, next]);
    playSound("tap");
    if (!onStroke) return;
    void Promise.resolve(
      onStroke({
        userId: next.userId,
        authorName: next.authorName,
        authorColor: next.authorColor,
        tone: next.tone,
        size: next.size,
        points: next.points,
        regionId: next.regionId,
      }),
    ).then(() => {
      window.setTimeout(() => {
        setLocalStrokes((existing) => existing.filter((stroke) => stroke.id !== localId));
      }, 500);
    });
  };

  const clear = () => {
    setLocalStrokes([]);
    playSound("tap");
    void onClear?.();
  };

  const room = roomOpen ? createPortal(
    <div className="cozy-color-room" role="dialog" aria-modal="true" aria-label="Color together">
      <header className="cozy-color-room-header">
        <button type="button" className="cozy-color-room-close" onClick={() => setRoomOpen(false)}>
          <span aria-hidden="true">←</span> back to our space
        </button>
        <div className="cozy-color-room-title">
          <span className="cozy-color-kicker"><i /> live together</span>
          <h2>{String(widget.data.title ?? "same moon, both windows")}</h2>
        </div>
        <div className="cozy-color-room-people">
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
          </div>
          <strong>{filled.size}/{REGIONS.length}</strong>
        </div>
      </header>

      <main className="cozy-color-room-main">
        <section className="cozy-color-room-board" aria-label={`${progress}% colored`}>
          <PaintCanvas src={source} filled={filled} />
          <div className="cozy-color-region-layer">
            {REGIONS.map((region) => {
              const isFilled = filled.has(region.id);
              return (
                <button
                  type="button"
                  key={region.id}
                  className={`cozy-color-region tone-${region.tone}${isFilled ? " is-filled" : ""}${activeTone === region.tone ? " is-matched" : ""}`}
                  style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%` }}
                  onClick={() => fillRegion(region)}
                  disabled={isFilled}
                  aria-label={`${isFilled ? "Colored" : "Fill"} ${region.label} with number ${region.number}`}
                >
                  {isFilled ? "✓" : region.number}
                </button>
              );
            })}
          </div>
          <div className="cozy-color-progress"><i style={{ width: `${progress}%` }} /><span>{progress}% cozy</span></div>
        </section>

        <aside className="cozy-color-room-tools">
          <div className="cozy-color-room-instruction">
            <span>paint by number</span>
            <h3>Pick a spot.<br />Color snaps in.</h3>
            <p>Every tap lands live for both of you.</p>
          </div>
          <div className="cozy-color-number-pots" aria-label="Numbered colors">
            {TONES.map(({ tone, number, label }) => (
              <button
                type="button"
                key={tone}
                className={`cozy-color-number-pot tone-${tone}${activeTone === tone ? " is-active" : ""}`}
                onClick={() => {
                  setActiveTone(tone);
                  playSound("tap");
                }}
                aria-label={`Highlight number ${number}, ${label}`}
                aria-pressed={activeTone === tone}
              >
                <b>{number}</b><span>{label}</span>
              </button>
            ))}
          </div>
          <figure className="cozy-color-target">
            <img src="/assets/cozy-color-same-moon-colored.png" alt="Finished color reference" />
            <figcaption>our color target</figcaption>
          </figure>
          <button type="button" className="cozy-color-clear" onClick={clear} disabled={!filled.size}>
            start this picture over
          </button>
        </aside>
      </main>
    </div>,
    document.body,
  ) : null;

  return (
    <>
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
          </div>
        </header>
        <button
          type="button"
          className="cozy-color-door"
          onClick={(event) => {
            event.stopPropagation();
            setRoomOpen(true);
            playSound("tap");
          }}
        >
          <img src="/assets/cozy-color-same-moon-colored.png" alt="Colorful airport lounge postcard" />
          <span className="cozy-color-door-shade" />
          <span className="cozy-color-door-cta"><b>open coloring room</b><em>fills your whole screen →</em></span>
          <span className="cozy-color-door-progress">{filled.size}/{REGIONS.length} filled</span>
        </button>
        <footer className="cozy-color-preview-footer">
          <div className="cozy-color-mini-palette" aria-hidden="true">
            {TONES.map(({ tone, number }) => <i key={tone} className={`tone-${tone}`}>{number}</i>)}
          </div>
          <span>{progress ? `${progress}% done together` : "tap a number to begin"}</span>
        </footer>
      </section>
      {room}
    </>
  );
}
