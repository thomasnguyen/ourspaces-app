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
 * The canvas's own pulse line — what just happened on this board, in words.
 * It belongs to the board, not to the page chrome, so it renders inside
 * <main> next to the canvas rather than in the header or the rail.
 *
 * One fact, one home: the header owns the faces and "N here now", the title
 * owns the room's name. This line only says what nothing else on screen
 * says — that the board is live, who has a hand on something, how fresh the
 * last change is, and (only when it is news) that the board is still empty.
 * The name rides along hidden and CSS reveals it once the title has scrolled
 * off (`.is-canvas-away`), so the strip takes over as the wayfinder exactly
 * when the header stops being one.
 *
 * Every value here is a live Convex subscription handed down from
 * LiveSpace.tsx. A prop that has not arrived yet is left out of the sentence
 * rather than filled in with a plausible number.
 */
export function SpaceLiveStrip({
  spaceName,
  boardCount,
  lastChangeAt,
  gestures = [],
}: {
  /** the room this line is about — shown only once the title has scrolled away */
  spaceName?: string;
  /** widget rows on this space's board — only spoken while it is zero */
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

  /* The count is only news while it is zero — a populated board speaks for
     itself, and "13 things" next to 13 visible things is a stat, not a pulse. */
  const board = boardCount === 0 ? "nothing on the board yet" : null;

  const busy = gestures.length > 0 ? gestureLine(gestures) : null;
  const changed =
    !busy && lastChangeAt != null ? `last change ${since(lastChangeAt, now)}` : null;

  if (!spaceName && !board && !busy && !changed) return null;

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
          /* Collapsed at rest; CSS opens it when the title scrolls away. */
          <span className="space-live-strip-name">
            <span>
              <span className="space-live-strip-dot-sep" aria-hidden="true">
                ·
              </span>
              {spaceName}
            </span>
          </span>
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
