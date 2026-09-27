import type { BuildRoomLink } from "../data/buildroom";
import type { Widget } from "../data/types";

const BUILD_ROOM_OVERVIEW_MAX_SCALE = 1;
/* The composition's extent on the canvas: three columns (pile + roundtable /
   hot now + shipping wall / keepers) in a 48px margin. ~2.1:1, which is the
   shape of the band between the nameplate and the dock on a laptop, so the
   overview fits by width and spans the whole band instead of floating in the
   middle of it. */
export const BUILD_ROOM_OVERVIEW_RIGHT = 1998;
export const BUILD_ROOM_OVERVIEW_BOTTOM = 968;
export const BUILD_ROOM_CANVAS = { width: 2048, height: 1016 };

type Rect = [number, number, number, number];

/* Recognized demo placements (the seeded fixtures, plus every earlier pass of
   this composition that a canvas gesture may have saved) get the current
   composition. Other saved placements stay untouched. */
const BUILD_ROOM_LAYOUT: {
  type: Widget["type"];
  from: Rect[];
  to: Rect;
  data?: Record<string, unknown>;
}[] = [
  // column 1 — the pile
  { type: "frame", from: [[48, 64, 760, 420]], to: [48, 48, 850, 540] },
  { type: "linkPile", from: [[88, 148, 680, 300], [90, 142, 680, 300]], to: [80, 104, 780, 438] },
  // column 2 — hot now, five deep
  {
    type: "frame",
    from: [[850, 48, 700, 400], [936, 48, 620, 370], [936, 48, 620, 340]],
    to: [938, 48, 540, 540],
  },
  {
    type: "hotLinks",
    from: [[886, 112, 628, 300], [958, 84, 576, 306], [958, 80, 576, 306]],
    to: [960, 80, 496, 506],
    data: { limit: 5 },
  },
  // column 3 — keepers, two index cards stacked
  {
    type: "frame",
    from: [[850, 470, 700, 210], [936, 446, 620, 194], [936, 416, 620, 296]],
    to: [1518, 48, 480, 540],
  },
  {
    type: "note",
    from: [[886, 512, 320, 150], [862, 498, 320, 150], [958, 485, 276, 140], [958, 446, 276, 248]],
    to: [1540, 80, 436, 236],
  },
  {
    type: "note",
    from: [[1222, 512, 320, 150], [1218, 511, 320, 150], [1254, 485, 276, 140], [1254, 446, 276, 248]],
    to: [1540, 340, 436, 236],
  },
  // bottom row — roundtable under the pile, the shipping wall runs the rest
  {
    type: "frame",
    from: [[850, 705, 700, 310], [936, 668, 620, 278], [936, 742, 620, 302]],
    to: [48, 628, 850, 340],
  },
  {
    type: "roundtable",
    from: [[886, 752, 628, 250], [958, 704, 576, 228], [958, 774, 576, 256]],
    to: [70, 660, 806, 294],
  },
  { type: "frame", from: [[48, 570, 760, 380], [48, 626, 850, 320]], to: [938, 628, 1060, 340] },
  { type: "shipPost", from: [[84, 632, 222, 282], [72, 672, 254, 246]], to: [962, 674, 310, 280] },
  { type: "shipPost", from: [[328, 626, 222, 282], [356, 667, 254, 246]], to: [1313, 668, 310, 280] },
  { type: "shipPost", from: [[572, 634, 222, 282], [640, 674, 254, 246]], to: [1664, 676, 310, 280] },
];

export function withBuildRoomLayout(widget: Widget): Widget {
  const placement = BUILD_ROOM_LAYOUT.find(({ type, from }) =>
    widget.type === type &&
    from.some((old) =>
      [widget.x, widget.y, widget.w, widget.h].every((value, i) => value === old[i]),
    ),
  );
  if (!placement) return widget;
  const [x, y, w, h] = placement.to;
  return {
    ...widget,
    x,
    y,
    w,
    h,
    data: placement.data ? { ...widget.data, ...placement.data } : widget.data,
  };
}

/** Where the next kept takeaway lands: the keepers column holds two index
    cards; later ones fan off the bottom card so nothing lands on top of one. */
export function keeperNoteSlot(
  keepers: Pick<Widget, "x" | "y" | "w"> | undefined,
  slot: number,
) {
  const kx = keepers?.x ?? 1518;
  const ky = keepers?.y ?? 48;
  const w = (keepers?.w ?? 480) - 44;
  const fan = Math.max(0, slot - 1);
  return {
    x: kx + 22 + fan * 22,
    y: ky + 32 + Math.min(slot, 1) * 260 + fan * 28,
    w,
    h: 236,
  };
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
  /* Fit by width on a tall screen leaves slack under the composition; split it
     so the block sits centered in the band between nameplate and dock, capped
     so it never drifts toward the dock. */
  const slackY = Math.max(0, availableHeight - contentBottom * scale);
  viewport.style.setProperty(
    "--build-room-offset-y",
    `${Math.min(72, Math.round(slackY / 2))}px`,
  );
  return scale;
}

/** Seeded favorites get stable local art; scraped and dropped links keep theirs. */
export function withBuildRoomCover(link: BuildRoomLink): BuildRoomLink {
  const imageUrl = link.imageUrl || PINNED_LINK_COVERS[link.id];
  return imageUrl && imageUrl !== link.imageUrl ? { ...link, imageUrl } : link;
}
