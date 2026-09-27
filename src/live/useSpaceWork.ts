import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";

/**
 * What the space is doing right now, for the canvas's live strip.
 *
 * The backend writes one `work` row per real boundary inside the brain's slow
 * actions (convex/work.ts). This hook turns that stream into the single
 * sentence the strip has room for, and — the part that matters — decides when
 * to shut up. A narration line that outlives the work it describes is worse
 * than no line at all, so every row here expires.
 */

/** How far back the subscription looks. Anything older is not news. */
const WINDOW_MS = 120_000;
/** `since` only moves in steps this big, so the query key is stable between
 *  them and the subscription is not torn down and refetched every render. */
const BUCKET_MS = 30_000;

/**
 * A finished line is the payoff ("read “the case against X”") and deserves a
 * beat on screen — but only a beat, then the strip goes back to the board.
 */
const DONE_LINGER_MS = 9_000;
/**
 * A running line holds the strip while the work runs. The cap is the failsafe:
 * an action that dies between its "running" row and its "done" row must not
 * pin `fetching example.com` to the canvas forever. Generously past a slow
 * Firecrawl scrape, well short of permanent.
 */
const RUNNING_MAX_MS = 45_000;

const TICK_MS = 1_000;

export type SpaceWork = {
  /** the sentence, already in house voice from the server */
  line: string;
  status: "running" | "done" | "failed";
  kind: string;
  /** the widget it landed on, when it has landed on one */
  widgetId?: string;
};

export function useSpaceWork(spaceId: string | undefined): SpaceWork | null {
  /* Quantized so the query args only change twice a minute. A raw
     `Date.now() - WINDOW_MS` would be a new argument object on every render
     and a new subscription with it. */
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / BUCKET_MS));
  useEffect(() => {
    const timer = window.setInterval(
      () => setBucket(Math.floor(Date.now() / BUCKET_MS)),
      BUCKET_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const since = bucket * BUCKET_MS - WINDOW_MS;

  const rows = useQuery(api.work.recent, spaceId ? { spaceId: spaceId as never, since } : "skip");

  /* Rows arrive oldest-first; the newest one is what the room is doing now.
     Earlier rows in the same run have already been said. */
  const latest = rows && rows.length > 0 ? rows[rows.length - 1] : undefined;

  const [now, setNow] = useState(() => Date.now());
  /* The clock only runs while there is something on screen to expire. */
  useEffect(() => {
    if (!latest) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [latest]);

  return useMemo(() => {
    if (!latest) return null;
    const age = now - latest.createdAt;
    const limit = latest.status === "running" ? RUNNING_MAX_MS : DONE_LINGER_MS;
    if (age > limit) return null;
    return {
      line: latest.line,
      status: latest.status as SpaceWork["status"],
      kind: latest.kind,
      widgetId: latest.widgetId,
    };
  }, [latest, now]);
}
