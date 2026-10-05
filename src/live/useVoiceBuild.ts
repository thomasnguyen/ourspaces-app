import { playSound } from "../lib/sounds";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Widget } from "../data/types";
import {
  applyCard,
  existingFor,
  footprint,
  getCard,
  guessCard,
  parseDeal,
  parseDealResolved,
  parsePartialCard,
  placeCards,
  placeReason,
  resolveCard,
  routeAsk,
  scrubTokens,
  sentenceHangs,
  skeletonWidget,
  type AskRoute,
  type BoardItem,
  type CardContext,
  type ExistingCheck,
  type ResolveNote,
  type RoomFacts,
  type CardId,
  type DealtCard,
  type Placement,
  type Rect,
} from "../lib/deck";
import type { Schema } from "../lib/deck/schema";
import { expandRecipe, isRecipe, recipeLead, type RecipePart } from "../lib/deck/recipes";
import type { VoiceEnd, VoiceHooks } from "../lib/voice";

/**
 * Say it → it builds, the room's half (the model's half is convex/voiceBuild.ts).
 * It starts while you're still talking:
 *
 * 1. Every new word: code guesses the card from the words (deck/guess.ts) and
 *    shows that card's real widget as a skeleton in your view at once, the
 *    title filling from your words. A changed guess morphs the same skeleton.
 * 2. Every new word that names a card (no card named: 4+ words steady for a
 *    beat) goes out as a speculative `deal` call, at most two in flight; when
 *    both are out, the newest words wait for a slot. Each answer fills the
 *    skeleton *tentatively* (dimmed) the moment it lands, the newest words
 *    winning: an answer for older words than the one shown is ignored. Only
 *    closed fields show, so a field that didn't change stays put. Nothing is
 *    committed while you talk.
 * 3. A pause ends the ask (lib/voice.ts; shorter when these exact words have
 *    already made a whole card). The call for exactly these words is used,
 *    else one goes out now.
 * 4. The moment that call's first card closes in the stream, the card goes
 *    final on this screen, `placeCards` picks its spot, and `commit` writes it
 *    with that spot in one mutation; Convex brings it to every other screen.
 *    The synced card replaces the local one in the same frame (`withDrafts`).
 *    More cards in the same answer follow in a second write.
 * 5. A word that lands just after the pause reopens the ask (lib/voice.ts).
 *    The longer sentence gets its own call; a card already committed is
 *    corrected in place (`amend`), never dealt twice.
 *
 * Two more things run alongside (B2/D1b):
 * - **Route by need.** Each call is routed by the room brief's facts
 *   (`routeAsk`): words that point at no room fact get the fast Lightning
 *   fill; words that do get the token prompt on Ultra, and every answer
 *   (tentative too) is resolved here against the facts (`resolve.ts`), so
 *   names and dates come from rows, never from the model.
 * - **Decide while you talk.** Every new word (not hanging) also asks Ultra
 *   for one letter: which card. A sure pick (≥ 0.8) beats the code's guess
 *   for the skeleton on the fast route, goes into the next fill as "deal one
 *   <card> card", and when the final answer dealt a different card, the fill
 *   is asked again with the pick.
 * - **Already here (B3).** When code sees a widget on the board whose kind
 *   and title match the words (`existingFor`), the decide also asks Ultra
 *   "is a card already on the board that does what the request asks?". A
 *   yes (≥ 0.8) for the final words, with code's match still standing, is
 *   the answer: nothing is committed, the camera glides to that widget, it
 *   pulses once in the asker's colour and a slip says it's already here.
 *   No code match: the model is never asked and the card is dealt as before.
 * - **The skeleton holds.** Once it shows a card, a tentative answer for
 *   another card only moves it when a second call agrees, or the sure
 *   decide does; the final answer always wins.
 *
 * Every ask leaves a trace (words, calls, guesses, every tentative fill and
 * which answer became final, the context the model got, its raw answer, the
 * cards kept or rejected, why the spot, stage times from the last word) for
 * the dev readout and drawer. Clocks start at the last word.
 */

export type DealCall = {
  said: string;
  nonce: string;
  spec: boolean;
  /** "brain": the token prompt with `menu` on the big model. */
  route?: "fast" | "brain";
  menu?: string;
  /** The decide pass's card, when it was sure. */
  card?: string;
};
export type BoardVerdict = { yes: boolean; conf: number | null; ms: number; usage: { prompt: number; completion: number } | null; error: string | null };
export type DecideAnswer = {
  /** The yes/no "already on the board?", when it was asked. */
  onBoard?: BoardVerdict | null;
  card: string | null;
  conf: number | null;
  top: { card: string; p: number }[];
  ms: number;
  usage: { prompt: number; completion: number } | null;
  error: string | null;
};
/** The decide pass is trusted from this probability (nebius/eval/decide: 36 of 38 right at ≥ 0.8). */
const DECIDE_BAR = 0.8;
const DECIDE_MAX = 6;
const DECIDE_IN_FLIGHT = 2;
export type DealAnswer = {
  dealId: string | null;
  /** The model's short name; null for the mock stand-in (no model, no ms). */
  model: string | null;
  /** Exactly what the model was told about the room; null when nothing was sent. */
  context: string | null;
  answer: string;
  error: string | null;
  modelMs?: { firstLine: number | null; total: number } | null;
  route?: string;
  usage?: { prompt: number; completion: number } | null;
};

/** One time an answer went into the card on this screen. */
export type AskFill = {
  /** ms from the tap. */
  ms: number;
  /** Which call (index into `calls`). */
  call: number;
  words: string;
  /** Model fields whose value changed from the fill before (the flicker count). */
  changed: string[];
  /** The model's whole card, not some of its fields. */
  whole: boolean;
  /** The answer that became final (after the ask ended); else tentative. */
  final: boolean;
};

export type AskTrace = {
  key: number;
  /** Wall clock at the tap. */
  at: number;
  said: string;
  how: VoiceEnd["how"] | null;
  /** ms from the tap. */
  words: { text: string; ms: number }[];
  calls: {
    text: string;
    ms: number;
    spec: boolean;
    used: boolean;
    route?: "fast" | "brain";
    /** The decided card this call was told to deal. */
    card?: string | null;
    /** Tokens in and out, once the call returned (for the cost line). */
    usage?: { model: string; prompt: number; completion: number } | null;
  }[];
  guesses: { card: string; ms: number }[];
  /** Every decide call: when it went out and came back (ms from the tap), its pick. */
  decides: {
    text: string;
    ms: number;
    back: number | null;
    card: string | null;
    conf: number | null;
    top: { card: string; p: number }[];
    error: string | null;
    usage: { prompt: number; completion: number } | null;
    /** Code's match when this decide went out, and the yes/no it asked. */
    match?: string | null;
    onBoard?: BoardVerdict | null;
  }[];
  /** The "already here" answer: code's check at the pause, the model's yes/no, and what was done. */
  found: {
    check: ExistingCheck;
    verdict: { yes: boolean; conf: number | null; text: string; standIn: boolean } | null;
    outcome: "pointed" | "dealt";
    why: string;
    widgetId?: string;
  } | null;
  /** Tentative answers for another card that didn't move the skeleton (no agreement yet). */
  held: { card: string; call: number; ms: number }[];
  /** Every card the skeleton showed, and what put it there. */
  skeletons: { card: string; by: "guess" | "decide" | "model"; ms: number }[];
  /** The decide's pick replaced (or supplied) the skeleton's card this many times. */
  decideMoves: number;
  /** The final call's route, why, and the exact facts sent. */
  route: AskRoute | null;
  /** The decided card overrode the final answer's card (the fill was asked again). */
  overrode: string | null;
  /** Every token in the final cards, what it became, every rule that fired. */
  notes: ResolveNote[];
  /** The room facts the tokens read (for the drawer's source rows). */
  facts: RoomFacts | null;
  fills: AskFill[];
  /** Field changes after a field first appeared, summed over the ask. */
  flicker: number;
  /** Words after a pause had ended the ask, and what happened to the card. */
  late: { text: string; ms: number; outcome: string; after?: number }[];
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

const STAGES = ["pause", "decided", "found", "skeleton", "tentative", "card-full", "first-field", "card-local", "committed", "card-on-screen", "cluster-local", "cluster-on-screen"] as const;
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
/** The ask pointed at a widget already on the board instead of dealing one. */
export type VoiceFound = {
  widgetId: string;
  x: number;
  y: number;
  host: HTMLElement;
  traceKey: number;
  card: string;
  title: string;
  /** Who made it, when known. */
  by: string | null;
  /** The obvious next step the slip offers (never done for you). */
  next: "spin" | null;
};
export type VoiceReceipt =
  | { ok: true; key: number; cards: string[]; model: string | null; ms: number | null; widgetId: string }
  | { ok: false; key: number };

const DOCK_ROOM = 20; // clear air between a landed card and the dock
const HANDOFF_MS = 520; // the ring's let-go (--dur-stage, plus a frame)
const LEAVE_MS = 240; // the slip's exit (--dur-base, plus a frame)
const FRAME_PAD = 12; // a frame's label, garland and dashes paint past its box
const STEADY_MS = 200; // no card named yet: words unchanged this long go out speculatively
const SPEC_MIN_WORDS = 4; // …and only from this many words
const SPEC_MAX_CALLS = 6; // speculative calls per ask (the final call is extra)
const SPEC_IN_FLIGHT = 2; // more words while this many are out: the newest waits for a slot
const RECEIPT_MS = 6000;
const DRAFT = "voice-draft-";
const LIFTED_Z = 99990; // a skeleton floating over the board until it has a spot

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now())));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Every required field of the card has a value from the model. */
function filledIn(card: CardId, settings: Record<string, unknown>) {
  const schema = (getCard(card)?.settings ?? {}) as Schema;
  return Object.entries(schema).every(([k, f]) => f.optional || f.default !== undefined || settings[k] !== undefined);
}

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
  /** Order fired in this ask: a newer call's answer beats an older one's. */
  seq: number;
  text: string;
  norm: string;
  spec: boolean;
  /** The answer as streamed so far. */
  streamed: string;
  /** The stream is whole (the row says done, or the call returned). */
  whole: boolean;
  /** A closed, valid card is in: enough to end on, go final and commit. */
  cardOk: boolean;
  answer: DealAnswer | null;
  /** performance.now() when its answer first put a model field on screen. */
  firstFieldAt: number | null;
  route: AskRoute;
  /** The facts its tokens resolve against (as they were when it went out). */
  facts: RoomFacts | null;
  /** The decided card it was told to deal. */
  hint: string | null;
  /** Resolves once a valid card has closed in the stream, or the call ended without one. */
  ready: Promise<void>;
  settle: () => void;
  promise: Promise<DealAnswer | null>;
};

/** A card kept for the board: the checked card, its widget, and (room tokens) who it's among / for. */
export type Kept = {
  card: DealtCard;
  widget: Widget;
  people?: string[];
  assignees?: string[];
  /** A recipe's part: its spot in the group, which write it goes in, its link. */
  part?: RecipePart;
  /** A recipe link, its source already written: the server links this card to it (convex/links.ts). */
  link?: { from: string; when: string; fill: string; value: string };
};

type Dec = {
  seq: number;
  text: string;
  norm: string;
  card: string | null;
  conf: number | null;
  back: boolean;
  /** The widget code matched when it went out (the yes/no was asked about it). */
  matchId: string | null;
  onBoard: BoardVerdict | null;
  done: Promise<void>;
};

/** A decide pick that names a deck card (not none/several) and is sure. */
const sure = (d: Dec | null) => !!d && d.back && d.conf !== null && d.conf >= DECIDE_BAR && !!d.card && !!getCard(d.card);

type Item =
  | { ok: true; card: DealtCard; raw: string; notes: ResolveNote[]; people?: string[]; assignees?: string[] }
  | { ok: false; reason: string; raw: string };

/** A call's answer as cards: the brain route's tokens resolved against the room, then checked. */
function itemsOf(sp: Spec, text: string, whole: boolean): { items: Item[]; none: boolean } {
  if (sp.route.route === "brain" && sp.facts) {
    const d = parseDealResolved(text, whole, sp.facts, sp.text);
    return {
      none: d.none,
      items: d.items.map((i): Item =>
        i.ok
          ? { ok: true, card: i.card, raw: i.raw, notes: i.resolved.notes, people: i.resolved.people, assignees: i.resolved.assignees }
          : { ok: false, reason: i.reason, raw: i.raw },
      ),
    };
  }
  const d = parseDeal(text, whole);
  return { none: d.none, items: d.items.map((i): Item => (i.ok ? { ok: true, card: i.card, raw: i.raw, notes: [] } : i)) };
}

/**
 * The card a fill for these words is told to deal: the decide's sure pick, on
 * the fast route only. The brain route is Ultra with the room's facts and
 * picks better than the facts-free decide (live, the hint turned "where
 * should we eat Saturday" into a question and "who's on dishes" into a
 * checklist), so it picks its own card.
 */
function hintFor(s: Session, f: RoomFacts | null, said: string): string | null {
  return sure(s.decided) && routeAsk(f, said).route === "fast" ? s.decided!.card : null;
}

/** The call to finish on for these words: the one told the decided card, else the newest. */
function pickFinal(s: Session, said: string, f: RoomFacts | null): Spec | undefined {
  const want = hintFor(s, f, said);
  const all = s.specs.filter((sp) => sp.norm === norm(said));
  return all.find((sp) => sp.hint === want) ?? all.at(-1);
}

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
  /** What the model has put in the card so far, and from which call. */
  tent: { card: CardId; settings: Record<string, unknown>; key: string } | null;
  shownSeq: number;
  /** The skeleton's spot, and whether it floats over the board until placed. */
  spot: Placement | null;
  lifted: boolean;
  specs: Spec[];
  inFlight: number;
  /** Words came while every slot was taken: send the newest when one frees. */
  queued: boolean;
  decides: Dec[];
  decInFlight: number;
  decQueued: boolean;
  /** The newest sure decide (by words), if any. */
  decided: Dec | null;
  /** Each card a tentative answer proposed, by which calls: two agreeing calls may move the skeleton. */
  proposals: Map<string, Set<number>>;
  /** The ask ended on a widget already on the board: nothing more is drawn. */
  pointed: boolean;
  /** Code matches the words so far to a widget already here: no new skeleton over the board until that's settled. */
  matching: string | null;
  steady: number;
  final: Spec | null;
  ended: boolean;
  /** Each pause that ends the ask is a round; a late word starts the next. */
  round: number;
  /** The first write, once it's gone out; a later round corrects it in place. */
  commitP: Promise<string[]> | null;
  committedCard: string | null;
  /** Reopened after the card was already written: no new draft, only a correction. */
  reopened: boolean;
  lastWordAt: number;
  marks: Partial<Record<StageName, number>>;
  trace: AskTrace;
};

export function useVoiceBuild({
  scrollerRef,
  deal,
  commit,
  amend,
  cardContext,
  selectedId,
  warm,
  onLanded,
  facts,
  decide,
  board,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  /** `onPartial` gets the answer so far, and `done` once the stream is whole. */
  deal: (call: DealCall, onPartial: (answer: string, done?: boolean) => void) => Promise<DealAnswer>;
  /** Write the kept cards (already placed); resolves to the synced widget ids, in order. */
  commit: (c: { dealId: string | null; nonce: string; cards: Kept[] }) => Promise<string[]>;
  /** A late word changed the card: rewrite the committed widget in place (live only). */
  amend?: (a: { widgetId: string; nonce: string; card: Kept }) => Promise<unknown>;
  /** The room brief's facts (live only): routes each call and resolves its tokens. */
  facts?: () => RoomFacts | null;
  /** The one-letter card pick (live only); `onBoard` also asks the "already on the board?" yes/no. */
  decide?: (said: string, opts: { onBoard: string | null }) => Promise<DecideAnswer>;
  /** The widgets on the board now, for the "already here" check. Without `decide` (mock), code's check alone answers, as a stand-in. */
  board?: () => BoardItem[];
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
  const [found, setFound] = useState<VoiceFound | null>(null);
  const [receipt, setReceipt] = useState<VoiceReceipt | null>(null);
  const [traces, setTraces] = useState<AskTrace[]>([]);
  /** The slip is on its way out (it leaves on glide, then unmounts). */
  const [leaving, setLeaving] = useState(false);
  const room = useRef({ deal, commit, amend, cardContext, selectedId, warm, onLanded, facts, decide, board });
  room.current = { deal, commit, amend, cardContext, selectedId, warm, onLanded, facts, decide, board };
  const session = useRef<Session | null>(null);
  const clearTimer = useRef(0);
  const shellTimer = useRef(0);
  const warmedAt = useRef(0);
  /** Send the newest words if they're worth a call and a slot is free (set below). */
  const maybeFire = useRef<(s: Session) => void>(() => {});
  const maybeDecide = useRef<(s: Session) => void>(() => {});

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

  /** Mark a stage at the next frame (when what was just set is on screen). */
  const markNext = useCallback(
    (s: Session, name: StageName) => {
      if (s.marks[name] !== undefined) return;
      s.marks[name] = -1;
      void nextFrame().then((t) => {
        delete s.marks[name];
        mark(s, name, t);
      });
    },
    [mark],
  );

  /** Put the skeleton (or the finished card) on the board as a local draft. */
  const show = useCallback(
    (s: Session, widgets: Widget[], at?: Placement[], state: "skeleton" | "card" = "skeleton", tentative = false) => {
      if (session.current !== s || !widgets.length) return;
      if (state === "skeleton" && s.matching) return;
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
      // The draft's look (shimmer while a skeleton, dimmed while tentative), set on WidgetCard's own element.
      requestAnimationFrame(() => {
        const look = s.lifted && !at ? "lifted" : state;
        for (const el of s.m?.canvas.querySelectorAll<HTMLElement>(`[data-widget-id^="${DRAFT}${s.key}-"]`) ?? []) {
          el.dataset.voiceDraft = look;
          if (tentative) el.dataset.voiceTentative = "";
          else delete el.dataset.voiceTentative;
        }
      });
      markNext(s, "skeleton");
      setShell((sh) =>
        sh && sh.draftId === `${DRAFT}${s.key}-0` && sh.phase === "dealing"
          ? sh
          : { host: s.m!.canvas, draftId: `${DRAFT}${s.key}-0`, box: { ...spots[0], w: first.w, h: first.h }, said: s.text, phase: "dealing" },
      );
    },
    [markNext, scrollerRef],
  );

  const ctxNow = useCallback(() => room.current.cardContext(), []);
  /** A check-in's skeleton draws the room's people (the brief's cast), not whoever is on the page. */
  const skelCtx = useCallback((card: CardId) => {
    const c = room.current.cardContext();
    const people = card === "checkin" ? room.current.facts?.()?.people : undefined;
    return people?.length ? { ...c, people } : c;
  }, []);

  /** The words' guess, as a skeleton (only while no model answer is filling it). */
  const showGuess = useCallback(
    (s: Session) => {
      // Once the model has written into the skeleton, only the model changes it.
      if (s.fromModel || s.reopened || s.pointed || s.matching) return;
      // A sure decide fills in when the words named nothing. It beats the
      // words' guess on the fast route only, where it also tells the fill;
      // the brain picks its own card, so moving the skeleton there is a flip.
      const brain = routeAsk(room.current.facts?.() ?? null, s.text).route === "brain";
      const dec = sure(s.decided) && (!s.shown || !brain || s.shown === s.decided!.card) ? (s.decided!.card as CardId) : null;
      const card = dec ?? s.guess;
      if (!card) return;
      if (card !== s.shown) {
        s.trace.skeletons.push({ card, by: dec ? "decide" : "guess", ms: Math.round(performance.now() - s.t0) });
        if (dec) s.trace.decideMoves++;
      }
      s.shown = card;
      const { widget } = skeletonWidget(card, { id: `${DRAFT}${s.key}-0`, ctx: skelCtx(card), said: s.text });
      show(s, [widget]);
    },
    [show, skelCtx],
  );

  /** Note what a fill changed (fields that already had a model value count as flicker). */
  const note = useCallback((s: Session, sp: Spec, card: CardId, settings: Record<string, unknown>, whole: boolean, final: boolean) => {
    const prev = s.tent;
    const changed = !prev
      ? []
      : prev.card !== card
        ? ["card"]
        : [...new Set([...Object.keys(prev.settings), ...Object.keys(settings)])].filter(
            (k) => prev.settings[k] !== undefined && !same(prev.settings[k], settings[k]),
          );
    s.trace.flicker += changed.length;
    s.trace.fills.push({ ms: Math.round(performance.now() - s.t0), call: sp.seq, words: sp.text, changed, whole, final });
    s.tent = { card, settings, key: card + JSON.stringify(settings) };
    s.shownSeq = sp.seq;
  }, []);

  /** A call's answer so far → the card, tentatively (while talking, or the final call's fields before its card closes). */
  const fill = useCallback(
    (s: Session, sp: Spec) => {
      if (session.current !== s || s.reopened || s.pointed || s.matching) return;
      if (s.ended ? s.final !== sp : sp.seq < s.shownSeq) return;
      let card: CardId;
      let settings: Record<string, unknown>;
      let whole = false;
      const first = itemsOf(sp, sp.streamed, sp.whole).items.find((i) => i.ok);
      if (first?.ok) {
        // After the end, the final card is drawn by `ask` (placed, then committed).
        if (s.ended) return;
        const lead = isRecipe(first.card.card) ? recipeLead(first.card.card, first.card.settings as Record<string, unknown>) : null;
        card = (lead?.card ?? first.card.card) as CardId;
        settings = lead?.settings ?? (first.card.settings as Record<string, unknown>);
        whole = !lead;
      } else {
        const p = parsePartialCard(sp.streamed);
        if (!p || !(getCard(p.card) || isRecipe(p.card))) return;
        if (isRecipe(p.card)) Object.assign(p, recipeLead(p.card, p.settings));
        card = p.card as CardId;
        // Only closed fields show: the last key may be a list still being written.
        settings = { ...p.settings };
        const last = Object.keys(settings).at(-1);
        if (last && typeof settings[last] === "object") delete settings[last];
        // Tokens resolve on the tentative card too; anything left reads "…", never "@coming".
        if (sp.route.route === "brain" && sp.facts) settings = scrubTokens(resolveCard({ card, settings }, sp.facts, sp.text).settings);
        // A newer call's first fields go over the card already shown, not over blanks.
        if (s.tent?.card === card) settings = { ...s.tent.settings, ...settings };
      }
      if (s.tent && s.tent.key === card + JSON.stringify(settings)) {
        s.shownSeq = Math.max(s.shownSeq, sp.seq);
        return;
      }
      // Another card than the skeleton shows: only when a second call agrees, or the sure decide does.
      const by = s.proposals.get(card) ?? new Set<number>();
      by.add(sp.seq);
      s.proposals.set(card, by);
      if (s.shown && card !== s.shown && by.size < 2 && !(sure(s.decided) && s.decided!.card === card)) {
        if (!s.trace.held.some((h) => h.call === sp.seq && h.card === card))
          s.trace.held.push({ card, call: sp.seq, ms: Math.round(performance.now() - s.t0) });
        return;
      }
      const hasField = Object.keys(settings).length > 0;
      note(s, sp, card, settings, whole, false);
      if (card !== s.shown) s.trace.skeletons.push({ card, by: "model", ms: Math.round(performance.now() - s.t0) });
      s.shown = card;
      s.fromModel = true;
      const { widget } = skeletonWidget(card, { id: `${DRAFT}${s.key}-0`, ctx: skelCtx(card), said: s.text, partial: settings });
      show(s, [widget], undefined, "skeleton", hasField);
      if (hasField) {
        markNext(s, "tentative");
        if (!sp.firstFieldAt) {
          sp.firstFieldAt = -1;
          void nextFrame().then((t) => (sp.firstFieldAt = t));
        }
      }
      if (filledIn(card, settings)) markNext(s, "card-full");
    },
    [markNext, note, show, skelCtx],
  );

  /** The stream moved (or the call returned): keep the newest text, settle `ready`, fill. */
  const stream = useCallback(
    (s: Session, sp: Spec, text: string, done: boolean) => {
      if (session.current !== s) return;
      // A watch update can arrive after the returned answer: never step back.
      if (text.length >= sp.streamed.length) sp.streamed = text;
      if (done) sp.whole = true;
      if (!sp.cardOk && itemsOf(sp, sp.streamed, sp.whole).items.some((i) => i.ok)) sp.cardOk = true;
      if (sp.cardOk || sp.whole) sp.settle();
      fill(s, sp);
    },
    [fill],
  );

  const fire = useCallback(
    (s: Session, text: string, spec: boolean): Spec => {
      const facts = room.current.facts?.() ?? null;
      const route = routeAsk(facts, text);
      const hint = hintFor(s, facts, text);
      let settle = () => {};
      const ready = new Promise<void>((r) => (settle = r));
      const sp: Spec = {
        nonce: `${s.key.toString(36)}-${s.specs.length}-${Math.random().toString(36).slice(2, 7)}`,
        seq: s.specs.length,
        text,
        norm: norm(text),
        spec,
        route,
        facts,
        hint,
        streamed: "",
        whole: false,
        cardOk: false,
        answer: null,
        firstFieldAt: null,
        ready,
        settle,
        promise: Promise.resolve(null),
      };
      s.specs.push(sp);
      s.trace.calls.push({ text, ms: Math.round(performance.now() - s.t0), spec, used: false, route: route.route, card: hint });
      // A speculative call holds a slot until its card is in (or it ends).
      let held = spec;
      const release = () => {
        if (!held) return;
        held = false;
        s.inFlight--;
        if (s.queued) {
          s.queued = false;
          maybeFire.current(s);
        }
      };
      if (spec) {
        s.inFlight++;
        performance.mark("voice:phrase");
      }
      void ready.then(release);
      sp.promise = room.current
        .deal(
          {
            said: text,
            nonce: sp.nonce,
            spec,
            ...(route.route === "brain" && route.menu ? { route: "brain" as const, menu: route.menu } : {}),
            ...(hint ? { card: hint } : {}),
          },
          (a, done) => stream(s, sp, a, done === true),
        )
        .then(
          (answer) => {
            sp.answer = answer;
            const call = s.trace.calls[sp.seq];
            if (call && answer.usage) call.usage = { model: answer.model ?? "?", ...answer.usage };
            stream(s, sp, answer.answer, true);
            return answer;
          },
          () => null,
        )
        .finally(() => {
          sp.whole = true;
          sp.settle();
        });
      return sp;
    },
    [stream],
  );

  maybeFire.current = (s: Session) => {
    const text = s.text;
    if (session.current !== s || s.ended || !text || sentenceHangs(text)) return;
    const n = text.split(/\s+/).length;
    if (!(guessCard(text) || sure(s.decided) ? n >= 2 : n >= SPEC_MIN_WORDS)) return;
    const hint = hintFor(s, room.current.facts?.() ?? null, text);
    if (s.specs.some((sp) => sp.norm === norm(text) && sp.hint === hint)) return;
    if (s.specs.filter((sp) => sp.spec).length >= SPEC_MAX_CALLS) return;
    if (s.inFlight >= SPEC_IN_FLIGHT) {
      s.queued = true;
      return;
    }
    fire(s, text, true);
  };

  /** One decide call for these words (the yes/no too when code matched a widget). */
  const sendDecide = (s: Session, text: string, ask: NonNullable<typeof decide>): Dec => {
    const match = existingFor(text, room.current.board?.() ?? []);
    let done = () => {};
    const d: Dec = {
      seq: s.decides.length,
      text,
      norm: norm(text),
      card: null,
      conf: null,
      back: false,
      matchId: match.ok ? match.item.id : null,
      onBoard: null,
      done: new Promise<void>((r) => (done = r)),
    };
    s.decides.push(d);
    s.decInFlight++;
    const row: AskTrace["decides"][number] = {
      text,
      ms: Math.round(performance.now() - s.t0),
      back: null,
      card: null,
      conf: null,
      top: [],
      error: null,
      usage: null,
      match: match.ok ? `${match.item.card} "${match.item.title}"` : null,
    };
    s.trace.decides.push(row);
    void ask(text, { onBoard: match.ok ? `${match.item.card} "${match.item.title}"` : null })
      .then(
        (a) => {
          Object.assign(row, { back: Math.round(performance.now() - s.t0), card: a.card, conf: a.conf, top: a.top, error: a.error, usage: a.usage, onBoard: a.onBoard ?? null });
          Object.assign(d, { back: true, card: a.card, conf: a.conf, onBoard: a.onBoard ?? null });
          if (session.current !== s || !sure(d) || (s.decided && s.decided.seq > d.seq)) return;
          s.decided = d;
          mark(s, "decided");
          if (s.ended) return;
          // The skeleton follows it now; a model fill of another card is asked again with it.
          if (!s.fromModel) showGuess(s);
          if (!s.tent || s.tent.card !== d.card) maybeFire.current(s);
        },
        (e) => {
          row.error = String(e).slice(0, 160);
        },
      )
      .finally(() => {
        d.back = true;
        done();
        s.decInFlight--;
        if (s.decQueued) {
          s.decQueued = false;
          maybeDecide.current(s);
        }
        if (session.current === s) publish(s);
      });
    return d;
  };

  /** Ask the decide pass about the newest words (no settle; two out at most, the newest waits). */
  maybeDecide.current = (s: Session) => {
    const ask = room.current.decide;
    const text = s.text;
    if (!ask || session.current !== s || s.ended || !text || sentenceHangs(text)) return;
    if (text.split(/\s+/).length < 2) return;
    const n = norm(text);
    if (s.decides.some((d) => d.norm === n) || s.decides.length >= DECIDE_MAX) return;
    if (s.decInFlight >= DECIDE_IN_FLIGHT) {
      s.decQueued = true;
      return;
    }
    sendDecide(s, text, ask);
  };

  /**
   * Is the ask already on the board? Code's match for the final words, then
   * the model's yes/no about exactly those words (the decide already out for
   * them, or one sent now). Mock has no model: code's match alone, said so.
   */
  const verdictFor = async (s: Session, said: string, check: ExistingCheck & { ok: true }): Promise<NonNullable<AskTrace["found"]>["verdict"]> => {
    const ask = room.current.decide;
    if (!ask) return { yes: true, conf: null, text: said, standIn: true };
    const n = norm(said);
    const d = s.decides.find((x) => x.norm === n && x.matchId === check.item.id) ?? sendDecide(s, said, ask);
    // The decide is ~0.6 s; past 2 s the card is dealt as before.
    await Promise.race([d.done, new Promise((r) => setTimeout(r, 2000))]);
    return d.onBoard && !d.onBoard.error ? { yes: d.onBoard.yes, conf: d.onBoard.conf, text: d.text, standIn: false } : null;
  };

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
      tent: null,
      shownSeq: -1,
      spot: null,
      lifted: false,
      specs: [],
      inFlight: 0,
      queued: false,
      decides: [],
      decInFlight: 0,
      decQueued: false,
      decided: null,
      proposals: new Map(),
      pointed: false,
      matching: null,
      steady: 0,
      final: null,
      ended: false,
      round: 0,
      commitP: null,
      committedCard: null,
      reopened: false,
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
        decides: [],
        skeletons: [],
        decideMoves: 0,
        found: null,
        held: [],
        route: null,
        overrode: null,
        notes: [],
        facts: null,
        fills: [],
        flicker: 0,
        late: [],
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
    setFound(null);
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
      if (!s) return;
      if (s.ended) {
        // A late word reopened the ask (lib/voice.ts). Once a card is written,
        // it's corrected in place at the next pause, not drawn again.
        s.ended = false;
        s.reopened = s.commitP !== null;
        // It pointed at a widget already here: the longer words are asked afresh.
        if (s.pointed) {
          s.pointed = false;
          s.trace.done = false;
          setFound(null);
        }
        s.round++; // the round that pause started is over, written or not

      }
      s.text = text;
      s.trace.words.push({ text, ms: Math.round(performance.now() - s.t0) });
      const guess = guessCard(text);
      if (guess && guess !== s.guess) {
        s.guess = guess;
        s.trace.guesses.push({ card: guess, ms: Math.round(performance.now() - s.t0) });
      }
      // Words that match a widget already here: take the new skeleton down until the pause settles it.
      const match = existingFor(text, room.current.board?.() ?? []);
      const matching = match.ok ? match.item.id : null;
      if (matching !== s.matching) {
        s.matching = matching;
        if (matching && !s.commitP) {
          s.shown = null;
          s.fromModel = false;
          s.tent = null;
          setDrafts([]);
          setShell(null);
        }
      }
      showGuess(s);
      maybeDecide.current(s);
      // Words that name a card go out at once; others once they've held for a beat.
      window.clearTimeout(s.steady);
      if (guess || sure(s.decided)) maybeFire.current(s);
      else
        s.steady = window.setTimeout(() => {
          if (session.current === s && s.text === text) maybeFire.current(s);
        }, STEADY_MS);
    },
    [showGuess],
  );

  /** These exact words already made a whole card: the pause can be shorter (lib/voice.ts). */
  const ready = useCallback((text: string) => {
    const s = session.current;
    if (!s || s.reopened) return false;
    return !!pickFinal(s, text, room.current.facts?.() ?? null)?.cardOk;
  }, []);

  const leave = useCallback(() => {
    clearTimer.current = window.setTimeout(() => {
      setLeaving(true);
      clearTimer.current = window.setTimeout(() => {
        setReceipt(null);
        setLanded(null);
        setFound(null);
        setLeaving(false);
      }, LEAVE_MS);
    }, RECEIPT_MS);
  }, []);

  /** The ask is a widget already on the board: glide to it, nothing is written. False when it isn't drawn here. */
  const pointAt = useCallback(
    (s: Session, item: BoardItem): boolean => {
      const m = measure(scrollerRef.current) ?? s.m;
      const r = m?.board.find((b) => b.id === item.id);
      if (!m || !r) {
        if (s.trace.found) s.trace.found.why += "; but it isn't drawn on this screen: dealt";
        return false;
      }
      s.pointed = true;
      s.trace.found!.outcome = "pointed";
      s.trace.found!.widgetId = item.id;
      s.trace.done = true;
      s.trace.ok = true;
      setDrafts([]);
      setShell(null);
      // The camera goes to it: centred in the view (as far as the room scrolls).
      const dx = r.x + r.w / 2 - (m.view.x + m.view.w / 2);
      const dy = r.y + r.h / 2 - (m.view.y + m.view.h / 2);
      glideScroll(m.scroller, Math.round(dx * m.scale), Math.round(dy * m.scale));
      setFound({
        widgetId: item.id,
        x: r.x,
        y: r.y,
        host: m.canvas,
        traceKey: s.key,
        card: item.card,
        title: item.title,
        by: item.by,
        next: item.card === "wheel" ? "spin" : null,
      });
      markNext(s, "found");
      void nextFrame().then(() => publish(s));
      leave();
      return true;
    },
    [leave, markNext, publish, scrollerRef],
  );

  /** The model's details for the trace, once the call has returned. */
  const traceAnswer = useCallback((s: Session, answer: DealAnswer | null) => {
    s.trace.model = answer?.model ?? null;
    s.trace.context = answer?.context ?? null;
    s.trace.answer = answer?.answer ?? null;
    s.trace.error = answer?.error ?? null;
    s.trace.dealId = answer?.dealId ?? null;
    s.trace.modelMs = answer?.modelMs ?? null;
  }, []);

  /**
   * A recipe's cards: placed as one group (the frame's footprint, by
   * `placeCards`; each part at its spot inside it), then written one batch at
   * a time in the recipe's order, each batch drawn on this screen as it goes
   * out, so the group builds card by card here and lands the same way on
   * every other screen. A standings card is written after its check-in and
   * points at that check-in's id.
   */
  const buildRecipe = useCallback(
    async (s: Session, sp: Spec, kept: Kept[], cards: AskTrace["cards"]) => {
      const fail = (reason: string) => {
        if (session.current !== s) return;
        s.trace.error = s.trace.error ?? reason;
        setShell(null);
        setDrafts([]);
        setReceipt({ ok: false, key: s.key });
        s.trace.done = true;
        s.trace.ok = false;
        publish(s);
        leave();
      };
      s.trace.cards = cards;
      s.shown = "checkin";
      const m = measure(scrollerRef.current) ?? s.m;
      if (!m) return fail("no canvas");
      // the group is placed by its frame (the first part), the rest sit inside it
      const size = { ...kept[0].part!.size };
      const placeRoom = { widgets: m.board, view: m.view, bounds: m.bounds, selected: room.current.selectedId?.() ?? null };
      const [spot] = placeCards([size], placeRoom);
      s.trace.place = `recipe group ${size.w}×${size.h}: ${placeReason([size], [spot], placeRoom)}`;
      const placed = kept.map((k) => ({ ...k, widget: { ...k.widget, x: spot.x + k.part!.at.x, y: spot.y + k.part!.at.y } }));
      // on this screen, before anything is written, a linked part already points at its source's draft
      for (const k of placed) {
        const l = k.part!.link;
        const from = l?.value === "id" ? placed.find((x) => x.part!.key === l.from) : undefined;
        if (l && from) k.widget = { ...k.widget, data: { ...k.widget.data, [l.fill]: from.widget.id } };
      }
      const group = { ...spot, ...size };
      if (!inView(group, m.view)) {
        const pan = panFor(group, m.view);
        glideScroll(m.scroller, pan.dx * m.scale, pan.dy * m.scale);
      }
      setShell(null);
      s.lifted = false;
      const batches = [...new Set(placed.map((k) => k.part!.batch))].sort((a, b) => a - b);
      const ids: string[] = [];
      // part key → its written id, for the links
      const written = new Map<string, string>();
      let resolveAll: (v: string[]) => void = () => {};
      s.commitP = new Promise<string[]>((r) => (resolveAll = r));
      s.committedCard = JSON.stringify(kept.map((k) => k.card));
      /* The writes go out back to back, in the recipe's order (a client's
         mutations run in the order sent), so every screen gets them one at a
         time. Only a linked part waits: it goes once its source has an id.
         This screen draws each batch as its write comes back. */
      const onScreen = (id: string | undefined) => !!id && !!m.canvas.querySelector(`[data-widget-id="${id}"], [data-frame-id="${id}"]`);
      let failed = false;
      const pending: Promise<void>[] = [];
      setDrafts(placed.filter((k) => k.part!.batch === batches[0]).map((k) => k.widget));
      markNext(s, "card-local");
      markNext(s, "cluster-local");
      playSound("place");
      for (const [bi, b] of batches.entries()) {
        if (session.current !== s || failed) return;
        const idx = placed.flatMap((k, i) => (k.part!.batch === b ? [i] : []));
        if (idx.some((i) => placed[i].part!.link && !written.has(placed[i].part!.link!.from))) await Promise.all(pending);
        if (session.current !== s || failed) return;
        const cardsOut = idx.map((i) => {
          const l = placed[i].part!.link;
          const from = l ? written.get(l.from) : undefined;
          return { ...placed[i], ...(l && from ? { link: { from, when: l.when, fill: l.fill, value: l.value } } : {}) };
        });
        pending.push(
          room.current
            .commit({ dealId: sp.answer?.dealId ?? null, nonce: sp.nonce, cards: cardsOut })
            .catch(() => [] as string[])
            .then((got) => {
              if (session.current !== s) return;
              if (!got.length) {
                failed = true;
                return;
              }
              idx.forEach((i, k) => {
                ids[i] = got[k];
                written.set(placed[i].part!.key, got[k]);
              });
              if (bi === 0) mark(s, "committed");
              setDrafts((d) => {
                const have = new Set(d.map((w) => w.id));
                return [...d, ...placed.filter((k, i) => k.part!.batch <= b && !have.has(k.widget.id) && i >= 0).map((k) => k.widget)];
              });
              setSynced((all) => ({ ...all, ...Object.fromEntries(idx.map((i, k) => [`${DRAFT}${s.key}-${i}`, got[k]])) }));
              if (bi > 0) playSound("tap");
            }),
        );
      }
      // first card of the group on screen (synced), then the whole group, watched while the writes land
      const watch = (async () => {
        for (let i = 0; i < 400 && !onScreen(ids[0]); i++) await new Promise((r) => setTimeout(r, 8));
        if (onScreen(ids[0])) mark(s, "card-on-screen");
        for (let i = 0; i < 600 && !(ids.length === placed.length && placed.every((_, k) => onScreen(ids[k]))); i++) await new Promise((r) => setTimeout(r, 8));
        if (placed.every((_, k) => onScreen(ids[k]))) mark(s, "cluster-on-screen");
      })();
      await Promise.all(pending);
      resolveAll(ids);
      if (failed || session.current !== s) return fail("the commit wrote nothing");
      s.trace.cards.filter((c) => c.ok).forEach((c, i) => (c.widgetId = ids[i]));
      await watch;
      const lead = placed.findIndex((k) => k.card.card === "checkin");
      setLanded({ widgetId: ids[0], x: spot.x, y: spot.y, host: m.canvas, traceKey: s.key });
      window.setTimeout(() => {
        if (session.current === s) setDrafts([]);
      }, 50);
      const answer = await sp.promise;
      if (session.current !== s) return;
      traceAnswer(s, answer);
      s.trace.done = true;
      s.trace.ok = true;
      publish(s);
      const local = s.marks["card-local"];
      const t = s.marks["cluster-on-screen"] ?? s.marks["card-on-screen"];
      setReceipt({
        ok: true,
        key: s.key,
        cards: kept.map((k) => k.card.card),
        model: answer?.model ?? null,
        ms: answer?.model && local !== undefined ? Math.round(local - s.lastWordAt) : null,
        widgetId: ids[Math.max(0, lead)],
      });
      if (answer?.dealId && t !== undefined) room.current.onLanded?.(answer.dealId, t - s.lastWordAt, s.trace);
      leave();
    },
    [leave, mark, markNext, publish, scrollerRef, traceAnswer],
  );

  const ask = useCallback(
    async (said: string, end: VoiceEnd) => {
      const s = session.current;
      if (!s) return;
      const round = ++s.round;
      s.ended = true;
      s.text = said;
      s.lastWordAt = end.lastWordAt || end.endedAt;
      window.clearTimeout(s.steady);
      performance.mark("voice:end-of-speech");
      if (end.how === "pause") s.marks.pause = end.endedAt;
      s.trace.said = said;
      s.trace.how = end.how;
      const late: AskTrace["late"][number] | null = round > 1 ? { text: said, ms: Math.round(performance.now() - s.t0), outcome: "…" } : null;
      if (late) s.trace.late.push(late);
      let sp = pickFinal(s, said, room.current.facts?.() ?? null) ?? fire(s, said, false);
      s.final = sp;
      s.trace.calls.forEach((c, i) => (c.used = i === sp.seq));
      s.trace.route = sp.route;
      s.trace.facts = sp.facts;
      // Already on the board? Code's match first; the model is asked only about that widget.
      const check = s.reopened || s.commitP ? null : existingFor(said, room.current.board?.() ?? []);
      const verdict = check?.ok ? verdictFor(s, said, check) : null;
      // Words that named no card yet: hold a card-sized ring open in view.
      if (!s.shown && !s.reopened && !sp.cardOk && !check?.ok) {
        s.m = measure(scrollerRef.current) ?? s.m;
        if (s.m) {
          const size = { w: 300, h: 240 };
          const [spot] = placeCards([size], { widgets: s.m.board, view: s.m.view, bounds: s.m.bounds });
          setShell({ host: s.m.canvas, draftId: null, box: { ...spot, ...size }, said, phase: "dealing" });
          s.spot = inView({ ...spot, ...size }, s.m.view) ? spot : null;
          void nextFrame().then((t) => mark(s, "skeleton", t));
        }
      }
      // The final call's fields so far (it may have streamed some before the end).
      fill(s, sp);
      publish(s);

      const stale = () => session.current !== s || s.round !== round;
      const fail = (reason?: string) => {
        if (stale()) return;
        if (reason) s.trace.error = s.trace.error ?? reason;
        if (s.commitP) {
          // The card from before the late word stays as it was.
          if (late) late.outcome = `kept the card as it was (${reason ?? "no answer"})`;
          publish(s);
          return;
        }
        setShell(null);
        setDrafts([]);
        setReceipt({ ok: false, key: s.key });
        s.trace.done = true;
        s.trace.ok = false;
        publish(s);
        leave();
      };

      if (check) {
        const v = verdict ? await verdict : null;
        if (stale()) return;
        const sureYes = !!v?.yes && (v.standIn || (v.conf ?? 0) >= DECIDE_BAR);
        s.trace.found = {
          check,
          verdict: v,
          outcome: "dealt",
          why: !check.ok
            ? check.why
            : !v
              ? "the yes/no didn't come back in time: dealt"
              : sureYes
                ? v.standIn
                  ? "stand-in: code's match alone (mock, no model)"
                  : `the model says it's on the board (${v.conf?.toFixed(2)}) and code's match stands`
                : v.yes
                  ? `the model says yes but only ${v.conf?.toFixed(2)} (below ${DECIDE_BAR}): dealt`
                  : `the model says it's not there (${v.conf?.toFixed(2)}): dealt`,
        };
        if (check.ok && sureYes && pointAt(s, check.item)) return;
        // Not pointed: the card is dealt as before, its skeleton allowed again.
        if (s.matching) {
          s.matching = null;
          fill(s, sp);
        }
        publish(s);
      }

      await sp.ready;
      if (stale()) return;
      // Ultra wins over Lightning: the decide was sure of another card than the fast fill dealt, so it's asked again with it.
      const want = hintFor(s, sp.facts, said);
      const firstCard = itemsOf(sp, sp.streamed, sp.whole).items.find((i) => i.ok);
      if (want && firstCard?.ok && firstCard.card.card !== want && sp.hint !== want && !s.commitP) {
        s.trace.overrode = `${firstCard.card.card} → ${want}`;
        sp = fire(s, said, false);
        s.final = sp;
        s.trace.calls.forEach((c, i) => (c.used = i === sp.seq));
        s.trace.route = sp.route;
        publish(s);
        await sp.ready;
        if (stale()) return;
      }
      // Its first card is in (the rest of the answer may still be streaming).
      const ctx = ctxNow();
      const final = sp;
      const keep = (text: string, whole: boolean) => {
        const kept: Kept[] = [];
        const cards: AskTrace["cards"] = [];
        const notes: ResolveNote[] = [];
        for (const item of itemsOf(final, text, whole).items) {
          if (!item.ok) {
            cards.push({ card: /"card"\s*:\s*"([^"]+)"/.exec(item.raw)?.[1] ?? "?", ok: false, reason: item.reason });
            continue;
          }
          notes.push(...item.notes);
          const people = item.people?.length ? item.people : undefined;
          if (isRecipe(item.card.card)) {
            // Code lays out and links the recipe's cards; the model only gave the slots.
            // "me" is the speaker
            const who = people?.map((p) => (p === "@me" ? ctx.by : p)).filter((p, i, all) => all.indexOf(p) === i);
            const c = who ? { ...ctx, people: who } : ctx;
            for (const part of expandRecipe(item.card.card, item.card.settings as Record<string, unknown>, c)) {
              const raw = { card: part.card, settings: part.settings };
              const r = applyCard(raw, c, { id: `${DRAFT}${s.key}-${kept.length}`, z: part.z });
              if (r.ok) kept.push({ card: raw as DealtCard, widget: { ...r.widget, w: part.size.w, h: part.size.h, ...(part.rotate !== undefined ? { rotate: part.rotate } : {}) }, people: c.people, part });
              cards.push(r.ok ? { card: part.card, ok: true } : { card: part.card, ok: false, reason: r.reason });
            }
            continue;
          }
          const r = applyCard(item.card, people ? { ...ctx, people } : ctx, {
            id: `${DRAFT}${s.key}-${kept.length}`,
            z: 1000 + kept.length,
            assignees: item.assignees,
          });
          if (r.ok) kept.push({ card: item.card, widget: r.widget, people, assignees: item.assignees });
          cards.push(r.ok ? { card: item.card.card, ok: true } : { card: item.card.card, ok: false, reason: r.reason });
        }
        return { kept, cards, notes };
      };
      const got = keep(sp.streamed, sp.whole);
      s.trace.notes = got.notes;
      let kept = got.kept;
      if (!kept.length) {
        traceAnswer(s, sp.answer);
        s.trace.cards = got.cards;
        return fail(itemsOf(sp, sp.streamed, true).none ? "the model said no card fits" : sp.answer ? "no valid card in the answer" : "the deal call failed");
      }

      if (s.commitP) {
        // A late word, after the card was written: correct it in place.
        const ids = await s.commitP;
        if (stale() || !late) return;
        const json = JSON.stringify(kept[0].card);
        if (!ids.length) late.outcome = "nothing was written to correct";
        else if (json === s.committedCard) late.outcome = "same card: nothing to change";
        else if (!room.current.amend) late.outcome = "stand-in: not corrected";
        else {
          await room.current.amend({ widgetId: ids[0], nonce: sp.nonce, card: kept[0] }).catch(() => {});
          s.committedCard = json;
          late.outcome = `corrected in place → ${kept[0].card.card}`;
          late.after = Math.round(performance.now() - s.lastWordAt);
        }
        void sp.promise.then((a) => {
          if (!stale()) traceAnswer(s, a);
          publish(s);
        });
        publish(s);
        return;
      }

      // A recipe: its own path (one group, written part by part).
      if (kept[0].part) return buildRecipe(s, sp, kept, got.cards);

      // Final: the answer for exactly these words, on this screen.
      const firstCardId = kept[0].card.card as CardId;
      if (firstCardId !== s.shown) s.trace.skeletons.push({ card: firstCardId, by: "model", ms: Math.round(performance.now() - s.t0) });
      s.shown = firstCardId;
      note(s, sp, firstCardId, kept[0].card.settings as Record<string, unknown>, true, true);
      s.trace.cards = got.cards;
      s.trace.guessAgreed = s.guess ? kept[0].card.card === s.guess : null;
      const m = measure(scrollerRef.current) ?? s.m;
      if (!m) return fail("no canvas");
      // Where it goes: code, from the board as drawn, as close to the skeleton as fits.
      const sizes = kept.map((k) => footprint(k.widget));
      const placeRoom = { widgets: m.board, view: m.view, bounds: m.bounds, selected: room.current.selectedId?.() ?? null, anchor: s.spot ?? undefined };
      const spots = placeCards(sizes, placeRoom);
      s.trace.place = placeReason(sizes, spots, placeRoom);
      const placed = kept.map((k, i) => ({ ...k, widget: { ...k.widget, ...spots[i] } }));
      // The write goes out now, with the final spot; the screen catches up in the same tick.
      s.commitP = room.current.commit({ dealId: sp.answer?.dealId ?? null, nonce: sp.nonce, cards: placed }).catch(() => [] as string[]);
      s.committedCard = JSON.stringify(kept[0].card);
      s.lifted = false;
      show(
        s,
        placed.map((p) => p.widget),
        spots,
        "card",
      );
      if (sp.firstFieldAt && sp.firstFieldAt > 0) mark(s, "first-field", sp.firstFieldAt);
      markNext(s, "first-field");
      markNext(s, "card-local");
      playSound("place"); // the card the agent built lands like anything else placed on the board
      markNext(s, "card-full");
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
      publish(s);

      const ids = await s.commitP;
      if (session.current !== s) return;
      if (!ids.length) {
        s.commitP = null;
        return fail("the commit wrote nothing");
      }
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
      const t = s.marks["card-on-screen"];
      // Drafts that were replaced are dropped once the synced cards are in.
      if (t !== undefined)
        window.setTimeout(() => {
          if (session.current === s) setDrafts([]);
        }, 50);

      // The rest of the answer: the model's details, and any card after the first ones.
      const answer = await sp.promise;
      if (session.current !== s) return;
      traceAnswer(s, answer);
      if (answer && !stale()) {
        const more = keep(answer.answer, true);
        const extra = more.kept.slice(kept.length);
        if (extra.length) {
          s.trace.cards = more.cards;
          s.trace.notes = more.notes;
          const m2 = measure(scrollerRef.current) ?? m;
          const sizes2 = extra.map((k) => footprint(k.widget));
          const spots2 = placeCards(sizes2, { widgets: m2.board, view: m2.view, bounds: m2.bounds, anchor: spots[0] });
          const ids2 = await room.current
            .commit({ dealId: answer.dealId, nonce: sp.nonce, cards: extra.map((k, i) => ({ ...k, widget: { ...k.widget, ...spots2[i] } })) })
            .catch(() => [] as string[]);
          s.trace.cards.filter((c) => c.ok).forEach((c, i) => (c.widgetId = [...ids, ...ids2][i]));
          kept = more.kept;
        }
      }
      s.trace.done = true;
      s.trace.ok = true;
      publish(s);
      const local = s.marks["card-local"];
      setReceipt({
        ok: true,
        key: s.key,
        cards: kept.map((k) => k.card.card),
        model: answer?.model ?? null,
        ms: answer?.model && local !== undefined ? Math.round(local - s.lastWordAt) : null,
        widgetId: ids[0],
      });
      if (answer?.dealId && t !== undefined) room.current.onLanded?.(answer.dealId, t - s.lastWordAt, s.trace);
      leave();
    },
    [buildRecipe, ctxNow, fill, fire, leave, mark, markNext, note, pointAt, publish, scrollerRef, show, traceAnswer],
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

  const voice: VoiceHooks = { start, words, ask, ready };
  return { voice, withDrafts, drafts, shell, landed, found, receipt, leaving, traces };
}
