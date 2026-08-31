import type { BuildRoomLink, LinkKind } from "../data/buildroom";

/** Hot Now's score. Discussion is worth less than a vote but more than nothing. */
export function linkScore(link: BuildRoomLink, replies: number) {
  return link.voters.length * 3 + replies * 2;
}

/** Pinned first (a human overrode the ranking), then score, then newest. */
export function rankLinks(
  links: BuildRoomLink[],
  replyCounts: Record<string, number> = {},
): BuildRoomLink[] {
  return [...links].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const delta = linkScore(b, replyCounts[b.id] ?? 0) - linkScore(a, replyCounts[a.id] ?? 0);
    if (delta !== 0) return delta;
    return b.droppedAt - a.droppedAt;
  });
}

export type PileCounts = {
  total: number;
  today: number;
  discussed: number;
  kept: number;
  enriching: number;
};

const DAY_MS = 86_400_000;

export function pileCounts(
  links: BuildRoomLink[],
  replyCounts: Record<string, number> = {},
): PileCounts {
  const now = Date.now();
  return {
    total: links.length,
    today: links.filter((link) => now - link.droppedAt < DAY_MS).length,
    discussed: links.filter((link) => (replyCounts[link.id] ?? 0) > 0).length,
    kept: links.filter((link) => link.keptAt !== undefined).length,
    enriching: links.filter((link) => link.status === "pending").length,
  };
}

/** Flat identity colors for the monogram tiles — no gradients, house rule. */
const KIND_TONES: Record<LinkKind, string> = {
  article: "#7853ff",
  video: "#e9369d",
  repo: "#111114",
  discussion: "#13b8a6",
  tool: "#3f70ff",
  docs: "#ffb02e",
};

export function kindTone(kind: string) {
  return KIND_TONES[kind as LinkKind] ?? KIND_TONES.article;
}

/** Kind, plus a second read (code / reference / …) and the host. */
const KIND_TAG: Record<LinkKind, string | null> = {
  article: null,
  video: "watch",
  repo: "code",
  discussion: "thread",
  tool: "tooling",
  docs: "reference",
};

export function linkTags(link: { kind: string; domain: string }): string[] {
  const kind = (link.kind in KIND_TAG ? link.kind : "article") as LinkKind;
  const host = link.domain
    .replace(/^(www|blog|docs|news)\./, "")
    .split(".")[0]
    ?.toLowerCase();
  return [...new Set([kind, KIND_TAG[kind], host].filter(Boolean) as string[])].slice(
    0,
    4,
  );
}

/** Is this tag the link's kind, and so worth wearing the kind's color? */
export function isKindTag(tag: string): tag is LinkKind {
  return tag in KIND_TONES;
}

export function linkHasTag(link: BuildRoomLink, tag: string) {
  return link.status === "ready" && linkTags(link).includes(tag);
}

/** Chips for the pile's filter row: kinds first — a stable vocabulary the room
    learns — then the hosts that show up most. Kind synonyms ("watch" for video)
    drop out; they'd be a second chip with an identical count and result. */
export function tagFacets(links: BuildRoomLink[], limit = 6) {
  const synonyms = new Set(Object.values(KIND_TAG).filter(Boolean) as string[]);
  const counts = new Map<string, number>();
  for (const link of links) {
    if (link.status !== "ready") continue;
    for (const tag of linkTags(link)) {
      if (synonyms.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort(
      (a, b) =>
        Number(isKindTag(b.tag)) - Number(isKindTag(a.tag)) ||
        b.count - a.count ||
        a.tag.localeCompare(b.tag),
    )
    .slice(0, limit);
}

/** Hook + room take, when they differ — reads as 2–3 lines in the circle. */
export function linkSummary(link: { description: string; whyItMatters: string }) {
  const why = link.whyItMatters.trim();
  const desc = link.description.trim();
  if (why && desc && why !== desc) return `${desc} ${why}`;
  return why || desc;
}

export function linkMonogram(link: { domain: string; title: string }) {
  return (link.domain.replace(/^(www|blog|docs|news)\./, "")[0] ?? "•").toUpperCase();
}

/* Cover stand-ins are tinted per domain so a run of three articles doesn't
   render as three identical squares. Flat identity colors only. */
const TILE_TONES = ["#7853ff", "#e9369d", "#3f70ff", "#13b8a6", "#ffb02e", "#ff7c42"];

export function linkTone(link: { domain: string }) {
  let hash = 0;
  for (const char of link.domain) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length];
}
