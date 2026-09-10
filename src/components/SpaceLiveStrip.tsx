import { useEffect, useState } from "react";
import { relTime } from "../live/adapt";

/** Someone with a hand on a widget right now, straight off their presence row. */
export type LiveStripGesture = {
  userId: string;
  name: string;
  kind: "move" | "resize";
  /** the widget's own title, when the board still has that widget */
  label?: string;
};

const TICK_MS = 1_000;
const LABEL_MAX = 40;

/**
 * Sub-minute freshness only. Anything a minute or older hands off to the
 * shared relTime() so the app keeps one relative-time vocabulary ("3m",
 * "5h", "2d") instead of growing a second one.
 */
function since(at: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  return `${relTime(at)} ago`;
}

function trim(label: string) {
  const clean = label.trim();
  return clean.length > LABEL_MAX ? `${clean.slice(0, LABEL_MAX - 1)}…` : clean;
}

function gestureLine(gestures: LiveStripGesture[]) {
  if (gestures.length === 1) {
    const [only] = gestures;
    const verb = only.kind === "resize" ? "resizing" : "moving";
    return only.label
      ? `${only.name} is ${verb} ${trim(only.label)}`
      : `${only.name} is ${verb} something`;
  }
  if (gestures.length === 2) {
    return `${gestures[0].name} and ${gestures[1].name} are moving things`;
  }
  return `${gestures.length} people are moving things`;
}

/**
 * The canvas's own status line — what is true about this room right now, in
 * words. It belongs to the board, not to the page chrome, so it renders
 * inside <main> next to the canvas rather than in the header or the rail.
 *
 * Every value here is a live Convex subscription handed down from
 * LiveSpace.tsx. A prop that has not arrived yet is left out of the sentence
 * rather than filled in with a plausible number.
 */
export function SpaceLiveStrip({
  spaceName,
  hereCount,
  boardCount,
  lastChangeAt,
  gestures = [],
}: {
  /** the room this line is about — the canvas pans away from the header */
  spaceName?: string;
  /** presence component room occupancy — the same number the rail shows */
  hereCount?: number;
  /** widget rows on this space's board */
  boardCount?: number;
  /** newest real write we know about (widget or message) */
  lastChangeAt?: number;
  gestures?: LiveStripGesture[];
}) {
  const [now, setNow] = useState(() => Date.now());
  /* The clock only has to tick while it is the thing on show; a live gesture
     takes the tail of the line and freezes the timer until it lets go. */
  const ticking = lastChangeAt != null && gestures.length === 0;

  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const here =
    hereCount == null
      ? null
      : hereCount === 0
        ? "quiet right now"
        : hereCount === 1
          ? "1 here now"
          : `${hereCount} here now`;

  const board =
    boardCount == null
      ? null
      : boardCount === 0
        ? "nothing on the board yet"
        : boardCount === 1
          ? "1 thing on the board"
          : `${boardCount} things on the board`;

  const busy = gestures.length > 0 ? gestureLine(gestures) : null;
  const changed =
    !busy && lastChangeAt != null ? `last change ${since(lastChangeAt, now)}` : null;

  if (!here && !board && !busy && !changed) return null;

  return (
    <p className="space-live-strip">
      {/* The announced part is the news: who is here, what is on the board,
          who has their hand on something. The clock sits outside it on
          purpose — a live region that re-reads itself every second is a
          nuisance in a screen reader, and the second hand is not news. */}
      <span className="space-live-strip-news" aria-live="polite">
        <span className="space-live-strip-dot" aria-hidden="true" />
        <span className="space-live-strip-live">live</span>
        {spaceName && (
          <>
            <span className="space-live-strip-dot-sep" aria-hidden="true">
              ·
            </span>
            {spaceName}
          </>
        )}
        {here && (
          <>
            <span className="space-live-strip-dot-sep" aria-hidden="true">
              ·
            </span>
            {here}
          </>
        )}
        {board && (
          <>
            <span className="space-live-strip-dot-sep" aria-hidden="true">
              ·
            </span>
            {board}
          </>
        )}
        {busy && (
          <>
            <span className="space-live-strip-dot-sep" aria-hidden="true">
              ·
            </span>
            <em className="space-live-strip-busy">{busy}</em>
          </>
        )}
      </span>
      {changed && (
        <span className="space-live-strip-since">
          <span className="space-live-strip-dot-sep" aria-hidden="true">
            ·
          </span>
          {changed}
        </span>
      )}
    </p>
  );
}
