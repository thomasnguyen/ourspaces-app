import { useCallback, useRef } from "react";

/* Smooth remote motion.
 *
 * Measured against prod (necessary-cobra-892): a presence write reaches the
 * other tab in ~135ms p50 / ~147ms p90, and that number is *flat* — it does
 * not care whether we write 11 or 25 times a second. So the network is not
 * the thing that made dragging look bad. What made it look bad is that we
 * painted each arriving sample as a hard jump and then sat still until the
 * next one, which reads as a slideshow no matter how short the gap is.
 *
 * This layer does what every multiplayer cursor does instead:
 *   - interpolate, so motion is continuous between samples rather than stepped
 *   - lead the newest sample by its own age, so a peer who is still moving is
 *     drawn roughly where they are NOW instead of where they were a beat ago
 *
 * The lead is what actually removes the "really delayed" feeling — a CSS
 * transition can only ever add to the lag, never subtract from it.
 *
 * Positions are written straight to the DOM on rAF. They never become React
 * state, so a peer waving their cursor around does not re-render the canvas.
 */

export type MotionTuning = {
  /** exponential smoothing constant, ms. Bigger = softer, and laggier. */
  tau: number;
  /** extra lead on top of the sample's age, ms — pays down one-way latency. */
  bias: number;
  /** hard cap on prediction, ms. Caps the overshoot on a direction change. */
  maxLead: number;
};

/** A cursor is forgiving: overshooting it by a few px on a hard turn is
 *  invisible, so it gets the aggressive lead and wins the most latency back. */
export const CURSOR_MOTION: MotionTuning = { tau: 45, bias: 45, maxLead: 140 };

/** A dragged widget is a big object with edges you can line up against, so
 *  overshoot is legible. It leans on interpolation and barely predicts. */
export const WIDGET_MOTION: MotionTuning = { tau: 60, bias: 10, maxLead: 80 };

/** Past this, a peer has stopped sending — coast to a halt, don't keep
 *  extrapolating a velocity nobody is still moving at. */
const STALE_MS = 400;
/** How fast the prediction unwinds once samples dry up. A hand that stops
 *  dead stops SENDING too, so silence is the main evidence of a stop —
 *  without this the cursor flies ~100px past the target and snaps back. */
const UNWIND_MS = 55;
/** px/ms below which a peer counts as parked (2px a second). */
const STILL = 0.002;
/** Below this the track is parked; the loop can stop. */
const SETTLED_PX = 0.05;
const REAP_AFTER_MS = 15_000;
/** Letting go hands the card back to its committed left/top, and the ghost is
 *  typically ~25px off at that instant. Easing that last bit reads as the card
 *  settling; clearing the transform outright reads as a pop. */
const RELEASE_MS = 140;
const RELEASE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

type Track = {
  el: HTMLElement | null;
  tuning: MotionTuning;
  /** subtracted from the painted value — a widget's transform is relative to
   *  its own left/top, a cursor's is absolute */
  originX: number;
  originY: number;
  /** newest sample: server clock identifies it, local clock ages it */
  tx: number;
  ty: number;
  tAt: number;
  tRecv: number;
  /** px/ms over the last hop, and the hop before it. Comparing the two is how
   *  a stop or a direction change gets caught on the very sample it happens,
   *  instead of a beat later. */
  vx: number;
  vy: number;
  pvx: number;
  pvy: number;
  /** ms between the last two samples — the cadence to expect the next one at */
  gap: number;
  /** what is actually on screen */
  rx: number;
  ry: number;
  /** false until the first real sample — the first paint must not slide in
   *  from wherever the track happened to be created */
  seeded: boolean;
  touched: number;
};

export type PeerMotion = {
  /** Called during render with whatever the last snapshot said. Idempotent:
   *  re-sending the same point is free, which is what lets it live in render. */
  sample: (
    key: string,
    x: number,
    y: number,
    tuning: MotionTuning,
    at?: number,
    origin?: { x: number; y: number },
  ) => void;
  /** Hand the engine the node to drive. Returns the detach, which also wipes
   *  the inline transform so the element goes back to its CSS position. */
  attach: (key: string, el: HTMLElement | null) => () => void;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function usePeerMotion(): PeerMotion {
  const tracks = useRef(new Map<string, Track>());
  const frame = useRef<number | null>(null);
  const lastTick = useRef(0);

  const tick = useCallback((now: number) => {
    const dt = Math.min(64, Math.max(1, now - lastTick.current));
    lastTick.current = now;
    const snap = prefersReducedMotion();
    let alive = false;

    for (const [key, track] of tracks.current) {
      if (now - track.touched > REAP_AFTER_MS && !track.el) {
        tracks.current.delete(key);
        continue;
      }
      if (!track.el) continue;

      const age = now - track.tRecv;
      let aimX = track.tx;
      let aimY = track.ty;
      const speed = Math.hypot(track.vx, track.vy);
      if (age < STALE_MS && speed > STILL) {
        /* How much to believe this velocity. A hand that is slowing down or
           doubling back gets its prediction cut on the spot — that is the
           difference between leading a peer and overshooting them. */
        const was = Math.hypot(track.pvx, track.pvy);
        let trust = 1;
        if (was > STILL) {
          const align = Math.max(
            0,
            (track.vx * track.pvx + track.vy * track.pvy) / (speed * was),
          );
          trust = align * Math.min(1, speed / was);
        }
        /* And silence means stopped. The lead is allowed to grow for exactly
           one expected hop — past that we are guessing about a peer who has
           told us nothing, so it unwinds instead of flying on. Letting it
           keep growing is what threw the cursor ~80px past a hard stop and
           then crawled it back. */
        const overdue = Math.max(0, age - track.gap);
        const lead =
          Math.min(track.tuning.maxLead, Math.min(age, track.gap) + track.tuning.bias) *
          trust *
          Math.exp(-overdue / UNWIND_MS);
        aimX += track.vx * lead;
        aimY += track.vy * lead;
      }

      const k = snap ? 1 : 1 - Math.exp(-dt / track.tuning.tau);
      track.rx += (aimX - track.rx) * k;
      track.ry += (aimY - track.ry) * k;
      track.el.style.transform = `translate3d(${(
        track.rx - track.originX
      ).toFixed(2)}px, ${(track.ry - track.originY).toFixed(2)}px, 0)`;

      if (
        Math.abs(aimX - track.rx) > SETTLED_PX ||
        Math.abs(aimY - track.ry) > SETTLED_PX ||
        age < STALE_MS
      ) {
        alive = true;
      }
    }

    frame.current = alive ? window.requestAnimationFrame(tick) : null;
  }, []);

  const start = useCallback(() => {
    if (frame.current !== null) return;
    lastTick.current = performance.now();
    frame.current = window.requestAnimationFrame(tick);
  }, [tick]);

  const sample = useCallback<PeerMotion["sample"]>(
    (key, x, y, tuning, at, origin) => {
      const now = performance.now();
      const stamp = at ?? now;
      let track = tracks.current.get(key);
      if (!track) {
        track = {
          el: null,
          tuning,
          originX: 0,
          originY: 0,
          tx: x,
          ty: y,
          tAt: stamp,
          tRecv: now,
          vx: 0,
          vy: 0,
          pvx: 0,
          pvy: 0,
          gap: 50,
          rx: x,
          ry: y,
          seeded: true,
          touched: now,
        };
        tracks.current.set(key, track);
      } else {
        track.tuning = tuning;
        track.touched = now;
        if (!track.seeded) {
          track.seeded = true;
          track.tx = track.rx = x;
          track.ty = track.ry = y;
          track.tAt = stamp;
          track.tRecv = now;
          track.vx = track.vy = track.pvx = track.pvy = 0;
        } else if (stamp > track.tAt) {
          /* Dedupe on the stamp, not the position. A snapshot that repeats a
             peer's coordinates is not nothing — it is them telling us they
             stopped, and the zero-length hop below is what records that. */
          let hop = stamp - track.tAt;
          if (!(hop > 8 && hop < 600)) {
            hop = Math.min(600, Math.max(8, now - track.tRecv));
          }
          track.pvx = track.vx;
          track.pvy = track.vy;
          track.vx = (x - track.tx) / hop;
          track.vy = (y - track.ty) / hop;
          track.gap = hop;
          track.tx = x;
          track.ty = y;
          track.tAt = stamp;
          track.tRecv = now;
        }
      }
      if (origin) {
        track.originX = origin.x;
        track.originY = origin.y;
      }
      start();
    },
    [start],
  );

  const attach = useCallback<PeerMotion["attach"]>(
    (key, el) => {
      let track = tracks.current.get(key);
      if (!track) {
        // the node beat the first snapshot here; park it until a sample lands
        track = {
          el: null,
          tuning: CURSOR_MOTION,
          originX: 0,
          originY: 0,
          tx: 0,
          ty: 0,
          tAt: 0,
          tRecv: 0,
          vx: 0,
          vy: 0,
          pvx: 0,
          pvy: 0,
          gap: 50,
          rx: 0,
          ry: 0,
          seeded: false,
          touched: performance.now(),
        };
        tracks.current.set(key, track);
      }
      const bound = track;
      bound.el = el;
      if (el) el.style.transition = "";
      if (el && bound.seeded) {
        // land on the current target this frame rather than sliding in from
        // whatever the last gesture left behind
        bound.rx = bound.tx;
        bound.ry = bound.ty;
        el.style.transform = `translate3d(${bound.rx - bound.originX}px, ${
          bound.ry - bound.originY
        }px, 0)`;
      }
      start();
      return () => {
        if (bound.el !== el) return;
        bound.el = null;
        if (!el) return;
        /* By now React has already moved the card onto its committed left/top,
           so the old transform means something different than it did a frame
           ago. Re-express it against the NEW origin — that keeps the card
           exactly where the eye last saw it — and ease that remainder to zero.
           Dropping the transform outright pops it the last ~25px instead. */
        const box = window.getComputedStyle(el);
        const dx = bound.rx - (parseFloat(box.left) || 0);
        const dy = bound.ry - (parseFloat(box.top) || 0);
        if (
          prefersReducedMotion() ||
          !Number.isFinite(dx) ||
          !Number.isFinite(dy) ||
          Math.hypot(dx, dy) < 0.5
        ) {
          el.style.transform = "";
          return;
        }
        el.style.transition = "none";
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        void el.offsetWidth; // commit that as the start of the ease
        el.style.transition = `transform ${RELEASE_MS}ms ${RELEASE_EASE}`;
        el.style.transform = "translate3d(0px, 0px, 0)";
        window.setTimeout(() => {
          // only if nobody has picked the card back up in the meantime
          if (bound.el !== null) return;
          el.style.transition = "";
          el.style.transform = "";
        }, RELEASE_MS);
      };
    },
    [start],
  );

  return { sample, attach };
}
