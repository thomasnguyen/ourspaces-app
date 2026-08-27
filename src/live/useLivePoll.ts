import { useQuery } from "convex-helpers/react/cache";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { SpaceMember, Widget } from "../data/types";

export function useLivePoll(widget: Widget, userId: string, members: SpaceMember[]) {
  const rows = useQuery(api.votes.getResults, widget.id ? { widgetId: widget.id as never } : "skip");
  return useMemo(() => {
    const options = Array.isArray(widget.data.options)
      ? widget.data.options as Record<string, unknown>[]
      : [];
    const mine = rows?.find((row) => row.userId === userId);
    const others = rows?.filter((row) => row.userId !== userId) ?? [];
    const merged = options.map((option) => {
      const voters = others
        .filter((row) => row.optionId === option.id)
        .map((row) => row.voterName);
      return { ...option, votes: voters.length, total: others.length, voters };
    });
    const waitingOn = members
      .map((member) => member.name)
      .filter(
        (name) =>
          !others.some((row) => row.voterName === name) && name !== "You",
      );
    return {
      ...widget,
      data: {
        ...widget.data,
        options: merged,
        waitingOn,
        selectedOptionId: mine?.optionId,
      },
    };
  }, [members, rows, userId, widget]);
}
