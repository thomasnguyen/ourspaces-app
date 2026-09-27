import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { useSpaceData } from "../live/useSpaceData";
import { BlockPage, type BlockPageProps } from "./Block";
import type { SpaceCustomization } from "../data/spaceThemes";

// Matches the presence TTL the server filters on: ticking faster than the
// window being measured just buys re-executions. Only `getHereNow` rides this
// cadence now — the totals are argument-free and update when they change.
const COUNT_TICK_MS = 30_000;
const bucketNow = () => Math.floor(Date.now() / COUNT_TICK_MS) * COUNT_TICK_MS;

type LiveBlockZoomProps = Pick<
  BlockPageProps,
  "zoomPhase" | "zoomSpaceId" | "zoomMode" | "blockScroll" | "exitCamera" |
    "onZoomInStart" | "onZoomInComplete" | "onZoomOutComplete"
>;

export function LiveBlockPage({
  onEnterSpace,
  ...zoomProps
}: { onEnterSpace: (id: string) => void } & LiveBlockZoomProps) {
  // Coarse bucket so "here now" ticks without re-running the query on every
  // render — getLiveCounts takes time as an argument rather than reading the
  // clock inside a cached query.
  const [nowBucket, setNowBucket] = useState(() => bucketNow());
  useEffect(() => {
    const id = window.setInterval(() => setNowBucket(bucketNow()), COUNT_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  // Two queries, deliberately: the totals read 28 counter shards and must not
  // re-run on the clock, while "here now" must. Bundled, the clock dragged the
  // shard reads with it four times a minute per visitor. See convex/stats.ts.
  const totals = useQuery(api.stats.getLiveTotals, {});
  const hereNow = useQuery(api.stats.getHereNow, { now: nowBucket });
  const liveCounts =
    totals && hereNow !== undefined
      ? [
          { label: "spaces", value: totals.spaces },
          { label: "widgets", value: totals.widgets },
          { label: "messages", value: totals.messages },
          { label: "here now", value: hereNow },
        ]
      : [];
  const buildroom = useSpaceData("buildroom");
  const crew = useSpaceData("crew");
  const couple = useSpaceData("couple");
  const house = useSpaceData("house");
  const league = useSpaceData("league");
  const data = { buildroom, crew, couple, house, league };
  const liveWidgets = Object.fromEntries(
    Object.entries(data).map(([slug, item]) => [slug, item.widgets]),
  );
  const emptyCustomizations: Record<string, SpaceCustomization> = {};
  return (
    <>
      <BlockPage
        onEnterSpace={onEnterSpace}
        addedWidgets={{}}
        widgetPlacements={{}}
        widgetDataOverrides={{}}
        deletedWidgetIds={{}}
        pollSelections={{}}
        rsvpSelections={{}}
        dailyAnswers={{}}
        dailyReactions={{}}
        promoted={false}
        spaceCustomizations={emptyCustomizations}
        backendLiveCounts={liveCounts}
        visitorCount={hereNow ?? 0}
        liveWidgets={liveWidgets}
        {...zoomProps}
      />
    </>
  );
}
