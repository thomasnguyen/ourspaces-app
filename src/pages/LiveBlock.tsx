import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { useSpaceData } from "../live/useSpaceData";
import { BlockPage, type BlockPageProps } from "./Block";
import type { SpaceCustomization } from "../data/spaceThemes";

type LiveBlockZoomProps = Pick<
  BlockPageProps,
  "zoomPhase" | "zoomSpaceId" | "zoomMode" | "blockScroll" | "exitCamera" |
    "onZoomInStart" | "onZoomInComplete" | "onZoomOutComplete"
>;

export function LiveBlockPage({
  onEnterSpace,
  ...zoomProps
}: { onEnterSpace: (id: string) => void } & LiveBlockZoomProps) {
  const liveCounts = useQuery(api.stats.getLiveCounts);
  const crew = useSpaceData("crew");
  const couple = useSpaceData("couple");
  const house = useSpaceData("house");
  const league = useSpaceData("league");
  const data = { crew, couple, house, league };
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
