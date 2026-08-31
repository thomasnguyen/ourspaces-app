import { BUILD_ROOM_LINKS, type BuildRoomLink } from "../data/buildroom";
import { getThreadsForSpace } from "../data/chat";
import { getSpace } from "../data/spaces";
import type { Widget } from "../data/types";
import type { BuildRoomFeed, RoundtableReply } from "../widgets/buildroom";

/** `<pileWidgetId>::link:<linkId>` — link discussion rides the message pipes. */
export function linkThreadId(pileWidgetId: string, linkId: string) {
  return `${pileWidgetId}::link:${linkId}`;
}

export function linkQuestionThreadId(
  pileWidgetId: string,
  linkId: string,
  questionId: string,
) {
  return `${linkThreadId(pileWidgetId, linkId)}::q:${questionId}`;
}

const LINK_THREAD_RE = /::link:([^:]+?)(?:::q:.+)?$/;

/** Roll a flat `threadId -> count` map up into per-link reply counts. */
export function linkReplyCounts(
  counts: Record<string, number>,
): Record<string, number> {
  const byLink: Record<string, number> = {};
  for (const [threadId, count] of Object.entries(counts)) {
    const match = LINK_THREAD_RE.exec(threadId);
    if (match) byLink[match[1]] = (byLink[match[1]] ?? 0) + count;
  }
  return byLink;
}

/* ── link state ───────────────────────────────────────────────────────────
 * Votes, pins and keeps live in the pile widget's own `data.linkState`, and
 * runtime drops live in `data.dropped`. Both ride the existing
 * `widgets.updateWidgetData` mutation, so the whole room is reactive and
 * multiplayer with no schema change. Swapping to a `links` table later only
 * has to keep producing a `BuildRoomLink[]`.
 */

export type LinkState = {
  voters?: string[];
  pinned?: boolean;
  keptAt?: number;
  keptWidgetId?: string;
};

export type PileData = {
  linkState?: Record<string, LinkState>;
  dropped?: BuildRoomLink[];
};

export function readPileData(widget?: Widget | null): PileData {
  const data = (widget?.data ?? {}) as PileData;
  return {
    linkState:
      data.linkState && typeof data.linkState === "object" ? data.linkState : {},
    dropped: Array.isArray(data.dropped) ? data.dropped : [],
  };
}

/** Fixture links + anything dropped at runtime, with live state folded in. */
export function pileLinks(widget?: Widget | null): BuildRoomLink[] {
  const { linkState = {}, dropped = [] } = readPileData(widget);
  return [...dropped, ...BUILD_ROOM_LINKS].map((link) => {
    const state = linkState[link.id];
    if (!state) return link;
    return {
      ...link,
      voters: state.voters ?? link.voters,
      pinned: state.pinned ?? link.pinned,
      keptAt: state.keptAt ?? link.keptAt,
    };
  });
}

/** Toggle one person's vote, seeding from the fixture count on first touch. */
export function toggledVoters(link: BuildRoomLink, userId: string): string[] {
  return link.voters.includes(userId)
    ? link.voters.filter((voter) => voter !== userId)
    : [...link.voters, userId];
}

export function buildRoomFeedFrom(
  links: BuildRoomLink[],
  replyCounts: Record<string, number>,
  members: { name: string; color?: string; avatarUrl?: string }[],
): BuildRoomFeed {
  return { links, replyCounts, faces: members };
}

/** Mock-mode feed: fixtures plus the thread fixtures' reply counts. */
export function mockBuildRoomFeed(spaceId: string): BuildRoomFeed | undefined {
  if (spaceId !== "buildroom") return undefined;
  const counts: Record<string, number> = {};
  for (const [threadId, thread] of Object.entries(getThreadsForSpace(spaceId))) {
    counts[threadId] = thread.messages.length;
  }
  return buildRoomFeedFrom(
    BUILD_ROOM_LINKS,
    linkReplyCounts(counts),
    getSpace(spaceId).members,
  );
}

/** Inline reply previews for every roundtable card in the space. */
export function mockRoundtableReplies(
  spaceId: string,
): Record<string, RoundtableReply[]> {
  if (spaceId !== "buildroom") return {};
  const space = getSpace(spaceId);
  const members = new Map(space.members.map((member) => [member.name, member.color]));
  const threads = getThreadsForSpace(spaceId);
  const out: Record<string, RoundtableReply[]> = {};
  for (const widget of space.widgets) {
    if (widget.type !== "roundtable") continue;
    const thread = threads[widget.id];
    if (!thread) continue;
    out[widget.id] = thread.messages.map((message) => ({
      id: message.id,
      from: message.from,
      fromColor: message.fromColor ?? members.get(message.from),
      fromAvatarUrl: message.fromAvatarUrl,
      text: message.text,
      time: message.time,
    }));
  }
  return out;
}
