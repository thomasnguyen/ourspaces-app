/* The no-Firecrawl arrival: what a dropped link looks like before and after
   the room "reads" it, faked on a timer. One source for mock mode (App.tsx)
   and the arrival lab (#/arrival), so the demo beat can't drift between them.
   The row's narration itself lives in ReadingRoom.tsx (arrivalStage). */
import type { BuildRoomLink, LinkKind } from "../data/buildroom";
import { cannedLinkQuestions } from "./linkQuestions";

export function mockLinkTitle(url: string) {
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "");
  /* Skip the segments that are routing, not a name (youtube's /watch,
     twitter's /status, an index page) — the domain reads better. */
  const segment =
    path
      .split("/")
      .filter((part) => part && !/^(watch|status|index|home|p|s|v|e|a)$/i.test(part))
      .pop() ?? "";
  const words = segment.replace(/\.\w+$/, "").replace(/[-_+]+/g, " ").trim();
  const domain = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  /* An id-shaped last segment (no vowels, long) is not a title either. */
  return /^[\w]{6,}$/.test(words) && !/[aeiou]/i.test(words.slice(1)) ? domain : words || domain;
}

/** The kind verdict, guessed off the host so the mock beat still snaps a
    real-looking classification into the row. */
export function mockLinkKind(url: string): LinkKind {
  const host = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  if (/github\.com|gitlab\.com/.test(host)) {
    return path.split("/").filter(Boolean).length >= 2 ? "repo" : "tool";
  }
  if (/youtu\.?be|vimeo\.com|loom\.com/.test(host)) return "video";
  if (/news\.ycombinator|reddit\.com|lobste\.rs|x\.com|twitter\.com|bsky/.test(host)) {
    return "discussion";
  }
  if (/^docs\.|\/docs?(\/|$)|readthedocs|developer\./.test(host + path)) return "docs";
  if (/producthunt|\.app$|\.tools?$/.test(host)) return "tool";
  return "article";
}

export function pendingLinkRows(
  urls: string[],
  droppedBy: string,
  droppedByName: string,
  now = Date.now(),
): BuildRoomLink[] {
  const batchKey = `mock-drop-${now}`;
  return urls.map((url, index) => ({
    id: `${batchKey}-${index}`,
    url,
    domain: url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0],
    title: "",
    description: "",
    imageUrl: "",
    kind: "article",
    whyItMatters: "",
    questions: [],
    status: "pending",
    batchKey,
    droppedBy,
    droppedByName,
    droppedAt: now,
    voters: [],
  }));
}

export function mockResolvedPatch(link: BuildRoomLink): Partial<BuildRoomLink> {
  const title = mockLinkTitle(link.url);
  return {
    status: "ready",
    kind: mockLinkKind(link.url),
    title,
    description: "fresh drop — you're the first here. tell the room why it matters.",
    whyItMatters: "",
    questions: cannedLinkQuestions(title),
  };
}

export const MOCK_RESOLVE_BASE_MS = 6300;
export const MOCK_RESOLVE_STEP_MS = 520;

/** Each link resolves on its own clock (they genuinely do live: separate
    scrapes, separate latencies), so a six-link paste deals out instead of
    flipping as one wall. Returns a cancel. */
export function scheduleMockResolve(
  rows: BuildRoomLink[],
  apply: (id: string, patch: Partial<BuildRoomLink>) => void,
  options: { scale?: number; failIds?: Set<string> } = {},
) {
  const scale = options.scale ?? 1;
  const timers = rows.map((link, index) =>
    window.setTimeout(
      () =>
        apply(
          link.id,
          options.failIds?.has(link.id)
            ? { status: "failed", title: link.domain }
            : mockResolvedPatch(link),
        ),
      (MOCK_RESOLVE_BASE_MS + index * MOCK_RESOLVE_STEP_MS + Math.random() * 400) * scale,
    ),
  );
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}
