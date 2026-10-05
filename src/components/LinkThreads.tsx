/**
 * The thread between two cards of a flow (W2): a thin drawn line from one
 * card's edge to the other's, with a small tag naming the link ("winner names
 * it"). Dashed while the second card waits, solid once it's filled. It follows
 * either card while it's dragged (positions are read off the board every
 * frame, not from the stored x/y), and a person can cut it: cutting stops the
 * link for good and the second card becomes an ordinary card.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import "./link-threads.css";

export type ThreadLink = {
  id: string;
  from: string;
  to: string;
  tag: string;
  /** waiting: the second card waits · asked: its write would undo a choice, the people it's theirs decide on the card · live: it follows the first until locked · done: filled */
  state: "waiting" | "asked" | "live" | "done";
  when: string;
};

type Box = { x: number; y: number; w: number; h: number };

/** Where the line from a box's centre toward a point leaves the box. */
function edge(r: Box, to: { x: number; y: number }, pad = 6) {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  const t = Math.min(dx ? (r.w / 2 + pad) / Math.abs(dx) : Infinity, dy ? (r.h / 2 + pad) / Math.abs(dy) : Infinity, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function ends(a: Box, b: Box) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return { p: edge(a, cb), q: edge(b, ca) };
}

/** One thread between two boxes already in the same coordinates (the stage's group). */
export function Thread({ a, b, tag, state = "waiting" }: { a: Box; b: Box; tag: string; state?: ThreadLink["state"] }) {
  const { p, q } = ends(a, b);
  return (
    <div className="link-thread-layer" aria-hidden="true">
      <svg className="link-thread-svg">
        <line className="link-thread-line" data-state={state} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
      </svg>
      <span className="link-thread-tag" data-state={state} style={{ left: (p.x + q.x) / 2, top: (p.y + q.y) / 2 } as CSSProperties}>
        {tag}
      </span>
    </div>
  );
}

/** Every flow's thread on the board, following the cards as drawn. */
export function LinkThreads({
  links,
  onCut,
  onLock,
  onDeal,
}: {
  links: ThreadLink[];
  onCut?: (id: string) => void;
  onLock?: (id: string) => void;
  onDeal?: (id: string) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = layer.current;
      const canvas = root?.parentElement;
      if (!root || !canvas) return;
      const c = canvas.getBoundingClientRect();
      const scale = c.width / Math.max(1, canvas.offsetWidth);
      // the layer is as big as the board (an svg with no size paints nothing)
      const svg = root.querySelector("svg");
      if (svg && svg.getAttribute("width") !== String(canvas.scrollWidth)) {
        svg.setAttribute("width", String(canvas.scrollWidth));
        svg.setAttribute("height", String(canvas.scrollHeight));
      }
      const box = (id: string): Box | null => {
        const el = canvas.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: (r.left - c.left) / scale, y: (r.top - c.top) / scale, w: r.width / scale, h: r.height / scale };
      };
      for (const l of links) {
        const line = root.querySelector<SVGLineElement>(`line[data-link="${l.id}"]`);
        const tag = root.querySelector<HTMLElement>(`[data-link-tag="${l.id}"]`);
        const a = box(l.from);
        const b = box(l.to);
        const shown = !!(a && b);
        if (line) line.style.display = shown ? "" : "none";
        if (tag) tag.style.display = shown ? "" : "none";
        if (!a || !b || !line || !tag) continue;
        const { p, q } = ends(a, b);
        line.setAttribute("x1", String(p.x));
        line.setAttribute("y1", String(p.y));
        line.setAttribute("x2", String(q.x));
        line.setAttribute("y2", String(q.y));
        tag.style.left = `${(p.x + q.x) / 2}px`;
        tag.style.top = `${(p.y + q.y) / 2}px`;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [links]);
  if (!links.length) return null;
  return (
    <div className="link-thread-layer is-board" ref={layer} data-testid="link-threads">
      <svg className="link-thread-svg">
        {links.map((l) => (
          <line key={l.id} className="link-thread-line" data-link={l.id} data-state={l.state} />
        ))}
      </svg>
      {links.map((l) => (
        <span
          key={l.id}
          className="link-thread-tag"
          data-testid="link-thread"
          data-link-tag={l.id}
          data-from={l.from}
          data-to={l.to}
          data-state={l.state}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {l.tag}
          {l.state === "waiting" && l.when.includes("tap") && onDeal && (
            <button type="button" className="link-thread-key" data-testid="link-deal" onClick={() => onDeal(l.id)}>
              deal the rest
            </button>
          )}
          {l.state === "live" && onLock && (
            <button type="button" className="link-thread-key" data-testid="link-lock" onClick={() => onLock(l.id)}>
              lock it
            </button>
          )}
          {l.state !== "done" && onCut && (
            <button type="button" className="link-thread-cut" data-testid="link-cut" aria-label="cut the thread" onClick={() => onCut(l.id)}>
              ✂
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
