import { useEffect, useMemo, useRef, useState } from "react";
import "./labs.css";
import { ReadingRoom } from "../components/ReadingRoom";
import { BUILD_ROOM_LINKS, type BuildRoomLink } from "../data/buildroom";
import { getSpace } from "../data/spaces";
import { mockBuildRoomFeed } from "../lib/buildRoomFeed";
import { pendingLinkRows, scheduleMockResolve } from "../lib/mockArrival";
import { playSound } from "../lib/sounds";

/**
 * Arrival lab — watch a dropped link narrate its own arrival, on a loop,
 * without spending a Firecrawl credit. Hash route: /#/arrival
 *
 * Same pile, same ReadingRoom, same fake resolve as mock mode
 * (lib/mockArrival.ts); the bar at the bottom just drops for you and can
 * run the whole beat at quarter speed.
 */

const SAMPLE_URLS = [
  "https://github.com/get-convex/convex-backend",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://stripe.com/blog/idempotency",
  "https://news.ycombinator.com/item?id=41000000",
  "https://docs.convex.dev/scheduling/cron-jobs",
  "https://martinfowler.com/bliki/TwoHardThings.html",
];

export function ArrivalLab() {
  const [dropped, setDropped] = useState<BuildRoomLink[]>([]);
  const [slow, setSlow] = useState(false);
  const scale = slow ? 4 : 1;
  const cancels = useRef<(() => void)[]>([]);

  /* Slow-mo: the CSS side reads `--arrival-slow`, the stage clock reads
     `clockScale`. Both stretch together or the beat desyncs. */
  useEffect(() => {
    document.documentElement.style.setProperty("--arrival-slow", String(scale));
    return () => {
      document.documentElement.style.removeProperty("--arrival-slow");
    };
  }, [scale]);

  useEffect(() => () => cancels.current.forEach((cancel) => cancel()), []);

  const feed = useMemo(() => mockBuildRoomFeed("buildroom"), []);
  const links = useMemo(() => [...dropped, ...BUILD_ROOM_LINKS], [dropped]);

  const drop = (urls: string[], failLast = false) => {
    const rows = pendingLinkRows(urls, "you", "you");
    setDropped((current) => [...rows, ...current]);
    playSound("place");
    cancels.current.push(
      scheduleMockResolve(
        rows,
        (id, patch) =>
          setDropped((current) =>
            current.map((link) => (link.id === id ? { ...link, ...patch } : link)),
          ),
        { scale, failIds: failLast ? new Set([rows[rows.length - 1].id]) : undefined },
      ),
    );
  };

  const next = (count: number) => {
    const taken = new Set(dropped.map((link) => link.url));
    const fresh = SAMPLE_URLS.filter((url) => !taken.has(url));
    const pool = fresh.length >= count ? fresh : SAMPLE_URLS;
    return pool.slice(0, count).map((url) =>
      taken.has(url) ? `${url}${url.includes("?") ? "&" : "?"}again=${Date.now()}` : url,
    );
  };

  const clear = () => {
    cancels.current.forEach((cancel) => cancel());
    cancels.current = [];
    setDropped([]);
  };

  return (
    <div className="arrival-lab paper-bg" data-space-id="buildroom">
      <ReadingRoom
        pileId="lab-pile"
        links={links}
        replyCounts={feed?.replyCounts ?? {}}
        messagesByThread={{}}
        faces={getSpace("buildroom").members}
        userId="you"
        onDrop={(urls) => drop(urls)}
        onRetry={(linkId) => {
          const row = dropped.find((link) => link.id === linkId);
          if (!row) return;
          clear();
          drop([row.url]);
        }}
        onClose={() => {
          window.location.hash = "#/space/buildroom";
        }}
        clockScale={scale}
        extra={
          <div className="arrival-lab-bar">
            <span className="arrival-lab-kicker">arrival lab</span>
            <button type="button" onClick={() => drop(next(1))}>drop 1</button>
            <button type="button" onClick={() => drop(next(3))}>drop 3</button>
            <button type="button" onClick={() => drop(next(6))}>drop 6</button>
            <button type="button" onClick={() => drop(next(2), true)}>one fails</button>
            <i aria-hidden="true" />
            <button
              type="button"
              className={slow ? "is-on" : ""}
              onClick={() => setSlow((value) => !value)}
            >
              {slow ? "¼ speed · on" : "¼ speed"}
            </button>
            <button type="button" onClick={clear}>clear</button>
          </div>
        }
      />
    </div>
  );
}
