import type { Widget, WidgetType } from "../data/types";

/** Containers and widgets that already ARE conversation do not open a thread focus. */
export const THREADLESS_WIDGET_TYPES: WidgetType[] = [
  "frame",
  "sticker",
  "chat",
  "messageWall",
  "dualClock",
  "cozyColor",
  "linkPile",
  "hotLinks",
];

export function widgetSupportsThread(widget: Widget): boolean {
  return !THREADLESS_WIDGET_TYPES.includes(widget.type);
}
