import { getGlobalThread, getThreadsForSpace } from "../data/chat";
import { SPACES_BY_ID } from "../data/spaces";
import type { Widget } from "../data/types";

export type BackendCount = {
  label: string;
  value: number;
};

export function computeBackendCounts({
  addedWidgets,
  deletedWidgetIds,
  hereNowOverride,
}: {
  addedWidgets: Record<string, Widget[]>;
  deletedWidgetIds: Record<string, string[]>;
  hereNowOverride?: number;
}): BackendCount[] {
  let widgetCount = 0;
  let messageCount = 0;
  let hereNow = 0;

  for (const [spaceId, space] of Object.entries(SPACES_BY_ID)) {
    const deleted = new Set(deletedWidgetIds[spaceId] ?? []);
    widgetCount += space.widgets.filter((widget) => !deleted.has(widget.id)).length;
    widgetCount += (addedWidgets[spaceId] ?? []).length;

    messageCount += getGlobalThread(spaceId).messages.length;
    for (const thread of Object.values(getThreadsForSpace(spaceId))) {
      messageCount += thread.messages.length;
    }

    hereNow += space.members.filter((member) => member.online).length;
  }

  return [
    { label: "spaces", value: Object.keys(SPACES_BY_ID).length },
    { label: "widgets", value: widgetCount },
    { label: "messages", value: messageCount },
    { label: "here now", value: hereNowOverride ?? hereNow },
  ];
}
