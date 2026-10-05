import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Widget } from "../data/types";
import {
  applyCard,
  footprint,
  getCard,
  guessCard,
  parseDeal,
  parsePartialCard,
  placeCards,
  placeReason,
  sentenceHangs,
  skeletonWidget,
  type CardContext,
  type CardId,
  type DealtCard,
  type Placement,
  type Rect,
} from "../lib/deck";
import type { VoiceEnd, VoiceHooks } from "../lib/voice";

/**
 * Say it → it builds, the room's half (the model's half is convex/voiceBuild.ts).
 * It starts while you're still talking:
 *
 * 1. Every new word: code guesses the card from the words (deck/guess.ts) and
 *    shows that card's real widget as a skeleton in your view at once, the
 *    title filling from your words. A changed guess morphs the same skeleton.
 * 2. Words steady for a beat: a speculative `deal` call goes out for them.
 *    It only returns cards; nothing is committed. Its answer streams into the
 *    skeleton field by field while the words still match it.
 * 3. A pause ends the ask. If a call already went out for exactly these words
 *    its answer is used (often already there); else one goes out now.
 * 4. The finished card renders on this screen from the answer right away,
 *    `placeCards` picks its spot (it glides there, the camera follows only if
 *    the spot is off-screen), then `commit` writes it and Convex brings it to
 *    every other screen. The synced card replaces the local one in the same
 *    frame (`withDrafts`).
 *
 * Every ask leaves a trace (words, calls, guesses, the context the model got,
 * its raw answer, the cards kept or rejected, why the spot, stage times from
 * the last word) for the dev readout and drawer. Clocks start at the last word.
 */

export type DealCall = { said: string; nonce: string; spec: boolean };
export type DealAnswer = {
  dealId: string | null;
  /** The model's short name; null for the mock stand-in (no model, no ms). */
  model: string | null;
  /** Exactly what the model was told about the room; null when nothing was sent. */
  context: string | null;
  answer: string;
  error: string | null;
  modelMs?: { firstLine: number | null; total: number } | null;
};

export type AskTrace = {
  key: number;
  /** Wall clock at the tap. */
  at: number;
  said: string;
  how: VoiceEnd["how"] | null;
  /** ms from the tap. */
  words: { text: string; ms: number }[];
  calls: { text: string; ms: number; spec: boolean; used: boolean }[];
  guesses: { card: string; ms: number }[];
  model: string | null;
  context: string | null;
  answer: string | null;
  error: string | null;
  dealId: string | null;
  cards: { card: string; ok: boolean; reason?: string; widgetId?: string }[];
  place: string | null;
  /** The code's guess at the pause vs the model's first card; null when either is missing. */
  guessAgreed: boolean | null;
  modelMs: { firstLine: number | null; total: number } | null;
  /** ms from the last word (negative = before it). */
  stages: Record<StageName, number | null>;
  done: boolean;
  ok: boolean | null;
};

const STAGES = ["pause", "skeleton", "first-field", "card-local", "committed", "card-on-screen"] as const;
export type StageName = (typeof STAGES)[number];

/** The ring in the maker's colour around the card being built (or, before
    the words name a card, a card-sized hole of its own). */
export type VoiceShell = {
  host: HTMLElement;
  /** Follows this draft's element; absent = sits at `box`. */
  draftId: string | null;
  box: Rect;
  said: string;
  /** "landing": the card is in, the ring goes solid and lets go. */
  phase: "dealing" | "landing";
};
export type VoiceLanded = { widgetId: string; x: number; y: number; host: HTMLElement; traceKey: number };
export type VoiceReceipt =
  | { ok: true; key: number; cards: string[]; model: string | null; ms: number | null; widgetId: string }
  | { ok: false; key: number };

const DOCK_ROOM = 20; // clear air between a landed card and the dock
const HANDOFF_MS = 520; // the ring's let-go (--dur-stage, plus a frame)
const LEAVE_MS = 240; // the slip's exit (--dur-base, plus a frame)
const FRAME_PAD = 12; // a frame's label, garland and dashes paint past its box
const STEADY_MS = 200; // words unchanged this long: send them speculatively
const SPEC_MIN_WORDS = 4;
const SPEC_MAX_CALLS = 4; // per ask, the final call included
const RECEIPT_MS = 6000;
const DRAFT = "voice-draft-";
const LIFTED_Z = 99990; // a skeleton floating over the board until it has a spot

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now())));

/** The box a frame really paints: its own, its label and decorations, and a pad. */
function paintedBox(el: HTMLElement) {
  let { left, top, right, bottom } = el.getBoundingClientRect();
  for (const k of el.querySelectorAll<HTMLElement>("*")) {
    const r = k.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return { left, top, right, bottom };
}

/** Pan on the house glide: fast off the mark, long settle. */
function glideScroll(scroller: HTMLElement, dx: number, dy: number, ms = 900) {
  if (!dx && !dy) return;
  const x0 = scroller.scrollLeft;
  const y0 = scroller.scrollTop;
  if (reducedMotion()) return scroller.scrollTo(x0 + dx, y0 + dy);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const e = t === 1 ? 1 : 1 - 2 ** (-10 * t);
    scroller.scrollTo(x0 + dx * e, y0 + dy * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** The shortest move that brings `r` into the view with air around it (canvas units). */
function panFor(r: Rect, v: Rect) {
  const airX = Math.min(120, Math.max(24, (v.w - r.w) / 2));
  const airY = Math.min(96, Math.max(24, (v.h - r.h) / 2));
  const axis = (a: number, len: number, va: number, vlen: number, air: number) =>
    a < va + air ? a - (va + air) : a + len > va + vlen - air ? a + len - (va + vlen - air) : 0;
  return { dx: axis(r.x, r.w, v.x, v.w, airX), dy: axis(r.y, r.h, v.y, v.h, airY) };
}

/** Read the canvas the way the asker sees it, in canvas coordinates (skeletons left out). */
function measure(scroller: HTMLElement | null) {
  const canvas = scroller?.querySelector<HTMLElement>(".space-canvas");
  if (!scroller || !canvas) return null;
  const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth || 1;
  const c = canvas.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  const dockTop = document.querySelector(".action-dock")?.getBoundingClientRect().top ?? s.bottom;
  const left = Math.max(s.left, c.left);
  const top = Math.max(s.top, c.top);
  const view = {
    x: (left - c.left) / scale,
    y: (top - c.top) / scale,
    w: (Math.min(s.right, window.innerWidth) - left) / scale,
    // Above the dock.
    h: (Math.min(s.bottom, dockTop - DOCK_ROOM) - top) / scale,
  };
  const board = Array.from(canvas.querySelectorAll<HTMLElement>("[data-widget-id]"), (el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.widgetId ?? "", x: (r.left - c.left) / scale, y: (r.top - c.top) / scale, w: r.width / scale, h: r.height / scale };
  }).filter((b) => b.id && !b.id.startsWith(DRAFT));
  // Frames are on the board too (data-frame-id, not a widget id): nothing lands on one.
  for (const el of canvas.querySelectorAll<HTMLElement>("[data-frame-id]")) {
    const r = paintedBox(el);
    board.push({
      id: el.dataset.frameId ?? "",
      x: (r.left - c.left) / scale - FRAME_PAD,
      y: (r.top - c.top) / scale - FRAME_PAD,
      w: (r.right - r.left) / scale + FRAME_PAD * 2,
      h: (r.bottom - r.top) / scale + FRAME_PAD * 2,
    });
  }
  // As far as the room can scroll with a spot still clear of the dock (a
  // phone's board runs past its canvas box, and the dock covers the last strip).
  const reachX = (scroller.scrollWidth - scroller.scrollLeft - (c.left - s.left)) / scale;
  const reachY = (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop + (dockTop - DOCK_ROOM - c.top)) / scale;
  const bounds = { x: 0, y: 0, w: Math.max(canvas.offsetWidth, reachX), h: Math.max(view.y + view.h, reachY) };
  return { canvas, scroller, scale, view, board, bounds };
}
type Measured = NonNullable<ReturnType<typeof measure>>;

const inView = (r: Rect, v: Rect) => r.x >= v.x && r.y >= v.y && r.x + r.w <= v.x + v.w && r.y + r.h <= v.y + v.h;

type Spec = {
  nonce: string;
  text: string;
  norm: string;
  spec: boolean;
  answer: DealAnswer | null;
  /** performance.now() when its answer first put a model field / the whole card on screen. */
  firstFieldAt: number | null;
  completeAt: number | null;
  promise: Promise<DealAnswer | null>;
};

type Session = {
  key: number;
  t0: number;
  text: string;
  m: Measured | null;
  guess: CardId | null;
  /** The card type the skeleton shows now (a guess or the model's). */
  shown: CardId | null;
  /** The skeleton shows the model's fields now, not the words' guess. */
  fromModel: boolean;
  /** The skeleton's spot, and whether it floats over the board until placed. */
  spot: Placement | null;
  lifted: boolean;
  specs: Spec[];
  steady: number;
  final: Spec | null;
  ended: boolean;
  lastWordAt: number;
  marks: Partial<Record<StageName, number>>;
  trace: AskTrace;
};

export function useVoiceBuild({
  scrollerRef,
  deal,
  commit,
  cardContext,
  selectedId,
  warm,
  onLanded,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  deal: (call: DealCall, onPartial: (answer: string) => void) => Promise<DealAnswer>;
  /** Write the kept cards (already placed); resolves to the synced widget ids, in order. */
  commit: (c: { dealId: string | null; cards: Array<{ card: DealtCard; widget: Widget }> }) => Promise<string[]>;
  cardContext: () => CardContext;
  selectedId?: () => string | null;
  /** Orb tapped: wake the model path (live only). */
  warm?: () => void;
  /** The asker's screen showed the synced card, `ms` after the last word. */
  onLanded?: (dealId: string, ms: number, trace: AskTrace) => void;
}) {
  const [drafts, setDrafts] = useState<Widget[]>([]);
  /** draft id → the synced widget that replaces it. */
  const [synced, setSynced] = useState<Record<string, string>>({});
  const [shell, setShell] = useState<VoiceShell | null>(null);
  const [landed, setLanded] = useState<VoiceLanded | null>(null);
  const [receipt, setReceipt] = useState<VoiceReceipt | null>(null);
  const [traces, setTraces] = useState<AskTrace[]>([]);
  /** The slip is on its way out (it leaves on glide, then unmounts). */
  const [leaving, setLeaving] = useState(false);
  const room = useRef({ deal, commit, cardContext, selectedId, warm, onLanded });
  room.current = { deal, commit, cardContext, selectedId, warm, onLanded };
  const session = useRef<Session | null>(null);
  const clearTimer = useRef(0);
  const shellTimer = useRef(0);
  const warmedAt = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(clearTimer.current);
      window.clearTimeout(shellTimer.current);
      if (session.current) window.clearTimeout(session.current.steady);
    },
    [],
  );

  /** Publish the session's trace (newest first, last 10 kept). */
  const publish = useCallback((s: Session) => {
    const t = { ...s.trace, stages: { ...s.trace.stages } };
    for (const name of STAGES) {
      const at = s.marks[name];
      t.stages[name] = at !== undefined && s.lastWordAt ? Math.round(at - s.lastWordAt) : null;
    }
    (window as unknown as { __voiceTrace?: AskTrace }).__voiceTrace = t;
    setTraces((all) => [t, ...all.filter((x) => x.key !== t.key)].slice(0, 10));
  }, []);

  const mark = useCallback((s: Session, name: StageName, at = performance.now()) => {
    if (s.marks[name] !== undefined) return;
    s.marks[name] = at;
    performance.mark(`voice:${name}`, { startTime: at });
  }, []);

  /** Put the skeleton (or the finished card) on the board as a local draft. */
  const show = useCallback(
    (s: Session, widgets: Widget[], at?: Placement[], state: "skeleton" | "card" = "skeleton") => {
      if (session.current !== s || !widgets.length) return;
      const first = widgets[0];
      if (!s.spot) {
        s.m = measure(scrollerRef.current) ?? s.m;
        if (!s.m) return;
        const size = footprint(first);
        const [spot] = placeCards([size], { widgets: s.m.board, view: s.m.view, bounds: s.m.bounds, selected: room.current.selectedId?.() ?? null });
        if (inView({ ...spot, ...size }, s.m.view)) s.spot = spot;
        else {
          // No clear spot in view: float over the board now, find the spot after.
          s.lifted = true;
          s.spot = {
            x: Math.round(s.m.view.x + Math.max(16, (s.m.view.w - size.w) / 2)),
            y: Math.round(s.m.view.y + Math.max(16, (s.m.view.h - size.h) / 3)),
          };
        }
      }
      const spots = at ?? widgets.map((_, i) => ({ x: s.spot!.x + i * 24, y: s.spot!.y + i * 24 }));
      setDrafts(
        widgets.map((w, i) => ({ ...w, x: spots[i].x, y: spots[i].y, z: s.lifted && !at ? LIFTED_Z + i : w.z })),
      );
      // The draft's look (shimmer while a skeleton), set on WidgetCard's own element.
      requestAnimationFrame(() => {
        const look = s.lifted && !at ? "lifted" : state;
        for (const el of s.m?.canvas.querySelectorAll<HTMLElement>(`[data-widget-id^="${DRAFT}${s.key}-"]`) ?? []) el.dataset.voiceDraft = look;
      });
      if (s.marks.skeleton === undefined) {
        s.marks.skeleton = -1;
        void nextFrame().then((t) => {
          delete s.marks.skeleton;
          mark(s, "skeleton", t);
        });
      }
      setShell((sh) =>
        sh && sh.draftId === `${DRAFT}${s.key}-0` && sh.phase === "dealing"
          ? sh
          : { host: s.m!.canvas, draftId: `${DRAFT}${s.key}-0`, box: { ...spots[0], w: first.w, h: first.h }, said: s.text, phase: "dealing" },
      );
    },
    [mark, scrollerRef],
  );

  const ctxNow = useCallback(() => room.current.cardContext(), []);

  /** The words' guess, as a skeleton (only while no model answer is filling it). */
  const showGuess = useCallback(
    (s: Session) => {
      // Once the model has written into the skeleton, only the model changes it.
      if (!s.guess || s.fromModel) return;
      s.shown = s.guess;
      const { widget } = skeletonWidget(s.guess, { id: `${DRAFT}${s.key}-0`, ctx: ctxNow(), said: s.text });
      show(s, [widget]);
    },
    [ctxNow, show],
  );

  /** A call's answer so far → the skeleton, field by field (only while its words are the current ones). */
  const fill = useCallback(
    (s: Session, sp: Spec, answer: string) => {
      if (session.current !== s) return;
      const current = s.final ? s.final === sp : sp.norm === norm(s.text);
      if (!current || sp.completeAt) return;
      const p = parsePartialCard(answer);
      if (!p || !getCard(p.card)) return;
      const card = p.card as CardId;
      s.shown = card;
      s.fromModel = true;
      const { widget, filled } = skeletonWidget(card, { id: `${DRAFT}${s.key}-0`, ctx: ctxNow(), said: s.text, partial: p.settings });
      show(s, [widget]);
      if (filled && !sp.firstFieldAt) {
        sp.firstFieldAt = -1;
        void nextFrame().then((t) => {
          sp.firstFieldAt = t;
          if (s.final === sp) mark(s, "first-field", t);
        });
      }
    },
    [ctxNow, mark, show],
  );

  /** A card's object has closed (in the stream, or the whole answer is in):
      the finished card(s) on this screen, still local. */
  const complete = useCallback(
    (s: Session, sp: Spec, text = sp.answer?.answer): Widget[] | null => {
      if (session.current !== s || text === undefined) return null;
      const current = s.final ? s.final === sp : sp.norm === norm(s.text);
      if (!current) return null;
      const ctx = ctxNow();
      const { items } = parseDeal(text, sp.answer !== null);
      const widgets: Widget[] = [];
      items.forEach((item) => {
        if (!item.ok) return;
        const r = applyCard(item.card, ctx, { id: `${DRAFT}${s.key}-${widgets.length}`, z: 1000 + widgets.length });
        if (r.ok) widgets.push(r.widget);
      });
      if (!widgets.length) return null;
      s.fromModel = true;
      show(s, widgets, undefined, "card");
      if (!sp.completeAt) {
        sp.completeAt = -1;
        void nextFrame().then((t) => {
          sp.completeAt = t;
          if (!sp.firstFieldAt || sp.firstFieldAt < 0) sp.firstFieldAt = t;
          if (s.final === sp) {
            mark(s, "first-field", sp.firstFieldAt);
            mark(s, "card-local", t);
          }
        });
      }
      return widgets;
    },
    [ctxNow, mark, show],
  );

  const fire = useCallback(
    (s: Session, text: string, spec: boolean): Spec => {
      const sp: Spec = {
        nonce: `${s.key.toString(36)}-${s.specs.length}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        norm: norm(text),
        spec,
        answer: null,
        firstFieldAt: null,
        completeAt: null,
        promise: Promise.resolve(null),
      };
      s.specs.push(sp);
      s.trace.calls.push({ text, ms: Math.round(performance.now() - s.t0), spec, used: false });
      if (spec) performance.mark("voice:phrase");
      sp.promise = room.current
        .deal({ said: text, nonce: sp.nonce, spec }, (a) => {
          // A closed card object is a finished card; before that, fill field by field.
          if (!sp.answer && parseDeal(a).items.some((i) => i.ok)) complete(s, sp, a);
          else fill(s, sp, a);
        })
        .then(
          (answer) => {
            sp.answer = answer;
            complete(s, sp);
            return answer;
          },
          () => null,
        );
      return sp;
    },
    [complete, fill],
  );

  const start = useCallback(() => {
    if (session.current) window.clearTimeout(session.current.steady);
    window.clearTimeout(clearTimer.current);
    window.clearTimeout(shellTimer.current);
    const now = performance.now();
    const s: Session = {
      key: Date.now(),
      t0: now,
      text: "",
      m: measure(scrollerRef.current),
      guess: null,
      shown: null,
      fromModel: false,
      spot: null,
      lifted: false,
      specs: [],
      steady: 0,
      final: null,
      ended: false,
      lastWordAt: 0,
      marks: {},
      trace: {
        key: Date.now(),
        at: Date.now(),
        said: "",
        how: null,
        words: [],
        calls: [],
        guesses: [],
        model: null,
        context: null,
        answer: null,
        error: null,
        dealId: null,
        cards: [],
        place: null,
        guessAgreed: null,
        modelMs: null,
        stages: Object.fromEntries(STAGES.map((n) => [n, null])) as AskTrace["stages"],
        done: false,
        ok: null,
      },
    };
    s.trace.key = s.key;
    session.current = s;
    setReceipt(null);
    setLanded(null);
    setLeaving(false);
    setShell(null);
    setDrafts([]);
    // Wake the model path, at most once a minute.
    if (now - warmedAt.current > 60_000) {
      warmedAt.current = now;
      room.current.warm?.();
    }
  }, [scrollerRef]);

  const words = useCallback(
    (text: string) => {
      const s = session.current;
      if (!s || s.ended) return;
      s.text = text;
      s.trace.words.push({ text, ms: Math.round(performance.now() - s.t0) });
      const guess = guessCard(text);
      if (guess && guess !== s.guess) {
        s.guess = guess;
        s.trace.guesses.push({ card: guess, ms: Math.round(performance.now() - s.t0) });
      }
      showGuess(s);
      // Words steady for a beat and they mean something: send them now.
      window.clearTimeout(s.steady);
      s.steady = window.setTimeout(() => {
        if (session.current !== s || s.ended || s.text !== text) return;
        if (text.split(/\s+/).length < SPEC_MIN_WORDS || sentenceHangs(text)) return;
        if (s.specs.length >= SPEC_MAX_CALLS - 1 || s.specs.some((sp) => sp.norm === norm(text))) return;
        fire(s, text, true);
      }, STEADY_MS);
    },
    [fire, showGuess],
  );

  const leave = useCallback(() => {
    clearTimer.current = window.setTimeout(() => {
      setLeaving(true);
      clearTimer.current = window.setTimeout(() => {
        setReceipt(null);
        setLanded(null);
        setLeaving(false);
      }, LEAVE_MS);
    }, RECEIPT_MS);
  }, []);

  const ask = useCallback(
    async (said: string, end: VoiceEnd) => {
      const s = session.current;
      if (!s) return;
      s.ended = true;
      s.text = said;
      s.lastWordAt = end.lastWordAt || end.endedAt;
      window.clearTimeout(s.steady);
      performance.mark("voice:end-of-speech");
      if (end.how === "pause") s.marks.pause = end.endedAt;
      s.trace.said = said;
      s.trace.how = end.how;
      const hit = s.specs.find((sp) => sp.norm === norm(said));
      const sp = hit ?? fire(s, said, false);
      s.final = sp;
      s.trace.calls[s.specs.indexOf(sp)].used = true;
      // Marks this call already reached before the pause count now.
      if (sp.firstFieldAt && sp.firstFieldAt > 0) mark(s, "first-field", sp.firstFieldAt);
      if (sp.completeAt && sp.completeAt > 0) mark(s, "card-local", sp.completeAt);
      // Words that named no card yet: hold a card-sized ring open in view.
      if (!s.shown && !s.final.answer) {
        s.m = measure(scrollerRef.current) ?? s.m;
        if (s.m) {
          const size = { w: 300, h: 240 };
          const [spot] = placeCards([size], { widgets: s.m.board, view: s.m.view, bounds: s.m.bounds });
          setShell({ host: s.m.canvas, draftId: null, box: { ...spot, ...size }, said, phase: "dealing" });
          s.spot = inView({ ...spot, ...size }, s.m.view) ? spot : null;
          void nextFrame().then((t) => mark(s, "skeleton", t));
        }
      }
      publish(s);

      const fail = (reason?: string) => {
        if (session.current !== s) return;
        setShell(null);
        setDrafts([]);
        setReceipt({ ok: false, key: s.key });
        s.trace.done = true;
        s.trace.ok = false;
        if (reason) s.trace.error = s.trace.error ?? reason;
        publish(s);
        leave();
      };

      const answer = await sp.promise;
      if (session.current !== s) return;
      s.trace.model = answer?.model ?? null;
      s.trace.context = answer?.context ?? null;
      s.trace.answer = answer?.answer ?? null;
      s.trace.error = answer?.error ?? null;
      s.trace.dealId = answer?.dealId ?? null;
      s.trace.modelMs = answer?.modelMs ?? null;
      if (!answer) return fail("the deal call failed");
      const { items, none } = parseDeal(answer.answer, true);
      const ctx = ctxNow();
      const kept: Array<{ card: DealtCard; widget: Widget }> = [];
      for (const item of items) {
        if (!item.ok) {
          s.trace.cards.push({ card: /"card"\s*:\s*"([^"]+)"/.exec(item.raw)?.[1] ?? "?", ok: false, reason: item.reason });
          continue;
        }
        const r = applyCard(item.card, ctx, { id: `${DRAFT}${s.key}-${kept.length}`, z: 1000 + kept.length });
        if (r.ok) kept.push({ card: item.card, widget: r.widget });
        s.trace.cards.push(r.ok ? { card: item.card.card, ok: true } : { card: item.card.card, ok: false, reason: r.reason });
      }
      s.trace.guessAgreed = s.guess && kept.length ? kept[0].card.card === s.guess : null;
      if (!kept.length) return fail(none ? "the model said no card fits" : "no valid card in the answer");
      complete(s, sp);

      // Where it goes: code, from the board as drawn, as close to the skeleton as fits.
      const m = measure(scrollerRef.current) ?? s.m;
      if (!m) return fail("no canvas");
      const sizes = kept.map((k) => footprint(k.widget));
      const placeRoom = { widgets: m.board, view: m.view, bounds: m.bounds, selected: room.current.selectedId?.() ?? null, anchor: s.spot ?? undefined };
      const spots = placeCards(sizes, placeRoom);
      s.trace.place = placeReason(sizes, spots, placeRoom);
      const placed = kept.map((k, i) => ({ ...k, widget: { ...k.widget, ...spots[i] } }));
      s.lifted = false;
      show(
        s,
        placed.map((p) => p.widget),
        spots,
        "card",
      );
      // The camera follows only when the spot is off-screen.
      const cluster = {
        x: Math.min(...spots.map((p) => p.x)),
        y: Math.min(...spots.map((p) => p.y)),
        w: Math.max(...spots.map((p, i) => p.x + sizes[i].w)) - Math.min(...spots.map((p) => p.x)),
        h: Math.max(...spots.map((p, i) => p.y + sizes[i].h)) - Math.min(...spots.map((p) => p.y)),
      };
      if (!inView(cluster, m.view)) {
        const pan = panFor(cluster, m.view);
        glideScroll(m.scroller, pan.dx * m.scale, pan.dy * m.scale);
      }
      // The ring goes solid and lets go; the slip goes on the card.
      setShell((sh) => (sh ? { ...sh, phase: "landing" } : sh));
      shellTimer.current = window.setTimeout(() => setShell(null), reducedMotion() ? 0 : HANDOFF_MS);
      const firstId = `${DRAFT}${s.key}-0`;
      setLanded({ widgetId: firstId, x: spots[0].x, y: spots[0].y, host: m.canvas, traceKey: s.key });

      let ids: string[] = [];
      try {
        ids = await room.current.commit({ dealId: answer.dealId, cards: placed });
      } catch {
        ids = [];
      }
      if (session.current !== s) return;
      if (!ids.length) return fail("the commit wrote nothing");
      mark(s, "committed");
      s.trace.cards.filter((c) => c.ok).forEach((c, i) => (c.widgetId = ids[i]));
      setSynced((all) => ({ ...all, ...Object.fromEntries(ids.map((id, i) => [`${DRAFT}${s.key}-${i}`, id])) }));
      setLanded((l) => (l && l.traceKey === s.key ? { ...l, widgetId: ids[0] } : l));

      // The synced card on this screen (it replaces the local one in the same frame).
      for (let i = 0; i < 200; i++) {
        if (m.canvas.querySelector(`[data-widget-id="${ids[0]}"]`)) break;
        await new Promise((r) => setTimeout(r, 16));
      }
      if (m.canvas.querySelector(`[data-widget-id="${ids[0]}"]`)) mark(s, "card-on-screen");
      s.trace.done = true;
      s.trace.ok = true;
      publish(s);
      const local = s.marks["card-local"];
      setReceipt({
        ok: true,
        key: s.key,
        cards: kept.map((k) => k.card.card),
        model: answer.model,
        ms: answer.model && local !== undefined ? Math.round(local - s.lastWordAt) : null,
        widgetId: ids[0],
      });
      const t = s.marks["card-on-screen"];
      if (answer.dealId && t !== undefined) room.current.onLanded?.(answer.dealId, t - s.lastWordAt, s.trace);
      leave();
      // Drafts that were replaced are dropped once the synced cards are in.
      if (t !== undefined)
        window.setTimeout(() => {
          if (session.current === s) setDrafts([]);
        }, 50);
    },
    [complete, ctxNow, fire, leave, mark, publish, scrollerRef, show],
  );

  /** The board as this screen should draw it: the synced widgets plus any
      local card not yet replaced by its synced copy. */
  const withDrafts = useCallback(
    (widgets: Widget[]): Widget[] => {
      if (!drafts.length) return widgets;
      const ids = new Set(widgets.map((w) => w.id));
      const at = new Set(widgets.map((w) => `${w.type}:${Math.round(w.x)}:${Math.round(w.y)}`));
      const keep = drafts.filter((d) => !(synced[d.id] && ids.has(synced[d.id])) && !at.has(`${d.type}:${d.x}:${d.y}`));
      return keep.length ? [...widgets, ...keep] : widgets;
    },
    [drafts, synced],
  );

  const voice: VoiceHooks = { start, words, ask };
  return { voice, withDrafts, drafts, shell, landed, receipt, leaving, traces };
}
