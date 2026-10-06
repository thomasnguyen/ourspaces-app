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
import { Thread } from "./LinkThreads";
import type { Widget } from "../data/types";
import { guessCard, sentenceHangs } from "../lib/deck";
import { isBare, SCRIPTED_ASKS } from "../lib/deck/mockDeal";
import { blankSlot, mapAnswer, missingNeeds, needOffers, needsOf, pinsFor, settingsFromWords } from "../lib/deck/needs";
import { checkRecipe, flowFor, getRecipe } from "../lib/deck/recipes";
import { getCard } from "../lib/deck/catalog";
import { checkSettings, type Need, type Schema } from "../lib/deck/schema";
import { orbLook } from "../lib/orbShader";
import { playSound } from "../lib/sounds";
import type { useVoice } from "../lib/voice";
import { fillPlan, showParts, type PartValue } from "../lib/voiceFillPlan";
import {
  markStageBeat,
  onVoiceStageRelease,
  stageBeats,
  setAskOutcome,
  setStageAsking,
  voiceStageBuild,
  voiceStageFacts,
  voiceStageOffers,
  watchStageBeats,
  watchVoiceStage,
  type StageBuild,
  type StageOffer,
  type StagePart,
  type StageReply,
  replyTone,
} from "../lib/voiceStage";
import { beat, timingCounts, VOICE_TIMINGS, voiceSlow } from "../lib/voiceTimings";
import { VoiceOrb } from "./VoiceOrb";
import { BoardLinkContext } from "../widgets/challenge";
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

/** The orb's flight between the dock and the stage. It stays where layout
    put it; only its transform moves, re-aimed every frame because the dock it
    lands in is still settling. The path is one arc (it leaves the dock going
    up and comes into the stage going sideways, and back the same way), the
    ball stretches along its travel while it is fast, and with `press` it
    first pushes down into the dock before it goes. */
function fly(host: HTMLElement, from: () => Box, to: () => Box, ms: number, o: { grow: (t: number) => number; press?: number }, done: () => void) {
  host.style.transform = "";
  const home = boxOf(host);
  const started = performance.now();
  const press = o.press ?? 0;
  let raf = 0;
  let last: { x: number; y: number } | null = null;
  let stretch = 1;
  // performance.now(), not the rAF timestamp: the two clocks can drift apart
  const frame = () => {
    const p = Math.min(1, (performance.now() - started) / ms);
    const a = from();
    const b = to();
    let x = a.x;
    let y = a.y;
    let w = a.w;
    let angle = 0;
    if (p < press) {
      // anticipation: down into the seat, and smaller, before the jump
      const q = Math.sin((p / press) * Math.PI);
      y = a.y + a.w * 0.06 * q;
      w = a.w * (1 - 0.14 * q);
    } else {
      const t = (p - press) / (1 - press);
      const e = glide(t);
      // the corner the arc bends round: over the dock, level with the stage
      const low = a.y > b.y ? a : b;
      const high = a.y > b.y ? b : a;
      const cx = low.x + (high.x - low.x) * 0.16;
      const cy = high.y + (low.y - high.y) * 0.1;
      const u = 1 - e;
      x = u * u * a.x + 2 * u * e * cx + e * e * b.x;
      y = u * u * a.y + 2 * u * e * cy + e * e * b.y;
      w = a.w + (b.w - a.w) * o.grow(t);
      if (last) {
        const speed = Math.hypot(x - last.x, y - last.y);
        stretch += (1 + Math.min(0.22, (speed / Math.max(80, w)) * 0.8) - stretch) * 0.5;
        if (speed > 0.5) angle = Math.atan2(y - last.y, x - last.x);
      }
    }
    last = { x, y };
    const k = w / home.w;
    host.style.transform = `translate(${x - home.x}px, ${y - home.y}px) rotate(${angle}rad) scale(${k * stretch}, ${k / Math.sqrt(stretch)}) rotate(${-angle}rad)`;
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

/** A recipe's group on the stage: the frame and each card in it at its own
    spot, each one arriving as it is written (the same order every screen
    gets them in). Fits the right half. */
function StageCluster({ cluster }: { cluster: NonNullable<StageBuild["cluster"]> }) {
  const { box, cards } = cluster;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // a group gets more of the stage than one card: it reaches left into the gap beside the words (voice-stage.css [data-group])
  const scale = vw <= 640 ? Math.min((vw - 40) / box.w, (vh * 0.34) / box.h) : Math.min((vw * 0.5) / box.w, (vh * 0.66) / box.h);
  const link = useMemo(() => ({ widgets: cards }), [cards]);
  return (
    <BoardLinkContext.Provider value={link}>
    <div className="voice-two-card-body voice-two-cluster" data-testid="voice-stage-cluster" data-cards={cards.length} style={{ zoom: scale, width: box.w, height: box.h }}>
      {cluster.thread && cards.length > 1 && <Thread a={{ ...cards[0], x: cards[0].x - box.x, y: cards[0].y - box.y }} b={{ ...cards[1], x: cards[1].x - box.x, y: cards[1].y - box.y }} tag={cluster.thread} />}
      {cards.map((w, i) => (
        <div key={w.id} className="voice-two-cluster-card" data-type={w.type} style={{ "--i": i } as CSSProperties}>
          <WidgetCard widget={{ ...w, x: w.x - box.x, y: w.y - box.y, z: w.type === "frame" ? 0 : 2 + i }} spaceId={spaceInHash()} canvasScale={scale} />
        </div>
      ))}
    </div>
    </BoardLinkContext.Provider>
  );
}

/** The card on the right half: the build's real widget, larger than on the
    board, in a dashed ring of the maker's colour until it is whole. */
const VERB_LABEL: Record<string, string> = { answer: "answering", recap: "catching up", mine: "your part", go: "going", game: "games", edit: "changing it" };

/** Another verb than make: no card, one slip (and offers to tap). The slip's
    tab says what kind of thing the space is saying; the first clause is the
    headline, the rest sits under it, so a long answer stacks instead of running wide. */
function StageReplySlip({ reply }: { reply: StageReply }) {
  const { tone, tab } = replyTone(reply);
  const [head, ...more] = reply.text.split(" · ");
  return (
    <div className="voice-two-reply" data-testid="voice-stage-reply" data-verb={reply.verb} data-tone={tone} onClick={(event) => event.stopPropagation()}>
      <span className="voice-two-reply-tab">{tab}</span>
      <p className="voice-two-reply-text">{head}</p>
      {more.length > 0 && <p className="voice-two-reply-more">{more.join(" · ")}</p>}
      {reply.source && <p className="voice-two-reply-source">{reply.source}</p>}
      {reply.offers?.length ? (
        <div className="voice-two-offers" data-testid="voice-stage-choices">
          {reply.offers.map((offer, i) => (
            <button
              type="button"
              key={i}
              className="voice-two-offer"
              data-testid={`voice-stage-choice-${i}`}
              onClick={() => {
                playSound("tap");
                offer.run();
              }}
            >
              {offer.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StageCard({
  build,
  reveal,
  fly,
  asking,
  offers,
  onOffer,
  found,
  question,
  answered,
}: {
  build: StageBuild;
  reveal: ReturnType<typeof useReveal>;
  fly: RefObject<HTMLDivElement | null>;
  /** The card was named with nothing to put in it: the stage asks for the rest. */
  asking: boolean;
  /** The question (lib/deck/needs.ts) and the field it fills: that part of the skeleton is the empty one. */
  question?: { ask: string; field: string } | null;
  /** While it asks: what the answers filled (shown as said) and every field still missing (shown empty, whatever a guess put there). */
  answered?: { pins: Record<string, unknown>; empty: string[] } | null;
  /** What the room offers to fill it with. */
  offers: StageOffer[];
  onOffer: (offer: StageOffer) => void;
  /** The board already has this card. */
  found: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  useArrivals(body, build.key);
  // an edit: the part that changes lights up (the row or line that carries the new words)
  const edit = build.edit;
  useLayoutEffect(() => {
    const root = body.current;
    if (!root) return;
    root.querySelectorAll("[data-edit-changed]").forEach((el) => el.removeAttribute("data-edit-changed"));
    const want = edit?.changed.toLowerCase().trim();
    if (!want) return;
    const hits = [...root.querySelectorAll<HTMLElement>("*")].filter((el) => (el.textContent ?? "").toLowerCase().includes(want));
    const deepest = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
    for (const el of deepest.slice(0, 2)) (el.closest<HTMLElement>("li, tr, .poll-row") ?? el).setAttribute("data-edit-changed", edit!.state);
  });
  // it is dealt out of the orb: where the orb is, from where the card will stand
  useLayoutEffect(() => {
    const el = fly.current;
    const stage = el?.closest<HTMLElement>(".voice-two");
    const orb = stage?.querySelector(".voice-stage-orb");
    if (!el || !stage || !orb) return;
    const o = orb.getBoundingClientRect();
    const frame = stage.getBoundingClientRect();
    el.style.setProperty("--deal-x", `${o.left + o.width / 2 - (frame.left + el.offsetLeft + el.offsetWidth / 2)}px`);
    el.style.setProperty("--deal-y", `${o.top + o.height / 2 - (frame.top + el.offsetTop + el.offsetHeight / 2)}px`);
  }, [fly]);
  // while it asks, the field it asks about is the empty one (whatever a guess put there)
  const widget =
    reveal.widget && asking && question
      ? { ...reveal.widget, data: withAnswers(reveal.widget.type, (answered?.empty ?? [question.field]).reduce((d, f) => askedEmpty(reveal.widget!.type, d, f), reveal.widget.data as Record<string, unknown>), answered?.pins ?? {}) as Widget["data"] }
      : reveal.widget;
  // the size is fixed by the card type, so the card doesn't breathe as rows land
  const scale = useMemo(() => (widget ? stageScale(widget.w, widget.h) : 1), [widget?.type, widget?.w]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!widget) return null;
  const whole = build.complete && reveal.all;
  // a cluster of one reads as its card ("poll"), never "1 cards, linked"
  const linkedCount = build.cluster ? build.cluster.cards.filter((w) => w.type !== "frame").length : 0;
  // the room's facts in this card, once the parts they filled are on screen
  const sources = build.parts.some((p) => p.room && p.id in reveal.at) ? build.sources : [];
  return (
    <div
      className="voice-two-card"
      data-testid="voice-stage-card"
      data-kind={build.kind ?? "card"}
      data-group={build.cluster ? "" : undefined}
      data-state={edit ? "edit" : found ? "found" : whole ? "complete" : asking ? "asking" : "skeleton"}
      data-asking-field={asking && question ? question.field : undefined}
    >
      <header className="voice-two-kind">
        <b>{linkedCount > 1 ? `${linkedCount} cards, linked` : (build.kind ?? "card")}</b>
        <span className="voice-two-parts" data-testid="voice-stage-parts">
          {build.parts.map((p) => (
            <i
              key={p.id}
              data-testid={`voice-stage-part-${p.id}`}
              data-part={p.id}
              data-status={p.status}
              data-shown={p.id in reveal.at ? "" : undefined}
              data-room={p.room ? "" : undefined}
              data-asked={asking && question && askedPart(question.field, p.id) ? "" : undefined}
              title={p.label}
            />
          ))}
        </span>
        {asking && !found && (
          <strong className="voice-two-ask" data-testid="voice-stage-ask" data-field={question?.field}>
            {question?.ask ?? fillPlan(build.kind).ask}
          </strong>
        )}
        {edit && (
          <strong className="voice-two-ask is-found is-edit" data-testid="voice-stage-edit" data-state={edit.state}>
            {edit.text}
          </strong>
        )}
        {found && !edit && (
          <strong className="voice-two-ask is-found" data-testid="voice-stage-found">
            already on the board
          </strong>
        )}
      </header>
      <div className="voice-two-fly" ref={fly}>
        <svg className="voice-two-ring" aria-hidden="true">
          <rect x="1.5" y="1.5" rx="28" />
        </svg>
        {build.cluster ? (
          <StageCluster cluster={build.cluster} />
        ) : (
          <div className="voice-two-card-body" ref={body} style={{ zoom: scale }}>
            <WidgetCard widget={{ ...widget, x: 0, y: 0, z: 1, rotate: 0 }} spaceId={spaceInHash()} canvasScale={scale} />
          </div>
        )}
      </div>
      {asking && !found && offers.length > 0 && (
        <div className="voice-two-offers" data-testid="voice-stage-offers" onClick={(event) => event.stopPropagation()}>
          <span>say it, or take one from the room</span>
          {offers.map((offer, i) => (
            <button type="button" key={offer.label} data-testid={`voice-stage-offer-${i}`} data-fills={offer.fills ? Object.keys(offer.fills).join(" ") : undefined} style={{ "--i": i } as CSSProperties} onClick={() => onOffer(offer)}>
              <b>{offer.label}</b>
              <i>from {offer.from}</i>
            </button>
          ))}
        </div>
      )}
      {sources.length > 0 && !found && (
        <p className="voice-two-sources" data-testid="voice-stage-sources">
          <i aria-hidden="true" />
          from the room: {sources.join(", ")}
        </p>
      )}
    </div>
  );
}

/** A card's field shown empty on the stage: list rows keep their places as blank pills. */
function askedEmpty(type: string, d: Record<string, unknown>, field: string) {
  const B = "\u00a0";
  if (type === "poll" && field === "options") return { ...d, options: [0, 1, 2].map((i) => ({ id: "abc"[i], label: B, votes: 0, total: 0, voters: [] })) };
  if (type === "wheel" && field === "options") return { ...d, slices: [0, 1, 2, 3].map((i) => ({ id: "abcd"[i], label: B })) };
  if (type === "potluck" && field === "items") return { ...d, items: [0, 1, 2].map(() => ({ name: B, by: null, claimed: false })) };
  if (type === "countdown" && (field === "date" || field === "event")) return { ...blankSlot(type, d, "date"), ...(field === "event" ? { event: B } : {}) };
  if (field === "question" || field === "title" || field === "text") return { ...d, [field]: B };
  return d;
}

/** The stage card while it asks: the answers so far, plus code's parse of the answer being said for the field asked (never a model's guess there); every other missing field empty. */
function askedView(r: { card: string; answers: Record<string, unknown>; from: number }, q: Need, said: string, facts: ReturnType<typeof voiceStageFacts>, today: string) {
  const partial = said.trim().split(/\s+/).slice(r.from).join(" ");
  const live = partial ? mapAnswer(q, partial, today) : null;
  const empty = new Set([q.field, ...missingNeeds(r.card, said, facts, today, r.answers).map((n) => n.field)]);
  return { pins: pinsFor(r.card, { ...r.answers, ...(live ?? {}) }), empty: [...empty] };
}

/** What the answers filled, as the card will have it (a poll's question, a list's rows, a countdown's date). */
function withAnswers(type: string, d: Record<string, unknown>, pins: Record<string, unknown>) {
  const out = { ...d };
  for (const [k, v] of Object.entries(pins)) {
    if (k === "options" && Array.isArray(v)) {
      if (type === "poll") out.options = v.map((label, i) => ({ id: "abcdefgh"[i], label, votes: 0, total: 0, voters: [] }));
      if (type === "wheel") out.slices = v.map((label, i) => ({ id: "abcdefgh"[i], label }));
    } else if (k === "items" && Array.isArray(v)) out.items = v.map((name) => ({ name, by: null, claimed: false }));
    else if (k === "date") out.targetDate = v;
    else out[k] = v;
  }
  return out;
}

/** Which skeleton part a field fills (the fill plan's part ids: question, option-0, event, date, total, title, item-0…). */
function askedPart(field: string, part: string) {
  const base = part.replace(/-\d+$/, "");
  return base === field || `${base}s` === field || (field === "items" && base === "item") || (field === "options" && base === "option") || (field === "text" && base === "title") || (field === "activity" && base === "title");
}

/** Your words, one span each: settled words stand, the newest is live, and
    the words that named the card wear the maker's colour. */
function StageWords({ text, live, kind, asking }: { text: string; live: boolean; kind: string | null; asking: boolean }) {
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
    <p className={`voice-two-words ${asking ? "is-asking" : ""}`} data-testid="voice-stage-text">
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

/** Dev only (`?timing=table`; `?timing=1` is just the thin readout): the beats of this ask, the table's number beside
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
  const parts = beats.filter((b) => b.name.startsWith("part:"));
  const counts = timingCounts();
  const both = (fast: number, brain: number) => `${fast.toLocaleString()} · brain ${brain.toLocaleString()}`;
  const rows: Array<[string, string, string]> = [
    ["card type known", keyword ? "at the card word" : "with the first field", since("type")],
    ["first field (tentative)", both(T.fastTentative.ms, T.brainTentative.ms), parts.length > 1 ? since(parts[1].name) : "—"],
    ["pause detected", `${T.pauseDetected.ms}`, since("pause")],
    ["final card", both(T.fastFinal.ms, T.brainFinal.ms), since("complete")],
    ["every part on screen", `+${T.partBeat.ms} a part (assumed)`, since("all")],
    ["committed", both(T.fastCommitted.ms, T.brainCommitted.ms), since("committed")],
    ["other screens", both(T.fastOthers.ms, T.brainOthers.ms), "one screen here"],
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
    // a recipe lands on its frame (frames carry data-frame-id)
    const at = (id: string) => p.host.querySelector<HTMLElement>(`[data-widget-id="${id}"], [data-frame-id="${id}"]`);
    const draft = at(draftId);
    const synced = at(p.widgetId);
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
    // it takes the hit and settles; a group lands as one thing, then each of its cards settles in turn
    if (target && !still()) {
      const box = target.getBoundingClientRect();
      const inside = target.hasAttribute("data-frame-id") && host
        ? [...host.querySelectorAll<HTMLElement>("[data-widget-id]")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const x = r.left + r.width / 2;
              const y = r.top + r.height / 2;
              return el !== target && x > box.left && x < box.right && y > box.top && y < box.bottom;
            })
            .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        : [];
      if (inside.length) {
        target.animate([{ scale: "1.03 0.97" }, { scale: "1" }], { duration: 360, easing: POP });
        inside.forEach((el, i) => el.querySelector(".widget-group-body")?.animate([{ scale: "1", translate: "0 0" }, { scale: "1.06 0.94", translate: "0 -7px" }, { scale: "1", translate: "0 0" }], { duration: 420, delay: 140 + i * 70, easing: GLIDE }));
      } else target.querySelector(".widget-group-body")?.animate([{ scale: "1.045 0.955" }, { scale: "1" }], { duration: 360, easing: POP });
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

/** The board already has this card: the stage's card travels to the one
    that is there and melts into it, which takes the hit. */
function mergeCard(card: HTMLElement, target: HTMLElement, ms: number, done: () => void) {
  const from = card.getBoundingClientRect();
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const host = target.offsetParent as HTMLElement | null;
  const started = performance.now();
  let raf = 0;
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    card.style.visibility = "hidden";
    if (!still()) target.querySelector(".widget-group-body")?.animate([{ scale: "1.06 0.94" }, { scale: "1" }], { duration: 360, easing: POP });
    markStageBeat("landed");
    done();
  };
  const frame = () => {
    const p = Math.min(1, (performance.now() - started) / ms);
    const r = target.getBoundingClientRect();
    const zoom = host ? host.getBoundingClientRect().width / host.offsetWidth || 1 : 1;
    const x = cx + (r.left + r.width / 2 - cx) * sway(p);
    const y = cy + (r.top + r.height / 2 - cy) * glide(p);
    const k = 1 + ((target.offsetWidth * zoom) / from.width - 1) * glide(p);
    card.style.transform = `translate(${x - cx}px, ${y - cy}px) scale(${k})`;
    // it is the same card: the one arriving thins out over the one that is there
    card.style.opacity = String(1 - Math.max(0, (p - 0.45) / 0.55) ** 2);
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
  const fresh = two && phase !== "closed" && fed && fed.key >= openedAt.current - 100 ? fed : null;
  // The build takes its skeleton down while the words match a card already on
  // the board. The stage keeps showing the card it had: it is what travels to
  // the one that is there.
  const held = useRef<{ at: number; build: StageBuild } | null>(null);
  if (fresh?.widget) held.current = { at: openedAt.current, build: fresh };
  const kept = phase !== "closed" && held.current?.at === openedAt.current ? held.current.build : null;
  const build = fresh?.widget ? fresh : fresh && kept ? { ...kept, found: fresh.found, failed: fresh.failed, reply: fresh.reply } : (kept ?? fresh);
  const buildRef = useRef(build);
  buildRef.current = build;
  const askedBare = useRef(false);
  const reveal = useReveal(build, freeze);

  // ---- it asks for what's missing (lib/deck/needs.ts) ----
  // Each card says which fields it can't do without. When nothing in the
  // words stands on one, the pause doesn't end the ask: the question lands on
  // the card's shoulder and in the slip, the room offers what it knows, and
  // the next words are the answer (code maps them onto that field only). Two
  // questions at most. Quiet for `followUpWait`: a card with its type and one
  // real field lands unfinished, its slot marked; an empty one is let go.
  const facts = voiceStageFacts();
  const today = facts?.today ?? new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const said = voice.transcript;
  const live = two && phase === "open" && voice.state === "listening";
  const askCard = live && said.trim() ? (flowFor(said, facts) ?? (/\bchallenge\b/i.test(said) ? "challenge" : (build?.kind ?? null))) : null;
  type AskRun = { card: string; base: string; answers: Record<string, unknown>; asked: Need[]; from: number; ms: number[] };
  const askRun = useRef<AskRun | null>(null);
  const [question, setQuestion] = useState<Need | null>(null);
  const hasNeeds = Boolean(askCard && needsOf(askCard).length);
  const missing = askCard && hasNeeds ? missingNeeds(askCard, said, facts, today) : [];
  // a card with no declared needs keeps the first version: named with nothing in it, "what's it about?"
  const bare = live && Boolean(build?.kind) && !hasNeeds && isBare(said);
  const needy = live && Boolean(askCard) && hasNeeds && (missing.length > 0 || askRun.current !== null);
  const asking = Boolean(question) || (bare && askedBare.current);
  const lastWordAt = useRef(0);
  useEffect(() => {
    lastWordAt.current = performance.now();
  }, [said]);
  /** Ask the next question, or end the ask with what code learned. */
  const advance = (r: AskRun, now: string, unfinished?: string) => {
    const next = unfinished ? undefined : missingNeeds(r.card, now, facts, today, r.answers)[0];
    if (next && r.asked.length < 2) {
      r.asked.push(next);
      r.from = now.trim().split(/\s+/).filter(Boolean).length;
      setQuestion(next);
      r.ms.push(Math.round(performance.now() - lastWordAt.current));
      markStageBeat("asked");
      return;
    }
    const left = unfinished ?? next?.field;
    const settings = { ...settingsFromWords(r.card, r.base, facts, today), ...pinsFor(r.card, r.answers) };
    const def = getCard(r.card);
    const direct = !left && (def ? checkSettings(def.settings as Schema, settings).ok : getRecipe(r.card) ? checkRecipe(r.card, settings).ok : false);
    setAskOutcome({ card: r.card, said: now, pins: left || direct ? settings : pinsFor(r.card, r.answers), direct, ...(left ? { unfinished: left } : {}), asked: r.asked.map((n) => n.ask), askedMs: r.ms });
    askRun.current = null;
    setQuestion(null);
    voiceRef.current.hold(false);
    voiceRef.current.finish();
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    voiceRef.current.hold(needy || bare);
    setStageAsking(needy || bare);
    if (!needy && !bare) {
      askRun.current = null;
      askedBare.current = false;
      setQuestion(null);
      return;
    }
    const quiet = beat(sentenceHangs(said) ? "pauseHang" : "pauseQuiet");
    const words = said.trim().split(/\s+/).filter(Boolean).length;
    const t = window.setTimeout(() => {
      if (bare) {
        askedBare.current = true;
        setQuestion(null);
        setBareAsked((n) => n + 1);
        markStageBeat("asked");
        return;
      }
      const r = askRun.current;
      if (!r) {
        const first = missingNeeds(askCard!, said, facts, today)[0];
        if (!first) return;
        askRun.current = { card: askCard!, base: said, answers: {}, asked: [], from: words, ms: [] };
        advanceRef.current(askRun.current, said);
        return;
      }
      if (words <= r.from) return;
      const got = mapAnswer(r.asked.at(-1)!, said.trim().split(/\s+/).slice(r.from).join(" "), today);
      // not that kind of answer (no list, no date, no number): the question stands
      if (!got) return;
      r.answers = { ...r.answers, ...got };
      advanceRef.current(r, said);
    }, quiet);
    const giveUp = window.setTimeout(() => {
      if (bare) {
        const guess = buildRef.current?.parts.length && buildRef.current.parts.every((p) => p.status !== "pending");
        if (guess) voiceRef.current.finish();
        else closeRef.current(false);
        return;
      }
      const r = askRun.current;
      // walked away: something real in it lands unfinished, its slot marked; nothing real is let go
      const real = r && Object.keys({ ...settingsFromWords(r.card, r.base, facts, today), ...r.answers }).length > 0;
      if (r && real) advanceRef.current(r, said, missingNeeds(r.card, said, facts, today, r.answers)[0]?.field ?? r.asked.at(-1)!.field);
      else closeRef.current(false);
    }, quiet + beat("followUpWait"));
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(giveUp);
    };
  }, [needy, bare, said]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, setBareAsked] = useState(0);
  const offers = useMemo<StageOffer[]>(() => {
    if (!asking || !build?.kind) return [];
    const card = askRun.current?.card ?? build.kind;
    const direct = needOffers(facts, card, question ?? undefined).map((o) => ({ label: o.label, say: o.label, from: o.from, fills: o.fills }));
    const first = !question || askRun.current?.asked.length === 1;
    const worded = first && (!question || question.as === "text") ? voiceStageOffers(build.kind) : [];
    return [...direct, ...worded].slice(0, 3);
  }, [asking, build?.kind, question]); // eslint-disable-line react-hooks/exhaustive-deps
  const takeOffer = (offer: StageOffer) => {
    playSound("tap");
    const r = askRun.current;
    const now = `${voice.transcript} ${offer.say}`;
    voice.say(now);
    if (r && question) {
      const got = offer.fills ?? mapAnswer(question, offer.say, today);
      if (got) {
        r.answers = { ...r.answers, ...got };
        return advance(r, now);
      }
    }
    voice.finish();
  };
  // ---- the board already has this card (the build's own check): say so, then go to it ----
  const found = build?.found ?? null;
  const reply = build?.reply ?? null;

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
    const there = () => {
      const box = boxOf(slot.current ?? host.parentElement!);
      return { ...box, w: box.w * 1.6 };
    };
    flight.current = fly(host, () => from, there, beat("stageOpen"), { grow: pop, press: 0.12 }, () => {
      host.style.transform = "";
    });
  }, [phase, host]);

  /** Let go: the stage closes, the orb flies home and, when there is a
      placed card on the stage, it travels to its spot on the board. `send`
      true sends what was said, false throws it away, undefined leaves the
      voice alone. */
  const close = useCallback(
    (send?: boolean, onto?: HTMLElement) => {
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
        if (!still()) {
          host.animate([{ scale: "1.2 0.82", translate: "0 5%" }, { scale: "1", translate: "0 0" }], { duration: 360, easing: POP });
          seat.current?.closest(".action-dock")?.animate([{ translate: "0 0" }, { translate: "0 5px", offset: 0.3 }, { translate: "0 0" }], { duration: 360, easing: GLIDE });
        }
        document.body.classList.remove("voice-stage-up");
        setPhase("closed");
      };
      let stopOrb = () => {};
      if (still() || !seat.current) window.setTimeout(land, 200);
      else {
        const from = boxOf(host);
        stopOrb = fly(host, () => from, () => seatBox(seat.current!), beat("orbHome"), { grow: glide }, land);
      }
      const b = buildRef.current;
      let stopCard = () => {};
      if (card.current && onto) {
        // the build's camera is already on its way to the card that is there; the stage's card melts into it
        stopCard = mergeCard(card.current, onto, beat("cardTravel"), land);
      } else if (card.current && b?.complete && b.placed) {
        stopCard = flyCard(card.current, () => buildRef.current?.placed ?? b.placed, `voice-draft-${b.key}-0`, beat("cardTravel"), land);
      } else land();
      flight.current = () => {
        stopOrb();
        stopCard();
      };
    },
    [host, seat],
  );

  const closeRef = useRef(close);
  closeRef.current = close;
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
    if (reply) {
      // an answer, a recap, your part: said on the stage, then the board takes over (offers wait for a tap)
      markStageBeat("reply");
      // a wait is said and let go at once: the board is where it plays out (the halo, the ticket)
      const id = window.setTimeout(() => close(), reply.offers?.length ? 12000 : reply.text.startsWith("waiting on ") ? beat("replyHold") / 2 : beat("replyHold"));
      return () => window.clearTimeout(id);
    }
    if (found) {
      markStageBeat("found");
      const onto = found.host.querySelector<HTMLElement>(`[data-widget-id="${found.widgetId}"]`) ?? undefined;
      const id = window.setTimeout(() => close(undefined, onto), beat("foundHold"));
      return () => window.clearTimeout(id);
    }
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
  }, [two, phase, freeze, whole, failed, found, reply, voice.state, close]);
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
        <b>{voice.muted ? "unmute" : "mute"}</b>
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
        <b>finish</b>
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
        <div className="voice-stage-orb" ref={slot}>
            <i className="voice-stage-thump" aria-hidden="true" />
          </div>
        <span className="voice-stage-status" data-testid="voice-stage-status" style={{ "--i": 2 } as CSSProperties}>
          <i aria-hidden="true" />
          {voice.muted ? "muted" : "listening"}
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
          <div className="voice-stage-orb" ref={slot}>
            <i className="voice-stage-thump" aria-hidden="true" />
          </div>
          <div className="voice-two-bar">
            <span className="voice-stage-status" data-testid="voice-stage-status" data-mood={voice.muted ? "muted" : listening ? "listening" : "working"}>
              <i aria-hidden="true" />
              {voice.muted ? "muted" : listening ? "listening" : reply ? (VERB_LABEL[reply.verb] ?? "done") : build?.edit ? "changing it" : found ? "already here" : whole ? "placing" : "building"}
            </span>
            {controls(done)}
          </div>
          <div className="voice-stage-wave-wrap">
            <StageWave level={voice.muted || !listening ? silent : level} />
          </div>
          {/* one box that arrives once with the stage: the words inside it never wait on an entrance */}
          <div className="voice-two-say">
            {voice.transcript ? (
              <StageWords text={voice.transcript} live={listening} kind={build?.kind ?? null} asking={asking} />
            ) : (
              <p className="voice-two-words is-hint is-asking" data-testid="voice-stage-text">
                say what to add
              </p>
            )}
            {question && listening && (
              <div className="voice-two-ask-slip" data-testid="voice-stage-ask-slip">
                <StageReplySlip reply={{ verb: "ask", text: question.ask }} />
              </div>
            )}
          </div>
        </section>
        <section className="voice-two-right" data-testid="voice-stage-right" data-state={state}>
          {reply && voice.state !== "listening" ? (
            <StageReplySlip reply={reply} />
          ) : build?.kind && build.widget ? (
            <StageCard
              key={build.key}
              build={build}
              reveal={reveal}
              fly={card}
              asking={asking}
              offers={offers}
              onOffer={takeOffer}
              found={Boolean(found)}
              question={question ? { ask: question.ask, field: question.field } : null}
              answered={askRun.current && question ? askedView(askRun.current, question, said, facts, today) : null}
            />
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
                    <i aria-hidden="true" />
                    {ask.say}
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
      {two && params.get("timing") === "table" && createPortal(<StageBeats said={lastSaid.current} mock={params.has("mock")} />, document.body)}
    </>
  );

  return { up: phase !== "closed" && (two || phase === "open"), open, layer };
}
