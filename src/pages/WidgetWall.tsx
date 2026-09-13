import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import "./labs.css";
import { WidgetCard } from "../components/WidgetCard";
import { DECISION_WIDGET, getSpace } from "../data/spaces";
import { WIDGET_CATALOG } from "../data/templates";
import type { Widget } from "../data/types";
import { mockBuildRoomFeed, mockRoundtableReplies } from "../lib/buildRoomFeed";
import { createDemoWidget } from "../lib/widgetDefaults";

/**
 * Widget wall — every widget on one drifting wall, for the demo line
 * "you can put pretty much anything in it. there's like thirty of these now."
 * Hash route: /#/wall
 *
 * Real WidgetCards from the seeded spaces (the crew's cake poll, the couple's
 * letter, the build room's pile), not screenshots. Three columns drift on a
 * tilted plane in alternating directions; every card wears a name tag; a roll
 * call lifts one card at a time, slows its column, and lights its tag lime.
 * The pointer adds parallax; hovering a card lifts it and holds its column;
 * clicking one selects it — it stays up, ringed in lime, its column pinned
 * while the rest keep flowing — until you click again, click the wall, or
 * press Esc. The lab pill (bottom-left) and the cursor hide after 2s idle,
 * so a recording is clean. `replay` re-runs the entrance.
 */

const COLS = 3;
const COL_W = 440;
const GAP = 26;
const ZOOM = 0.86;
const STICKER_ZOOM = 1.1;
const LIFT = 64;
const BASE_SPEED = 34;
const VARIANCE = 0.45;
const PARALLAX_DEG = 5;
const ROLL_EVERY = 1600;
const ROLL_HOLD = 1200;
const IDLE_AFTER = 2200;
const SPEEDS = [0.5, 1, 2];
const PLANE_W = COLS * COL_W + (COLS - 1) * GAP;

const TILTED = { tilt: 16, turn: -14, depth: 120 };
const FLAT = { tilt: 0, turn: 0, depth: 0 };
/* Mirrors WidgetCard's widgetGrows: these render at content height. */
const GROWS = new Set<Widget["type"]>(["dailyQ", "availability", "linkShelf", "playlist"]);

type WallTile = {
  widget: Widget;
  spaceId: string;
  label: string;
  emoji: string;
  zoom: number;
  /** Height in plane px (already zoomed). */
  h: number;
};

type Picked = { id: string; tile: WallTile };

const WEB_POST: Widget = {
  id: "wall-web-post",
  type: "linkCard",
  x: 0,
  y: 0,
  w: 260,
  h: 220,
  z: 1,
  data: {
    url: "https://martinfowler.com/bliki/TwoHardThings.html",
    title: "Two Hard Things",
    description:
      "There are only two hard things in Computer Science: cache invalidation and naming things.",
    imageUrl: "",
    siteName: "martinfowler.com",
    author: "Martin Fowler",
    publishedAt: "",
    savedBy: "sam",
    savedAt: Date.now() - 3_600_000,
  },
};

/* One of each, the most lived-in instance, in an order that mixes tall and
   short so the greedy packer below deals a good hand to every column. */
const PICKS: ({ space: string; id: string } | { widget: Widget; space?: string })[] = [
  { space: "crew", id: "poll-cake" },
  { space: "buildroom", id: "br-pile" },
  { space: "crew", id: "countdown" },
  { space: "crew", id: "quote" },
  { space: "couple", id: "us-color" },
  { space: "crew", id: "rsvp" },
  { space: "crew", id: "potluck" },
  { space: "house", id: "house-wheel" },
  { space: "crew", id: "weather" },
  { space: "crew", id: "daily-q" },
  { space: "crew", id: "sticker-bday-cake" },
  { space: "buildroom", id: "br-hot" },
  { space: "crew", id: "note-joke" },
  { space: "couple", id: "us-letter" },
  { space: "league", id: "sports" },
  { space: "crew", id: "media" },
  { space: "crew", id: "joke-registry" },
  { space: "buildroom", id: "br-ship-1" },
  { space: "crew", id: "expense-split" },
  { space: "crew", id: "link-shelf" },
  { space: "crew", id: "message-wall" },
  { space: "crew", id: "playlist" },
  { space: "couple", id: "us-clocks" },
  { space: "crew", id: "photo-wall" },
  { space: "buildroom", id: "br-table" },
  { space: "crew", id: "itinerary" },
  { widget: DECISION_WIDGET, space: "crew" },
  { space: "crew", id: "availability" },
  { widget: createDemoWidget("chat", "wall-chat") },
  { widget: createDemoWidget("backendLive", "wall-backend") },
  { widget: WEB_POST },
  { space: "crew", id: "sticker-glad" },
];

function catalogLabel(widget: Widget) {
  const entry = WIDGET_CATALOG.find((item) => item.type === widget.type);
  if (entry) return { label: entry.label, emoji: entry.emoji };
  if (widget.type === "sticker") return { label: "sticker", emoji: "✦" };
  if (widget.type === "letter") return { label: "letter", emoji: "✉️" };
  return { label: widget.type, emoji: "▢" };
}

/* Some widgets grow past their seeded height (the availability sheet, the
   link shelf) — `measured` carries what they actually rendered at. */
function buildTiles(measured: Record<string, number>): WallTile[] {
  const tiles: WallTile[] = [];
  for (const pick of PICKS) {
    const seeded =
      "widget" in pick
        ? pick.widget
        : getSpace(pick.space).widgets.find((item) => item.id === pick.id);
    if (!seeded) continue;
    const widget =
      measured[seeded.id] && measured[seeded.id] > seeded.h
        ? { ...seeded, h: measured[seeded.id] }
        : seeded;
    const base = widget.type === "sticker" ? STICKER_ZOOM : ZOOM;
    const zoom = Math.min(base, COL_W / widget.w);
    tiles.push({
      widget,
      spaceId: pick.space ?? "widget-wall",
      ...catalogLabel(widget),
      zoom,
      h: widget.h * zoom,
    });
  }
  return tiles;
}

/* Deal each tile to the shortest column so the loops stay similar length. */
function packColumns(tiles: WallTile[]): WallTile[][] {
  const cols: WallTile[][] = Array.from({ length: COLS }, () => []);
  const heights = new Array<number>(COLS).fill(0);
  for (const tile of tiles) {
    let c = 0;
    for (let i = 1; i < COLS; i++) if (heights[i] < heights[c]) c = i;
    cols[c].push(tile);
    heights[c] += tile.h + GAP;
  }
  return cols;
}

/* Golden-ratio spread so no two columns share a speed. */
function columnFactor(index: number) {
  const pseudo = ((index * 0.6180339887 + 0.35) % 1) * 2 - 1;
  return 1 + VARIANCE * pseudo;
}

/* Entrance and roll-call order: the middle column first, then outward. */
const MID = Math.floor(COLS / 2);
function entranceRank(c: number) {
  return Math.abs(c - MID) * 2 - (c < MID ? 1 : 0);
}
const ROLL_ORDER = [MID, ...Array.from({ length: COLS }, (_, i) => i).filter((i) => i !== MID)];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function tileFromId(columns: WallTile[][], id: string) {
  const [c, , k] = id.split("-").map(Number);
  return { c, tile: columns[c]?.[k] };
}

export function WidgetWall() {
  const stageRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);

  const offsets = useRef<number[]>([]);
  const velocities = useRef<number[]>([]);
  const pointer = useRef({ x: 0, y: 0 });
  const pointerIn = useRef(false);
  const damped = useRef({ x: 0, y: 0 });
  const hoverId = useRef<string | null>(null);
  const hoverCol = useRef(-1);
  const litCol = useRef(-1);
  const selectedRef = useRef<{ id: string; col: number } | null>(null);
  const speedMul = useRef(1);
  const pausedRef = useRef(false);

  const [lit, setLit] = useState<Picked | null>(null);
  const [selected, setSelected] = useState<Picked | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [flat, setFlat] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rollCall, setRollCall] = useState(true);
  const [labels, setLabels] = useState(true);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [idle, setIdle] = useState(false);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [entered, setEntered] = useState(false);
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { w: 1440, h: 900 }
      : { w: window.innerWidth, h: window.innerHeight },
  );

  const columns = useMemo(() => packColumns(buildTiles(measured)), [measured]);
  const periods = useMemo(
    () => columns.map((col) => col.reduce((sum, tile) => sum + tile.h + GAP, 0)),
    [columns],
  );
  const copies = useMemo(
    () => periods.map((period) => Math.max(2, Math.ceil((viewport.h * 1.3) / period) + 1)),
    [periods, viewport.h],
  );
  const baseVelocities = useMemo(
    () => columns.map((_, c) => BASE_SPEED * columnFactor(c) * (c % 2 === 0 ? 1 : -1)),
    [columns],
  );
  const feed = useMemo(() => mockBuildRoomFeed("buildroom"), []);
  const roundtableReplies = useMemo(() => mockRoundtableReplies("buildroom"), []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /* One measure pass: a growing widget's body scrolls past the seeded
     height; take what it rendered at so tiles never overlap. */
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    for (const tile of document.querySelectorAll<HTMLElement>(".ww-tile[data-grows]")) {
      const id = tile.dataset.widget ?? "";
      const body = tile.querySelector<HTMLElement>(".widget-group-body");
      if (!id || !body || next[id]) continue;
      next[id] = body.scrollHeight;
    }
    if (Object.keys(next).length) setMeasured(next);
  }, []);

  /* The entrance waits for the wall's first paint — the cards take a beat
     to lay out, and an animation that starts under that beat is already
     over by the first frame anyone sees. */
  useEffect(() => {
    setEntered(false);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [runKey]);

  /* Fresh offsets per run so replay starts from the same dealt hand. */
  useEffect(() => {
    offsets.current = periods.map((period, c) => period * ((c * 0.37) % 1));
    velocities.current = periods.map(() => 0);
    damped.current = { x: 0, y: 0 };
  }, [periods, runKey]);

  useEffect(() => {
    speedMul.current = SPEEDS[speedIndex];
  }, [speedIndex]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  /* The drift. Plane tilt follows the pointer, or sways on its own. A
     hovered or selected column holds; a roll-called one eases to ¼. */
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let t0: number | null = null;
    /* Three columns always fit the frame with a margin; the mask only has
       to dissolve the top and bottom, never a column. */
    const geom = flat
      ? { ...FLAT, scale: Math.min(1, (viewport.w - 64) / PLANE_W) }
      : { ...TILTED, scale: Math.max(0.7, (viewport.w - 120) / PLANE_W) };

    const tick = (ts: number) => {
      if (last === null) {
        last = ts;
        t0 = ts;
      }
      const dt = Math.min(0.05, Math.max(0, ts - last) / 1000);
      last = ts;
      const elapsed = (ts - (t0 ?? ts)) / 1000;

      let targetX = 0;
      let targetY = 0;
      if (!flat && !reduced) {
        if (pointerIn.current) {
          targetX = pointer.current.x * PARALLAX_DEG;
          targetY = -pointer.current.y * PARALLAX_DEG;
        } else {
          targetX = Math.sin(elapsed / 6.5) * 3;
          targetY = Math.cos(elapsed / 8.2) * 2;
        }
      }
      const damp = 1 - Math.exp(-dt / 0.35);
      damped.current.x += (targetX - damped.current.x) * damp;
      damped.current.y += (targetY - damped.current.y) * damp;
      const plane = planeRef.current;
      if (plane) {
        plane.style.transform =
          `translate(-50%, -50%) scale(${geom.scale.toFixed(4)}) ` +
          `rotateX(${(geom.tilt + damped.current.y).toFixed(3)}deg) ` +
          `rotateY(${(geom.turn + damped.current.x).toFixed(3)}deg) ` +
          `translateZ(${-geom.depth}px)`;
      }

      for (let c = 0; c < periods.length; c++) {
        const period = periods[c];
        const track = trackRefs.current[c];
        if (!period || !track) continue;
        const held = hoverCol.current === c || selectedRef.current?.col === c;
        const factor =
          pausedRef.current || reduced ? 0 : held ? 0 : litCol.current === c ? 0.25 : 1;
        const target = baseVelocities[c] * factor * speedMul.current;
        const ease = 1 - Math.exp(-dt / (target === 0 ? 0.18 : 0.3));
        velocities.current[c] += (target - velocities.current[c]) * ease;
        let next = (offsets.current[c] ?? 0) + velocities.current[c] * dt;
        next = ((next % period) + period) % period;
        offsets.current[c] = next;
        track.style.transform = `translate3d(0, ${(period / 2 - next).toFixed(2)}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flat, reduced, periods, baseVelocities, runKey, viewport.w]);

  /* Roll call: one card at a time, the one nearest the middle of its
     column. Sits out while the pointer or a selection owns the spotlight. */
  useEffect(() => {
    if (!rollCall || reduced) return;
    let step = 0;
    let hold = 0;
    const ping = () => {
      if (hoverId.current || selectedRef.current) return;
      const c = ROLL_ORDER[(step + Math.floor(step / ROLL_ORDER.length)) % ROLL_ORDER.length];
      step++;
      const col = columns[c];
      const period = periods[c];
      const count = copies[c];
      if (!col?.length || !period) return;
      const total = count * period - GAP;
      const shift = period / 2 - (offsets.current[c] ?? 0);
      let best = { d: Infinity, id: "", k: 0 };
      let top = 0;
      for (let k = 0; k < col.length; k++) {
        const center = top + col[k].h / 2;
        for (let i = 0; i < count; i++) {
          const y = -total / 2 + shift + i * period + center;
          if (Math.abs(y) < best.d) best = { d: Math.abs(y), id: `${c}-${i}-${k}`, k };
        }
        top += col[k].h + GAP;
      }
      litCol.current = c;
      setLit({ id: best.id, tile: col[best.k] });
      window.clearTimeout(hold);
      hold = window.setTimeout(() => {
        litCol.current = -1;
        setLit((current) => (current?.id === best.id ? null : current));
      }, ROLL_HOLD);
    };
    const first = window.setTimeout(ping, 1200);
    const every = window.setInterval(ping, ROLL_EVERY);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.clearTimeout(hold);
      litCol.current = -1;
    };
  }, [rollCall, reduced, columns, periods, copies, runKey]);

  /* Lab pill + cursor hide after a beat of stillness. */
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), IDLE_AFTER);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_AFTER);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, []);

  const deselect = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") deselect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deselect]);

  const releaseHover = useCallback(() => {
    if (!hoverId.current) return;
    hoverId.current = null;
    hoverCol.current = -1;
    setLit(null);
  }, []);

  const tileAt = useCallback(
    (clientX: number, clientY: number) => {
      const hit = document.elementFromPoint(clientX, clientY);
      const tileEl = hit?.closest?.("[data-tile]") as HTMLElement | null;
      if (!tileEl) return null;
      const id = tileEl.dataset.tile ?? "";
      const { c, tile } = tileFromId(columns, id);
      return tile ? { id, c, tile } : null;
    },
    [columns],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      pointerIn.current = true;
      pointer.current = {
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
      const hit = tileAt(event.clientX, event.clientY);
      if (!hit) {
        releaseHover();
        return;
      }
      if (hit.id === hoverId.current) return;
      hoverId.current = hit.id;
      hoverCol.current = hit.c;
      litCol.current = -1;
      setLit({ id: hit.id, tile: hit.tile });
    },
    [tileAt, releaseHover],
  );

  const onPointerLeave = useCallback(() => {
    pointerIn.current = false;
    pointer.current = { x: 0, y: 0 };
    releaseHover();
  }, [releaseHover]);

  /* Click a card: it stays up. Click it again, the wall, or Esc: it drops. */
  const onStageClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const hit = tileAt(event.clientX, event.clientY);
      if (!hit || selectedRef.current?.id === hit.id) {
        deselect();
        return;
      }
      selectedRef.current = { id: hit.id, col: hit.c };
      setSelected({ id: hit.id, tile: hit.tile });
    },
    [tileAt, deselect],
  );

  const replay = () => {
    releaseHover();
    deselect();
    setLit(null);
    setPaused(false);
    setRunKey((key) => key + 1);
  };

  const stageVars = {
    "--ww-col": `${COL_W}px`,
    "--ww-gap": `${GAP}px`,
    "--ww-lift": `${LIFT}px`,
  } as CSSProperties;

  return (
    <div className={`widget-wall paper-bg ${idle ? "is-idle" : ""}`}>
      <div
        ref={stageRef}
        className={`ww-stage ${flat ? "is-flat" : ""} ${reduced ? "is-reduced" : ""} ${
          labels ? "" : "no-labels"
        } ${selected ? "has-selection" : ""}`}
        style={stageVars}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onStageClick}
      >
        <div ref={planeRef} className={`ww-plane ${entered ? "is-in" : ""}`}>
          {columns.map((col, c) => (
            <div
              className="ww-col"
              key={`col-${c}`}
              style={{ "--i": entranceRank(c) } as CSSProperties}
            >
              <div
                className="ww-track"
                ref={(el) => {
                  trackRefs.current[c] = el;
                }}
              >
                {Array.from({ length: copies[c] }, (_, i) => (
                  <div className="ww-copy" key={`copy-${i}`}>
                    {col.map((tile, k) => {
                      const id = `${c}-${i}-${k}`;
                      const isLit = lit?.id === id;
                      const isSelected = selected?.id === id;
                      return (
                        <div
                          key={id}
                          className={`ww-tile ${isLit ? "is-lit" : ""} ${
                            isSelected ? "is-selected" : ""
                          }`}
                          data-tile={id}
                          data-col={c}
                          data-type={tile.widget.type}
                          data-widget={tile.widget.id}
                          data-grows={GROWS.has(tile.widget.type) ? "1" : undefined}
                          style={{
                            zoom: tile.zoom,
                            width: tile.widget.w,
                            height: tile.widget.h,
                          }}
                        >
                          <div className="ww-tile-inner">
                            <WidgetCard
                              widget={tile.widget}
                              spaceId={tile.spaceId}
                              canvasScale={1}
                              buildRoomFeed={feed}
                              roundtableReplies={roundtableReplies[tile.widget.id]}
                            />
                          </div>
                          <span className="ww-tag" style={{ zoom: 1 / tile.zoom }}>
                            <i aria-hidden="true">{tile.emoji}</i>
                            {tile.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="arrival-lab-bar ww-bar">
        <span className="arrival-lab-kicker">widget wall</span>
        <button type="button" className="is-main" onClick={replay}>
          replay
        </button>
        <button type="button" className={paused ? "is-on" : ""} onClick={() => setPaused((v) => !v)}>
          {paused ? "play" : "pause"}
        </button>
        <i aria-hidden="true" />
        <button
          type="button"
          className={rollCall ? "is-on" : ""}
          onClick={() => {
            setRollCall((v) => !v);
            setLit(null);
          }}
        >
          roll call
        </button>
        <button type="button" className={labels ? "is-on" : ""} onClick={() => setLabels((v) => !v)}>
          name tags
        </button>
        <button type="button" className={flat ? "is-on" : ""} onClick={() => setFlat((v) => !v)}>
          flat
        </button>
        <button
          type="button"
          onClick={() => setSpeedIndex((index) => (index + 1) % SPEEDS.length)}
        >
          {SPEEDS[speedIndex] === 0.5 ? "½×" : `${SPEEDS[speedIndex]}×`}
        </button>
        <i aria-hidden="true" />
        <a href="#/widgets">widget lab</a>
      </div>
    </div>
  );
}
