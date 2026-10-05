import type { SpaceMember, Widget } from "../data/types";

export type PollRow = { userId: string; optionId: string; voterName: string };

/* One poll's stored votes folded into its card: your row becomes the
   selection, everyone else's the tallies, names and who's still out. Fed by
   `votes.inSpace` (every poll in the room, one subscription), so a vote on
   the second poll repaints on every screen, not only the first. */
export function mergePollRows(
  widget: Widget,
  rows: PollRow[] | undefined,
  userId: string,
  members: SpaceMember[],
): Widget {
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
}
