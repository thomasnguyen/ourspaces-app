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
  COZY_BOARDS,
  strokePrefix,
  type BoardRegion,
  type CozyBoard,
} from "./cozyColorBoards";

export type CozyColorTone = "berry" | "orange" | "blue" | "violet" | "teal" | "lime";

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

export type CozyColorPeer = {
  userId?: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  x: number;
  y: number;
  zone?: string;
};

/** legacy wire field — convex validates tone against these six literals */
const WIRE_TONES: CozyColorTone[] = ["berry", "orange", "blue", "violet", "teal", "lime"];

function boardStrokes(board: CozyBoard, strokes: CozyColorStroke[]) {
  const prefix = strokePrefix(board);
  const ids = new Set(board.regions.map((region) => region.id));
  const result = new Map<string, CozyColorStroke>();
  for (const stroke of strokes) {
    if (!stroke.regionId) continue;
    if (prefix) {
      if (!stroke.regionId.startsWith(prefix)) continue;
      const raw = stroke.regionId.slice(prefix.length);
      if (ids.has(raw)) result.set(raw, stroke);
    } else {
      if (stroke.regionId.includes(":")) continue;
      if (ids.has(stroke.regionId)) result.set(stroke.regionId, stroke);
    }
  }
  return result;
}

function ArtBoard({
  board,
  palette,
  filled,
  activeColor,
  complete,
  onRegion,
}: {
  board: CozyBoard;
  palette: string[];
  filled: Map<string, CozyColorStroke>;
  activeColor: number;
  complete: boolean;
  onRegion: (region: BoardRegion) => void;
}) {
  const strokeW = board.underlay ? 1.7 : 5;
  return (
    <svg
      className={`cozy-svg${board.underlay ? " is-traced" : ""}`}
      viewBox={`0 0 ${board.w} ${board.h}`}
      role="img"
      aria-label={`Paint-by-number: ${board.title}`}
    >
      <rect className="cozy-svg-bg" width={board.w} height={board.h} />
      {board.underlay?.map((piece, index) => (
        <path
          key={index}
          d={piece.d}
          fill={board.muted?.[piece.c] ?? "#241c28"}
          fillRule="evenodd"
          className="cozy-svg-underlay"
        />
      ))}
      {board.regions.map((region) => {
        const mark = filled.get(region.id);
        const matched = region.c === activeColor;
        return (
          <path
            key={region.id}
            d={region.d}
            fillRule="evenodd"
            className={`cozy-svg-region${mark ? " is-filled" : ""}${matched ? " is-matched" : ""}${region.id.startsWith("star") ? " cozy-svg-star" : ""}`}
            style={{ "--region-paint": palette[region.c], strokeWidth: strokeW } as CSSProperties}
            onClick={() => onRegion(region)}
            aria-label={`region ${region.id}, number ${region.c + 1}`}
          />
        );
      })}
      {board.decor?.map((piece, index) => (
        <path
          key={index}
          d={piece.d}
          strokeWidth={piece.w}
          className={`cozy-svg-decor${complete ? " is-lit" : ""}`}
        />
      ))}
      {board.regions.flatMap((region) =>
        region.labels.map((label, index) => {
          const mark = filled.get(region.id);
          const matched = region.c === activeColor;
          return (
            <text
              key={`${region.id}-${index}`}
              x={label.x}
              y={label.y}
              fontSize={label.s * 1.15}
              className={`cozy-svg-number${mark ? " is-filled" : ""}${matched ? " is-matched" : ""}`}
            >
              {region.c + 1}
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
  peers,
  onCursor,
}: {
  widget: Widget;
  style: CSSProperties;
  strokes?: CozyColorStroke[];
  identity?: CozyColorIdentity;
  onStroke?: (stroke: Omit<CozyColorStroke, "id" | "createdAt">) => Promise<unknown> | void;
  onClear?: (regionPrefix?: string) => Promise<unknown> | void;
  peers?: CozyColorPeer[];
  onCursor?: (x: number, y: number, zone?: string) => void;
}) {
  const [roomOpen, setRoomOpen] = useState(false);
  const [boardId, setBoardId] = useState(COZY_BOARDS[0].id);
  const [activeColor, setActiveColor] = useState(0);
  const [localStrokes, setLocalStrokes] = useState<CozyColorStroke[]>([]);
  const board = COZY_BOARDS.find((entry) => entry.id === boardId) ?? COZY_BOARDS[0];
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
  const palette = board.palettes[preset];
  const filled = useMemo(() => boardStrokes(board, shownStrokes), [board, shownStrokes]);
  const fillsByBoard = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of COZY_BOARDS) counts.set(entry.id, boardStrokes(entry, shownStrokes).size);
    return counts;
  }, [shownStrokes]);
  const progress = Math.round((filled.size / board.regions.length) * 100);
  const complete = filled.size === board.regions.length;
  const wasComplete = useRef(complete);
  const remainingByColor = useMemo(() => {
    const result = new Map<number, number>();
    for (const region of board.regions) {
      if (!filled.has(region.id)) result.set(region.c, (result.get(region.c) ?? 0) + 1);
    }
    return result;
  }, [board, filled]);

  useEffect(() => {
    if (complete && !wasComplete.current) playSound("promote");
    wasComplete.current = complete;
  }, [complete]);

  useEffect(() => {
    if ((remainingByColor.get(activeColor) ?? 0) > 0 || filled.size === board.regions.length) return;
    const next = palette.findIndex((_, index) => (remainingByColor.get(index) ?? 0) > 0);
    if (next >= 0) setActiveColor(next);
  }, [activeColor, board, filled.size, palette, remainingByColor]);

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

  const zoneKey = `cozy:${board.id}`;
  const roomPeers = useMemo(
    () =>
      (peers ?? []).filter(
        (peer) => peer.zone === zoneKey && peer.userId !== identity?.userId,
      ),
    [identity?.userId, peers, zoneKey],
  );

  // tell the space where we are: cursors only meet on the same postcard
  useEffect(() => {
    if (!roomOpen) return;
    onCursor?.(0.5, 0.6, zoneKey);
    return () => onCursor?.(0, 0, undefined);
  }, [onCursor, roomOpen, zoneKey]);

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

  const selectBoard = (nextId: string) => {
    if (nextId === boardId) return;
    setBoardId(nextId);
    setActiveColor(0);
    playSound("tap");
  };

  const fillRegion = (region: BoardRegion) => {
    if (filled.has(region.id)) return;
    if (region.c !== activeColor) {
      // tapping any dim number jumps to that color
      setActiveColor(region.c);
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
      tone: WIRE_TONES[region.c % WIRE_TONES.length],
      size: 0.04,
      points: [{ x: label.x / board.w, y: label.y / board.h }],
      regionId: `${strokePrefix(board)}${region.id}`,
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
    if ((remainingByColor.get(region.c) ?? 0) === 1) {
      const nextColor = palette.findIndex(
        (_, index) => index !== region.c && (remainingByColor.get(index) ?? 0) > 0,
      );
      if (nextColor >= 0) window.setTimeout(() => setActiveColor(nextColor), 180);
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
    const prefix = strokePrefix(board);
    setLocalStrokes((existing) =>
      existing.filter((stroke) => {
        if (!stroke.regionId || stroke.regionId === "__preset__") return true;
        return prefix ? !stroke.regionId.startsWith(prefix) : stroke.regionId.includes(":");
      }),
    );
    playSound("tap");
    void onClear?.(prefix);
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
          <h2>{board.title}</h2>
          {board.credit ? <em className="cozy-color-credit">{board.credit}</em> : null}
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
          <strong>{complete ? "finished!" : `${filled.size}/${board.regions.length}`}</strong>
        </div>
      </header>

      <main className="cozy-color-room-main">
        <section
          className={`cozy-color-room-board${complete ? " is-complete" : ""}`}
          aria-label={`${progress}% colored`}
          style={{
            aspectRatio: `${board.w} / ${board.h}`,
            maxWidth: `calc((100dvh - 210px) * ${(board.w / board.h).toFixed(4)})`,
          }}
          onPointerMove={(event) => {
            if (!onCursor) return;
            const rect = event.currentTarget.getBoundingClientRect();
            onCursor(
              Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
              Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
              zoneKey,
            );
          }}
        >
          <ArtBoard
            board={board}
            palette={palette}
            filled={filled}
            activeColor={activeColor}
            complete={complete}
            onRegion={fillRegion}
          />
          <div className="cozy-color-now">
            <b style={{ background: palette[activeColor] }}>{activeColor + 1}</b>
            <span>{complete ? "you finished it together" : "tap the matching numbers"}</span>
          </div>
          <nav className="cozy-color-shelf" aria-label="Pick a postcard">
            {COZY_BOARDS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={entry.id === board.id ? "is-active" : ""}
                onClick={() => selectBoard(entry.id)}
                aria-label={`${entry.title} — ${fillsByBoard.get(entry.id) ?? 0} of ${entry.regions.length} filled`}
                aria-pressed={entry.id === board.id}
              >
                <img src={entry.poster} alt="" />
                <span>{fillsByBoard.get(entry.id) ?? 0}/{entry.regions.length}</span>
              </button>
            ))}
          </nav>
          <div className="cozy-cursor-layer" aria-hidden="true">
            {roomPeers.map((peer) => (
              <div
                key={peer.userId ?? peer.name}
                className="cozy-cursor"
                style={{
                  left: `${peer.x * 100}%`,
                  top: `${peer.y * 100}%`,
                  "--peer-color": peer.color,
                } as CSSProperties}
              >
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M3 2 L10.6 20.2 L13.1 12.6 L20.8 10.3 Z" />
                </svg>
                <span>{peer.name}</span>
              </div>
            ))}
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
              <i><span /><span /><span /></i><b>{board.presetLabels.electric}</b>
            </button>
            <button
              type="button"
              className={preset === "sunset" ? "is-active" : ""}
              onClick={() => choosePreset("sunset")}
              aria-pressed={preset === "sunset"}
            >
              <i><span /><span /><span /></i><b>{board.presetLabels.sunset}</b>
            </button>
          </div>
          <div className="cozy-color-number-pots" aria-label="Numbered colors">
            {palette.map((color, index) => (
              <button
                type="button"
                key={index}
                className={`cozy-color-number-pot${activeColor === index ? " is-active" : ""}${remainingByColor.get(index) ? "" : " is-complete"}`}
                style={{ background: color }}
                onClick={() => {
                  setActiveColor(index);
                  playSound("tap");
                }}
                aria-label={`Highlight number ${index + 1}`}
                aria-pressed={activeColor === index}
              >
                <b>{remainingByColor.get(index) ? index + 1 : "✓"}</b>
                <span>{remainingByColor.get(index) || "done"}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cozy-color-game-reset"
            onClick={clear}
            disabled={!filled.size}
            aria-label="Start this postcard over"
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
          <img src={board.poster} alt={`${board.title} postcard`} />
          <span className="cozy-color-door-shade" />
          <span className="cozy-color-door-cta"><b>open coloring room</b><em>3 postcards · full screen →</em></span>
          <span className="cozy-color-door-progress">{filled.size}/{board.regions.length} filled</span>
        </button>
        <footer className="cozy-color-preview-footer">
          <div className="cozy-color-mini-palette" aria-hidden="true">
            {palette.slice(0, 6).map((color, index) => (
              <i key={index} style={{ background: color }}>{index + 1}</i>
            ))}
          </div>
          <span>{progress ? `${progress}% done together` : "tap a number to begin"}</span>
        </footer>
      </section>
      {room}
    </>
  );
}
