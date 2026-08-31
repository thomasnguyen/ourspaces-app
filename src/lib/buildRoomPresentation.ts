import type { BuildRoomLink } from "../data/buildroom";
import type { Widget } from "../data/types";

const BUILD_ROOM_OVERVIEW_MAX_SCALE = 0.84;
const BUILD_ROOM_OVERVIEW_RIGHT = 1550;
const BUILD_ROOM_OVERVIEW_BOTTOM = 1015;

const PINNED_LINK_COVERS: Record<string, string> = {
  "bl-1": "/assets/link-card-collage-violet.png",
  "bl-19": "/assets/link-card-riso.png",
  "bl-32": "/assets/link-card-ceramic.png",
};

function cssPixels(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Fit the build room's framed composition between its fixed chrome. */
export function buildRoomOverviewScale(
  spaceId: string,
  viewport: HTMLElement,
  widgets: readonly Widget[],
) {
  if (
    spaceId !== "buildroom" ||
    window.matchMedia("(max-width: 800px)").matches
  ) {
    return 1;
  }

  const frames = widgets.filter((widget) => widget.type === "frame");
  const contentRight = Math.max(
    BUILD_ROOM_OVERVIEW_RIGHT,
    ...frames.map((frame) => frame.x + frame.w),
  );
  const contentBottom = Math.max(
    BUILD_ROOM_OVERVIEW_BOTTOM,
    ...frames.map((frame) => frame.y + frame.h),
  );
  const styles = window.getComputedStyle(viewport);
  const availableWidth = Math.max(
    1,
    viewport.clientWidth -
      cssPixels(styles.paddingLeft) -
      cssPixels(styles.paddingRight),
  );
  const availableHeight = Math.max(
    1,
    viewport.clientHeight -
      cssPixels(styles.paddingTop) -
      cssPixels(styles.paddingBottom),
  );

  return Math.min(
    BUILD_ROOM_OVERVIEW_MAX_SCALE,
    availableWidth / contentRight,
    availableHeight / contentBottom,
  );
}

/** Seeded favorites get stable local art; scraped and dropped links keep theirs. */
export function withBuildRoomCover(link: BuildRoomLink): BuildRoomLink {
  const imageUrl = link.imageUrl || PINNED_LINK_COVERS[link.id];
  return imageUrl && imageUrl !== link.imageUrl ? { ...link, imageUrl } : link;
}
