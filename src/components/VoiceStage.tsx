import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { guessCard } from "../lib/deck";
import { SCRIPTED_ASKS, standInFor } from "../lib/deck/mockDeal";
import { orbLook } from "../lib/orbShader";
import { playSound } from "../lib/sounds";
import type { useVoice } from "../lib/voice";
import { fillPlan, showParts, type PartValue } from "../lib/voiceFillPlan";
import {
  markStageBeat,
  onVoiceStageRelease,
  stageBeats,
  voiceStageBuild,
  watchStageBeats,
  watchVoiceStage,
  type StageBuild,
  type StagePart,
} from "../lib/voiceStage";
import { beat, timingCounts, VOICE_TIMINGS, voiceSlow } from "../lib/voiceTimings";
import { VoiceOrb } from "./VoiceOrb";
import { WidgetCard } from "./WidgetCard";
import "./voice-stage.css";

/* The voice stage: tapping the dock orb is the biggest moment in the app.
   One orb canvas, moved and FLIPped between the dock and the stage (never a
   second orb). Two layouts:

   - two-part (the default): you speak on the left, it builds on the right.
     The orb settles large on the left half of the dimmed room with your
     words under it, word by word. The moment the card type is known the
     real widget pops in on the right as a skeleton and its parts land one
     by one (lib/voiceFillPlan.ts). When it is complete the stage lets go:
     the orb flies home and the card travels to its spot on the board.
     The stage reads the build through one shape (lib/voiceStage.ts
     `StageBuild`); it never talks to the build itself.
   - `?stage=center`: the earlier centred stage (question, chips, release
     when the ask ends or `releaseVoiceStage()` is called).

   `?stage=0` keeps the old dock-only listening. `?stage=1` opens the stage
   on load (with `?voice=…` it plays the scripted ask). `&level=0.8` pins
   the loudness for stills; `&stageFreeze=type|mid|complete` stops the
   two-part stage at that beat. `?slow=3` plays everything at a third of the
   speed; `?timing=1` prints the beats (lib/voiceTimings.ts). */

type Voice = ReturnType<typeof useVoice>;
type Phase = "closed" | "open" | "closing";

const STARTERS = [
  { glyph: "◐", label: "Poll the group", ask: "add a poll for Saturday dinner" },
  { glyph: "◷", label: "Count down to it", ask: "start a countdown to the trip" },
  { glyph: "✺", label: "Spin for who drives", ask: "spin a wheel for who drives" },
];

const GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";
const POP = "cubic-bezier(0.2, 0.9, 0.3, 1.18)";
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The house curves (index.css @theme), for moves that are driven per frame. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const u = 1 - t;
      const err = 3 * x1 * t * u * u + 3 * x2 * t * t * u + t * t * t - x;
      const slope = 3 * x1 * (u * u - 2 * t * u) + 3 * x2 * (2 * t * u - t * t) + 3 * t * t;
      if (Math.abs(slope) < 1e-5) break;
      t -= err / slope;
    }
    const u = 1 - t;
    return 3 * y1 * t * u * u + 3 * y2 * t * t * u + t * t * t;
  };
}
const glide = bezier(0.16, 1, 0.3, 1);
const pop = bezier(0.2, 0.9, 0.3, 1.18);
const sway = bezier(0.3, 0.6, 0.3, 1);

type Box = { x: number; y: number; w: number };
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
};

/** Fly `host` from one box to another. It stays where layout put it; only
    its transform moves, re-aimed every frame because the dock it lands in is
    still settling. x runs on a slower curve than y, so the path is an arc. */
function fly(host: HTMLElement, from: () => Box, to: () => Box, ms: number, grow: (t: number) => number, done: () => void) {
  host.style.transform = "";
  const home = boxOf(host);
  const started = performance.now();
  let raf = 0;
  // performance.now(), not the rAF timestamp: the two clocks can drift apart
  const frame = () => {
    const p = Math.min(1, (performance.now() - started) / ms);
    const a = from();
    const b = to();
    const x = a.x + (b.x - a.x) * sway(p);
    const y = a.y + (b.y - a.y) * glide(p);
    const w = a.w + (b.w - a.w) * grow(p);
    host.style.transform = `translate(${x - home.x}px, ${y - home.y}px) scale(${w / home.w})`;
    if (p < 1) raf = requestAnimationFrame(frame);
    else done();
  };
  frame();
  return () => cancelAnimationFrame(raf);
}

/** Where the orb sits in the dock: centred on its key, 1.6 × the 58 px ball. */
const SEAT = 93;
const seatBox = (seat: HTMLElement): Box => ({ ...boxOf(seat), w: SEAT });

function tokenRgb(name: string) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The waveform under the orb: your loudness, newest in the middle, running
    out to both sides, in the orb's own violet → pink → orange. */
function StageWave({ level }: { level: RefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const stops = [tokenRgb("--color-crew"), tokenRgb("--color-couple"), tokenRgb("--color-trip")];
    const colour = (t: number) => {
      const [a, b] = t < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
      const k = t < 0.5 ? t * 2 : t * 2 - 2 + 1;
      return a.map((v, i) => Math.round(v + (b[i] - v) * k));
    };
    const history: number[] = new Array(64).fill(0);
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      if (now - last > 38) {
        last = now;
        history.unshift(level.current ?? 0);
        history.pop();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const pitch = 9;
      const bars = Math.floor(w / pitch / 2) * 2 + 1;
      const mid = (bars - 1) / 2;
      const left = (w - (bars - 1) * pitch) / 2;
      for (let i = 0; i < bars; i++) {
        const away = Math.abs(i - mid);
        // every bar has its own reach, so it reads as a voice, not a ramp
        const reach = 0.45 + 0.55 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
        const v = Math.min(1, history[Math.min(63, Math.round(away * 1.2))] * reach * (1 - (away / (mid + 1)) * 0.55));
        const tall = 4 + v * (h - 4);
        const [r, g, b] = colour(i / (bars - 1));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.38 + 0.62 * Math.min(1, v * 3)})`;
        ctx.beginPath();
        ctx.roundRect(left + i * pitch - 2, (h - tall) / 2, 4, tall, 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return <canvas ref={ref} className="voice-stage-wave" data-testid="voice-stage-wave" aria-hidden="true" />;
}

/** Long asks keep their tail: the newest words are the ones being read. */
function headline(text: string) {
  if (text.length <= 120) return text;
  const tail = text.slice(-116);
  return `…${tail.slice(tail.indexOf(" ") + 1)}`;
}

/* ---------- the two-part stage: what shows of the build ---------- */

type Shown = { key: number | null; at: Record<string, number> };

/** Which parts land next: the first waiting part of every step in the lowest
    wave that still has one (steps in a wave land together; a list goes one
    row per beat). A part that never got a value lands empty once the card is
    complete, so nothing can hold the close. */
function nextParts(parts: StagePart[], at: Record<string, number>, complete: boolean): string[] {
  const hidden = parts.filter((p) => !(p.id in at));
  if (!hidden.length) return [];
  const wave = Math.min(...hidden.map((p) => p.wave));
  const steps = new Set<string>();
  const out: string[] = [];
  for (const p of hidden) {
    if (p.wave !== wave || steps.has(p.label)) continue;
    steps.add(p.label);
    if (p.status !== "pending" || complete) out.push(p.id);
  }
  return out;
}

/** The parts of the build that have landed on the stage, each on its own
    beat (`partBeat`), and the widget showing exactly those. */
function useReveal(build: StageBuild | null, freeze: string | null) {
  const [state, setState] = useState<Shown>({ key: null, at: {} });
  const key = build?.key ?? null;
  const at = state.key === key ? state.at : {};
  const last = useRef(0);
  const before = useRef<{ key: number | null; data: Record<string, unknown> | null }>({ key: null, data: null });
  const [, redraw] = useState(0);

  if (build?.widget && !build.complete) before.current = { key, data: build.widget.data as Record<string, unknown> };

  const parts = build?.parts ?? [];
  const complete = Boolean(build?.complete);
  const waiting = nextParts(parts, at, complete).filter((id) => {
    if (freeze === "type") return parts.find((p) => p.id === id)?.wave === 0;
    if (freeze === "mid") return Object.keys(at).length < Math.ceil(parts.length / 2);
    return true;
  });
  const waitingKey = waiting.join(" ");
  useEffect(() => {
    if (key === null || !waitingKey) return;
    const due = last.current + beat("partBeat");
    const id = window.setTimeout(() => {
      const now = performance.now();
      last.current = now;
      const ids = waitingKey.split(" ");
      ids.forEach((part) => markStageBeat(`part:${part}`, now));
      setState((s) => ({ key, at: { ...(s.key === key ? s.at : {}), ...Object.fromEntries(ids.map((part) => [part, now])) } }));
    }, Math.max(0, due - performance.now()));
    return () => window.clearTimeout(id);
  }, [key, waitingKey]);

  // numbers count up to their value over `numberTick`
  const tickMs = beat("numberTick");
  const now = performance.now();
  const ticking = parts.some((p) => p.tick && p.id in at && now - at[p.id] < tickMs);
  useEffect(() => {
    if (!ticking) return;
    const raf = requestAnimationFrame(() => redraw((n) => n + 1));
    return () => cancelAnimationFrame(raf);
  });

  const shown: Record<string, PartValue | undefined> = {};
  for (const p of parts) {
    if (!(p.id in at) || p.value === null) continue;
    const t = p.tick && typeof p.value === "number" && !still() ? Math.min(1, (now - at[p.id]) / tickMs) : 1;
    shown[p.id] = t < 1 && typeof p.value === "number" ? p.value * (1 - (1 - t) ** 3) : p.value;
  }
  const widget = build?.widget
    ? showParts(build.widget, fillPlan(build.kind), shown, complete, before.current.key === key ? before.current.data : null)
    : null;
  const all = parts.length > 0 && parts.every((p) => p.id in at) && !ticking;
  return { widget, at, all };
}

/** Each part's own small arrival. The card is the real widget, so what
    changed is read off the DOM: an element whose words just appeared (or a
    row that was just put in) comes up into place. Words growing as you talk,
    and numbers counting, don't replay it. */
function useArrivals(root: RefObject<HTMLElement | null>, key: number) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const quiet = still();
    const blank = (text: string) => !text.replace(/[\s ]/g, "");
    const arrive = (target: Element) => {
      target.animate(
        quiet
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, translate: "0 0.5em", filter: "blur(5px)" },
              { opacity: 1, translate: "0 0", filter: "blur(0px)" },
            ],
        { duration: beat("partArrive"), easing: GLIDE },
      );
    };
    const watcher = new MutationObserver((records) => {
      const done = new Set<Element>();
      for (const record of records) {
        if (record.type === "characterData") {
          const target = record.target.parentElement;
          const was = record.oldValue ?? "";
          const now = record.target.textContent ?? "";
          if (!target || done.has(target) || blank(now)) continue;
          if (!blank(was) && (now.startsWith(was) || was.replace(/[\d,.]/g, "") === now.replace(/[\d,.]/g, ""))) continue;
          done.add(target);
          arrive(target);
          continue;
        }
        for (const node of record.addedNodes) {
          const target = node instanceof Element ? node : node.parentElement;
          if (!target || target === el || done.has(target) || blank(target.textContent ?? "")) continue;
          // a number that re-renders as it counts is not an arrival
          const gone = Array.from(record.removedNodes, (n) => n.textContent ?? "").join("");
          if (gone && !blank(gone) && gone.replace(/[\d,.]/g, "") === (node.textContent ?? "").replace(/[\d,.]/g, "")) continue;
          done.add(target);
          arrive(target);
        }
      }
    });
    watcher.observe(el, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
    return () => watcher.disconnect();
  }, [root, key]);
}

/** The room in the hash, for the widget's own lookups. */
const spaceInHash = () => /#\/space\/([^/?]+)/.exec(window.location.hash)?.[1] ?? "crew";

/** How much bigger than on the board the card stands on the stage. */
function stageScale(w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw <= 640;
  const scale = phone ? Math.min((vw - 56) / w, (vh * 0.34) / h, 1.2) : Math.min((vw * 0.4) / w, (vh * 0.56) / h, 1.9);
  return Math.max(0.7, Math.round(scale * 100) / 100);
}

/** The card on the right half: the build's real widget, larger than on the
    board, in a dashed ring of the maker's colour until it is whole. */
function StageCard({
  build,
  reveal,
  fly,
}: {
  build: StageBuild;
  reveal: ReturnType<typeof useReveal>;
  fly: RefObject<HTMLDivElement | null>;
}) {
  const body = useRef<HTMLDivElement>(null);
  useArrivals(body, build.key);
  const widget = reveal.widget;
  // the size is fixed by the card type, so the card doesn't breathe as rows land
  const scale = useMemo(() => (widget ? stageScale(widget.w, widget.h) : 1), [widget?.type, widget?.w]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!widget) return null;
  const whole = build.complete && reveal.all;
  return (
    <div className="voice-two-card" data-testid="voice-stage-card" data-kind={build.kind ?? "card"} data-state={whole ? "complete" : "skeleton"}>
      <header className="voice-two-kind">
        <b>{build.kind ?? "card"}</b>
        <span className="voice-two-parts" data-testid="voice-stage-parts">
          {build.parts.map((p) => (
            <i
              key={p.id}
              data-testid={`voice-stage-part-${p.id}`}
              data-part={p.id}
              data-status={p.status}
              data-shown={p.id in reveal.at ? "" : undefined}
              title={p.label}
            />
          ))}
        </span>
      </header>
      <div className="voice-two-fly" ref={fly}>
        <div className="voice-two-card-body" ref={body} style={{ zoom: scale }}>
          <WidgetCard widget={{ ...widget, x: 0, y: 0, z: 1, rotate: 0 }} spaceId={spaceInHash()} canvasScale={scale} />
        </div>
      </div>
    </div>
  );
}

/** Your words, one span each: settled words stand, the newest is live, and
    the words that named the card wear the maker's colour. */
function StageWords({ text, live, kind }: { text: string; live: boolean; kind: string | null }) {
  const words = text.split(/\s+/).filter(Boolean);
  // the card words: the shortest run that ends where code first knew the card
  let cueTo = -1;
  let cueFrom = -1;
  if (kind) {
    for (let i = 0; i < words.length && cueTo < 0; i++) if (guessCard(words.slice(0, i + 1).join(" "))) cueTo = i;
    for (let j = cueTo; j >= 0 && cueFrom < 0; j--) if (guessCard(words.slice(j, cueTo + 1).join(" "))) cueFrom = j;
  }
  const from = Math.max(0, words.length - 18);
  return (
    <p className="voice-two-words" data-testid="voice-stage-text">
      {from > 0 && <span className="voice-two-word is-old">…</span>}
      {words.slice(from).map((word, k) => {
        const i = from + k;
        const cue = i >= cueFrom && i <= cueTo;
        return (
          <span key={i} className={`voice-two-word ${live && i === words.length - 1 ? "is-live" : ""} ${cue ? "is-cue" : ""}`}>
            {word}
          </span>
        );
      })}
    </p>
  );
}

/** Dev only (`?timing=1`): the beats of this ask, the table's number beside
    what this run did, counted from the last word. */
function StageBeats({ said, mock }: { said: string; mock: boolean }) {
  const beats = useSyncExternalStore(watchStageBeats, stageBeats);
  const slow = voiceSlow();
  const at = (name: string) => beats.find((b) => b.name === name)?.at;
  const word = at("word");
  const since = (name: string) => {
    const t = at(name);
    return t === undefined || word === undefined ? "—" : `${Math.round((t - word) / slow).toLocaleString()}`;
  };
  const T = VOICE_TIMINGS;
  const keyword = guessCard(said) !== null;
  const room = keyword && Boolean(said) && Boolean(standInFor(said).room);
  const complete = T.steady.ms + (keyword ? (room ? T.roomFillFirstCard.ms : T.callToComplete.ms) : T.decideThenFill.ms);
  const first = keyword && !room ? T.lastWordToFirstField.ms : complete - T.streamWindow.ms;
  const parts = beats.filter((b) => b.name.startsWith("part:"));
  const counts = timingCounts();
  const rows: Array<[string, string, string]> = [
    ["card type known", keyword ? "at the card word" : `${T.steady.ms + T.typeByDecide.ms}`, since("type")],
    ["pause detected", `${T.pauseDetected.ms}`, since("pause")],
    ["first field", `${first}`, parts.length > 1 ? since(parts.find((p) => (at(p.name) ?? 0) > (word ?? 0))?.name ?? "") : "—"],
    ["card complete", `${complete}`, since("complete")],
    ["every part on screen", `+${T.partBeat.ms} a part (assumed)`, since("all")],
    ["committed", `${complete + T.commit.ms}`, since("committed")],
    ["other screens", `${complete + T.commit.ms + T.othersAfterCommit.ms}`, "one screen here"],
    ["stage lets go", `+${T.closeHold.ms} (assumed)`, since("close")],
    ["card on the board", `+${T.cardTravel.ms} (design)`, since("landed")],
  ];
  return (
    <aside className="voice-stage-beats" data-testid="voice-stage-beats" onClick={(event) => event.stopPropagation()}>
      <b>{mock ? "simulated from measurements · no model ran" : "live"}</b>
      <span>
        ms from the last word{slow > 1 ? ` · playing at 1/${slow} speed, shown at 1×` : ""}
      </span>
      <table>
        <thead>
          <tr>
            <th>beat</th>
            <th>table</th>
            <th>this run</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, planned, got]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{planned}</td>
              <td>{got}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span>
        {parts.length ? `parts: ${parts.map((p) => `${p.name.slice(5)} ${word === undefined ? "" : Math.round((p.at - word) / slow)}`).join(" · ")}` : "parts: —"}
      </span>
      <span>
        src/lib/voiceTimings.ts · {counts.measured} measured · {counts.derived} derived · {counts.code} code · {counts.assumed} assumed · {counts.design} design
      </span>
    </aside>
  );
}

/** The card's travel from the stage to its spot on the board: the stage's
    own card element moves and shrinks onto the board card (hidden until it
    lands), re-aimed every frame because the camera may still be following. */
function flyCard(card: HTMLElement, placed: () => StageBuild["placed"], draftId: string, ms: number, done: () => void) {
  const from = card.getBoundingClientRect();
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const hidden = new Set<HTMLElement>();
  const find = () => {
    const p = placed();
    if (!p) return null;
    const draft = p.host.querySelector<HTMLElement>(`[data-widget-id="${draftId}"]`);
    const synced = p.host.querySelector<HTMLElement>(`[data-widget-id="${p.widgetId}"]`);
    for (const el of [draft, synced]) {
      if (!el || hidden.has(el)) continue;
      el.style.visibility = "hidden";
      hidden.add(el);
    }
    return synced ?? draft;
  };
  // the synced copy can replace the draft mid-flight: hide it before it paints
  const host = placed()?.host;
  const watcher = new MutationObserver(find);
  if (host) watcher.observe(host, { childList: true, subtree: true });
  const started = performance.now();
  let raf = 0;
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    watcher.disconnect();
    const target = find();
    hidden.forEach((el) => (el.style.visibility = ""));
    card.style.visibility = "hidden";
    // it takes the hit and settles
    if (target && !still()) {
      target.querySelector(".widget-group-body")?.animate([{ scale: "1.045 0.955" }, { scale: "1" }], { duration: 360, easing: POP });
    }
    markStageBeat("landed");
    done();
  };
  const frame = () => {
    const target = find();
    if (!target || !host) return end();
    const p = Math.min(1, (performance.now() - started) / ms);
    const r = target.getBoundingClientRect();
    const zoom = host.getBoundingClientRect().width / host.offsetWidth || 1;
    const tilt = parseFloat(getComputedStyle(target).rotate) || 0;
    const x = cx + (r.left + r.width / 2 - cx) * sway(p);
    const y = cy + (r.top + r.height / 2 - cy) * glide(p);
    const k = 1 + ((target.offsetWidth * zoom) / from.width - 1) * glide(p);
    card.style.transform = `translate(${x - cx}px, ${y - cy}px) rotate(${tilt * glide(p)}deg) scale(${k})`;
    if (p < 1) raf = requestAnimationFrame(frame);
    else end();
  };
  if (still()) window.setTimeout(end, 200);
  else frame();
  return end;
}

/** Owns the orb (so it can travel) and the stage. The dock gives it the
    voice and the orb's seat; it gets back whether the stage is up, a way to
    open it, and the layer to render. */
export function useVoiceStage(voice: Voice, seat: RefObject<HTMLElement | null>) {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const enabled = params.get("stage") !== "0";
  const two = params.get("stage") !== "center";
  const freeze = params.get("stageFreeze");
  const [phase, setPhase] = useState<Phase>("closed");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [host] = useState(() => {
    const el = document.createElement("span");
    el.className = "voice-orb-host";
    return el;
  });
  const slot = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const flight = useRef<() => void>(() => {});
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // the build, through the adapter; one from an earlier ask is not this stage's
  const openedAt = useRef(0);
  const fed = useSyncExternalStore(watchVoiceStage, voiceStageBuild);
  const build = two && phase !== "closed" && fed && fed.key >= openedAt.current - 100 ? fed : null;
  const buildRef = useRef(build);
  buildRef.current = build;
  const reveal = useReveal(build, freeze);

  // `&level=0.8` pins the loudness the orb and the waveform show
  const pinned = useRef(Number(params.get("level")));
  const level = params.has("level") ? pinned : voice.level;
  const silent = useRef(0);

  useLayoutEffect(() => {
    seat.current?.appendChild(host);
    return () => {
      flight.current();
      host.remove();
    };
  }, [host, seat]);

  // Opening: the orb changes parent to the stage and flies there from where
  // it was in the dock, growing as it goes.
  useLayoutEffect(() => {
    if (phase !== "open" || !slot.current || host.parentElement === slot.current) return;
    const from = boxOf(host);
    slot.current.appendChild(host);
    flight.current();
    if (still()) return;
    flight.current = fly(host, () => from, () => boxOf(slot.current ?? host.parentElement!), beat("stageOpen"), pop, () => {
      host.style.transform = "";
    });
  }, [phase, host]);

  /** Let go: the stage closes, the orb flies home and, when there is a
      placed card on the stage, it travels to its spot on the board. `send`
      true sends what was said, false throws it away, undefined leaves the
      voice alone. */
  const close = useCallback(
    (send?: boolean) => {
      if (phaseRef.current !== "open") return;
      const v = voiceRef.current;
      if (send && v.transcript.trim()) v.finish();
      else if (send !== undefined) v.cancel();
      setPhase("closing");
      phaseRef.current = "closing";
      markStageBeat("close");
      flight.current();
      let left = 2;
      const land = () => {
        if (--left) return;
        host.style.transform = "";
        seat.current?.appendChild(host);
        document.body.classList.remove("voice-stage-up");
        setPhase("closed");
      };
      let stopOrb = () => {};
      if (still() || !seat.current) window.setTimeout(land, 200);
      else {
        const from = boxOf(host);
        stopOrb = fly(host, () => from, () => seatBox(seat.current!), beat("orbHome"), glide, land);
      }
      const b = buildRef.current;
      let stopCard = () => {};
      if (card.current && b?.complete && b.placed) {
        stopCard = flyCard(card.current, () => buildRef.current?.placed ?? b.placed, `voice-draft-${b.key}-0`, beat("cardTravel"), land);
      } else land();
      flight.current = () => {
        stopOrb();
        stopCard();
      };
    },
    [host, seat],
  );

  const open = useCallback(() => {
    if (!enabled || phaseRef.current !== "closed") return;
    openedAt.current = Date.now();
    markStageBeat("tap");
    document.body.classList.add("voice-stage-up");
    setPhase("open");
  }, [enabled]);

  // ---- when it lets go ----
  // centred stage: the ask ended (finish, the script ran out, a pause)
  useEffect(() => {
    if (!two && voice.state !== "listening") close();
  }, [two, voice.state, close]);
  // centred stage: a build started mid-sentence; keep listening in the dock
  useEffect(() => onVoiceStageRelease(() => close()), [close]);
  // two-part stage: the card is whole (held a beat so it reads as whole),
  // or nothing could be placed, or the ask ended with nothing to build
  const whole = Boolean(build?.complete && reveal.all);
  const failed = Boolean(build?.failed);
  const busy = useRef(false);
  const hold = useRef(0);
  useEffect(() => {
    if (!two || phase !== "open" || freeze) return;
    if (voice.state !== "idle") busy.current = true;
    if (whole) {
      markStageBeat("all");
      window.clearTimeout(hold.current);
      hold.current = window.setTimeout(() => close(), Math.max(0, beat("closeHold") - (performance.now() - (stageBeats().find((b) => b.name === "all")?.at ?? performance.now()))));
      return;
    }
    if (failed) return close();
    if (voice.state === "idle" && busy.current) {
      const id = window.setTimeout(() => close(), 300);
      return () => window.clearTimeout(id);
    }
  }, [two, phase, freeze, whole, failed, voice.state, close]);
  useEffect(() => {
    if (phase === "closed") busy.current = false;
  }, [phase]);

  // ---- the beats, for the readout ----
  useEffect(() => {
    if (phase === "open" && voice.transcript) markStageBeat("word", performance.now(), true);
  }, [phase, voice.transcript]);
  useEffect(() => {
    if (phase === "open" && voice.state === "working") markStageBeat("pause");
  }, [phase, voice.state]);
  useEffect(() => {
    if (build?.kind) markStageBeat("type");
    if (build?.complete) markStageBeat("complete");
    if (build?.placed && !build.placed.widgetId.startsWith("voice-draft-")) markStageBeat("committed");
  }, [build]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, close]);

  // `?stage=1`: open on load
  useEffect(() => {
    if (params.get("stage") !== "1") return;
    void voiceRef.current.start();
    open();
  }, [params, open]);

  const chip = (ask: string) => {
    playSound("tap");
    voice.say(ask);
    // long enough to read the sentence land before the stage lets go
    window.setTimeout(() => close(true), 650);
  };
  /** Two-part: a tap outside or Finish ends the ask; the stage stays for the build. */
  const done = () => {
    if (voice.state !== "listening") return;
    if (voice.transcript.trim()) voice.finish();
    else close(false);
  };

  const controls = (onFinish: () => void) => (
    <div className="voice-stage-controls" style={{ "--i": 6 } as CSSProperties} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="voice-stage-mute"
        data-testid="voice-stage-mute"
        aria-pressed={voice.muted}
        onClick={() => {
          playSound("tap");
          voice.mute(!voice.muted);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          {voice.muted && <path className="voice-stage-slash" d="M4 4l16 16" />}
        </svg>
        <b>{voice.muted ? "Unmute" : "Mute"}</b>
      </button>
      <button
        type="button"
        className="voice-stage-finish"
        data-testid="voice-stage-finish"
        onClick={() => {
          playSound("tap");
          onFinish();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <b>Finish</b>
      </button>
    </div>
  );

  const listening = voice.state === "listening";
  const lastSaid = useRef("");
  if (voice.transcript) lastSaid.current = voice.transcript;
  const text = headline(voice.transcript);
  const stageClass = `voice-stage is-${orbLook()} ${voice.muted ? "is-muted" : ""}`;
  const slowStyle = { "--slow": voiceSlow(), "--maker": build?.maker.color } as CSSProperties;

  const centred = (
    <div className={stageClass} data-testid="voice-stage" data-phase={phase} data-mode="center" onClick={() => close(true)}>
      <div className="voice-stage-body">
        <h2 className="voice-stage-question" style={{ "--i": 0 } as CSSProperties}>
          What are we doing together?
        </h2>
        <div className="voice-stage-orb" ref={slot} />
        <span className="voice-stage-status" data-testid="voice-stage-status" style={{ "--i": 2 } as CSSProperties}>
          <i aria-hidden="true" />
          {voice.muted ? "Muted" : "Listening"}
        </span>
        <div className="voice-stage-wave-wrap" style={{ "--i": 3 } as CSSProperties}>
          <StageWave level={voice.muted ? silent : level} />
        </div>
        <p className={`voice-stage-text ${text ? "" : "is-hint"}`} data-testid="voice-stage-text" style={{ "--i": 4 } as CSSProperties}>
          {text || "Say it out loud, or start with one of these."}
        </p>
        <div className="voice-stage-chips" style={{ "--i": 5 } as CSSProperties} onClick={(event) => event.stopPropagation()}>
          {STARTERS.map((starter, i) => (
            <button type="button" key={starter.label} className="voice-stage-chip" data-testid={`voice-stage-chip-${i}`} onClick={() => chip(starter.ask)}>
              <i aria-hidden="true">{starter.glyph}</i>
              {starter.label}
            </button>
          ))}
        </div>
        {controls(() => close(true))}
      </div>
    </div>
  );

  const state = build?.kind ? (whole ? "complete" : "filling") : "waiting";
  const twoPart = (
    <div
      className={`${stageClass} is-two`}
      data-testid="voice-stage"
      data-phase={phase}
      data-mode="two"
      data-build={state}
      style={slowStyle}
      onClick={done}
    >
      <div className="voice-two">
        <section className="voice-two-left" data-testid="voice-stage-left">
          <div className="voice-stage-orb" ref={slot} />
          <span className="voice-stage-status" data-testid="voice-stage-status">
            <i aria-hidden="true" />
            {voice.muted ? "Muted" : listening ? "Listening" : whole ? "Placing" : "Building"}
          </span>
          <div className="voice-stage-wave-wrap">
            <StageWave level={voice.muted || !listening ? silent : level} />
          </div>
          {voice.transcript ? (
            <StageWords text={voice.transcript} live={listening} kind={build?.kind ?? null} />
          ) : (
            <p className="voice-two-words is-hint" data-testid="voice-stage-text">
              Say what to add.
            </p>
          )}
          {controls(done)}
        </section>
        <section className="voice-two-right" data-testid="voice-stage-right" data-state={state}>
          {build?.kind && build.widget ? (
            <StageCard key={build.key} build={build} reveal={reveal} fly={card} />
          ) : (
            !voice.transcript &&
            listening && (
              <div className="voice-two-try" onClick={(event) => event.stopPropagation()}>
                <span>or tap one to hear it said</span>
                {SCRIPTED_ASKS.slice(0, 4).map((ask, i) => (
                  <button
                    type="button"
                    key={ask.id}
                    data-testid={`voice-stage-chip-${i}`}
                    style={{ "--i": i } as CSSProperties}
                    onClick={() => {
                      playSound("tap");
                      voice.play(ask.say);
                    }}
                  >
                    “{ask.say}”
                  </button>
                ))}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );

  const layer: ReactNode = (
    <>
      {createPortal(<VoiceOrb state={voice.muted ? "idle" : voice.state} level={level} stage={phase === "open"} />, host)}
      {phase !== "closed" && createPortal(two ? twoPart : centred, document.body)}
      {two && params.get("timing") === "1" && createPortal(<StageBeats said={lastSaid.current} mock={params.has("mock")} />, document.body)}
    </>
  );

  return { up: phase !== "closed" && (two || phase === "open"), open, layer };
}
