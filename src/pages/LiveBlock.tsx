import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { useSpaceData } from "../live/useSpaceData";
import { BlockPage, type BlockPageProps } from "./Block";
import type { SpaceCustomization } from "../data/spaceThemes";

const COUNT_TICK_MS = 15_000;
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
  const liveCounts = useQuery(api.stats.getLiveCounts, { now: nowBucket });
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
        backendLiveCounts={liveCounts?.counts ?? []}
        visitorCount={liveCounts?.counts.find((count) => count.label === "here now")?.value ?? 0}
        liveWidgets={liveWidgets}
        {...zoomProps}
      />
    </>
  );
}
