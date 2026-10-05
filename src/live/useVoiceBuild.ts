import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cardSize, getCard, placeCards, type Placement, type Rect } from "../lib/deck";
import { panToWidget } from "../lib/recapBoard";

/**
 * Say it → it builds, the room's half (the model's half is convex/voiceBuild.ts).
 * When speech ends: measure the board as drawn, put a shell where the card
 * will land, hand the words to `deal`, and watch the canvas for the first new
 * card. The receipt's ms is end of speech → that card on this screen, measured
 * here, never estimated. Live and mock rooms share this; only `deal` differs.
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

export type VoiceShell = Rect & { said: string; host: HTMLElement };
export type VoiceLanded = { widgetId: string; x: number; y: number; host: HTMLElement };
export type VoiceReceipt =
  | { ok: true; key: number; cards: string[]; model: string | null; ms: number | null; widgetId: string }
  | { ok: false; key: number };

const RECEIPT_ROOM = 64;

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
    // Above the dock and the receipt that will sit over it.
    h: (Math.min(s.bottom, dockTop - RECEIPT_ROOM) - top) / scale,
  };
  const board = Array.from(canvas.querySelectorAll<HTMLElement>("[data-widget-id]"), (el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.widgetId ?? "", x: (r.left - c.left) / scale, y: (r.top - c.top) / scale, w: r.width / scale, h: r.height / scale };
  }).filter((b) => b.id);
  const bounds = { x: 0, y: 0, w: canvas.offsetWidth, h: canvas.offsetHeight };
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
  const dealRef = useRef(deal);
  dealRef.current = deal;
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;
  const clearTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const ask = useCallback(async (said: string) => {
    const t0 = performance.now();
    // Marks for the timing breakdown (read with performance.getEntriesByType("mark")).
    performance.mark("voice:end-of-speech");
    const m = measure(scrollerRef.current);
    if (!m) return;
    window.clearTimeout(clearTimer.current);
    setReceipt(null);
    setLanded(null);

    // The shell: a poll-sized card at the spot code would pick, at once.
    const size = cardSize(getCard("poll")!);
    const [spot] = placeCards([size], { widgets: m.board, view: m.view, bounds: m.bounds });
    setShell({ ...spot, ...size, said, host: m.canvas });
    if (!inView({ ...spot, ...size }, m.view)) {
      m.scroller.scrollTo({
        left: m.scroller.scrollLeft + (spot.x + size.w / 2 - (m.view.x + m.view.w / 2)) * m.scale,
        top: m.scroller.scrollTop + (spot.y + size.h / 2 - (m.view.y + m.view.h / 2)) * m.scale,
        behavior: "smooth",
      });
    }

    // Every new card's first frame on this screen, in ms after speech ended.
    const before = new Set(m.board.map((b) => b.id));
    const seen = new Map<string, number>();
    let raf = 0;
    const watch = () => {
      for (const el of m.canvas.querySelectorAll<HTMLElement>("[data-widget-id]")) {
        const id = el.dataset.widgetId;
        if (id && !before.has(id) && !seen.has(id)) {
          seen.set(id, performance.now() - t0);
          performance.mark("voice:card-on-screen");
          setShell(null);
        }
      }
      raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
    const seenAt = async (id: string) => {
      for (let i = 0; i < 100 && !seen.has(id); i++) await new Promise((r) => setTimeout(r, 50));
      return seen.get(id) ?? null;
    };

    const fail = () => {
      setShell(null);
      setReceipt({ ok: false, key: t0 });
      clearTimer.current = window.setTimeout(() => setReceipt(null), RECEIPT_MS);
    };
    try {
      performance.mark("voice:deal-sent");
      const out = await dealRef.current({ said, board: m.board, view: m.view, bounds: m.bounds, anchor: spot });
      performance.mark("voice:deal-returned");
      if (!out.ok || !out.cards.length) return fail();
      const first = out.cards[0].widgetId;
      const ms = await seenAt(first);
      setShell(null);
      const el = m.canvas.querySelector<HTMLElement>(`[data-widget-id="${first}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const c = m.canvas.getBoundingClientRect();
        const at = { x: (r.left - c.left) / m.scale, y: (r.top - c.top) / m.scale, w: r.width / m.scale, h: r.height / m.scale };
        setLanded({ widgetId: first, x: at.x, y: at.y, host: m.canvas });
        if (!inView(at, measure(m.scroller)?.view ?? m.view)) panToWidget(first);
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
      clearTimer.current = window.setTimeout(() => {
        setReceipt(null);
        setLanded(null);
      }, RECEIPT_MS);
    } catch {
      fail();
    } finally {
      cancelAnimationFrame(raf);
    }
  }, [scrollerRef]);

  return { ask, shell, landed, receipt };
}
