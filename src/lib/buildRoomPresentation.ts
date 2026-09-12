import type { BuildRoomLink } from "../data/buildroom";
import type { Widget } from "../data/types";

const BUILD_ROOM_OVERVIEW_MAX_SCALE = 1;
const BUILD_ROOM_OVERVIEW_RIGHT = 1556;
const BUILD_ROOM_OVERVIEW_BOTTOM = 1044;

// Recognized demo placements (including the three lightly nudged live objects)
// get the new composition. Other saved placements stay untouched.
const BUILD_ROOM_LAYOUT: [Widget["type"], [number, number, number, number], [number, number, number, number]][] = [
  ["frame", [48, 64, 760, 420], [48, 48, 850, 540]],
  ["linkPile", [88, 148, 680, 300], [80, 104, 780, 438]],
  ["linkPile", [90, 142, 680, 300], [80, 104, 780, 438]],
  ["frame", [850, 48, 700, 400], [936, 48, 620, 340]],
  ["hotLinks", [886, 112, 628, 300], [958, 80, 576, 306]],
  ["frame", [850, 470, 700, 210], [936, 416, 620, 296]],
  ["note", [886, 512, 320, 150], [958, 446, 276, 248]],
  ["note", [1222, 512, 320, 150], [1254, 446, 276, 248]],
  ["note", [862, 498, 320, 150], [958, 446, 276, 248]],
  ["note", [1218, 511, 320, 150], [1254, 446, 276, 248]],
  ["frame", [48, 570, 760, 380], [48, 626, 850, 320]],
  ["shipPost", [84, 632, 222, 282], [72, 672, 254, 246]],
  ["shipPost", [328, 626, 222, 282], [356, 667, 254, 246]],
  ["shipPost", [572, 634, 222, 282], [640, 674, 254, 246]],
  ["frame", [850, 705, 700, 310], [936, 742, 620, 302]],
  ["roundtable", [886, 752, 628, 250], [958, 774, 576, 256]],
  // The first reference pass may already have been saved by a canvas gesture.
  ["frame", [936, 48, 620, 370], [936, 48, 620, 340]],
  ["hotLinks", [958, 84, 576, 306], [958, 80, 576, 306]],
  ["frame", [936, 446, 620, 194], [936, 416, 620, 296]],
  ["note", [958, 485, 276, 140], [958, 446, 276, 248]],
  ["note", [1254, 485, 276, 140], [1254, 446, 276, 248]],
  ["frame", [936, 668, 620, 278], [936, 742, 620, 302]],
  ["roundtable", [958, 704, 576, 228], [958, 774, 576, 256]],
];

export function withBuildRoomLayout(widget: Widget): Widget {
  const placement = BUILD_ROOM_LAYOUT.find(([type, old]) =>
    widget.type === type &&
    [widget.x, widget.y, widget.w, widget.h].every((value, i) => value === old[i]),
  );
  if (!placement) return widget;
  const [x, y, w, h] = placement[2];
  return { ...widget, x, y, w, h };
}

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

  const scale = Math.min(
    BUILD_ROOM_OVERVIEW_MAX_SCALE,
    availableWidth / contentRight,
    availableHeight / contentBottom,
  );
  viewport.style.setProperty("--build-room-width", `${contentRight * scale}px`);
  return scale;
}

/** Seeded favorites get stable local art; scraped and dropped links keep theirs. */
export function withBuildRoomCover(link: BuildRoomLink): BuildRoomLink {
  const imageUrl = link.imageUrl || PINNED_LINK_COVERS[link.id];
  return imageUrl && imageUrl !== link.imageUrl ? { ...link, imageUrl } : link;
}
