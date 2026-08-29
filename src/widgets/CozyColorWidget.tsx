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
import {
  ART_DECOR,
  ART_H,
  ART_REGIONS,
  ART_W,
  type ArtRegion,
  type ArtTone,
} from "./cozyColorArt";

export type CozyColorTone = ArtTone;

export type CozyColorPoint = { x: number; y: number };
export type CozyColorPreset = "electric" | "sunset";

export type CozyColorStroke = {
  id: string;
  userId: string;
  authorName: string;
  authorColor: string;
  tone: CozyColorTone;
  size: number;
  points: CozyColorPoint[];
  regionId?: string;
  preset?: CozyColorPreset;
  createdAt: number;
};

export type CozyColorIdentity = {
  userId: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
};

const TONES: { tone: CozyColorTone; number: number; label: string }[] = [
  { tone: "berry", number: 1, label: "pink" },
  { tone: "orange", number: 2, label: "orange" },
  { tone: "blue", number: 3, label: "blue" },
  { tone: "violet", number: 4, label: "violet" },
  { tone: "teal", number: 5, label: "teal" },
  { tone: "lime", number: 6, label: "lime" },
];
const TONE_NUMBER = Object.fromEntries(TONES.map(({ tone, number }) => [tone, number])) as Record<
  CozyColorTone,
  number
>;

const REGION_IDS = new Set(ART_REGIONS.map((region) => region.id));

function ArtBoard({
  filled,
  activeTone,
  complete,
  onRegion,
}: {
  filled: Map<string, CozyColorStroke>;
  activeTone: CozyColorTone;
  complete: boolean;
  onRegion: (region: ArtRegion) => void;
}) {
  return (
    <svg
      className="cozy-svg"
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      role="img"
      aria-label="Paint-by-number night valley: one moon over two hills, two houses, one river"
    >
      <rect className="cozy-svg-bg" width={ART_W} height={ART_H} />
      {ART_REGIONS.map((region) => {
        const mark = filled.get(region.id);
        const matched = region.tone === activeTone;
        return (
          <path
            key={region.id}
            d={region.d}
            fillRule="evenodd"
            className={`cozy-svg-region tone-${region.tone}${mark ? " is-filled" : ""}${matched ? " is-matched" : ""}${region.id.startsWith("star") ? " cozy-svg-star" : ""}`}
            onClick={() => onRegion(region)}
            aria-label={`${region.id.replace(/-/g, " ")}, number ${TONE_NUMBER[region.tone]}`}
          />
        );
      })}
      {ART_DECOR.map((piece, index) => (
        <path
          key={index}
          d={piece.d}
          strokeWidth={piece.w}
          className={`cozy-svg-decor${complete ? " is-lit" : ""}`}
        />
      ))}
      {ART_REGIONS.flatMap((region) =>
        region.labels.map((label, index) => {
          const mark = filled.get(region.id);
          const matched = region.tone === activeTone;
          return (
            <text
              key={`${region.id}-${index}`}
              x={label.x}
              y={label.y}
              fontSize={label.s * 1.15}
              className={`cozy-svg-number${mark ? " is-filled" : ""}${matched ? " is-matched" : ""}`}
            >
              {TONE_NUMBER[region.tone]}
            </text>
          );
        }),
      )}
    </svg>
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
  const preset = useMemo(() => {
    for (let index = shownStrokes.length - 1; index >= 0; index -= 1) {
      const mark = shownStrokes[index];
      if (mark.regionId === "__preset__" && mark.preset) return mark.preset;
    }
    return "electric";
  }, [shownStrokes]);
  const filled = useMemo(() => {
    const result = new Map<string, CozyColorStroke>();
    for (const stroke of shownStrokes) {
      if (stroke.regionId && REGION_IDS.has(stroke.regionId)) {
        result.set(stroke.regionId, stroke);
      }
    }
    return result;
  }, [shownStrokes]);
  const progress = Math.round((filled.size / ART_REGIONS.length) * 100);
  const complete = filled.size === ART_REGIONS.length;
  const wasComplete = useRef(complete);
  const remainingByTone = useMemo(() => {
    const result = new Map<CozyColorTone, number>(TONES.map(({ tone }) => [tone, 0]));
    for (const region of ART_REGIONS) {
      if (!filled.has(region.id)) result.set(region.tone, (result.get(region.tone) ?? 0) + 1);
    }
    return result;
  }, [filled]);

  useEffect(() => {
    if (complete && !wasComplete.current) playSound("promote");
    wasComplete.current = complete;
  }, [complete]);

  useEffect(() => {
    if ((remainingByTone.get(activeTone) ?? 0) > 0) return;
    const next = TONES.find(({ tone }) => (remainingByTone.get(tone) ?? 0) > 0);
    if (next) setActiveTone(next.tone);
  }, [activeTone, remainingByTone]);

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

  const fillRegion = (region: ArtRegion) => {
    if (filled.has(region.id)) return;
    if (region.tone !== activeTone) {
      // tapping any dim number jumps to that color
      setActiveTone(region.tone);
      playSound("tap");
      return;
    }
    const label = region.labels[0];
    const localId = `paint-${crypto.randomUUID()}`;
    const next: CozyColorStroke = {
      id: localId,
      userId: identity?.userId ?? "local-you",
      authorName: identity?.name ?? "you",
      authorColor: identity?.color ?? "var(--color-couple)",
      tone: region.tone,
      size: 0.04,
      points: [{ x: label.x / ART_W, y: label.y / ART_H }],
      regionId: region.id,
      createdAt: Date.now(),
    };
    setLocalStrokes((existing) => [...existing, next]);
    playSound("place");
    if (onStroke) {
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
      ).then((saved) => {
        // mock mode resolves null — keep the local stroke as the source of truth
        if (!saved) return;
        window.setTimeout(() => {
          setLocalStrokes((existing) => existing.filter((stroke) => stroke.id !== localId));
        }, 500);
      });
    }
    if ((remainingByTone.get(region.tone) ?? 0) === 1) {
      const nextTone = TONES.find(({ tone }) => tone !== region.tone && (remainingByTone.get(tone) ?? 0) > 0);
      if (nextTone) window.setTimeout(() => setActiveTone(nextTone.tone), 180);
    }
  };

  const choosePreset = (nextPreset: CozyColorPreset) => {
    if (preset === nextPreset) return;
    const localId = `preset-${crypto.randomUUID()}`;
    const next: CozyColorStroke = {
      id: localId,
      userId: identity?.userId ?? "local-you",
      authorName: identity?.name ?? "you",
      authorColor: identity?.color ?? "var(--color-couple)",
      tone: "berry",
      size: 0.04,
      points: [],
      regionId: "__preset__",
      preset: nextPreset,
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
        preset: next.preset,
      }),
    ).then((saved) => {
      if (!saved) return;
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
    <div
      className="cozy-color-room"
      data-preset={preset}
      role="dialog"
      aria-modal="true"
      aria-label="Color together"
      // portal events bubble through the React tree into WidgetCard's
      // drag handlers (which pointer-capture non-button targets and eat
      // clicks on the SVG regions) — keep the room self-contained
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
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
          <strong>{complete ? "finished!" : `${filled.size}/${ART_REGIONS.length}`}</strong>
        </div>
      </header>

      <main className="cozy-color-room-main">
        <section
          className={`cozy-color-room-board${complete ? " is-complete" : ""}`}
          aria-label={`${progress}% colored`}
        >
          <ArtBoard filled={filled} activeTone={activeTone} complete={complete} onRegion={fillRegion} />
          <div className="cozy-color-now">
            <b className={`tone-${activeTone}`}>{TONE_NUMBER[activeTone]}</b>
            <span>{complete ? "you finished it together" : "tap the matching numbers"}</span>
          </div>
          <div className="cozy-color-progress"><i style={{ width: `${progress}%` }} /><span>{progress}% cozy</span></div>
        </section>

        <footer className="cozy-color-gamebar">
          <div className="cozy-color-presets" aria-label="Shared color preset">
            <button
              type="button"
              className={preset === "electric" ? "is-active" : ""}
              onClick={() => choosePreset("electric")}
              aria-pressed={preset === "electric"}
            >
              <i><span /><span /><span /></i><b>night pop</b>
            </button>
            <button
              type="button"
              className={preset === "sunset" ? "is-active" : ""}
              onClick={() => choosePreset("sunset")}
              aria-pressed={preset === "sunset"}
            >
              <i><span /><span /><span /></i><b>sunset</b>
            </button>
          </div>
          <div className="cozy-color-number-pots" aria-label="Numbered colors">
            {TONES.map(({ tone, number, label }) => (
              <button
                type="button"
                key={tone}
                className={`cozy-color-number-pot tone-${tone}${activeTone === tone ? " is-active" : ""}${remainingByTone.get(tone) ? "" : " is-complete"}`}
                onClick={() => {
                  setActiveTone(tone);
                  playSound("tap");
                }}
                aria-label={`Highlight number ${number}, ${label}`}
                aria-pressed={activeTone === tone}
              >
                <b>{remainingByTone.get(tone) ? number : "✓"}</b>
                <span>{remainingByTone.get(tone) || "done"}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cozy-color-game-reset"
            onClick={clear}
            disabled={!filled.size}
            aria-label="Start this picture over"
          >
            ↻<span>reset</span>
          </button>
        </footer>
      </main>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <section className="widget-shell widget-cozy-color" data-preset={preset} style={style}>
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
          <img src="/assets/cozy-color-poster.svg" alt="Night valley poster: one moon over two little houses" />
          <span className="cozy-color-door-shade" />
          <span className="cozy-color-door-cta"><b>open coloring room</b><em>fills your whole screen →</em></span>
          <span className="cozy-color-door-progress">{filled.size}/{ART_REGIONS.length} filled</span>
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
