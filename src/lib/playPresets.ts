/**
 * Play-lab presets (docs/local/play-lab.md). On /#/play a picker drop arrives
 * already filled in like the showcase rooms' widgets — the crew's first, then
 * the other seeded rooms for kinds the crew doesn't have — size and tilt
 * included, so a blank room can be rebuilt by hand and look like the room
 * everyone has seen. Two tweaks for the take: the poll starts with no votes
 * (her matcha tap is the first), the potluck has exactly one slot open (her
 * claim fires ALL SET).
 */
import {
  BUILD_ROOM_WIDGETS,
  COUPLE_WIDGETS,
  CREW_WIDGETS,
  HOUSE_WIDGETS,
  LEAGUE_WIDGETS,
} from "../data/spaces";
import type { Widget, WidgetType } from "../data/types";

export type PlayPreset = Pick<Widget, "w" | "h" | "rotate" | "data">;

const SOURCES: Widget[][] = [
  CREW_WIDGETS,
  COUPLE_WIDGETS,
  HOUSE_WIDGETS,
  LEAGUE_WIDGETS,
  BUILD_ROOM_WIDGETS,
];

export function playPresetFor(type: WidgetType): PlayPreset | null {
  for (const source of SOURCES) {
    const hit = source.find((widget) => widget.type === type);
    if (hit) return tweak(type, hit);
  }
  return null;
}

function tweak(type: WidgetType, widget: Widget): PlayPreset {
  const data = structuredClone(widget.data) as Record<string, unknown>;
  if (type === "poll" && Array.isArray(data.options)) {
    data.options = (data.options as Record<string, unknown>[]).map((option) => ({
      ...option,
      votes: 0,
      total: 0,
      voters: [],
    }));
    data.waitingOn = [];
  }
  if (type === "potluck" && Array.isArray(data.items)) {
    let open = 0;
    data.items = (data.items as { name: string; by?: string | null; claimed: boolean }[]).map(
      (item) => {
        if (item.claimed) return item;
        open += 1;
        return open === 1 ? item : { ...item, by: "Rio", claimed: true };
      },
    );
    data.openCount = Math.min(open, 1);
  }
  return { w: widget.w, h: widget.h, rotate: widget.rotate, data };
}
