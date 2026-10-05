import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { CATALOG, cardSize, footprint, placeCards, type Placement, type Rect } from "../lib/deck";

/**
 * Say it → it builds, the room's half (the model's half is convex/voiceBuild.ts).
 * When speech ends: measure the board as drawn, put a shell where the card
 * will land, bring it into view, hand the words to `deal`, and watch the
 * canvas for the first new card. The shell hands off to that card (it takes
 * the card's real box and lets go), then a slip on the card says who and what
 * did it. The receipt's ms is end of speech → that card on this screen,
 * measured here, never estimated. Live and mock rooms share this; only `deal`
 * differs.
 */

export type DealRequest = {
  said: string;
  board: Array<Rect & { id: string }>;
  view: Rect;
  bounds: Rect;
  /** The shell's spot: the first card lands as close to it as fits. */
  anchor: Placement;
};

export type DealOutcome = {
  ok: boolean;
  cards: { card: string; widgetId: string }[];
  /** The model's short name; null for the mock stand-in (no model, no ms). */
  model: string | null;
  dealId?: string | null;
};

export type VoiceShell = Rect & {
  said: string;
  host: HTMLElement;
  /** performance.now() at end of speech: the shell's stopwatch counts from here. */
  t0: number;
  /** "landing": the card is on screen, the shell wears its box and lets go. */
  phase: "dealing" | "landing";
};
export type VoiceLanded = { widgetId: string; x: number; y: number; host: HTMLElement };
export type VoiceReceipt =
  | { ok: true; key: number; cards: string[]; model: string | null; ms: number | null; widgetId: string }
  | { ok: false; key: number };

const DOCK_ROOM = 20; // clear air between a landed card and the dock
const HANDOFF_MS = 520; // the shell's let-go (--dur-stage, plus a frame)
const LEAVE_MS = 240; // the slip's exit (--dur-base, plus a frame)
const FRAME_PAD = 12; // a frame's label, garland and dashes paint past its box

/** The card the words most likely ask for, to size the shell before the model
    answers. Only a guess at a size: the shell takes the real card's box when
    it lands. */
function guessSize(said: string) {
  const words = said.toLowerCase();
  const card =
    CATALOG.find((c) => new RegExp(`\\b${c.id.replace(/s$/, "")}`).test(words)) ??
    CATALOG.find((c) => c.id === "poll")!;
  const size = footprint({ type: card.type, ...cardSize(card) });
  // A dealt poll usually comes back with four options, one row taller than its box (deck/apply.ts).
  return card.type === "poll" ? { w: size.w, h: size.h + 42 } : size;
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

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/** Read the canvas the way the asker sees it, in canvas coordinates. */
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
  }).filter((b) => b.id);
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

const inView = (r: Rect, v: Rect) => r.x >= v.x && r.y >= v.y && r.x + r.w <= v.x + v.w && r.y + r.h <= v.y + v.h;

const RECEIPT_MS = 6000;

export function useVoiceBuild({
  scrollerRef,
  deal,
  onLanded,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  deal: (req: DealRequest) => Promise<DealOutcome>;
  /** The asker's screen showed the first card, `ms` after speech ended. */
  onLanded?: (dealId: string, ms: number) => void;
}) {
  const [shell, setShell] = useState<VoiceShell | null>(null);
  const [landed, setLanded] = useState<VoiceLanded | null>(null);
  const [receipt, setReceipt] = useState<VoiceReceipt | null>(null);
  /** The slip is on its way out (it leaves on glide, then unmounts). */
  const [leaving, setLeaving] = useState(false);
  const dealRef = useRef(deal);
  dealRef.current = deal;
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;
  const clearTimer = useRef(0);
  const shellTimer = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(clearTimer.current);
      window.clearTimeout(shellTimer.current);
    },
    [],
  );

  const ask = useCallback(async (said: string) => {
    const t0 = performance.now();
    // Marks for the timing breakdown (read with performance.getEntriesByType("mark")).
    performance.mark("voice:end-of-speech");
    const m = measure(scrollerRef.current);
    if (!m) return;
    window.clearTimeout(clearTimer.current);
    window.clearTimeout(shellTimer.current);
    setReceipt(null);
    setLanded(null);
    setLeaving(false);

    // The shell: a card-sized hole at the spot code would pick, at once.
    const size = guessSize(said);
    const [spot] = placeCards([size], { widgets: m.board, view: m.view, bounds: m.bounds });
    setShell({ ...spot, ...size, said, host: m.canvas, t0, phase: "dealing" });
    const pan = panFor({ ...spot, ...size }, m.view);
    glideScroll(m.scroller, pan.dx * m.scale, pan.dy * m.scale);

    // Every new card's first frame on this screen, in ms after speech ended.
    const before = new Set(m.board.map((b) => b.id));
    const seen = new Map<string, number>();
    const boxOf = (el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    const letGo = () => {
      shellTimer.current = window.setTimeout(() => setShell(null), reducedMotion() ? 0 : HANDOFF_MS);
    };
    const arrive = (el: HTMLElement) => {
      const id = el.dataset.widgetId;
      if (!id || before.has(id) || seen.has(id)) return;
      const first = seen.size === 0;
      seen.set(id, -1);
      // Before its first paint: the card lands, it doesn't blink in.
      el.dataset.voiceLand = "";
      window.setTimeout(() => delete el.dataset.voiceLand, 1200);
      if (first) {
        setShell((s) => (s ? { ...s, ...boxOf(el), phase: "landing" } : s));
        letGo();
      }
      requestAnimationFrame(() => {
        seen.set(id, performance.now() - t0);
        performance.mark("voice:card-on-screen");
      });
    };
    const watcher = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.dataset.widgetId) arrive(node);
          else node.querySelectorAll<HTMLElement>("[data-widget-id]").forEach(arrive);
        }
      }
    });
    watcher.observe(m.canvas, { childList: true, subtree: true });
    const seenAt = async (id: string) => {
      for (let i = 0; i < 100 && !((seen.get(id) ?? -1) >= 0); i++) await new Promise((r) => setTimeout(r, 50));
      const at = seen.get(id) ?? -1;
      return at >= 0 ? at : null;
    };

    const leave = () => {
      clearTimer.current = window.setTimeout(() => {
        setLeaving(true);
        clearTimer.current = window.setTimeout(() => {
          setReceipt(null);
          setLanded(null);
          setLeaving(false);
        }, LEAVE_MS);
      }, RECEIPT_MS);
    };
    const fail = () => {
      setShell(null);
      setReceipt({ ok: false, key: t0 });
      leave();
    };
    try {
      performance.mark("voice:deal-sent");
      const out = await dealRef.current({ said, board: m.board, view: m.view, bounds: m.bounds, anchor: spot });
      performance.mark("voice:deal-returned");
      if (!out.ok || !out.cards.length) return fail();
      const first = out.cards[0].widgetId;
      const ms = await seenAt(first);
      const el = m.canvas.querySelector<HTMLElement>(`[data-widget-id="${first}"]`);
      if (ms === null) setShell(null); // never saw it arrive: nothing to hand off to
      if (el) {
        const at = boxOf(el);
        setLanded({ widgetId: first, x: at.x, y: at.y, host: m.canvas });
        // A card bigger than the guess can land off the shell's spot: follow it.
        const now = measure(m.scroller);
        if (now && !inView(at, now.view)) {
          const follow = panFor(at, now.view);
          glideScroll(m.scroller, follow.dx * now.scale, follow.dy * now.scale);
        }
      }
      setReceipt({
        ok: true,
        key: t0,
        cards: out.cards.map((c) => c.card),
        model: out.model,
        ms: out.model && ms !== null ? Math.round(ms) : null,
        widgetId: first,
      });
      if (out.dealId && ms !== null) landedRef.current?.(out.dealId, ms);
      leave();
    } catch {
      fail();
    } finally {
      watcher.disconnect();
    }
  }, [scrollerRef]);

  return { ask, shell, landed, receipt, leaving };
}
