import { useEffect, useState } from "react";
import type { Widget } from "../data/types";

/**
 * Arriving in a space.
 *
 * The pitch is "spaces remember", so loading one must not look like it is being
 * built from nothing — it was already there. Everything settles into the place
 * it already occupied: the name lifts into its slot, a wavefront rolls out from
 * the canvas home corner (top-left, the board's permanent anchor) settling each
 * widget as it passes, and the people show up last.
 *
 * Timings live here; the motion itself is in index.css under "Space entrance".
 */

/** How long `.is-entering` stays on — just past the last beat (the cursors). */
export const ENTRANCE_MS = 1000;

/** Keep short-lived loading states off the screen so fast switches stay quiet. */
export function useShowAfter(active: boolean, ms = 200) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }

    const timeout = window.setTimeout(() => setShown(true), ms);
    return () => window.clearTimeout(timeout);
  }, [active, ms]);

  return active && shown;
}

/** Widest spread between the first widget settling and the last. */
const WAVE_SPREAD_MS = 300;

/** Head start for the space name, so the title leads the canvas. */
const WAVE_OFFSET_MS = 40;

/**
 * True while a freshly mounted space plays its entrance. Components get a fresh
 * `true` per space because App keys them on `spaceId`.
 */
export function useSpaceEntrance(enabled = true) {
  const [entering, setEntering] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    const timeout = window.setTimeout(() => setEntering(false), ENTRANCE_MS);
    return () => window.clearTimeout(timeout);
  }, [enabled]);

  return entering;
}

/**
 * Per-widget delay along a wave expanding from the canvas origin. Normalised by
 * the farthest widget so a busy board sweeps in the same window as a sparse one.
 */
export function wavefrontDelays(widgets: Widget[]): Record<string, number> {
  const distances = widgets.map((widget) => Math.hypot(widget.x, widget.y));
  const farthest = Math.max(1, ...distances);

  return Object.fromEntries(
    widgets.map((widget, index) => [
      widget.id,
      WAVE_OFFSET_MS + (distances[index] / farthest) * WAVE_SPREAD_MS,
    ]),
  );
}
