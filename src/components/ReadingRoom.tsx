import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BuildRoomLink } from "../data/buildroom";
import { linkQuestionThreadId, linkThreadId } from "../lib/buildRoomFeed";
import {
  isKindTag,
  kindTone,
  linkHasTag,
  linkMonogram,
  linkSummary,
  linkTags,
  linkTone,
  rankLinks,
  tagFacets,
} from "../lib/linkRanking";
import { playSound } from "../lib/sounds";
import { CanvasRoom, type RoomOrigin } from "./CanvasRoom";
import { MemberFace } from "./MemberFace";

export type RoomReply = {
  id: string;
  from: string;
  color?: string;
  avatarUrl?: string;
  text: string;
  time?: string;
};

type Filter = "all" | "new" | "hot" | "discussed" | "kept";

const DAY_MS = 86_400_000;
const FIRST_PAGE = 15;
/* Two drops by the same person within this window read as one run. */
const RUN_GAP_MS = 30 * 60_000;
const LINK_CARD_FALLBACK = "/assets/link-card-fallback.jpg";
/* How long a freshly resolved row keeps its "printing" choreography. */
const LANDING_MS = 1800;

/* ── arrival stages ──────────────────────────────────────────────────────
 * A pending row narrates what the room is doing with it, in the slot the
 * title will fill — so the resolve is a swap, not a reflow. The steps are
 * the real ones: Firecrawl renders the page in a browser, keeps the main
 * content, converts it to text, summarises it, and runs an LLM extract for
 * title / summary / site / author / date / cover; then the room decides the
 * kind and files it. The clock is the row's own `droppedAt`, which makes the
 * beat identical in mock and live mode: live just holds on the last step
 * until Firecrawl comes back.
 */
export const ARRIVAL_STEPS: { label: (link: BuildRoomLink) => string; detail: string }[] = [
  { label: (link) => `fetching ${link.domain}`, detail: "asking the site for the page" },
  { label: () => "rendering it", detail: "loading it like a browser — scripts, lazy images, all of it" },
  { label: () => "keeping the article", detail: "dropping the nav, the ads, the footer" },
  { label: () => "reading it", detail: "turning the page into plain text" },
  { label: () => "pulling out the facts", detail: "title, one-line summary, site, author, date, cover" },
  { label: () => "deciding what it is", detail: "article, repo, video, docs, tool or discussion" },
];

const STEP_AT_MS = [0, 450, 950, 1450, 2000, 2600];
const SLOW_AFTER_MS = 8000;

export function arrivalStage(link: BuildRoomLink, now: number, scale = 1): number {
  const age = (now - link.droppedAt) / scale;
  let stage = 0;
  for (let index = 0; index < STEP_AT_MS.length; index += 1) {
    if (age >= STEP_AT_MS[index]) stage = index;
  }
  return stage;
}

export function arrivalSlow(link: BuildRoomLink, now: number, scale = 1) {
  return (now - link.droppedAt) / scale >= SLOW_AFTER_MS;
}

export function arrivalLabel(link: BuildRoomLink, stage: number, slow: boolean) {
  return slow ? "slow page — still reading" : ARRIVAL_STEPS[stage].label(link);
}

export function arrivalDetail(stage: number, slow: boolean) {
  return slow ? "hanging on — the page is taking its time" : ARRIVAL_STEPS[stage].detail;
}

function relDrop(at: number) {
  const minutes = Math.max(1, Math.round((Date.now() - at) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/** Pull every http(s) URL out of a paste — one per line, comma'd, or prose. */
export function parseDroppedUrls(raw: string): string[] {
  const found = raw.match(/https?:\/\/[^\s,)"']+/gi) ?? [];
  const bare = raw
    .split(/[\s,]+/)
    .filter((token) => /^[\w-]+(\.[\w-]+)+\//.test(token) || /^[\w-]+\.[a-z]{2,}$/i.test(token))
    .map((token) => `https://${token}`);
  return [...new Set([...found, ...bare])].slice(0, 10);
}

export function ReadingRoom({
  pileId,
  links,
  replyCounts,
  messagesByThread,
  faces,
  userId,
  origin,
  initialLinkId,
  onDrop,
  onVote,
  onPin,
  onKeep,
  onReply,
  onRetry,
  onSearch,
  onCrawl,
  onZone,
  onClose,
  clockScale = 1,
  followDrops = false,
  extra,
}: {
  pileId: string;
  links: BuildRoomLink[];
  replyCounts: Record<string, number>;
  messagesByThread: Record<string, RoomReply[]>;
  faces: { name: string; color?: string; avatarUrl?: string }[];
  userId: string;
  origin?: RoomOrigin;
  initialLinkId?: string;
  onDrop?: (urls: string[]) => void;
  onVote?: (linkId: string) => void;
  onPin?: (linkId: string) => void;
  onKeep?: (linkId: string) => void;
  onReply?: (threadId: string, text: string) => void;
  onRetry?: (linkId: string) => void;
  onSearch?: (query: string) => void;
  onCrawl?: (url: string) => void;
  onZone?: (x: number, y: number, zone?: string) => void;
  onClose: () => void;
  /** Slow-mo for the arrival lab: stretches the stage clock (CSS side is
      the `--arrival-slow` custom property). */
  clockScale?: number;
  /** Follow every own drop into the circle, not just the drop bar's (the lab
      drops from its own pill). */
  followDrops?: boolean;
  /** Lab chrome rendered inside the room's top layer. */
  extra?: ReactNode;
}) {
  const ranked = useMemo(() => rankLinks(links, replyCounts), [links, replyCounts]);
  const hotIds = useMemo(
    () => new Set(ranked.slice(0, 5).map((link) => link.id)),
    [ranked],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mobileReading, setMobileReading] = useState(Boolean(initialLinkId));
  const [selectedId, setSelectedId] = useState(
    () => initialLinkId ?? ranked[0]?.id ?? "",
  );
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [paste, setPaste] = useState("");
  const [research, setResearch] = useState("");
  const closeRoomRef = useRef<(() => void) | null>(null);

  /* The arrival clock only ticks while a row is mid-story. */
  const enriching = links.filter((link) => link.status === "pending").length;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (enriching === 0) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(id);
  }, [enriching]);

  /* pending → ready flips get a landing window: the fields print in one at a
     time instead of all popping on the same frame. Works on both paths —
     mock resolves on a timer, live resolves when the Firecrawl patch lands. */
  const statusRef = useRef<Map<string, BuildRoomLink["status"]>>(new Map());
  const [landing, setLanding] = useState<Set<string>>(() => new Set());
  /* Your own drop takes the reading circle with it: the row on the left and
     the circle on the right tell the same story, then the circle becomes
     the card. Armed by the drop bar, spent by the first row it produces. */
  const followRef = useRef(false);
  useEffect(() => {
    const seen = statusRef.current;
    const landed: string[] = [];
    for (const link of links) {
      const before = seen.get(link.id);
      if (before === "pending" && link.status !== "pending") landed.push(link.id);
      if (
        before === undefined &&
        link.status === "pending" &&
        link.droppedBy === userId &&
        (followRef.current || followDrops)
      ) {
        followRef.current = false;
        setSelectedId(link.id);
      }
      seen.set(link.id, link.status);
    }
    if (landed.length === 0) return;
    setLanding((current) => new Set([...current, ...landed]));
    playSound("place");
    const id = window.setTimeout(
      () =>
        setLanding((current) => {
          const next = new Set(current);
          for (const linkId of landed) next.delete(linkId);
          return next;
        }),
      LANDING_MS,
    );
    return () => window.clearTimeout(id);
  }, [links]);

  const matches = (link: BuildRoomLink, cut: Filter) => {
    switch (cut) {
      case "new":
        return Date.now() - link.droppedAt < DAY_MS;
      case "hot":
        return hotIds.has(link.id);
      case "discussed":
        return (replyCounts[link.id] ?? 0) > 0;
      case "kept":
        return link.keptAt !== undefined;
      default:
        return true;
    }
  };

  /* The tag is the outer cut — what a link is about, before when it landed —
     so the new/hot/kept counts below it describe the tagged pile, not all 47. */
  const tagged = useMemo(
    () => (tag ? links.filter((link) => linkHasTag(link, tag)) : links),
    [links, tag],
  );

  /* A tag picked off a card in the circle can be one the row doesn't rank
     (a synonym, a rare host) — carry it in anyway, or there's no way to undo it. */
  const facets = useMemo(() => {
    const top = tagFacets(links);
    if (tag && !top.some((facet) => facet.tag === tag)) {
      return [{ tag, count: tagged.length }, ...top.slice(0, top.length - 1)];
    }
    return top;
  }, [links, tag, tagged.length]);

  const counts = useMemo(
    () => ({
      all: tagged.length,
      new: tagged.filter((link) => matches(link, "new")).length,
      hot: tagged.filter((link) => matches(link, "hot")).length,
      discussed: tagged.filter((link) => matches(link, "discussed")).length,
      kept: tagged.filter((link) => matches(link, "kept")).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hotIds, replyCounts, tagged],
  );
  const visible = useMemo(
    () => tagged.filter((link) => matches(link, filter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, hotIds, replyCounts, tagged],
  );

  const pickTag = (next: string) => {
    const value = tag === next ? null : next;
    setTag(value);
    /* Never strand the room on an empty list: a tag with nothing under the
       current cut drops back to all. */
    if (value && !links.some((link) => linkHasTag(link, value) && matches(link, filter))) {
      setFilter("all");
    }
    playSound("tap");
  };

  /* Links land one at a time. Stitch consecutive drops by the same person
     into a run, so the feed reads as people sharing — not pastes landing. */
  const runs = useMemo(() => {
    const sorted = [...visible].sort((a, b) => b.droppedAt - a.droppedAt);
    const out: BuildRoomLink[][] = [];
    for (const link of sorted) {
      const run = out[out.length - 1];
      if (
        run &&
        run[0].droppedBy === link.droppedBy &&
        run[run.length - 1].droppedAt - link.droppedAt < RUN_GAP_MS
      ) {
        run.push(link);
      } else {
        out.push([link]);
      }
    }
    return out;
  }, [visible]);

  const { shown, hidden } = useMemo(() => {
    if (expanded || visible.length <= FIRST_PAGE) {
      return { shown: runs, hidden: 0 };
    }
    const out: BuildRoomLink[][] = [];
    let budget = FIRST_PAGE;
    for (const run of runs) {
      if (budget <= 0) break;
      out.push(run.slice(0, budget));
      budget -= run.length;
    }
    return { shown: out, hidden: visible.length - Math.min(FIRST_PAGE, visible.length) };
  }, [expanded, runs, visible.length]);

  /* Entrance stagger flows down the page, so each run needs to know how many
     rows precede it — a per-run index would restart the cascade at every card. */
  const runOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const run of shown) {
      offsets.push(acc);
      acc += run.length;
    }
    return offsets;
  }, [shown]);

  const selected = links.find((link) => link.id === selectedId) ?? ranked[0] ?? null;

  /* A filter that hides the open link should move the reading circle, not
     leave it showing something that's no longer in the list. */
  useEffect(() => {
    if (visible.length === 0) return;
    if (!visible.some((link) => link.id === selectedId)) setSelectedId(visible[0].id);
  }, [selectedId, visible]);

  useEffect(() => setActiveQuestion(null), [selectedId]);

  const threadId = selected
    ? activeQuestion
      ? linkQuestionThreadId(pileId, selected.id, activeQuestion)
      : linkThreadId(pileId, selected.id)
    : "";
  const replies = messagesByThread[threadId] ?? [];
  const selectedStage =
    selected?.status === "pending" ? arrivalStage(selected, now, clockScale) : null;
  const selectedSlow = Boolean(selected && selectedStage !== null && arrivalSlow(selected, now, clockScale));

  const dropCount = parseDroppedUrls(paste).length;

  const submitDrop = () => {
    const urls = parseDroppedUrls(paste);
    if (urls.length === 0) return;
    playSound("place");
    followRef.current = true;
    setFilter("all");
    setTag(null);
    onDrop?.(urls);
    setPaste("");
  };

  const submitReply = () => {
    const text = draft.trim();
    if (!text || !threadId) return;
    playSound("place");
    onReply?.(threadId, text);
    setDraft("");
  };

  return (
    <CanvasRoom
      className={`reading-room${mobileReading ? " is-mobile-reading" : ""}`}
      origin={origin}
      label="back to the build room"
      closeRef={closeRoomRef}
      onClose={onClose}
    >
      <nav className="rr-mobile-switch" aria-label="Reading room view">
        <button type="button" aria-pressed={!mobileReading} onClick={() => setMobileReading(false)}>
          all links
        </button>
        <button type="button" aria-pressed={mobileReading} onClick={() => setMobileReading(true)}>
          reading circle
        </button>
      </nav>
      <div
        className="reading-room-body"
        onPointerMove={
          onZone && selected
            ? (event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onZone(
                  (event.clientX - rect.left) / Math.max(1, rect.width),
                  (event.clientY - rect.top) / Math.max(1, rect.height),
                  `pile:${selected.id}`,
                );
              }
            : undefined
        }
      >
        <section className="rr-list" aria-label="Every link in the pile">
          <header className="rr-head">
            <h2>
              the pile <i aria-hidden="true">·</i> <span>{links.length} links</span>
            </h2>

            <div className="rr-drop">
              <form
                className="rr-drop-bar"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitDrop();
                }}
              >
                <span className="rr-drop-clip" aria-hidden="true">
                  ⌇
                </span>
                <input
                  value={paste}
                  onChange={(event) => setPaste(event.target.value)}
                  placeholder="paste a link…"
                />
                <button type="submit" disabled={dropCount === 0}>
                  {dropCount > 1 ? `drop ${dropCount}` : "drop it"}
                </button>
              </form>
              {(onSearch || onCrawl) && (
                <form
                  className="rr-drop-bar rr-research-bar"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = research.trim();
                    if (!value) return;
                    playSound("place");
                    onSearch?.(value);
                    setResearch("");
                  }}
                >
                  <span className="rr-drop-clip" aria-hidden="true">
                    🔎
                  </span>
                  <input
                    value={research}
                    onChange={(event) => setResearch(event.target.value)}
                    placeholder="research a topic, or a site to crawl…"
                  />
                  {onSearch && (
                    <button type="submit" disabled={research.trim().length === 0}>
                      research
                    </button>
                  )}
                  {onCrawl && (
                    <button
                      type="button"
                      className="rr-crawl-btn"
                      disabled={research.trim().length === 0}
                      onClick={() => {
                        const value = research.trim();
                        if (!value) return;
                        playSound("place");
                        onCrawl(value);
                        setResearch("");
                      }}
                    >
                      crawl
                    </button>
                  )}
                </form>
              )}
            </div>
          </header>

          {facets.length > 0 && (
            <nav className="rr-tag-filters" aria-label="Filter the pile by tag">
              {facets.map((facet, index) => {
                const kind = isKindTag(facet.tag);
                return (
                  <button
                    key={facet.tag}
                    type="button"
                    className={`${kind ? "is-kind" : ""}${tag === facet.tag ? " is-on" : ""}`}
                    style={
                      {
                        "--i": index,
                        ...(kind ? { "--kind": kindTone(facet.tag) } : null),
                      } as CSSProperties
                    }
                    onClick={() => pickTag(facet.tag)}
                  >
                    {facet.tag}
                    <b>{facet.count}</b>
                  </button>
                );
              })}
            </nav>
          )}

          <nav className="rr-filters">
            {(
              [
                ["all", "all"],
                ["new", "new"],
                ["hot", "🔥 hot"],
                ["discussed", "discussed"],
                ["kept", "kept"],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? "is-active" : ""}
                onClick={() => {
                  setFilter(id);
                  playSound("tap");
                }}
              >
                {label}
                <b>{counts[id]}</b>
              </button>
            ))}
          </nav>

          <div className="rr-scroll">
            {shown.map((run, runIndex) => (
              <article
                key={run[0].id}
                className="rr-run"
                style={{ "--i": runOffsets[runIndex] } as CSSProperties}
              >
                <header className="rr-run-head">
                  <MemberFace name={run[0].droppedByName} size="sm" />
                  <span>
                    <strong>{run[0].droppedByName.toLowerCase()}</strong>
                    {run.length > 1 && <b> · {run.length} links</b>}
                  </span>
                  <i aria-hidden="true">·</i>
                  <em>{relDrop(run[0].droppedAt)}</em>
                </header>

                <ul className="rr-rows">
                  {run.map((link, index) => {
                    const pending = link.status === "pending";
                    const stage = pending ? arrivalStage(link, now, clockScale) : null;
                    const slow = pending && arrivalSlow(link, now, clockScale);
                    return (
                    <li
                      key={link.id}
                      className={`rr-row${link.id === selectedId ? " is-selected" : ""}${
                        pending ? " is-pending" : ""
                      }${link.status === "failed" ? " is-failed" : ""}${
                        landing.has(link.id) ? " is-landing" : ""
                      }`}
                      data-stage={stage ?? undefined}
                      data-slow={slow || undefined}
                      style={{ "--i": runOffsets[runIndex] + index } as CSSProperties}
                    >
                      <button
                        type="button"
                        className="rr-row-open"
                        onClick={() => {
                          setSelectedId(link.id);
                          setMobileReading(true);
                          playSound("tap");
                        }}
                      >
                        <span
                          className="rr-row-tile"
                          style={{ background: linkTone(link) }}
                          aria-hidden="true"
                        >
                          {link.imageUrl ? (
                            <img src={link.imageUrl} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            <i>{linkMonogram(link)}</i>
                          )}
                          {pending && <b className="rr-row-scan" />}
                        </span>
                        <span className="rr-row-title">
                          {stage !== null ? (
                            <strong className="rr-row-stage" key={`${stage}-${slow}`}>
                              {arrivalLabel(link, stage, slow)}
                              <i className="rr-row-caret" />
                            </strong>
                          ) : (
                            <strong>{link.title || link.domain}</strong>
                          )}
                          <em>
                            {link.domain}
                            {link.status === "ready" && (
                              <b
                                className="rr-row-kind"
                                style={{ "--kind": kindTone(link.kind) } as CSSProperties}
                              >
                                {link.kind}
                              </b>
                            )}
                            {stage !== null && (
                              <b className="rr-row-steps" aria-hidden="true">
                                {ARRIVAL_STEPS.map((_, step) => (
                                  <i key={step} />
                                ))}
                              </b>
                            )}
                          </em>
                        </span>
                        <span className="rr-row-desc">
                          {stage !== null
                            ? arrivalDetail(stage, slow)
                            : link.status === "failed"
                              ? "couldn't read that page — kept the link"
                              : link.description}
                        </span>
                      </button>

                      <span className="rr-row-counts">
                        <button
                          type="button"
                          className={`rr-vote${link.voters.includes(userId) ? " is-mine" : ""}`}
                          onClick={() => {
                            onVote?.(link.id);
                            playSound("tap");
                          }}
                        >
                          <i aria-hidden="true">↑</i>
                          {link.voters.length}
                        </button>
                        <span className="rr-replies">
                          <i aria-hidden="true">▤</i>
                          {replyCounts[link.id] ?? 0}
                        </span>
                      </span>

                      {link.status === "failed" && (
                        <button
                          type="button"
                          className="rr-retry"
                          onClick={() => onRetry?.(link.id)}
                        >
                          retry
                        </button>
                      )}
                      {hotIds.has(link.id) && (
                        <span className="rr-hot-flag" title="hot right now">
                          🔥
                        </span>
                      )}
                      {link.keptAt !== undefined && (
                        <span className="rr-kept-flag" title="kept">
                          ✦
                        </span>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </article>
            ))}

            {hidden > 0 && (
              <button
                type="button"
                className="rr-more"
                onClick={() => {
                  setExpanded(true);
                  playSound("tap");
                }}
              >
                show {hidden} more links <span aria-hidden="true">⌄</span>
              </button>
            )}

            {visible.length === 0 && (
              <p className="rr-empty">
                {tag ? `nothing tagged ${tag} here — try another tag.` : "nothing here yet — try another filter."}
              </p>
            )}
          </div>
        </section>

        {selected && (
          <aside
            className={`rr-circle${selected.status === "pending" ? " is-pending" : ""}${
              landing.has(selected.id) ? " is-landing" : ""
            }`}
            aria-label="Reading circle"
          >
            <header className="rr-circle-head">
              <h3>reading circle</h3>
              <span className="rr-circle-faces">
                {faces.slice(0, 5).map((face) => (
                  <MemberFace
                    key={face.name}
                    name={face.name}
                    color={face.color}
                    avatarUrl={face.avatarUrl}
                    size="sm"
                  />
                ))}
                {faces.length > 5 && <b>+{faces.length - 5}</b>}
              </span>
            </header>

            <div className="rr-circle-scroll">
              <a
                className="rr-hero"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="rr-hero-text">
                  <em className="rr-hero-domain">
                    {selected.domain} <i aria-hidden="true">↗</i>
                  </em>
                  {selectedStage !== null ? (
                    <strong
                      className="rr-hero-title rr-hero-stage"
                      key={`${selectedStage}-${selectedSlow}`}
                    >
                      {arrivalLabel(selected, selectedStage, selectedSlow)}
                      <i className="rr-row-caret" />
                    </strong>
                  ) : (
                    <strong className="rr-hero-title">
                      {selected.title || selected.domain}
                    </strong>
                  )}
                  <span className="rr-hero-by">
                    dropped by {selected.droppedByName.toLowerCase()} ·{" "}
                    {relDrop(selected.droppedAt)}
                  </span>
                </span>
                <span className="rr-hero-snap" aria-hidden="true">
                  <span className="rr-hero-tape" />
                  <img
                    src={selected.imageUrl || LINK_CARD_FALLBACK}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.src = LINK_CARD_FALLBACK;
                    }}
                  />
                </span>
              </a>

              {selectedStage !== null ? (
                <section className="rr-why rr-reading" key="why-reading">
                  <h4>what the room is doing</h4>
                  <ol className="rr-steps">
                    {ARRIVAL_STEPS.map((step, index) => (
                      <li
                        key={index}
                        className={
                          index < selectedStage
                            ? "is-done"
                            : index === selectedStage
                              ? "is-live"
                              : ""
                        }
                        style={{ "--i": index } as CSSProperties}
                      >
                        <i aria-hidden="true" />
                        <strong>
                          {index === selectedStage
                            ? arrivalLabel(selected, index, selectedSlow)
                            : step.label(selected)}
                        </strong>
                        <span>
                          <em>
                            {index === selectedStage
                              ? arrivalDetail(index, selectedSlow)
                              : step.detail}
                          </em>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : (
              <section className="rr-why" key={`why-${selected.status}`}>
                <h4>why it matters</h4>
                <p>{linkSummary(selected)}</p>
                {selected.status === "ready" && (
                  <ul className="rr-tags" aria-label="tags">
                    {linkTags(selected).map((label, index) => (
                      <li
                        key={label}
                        style={
                          {
                            "--i": index,
                            ...(label === selected.kind
                              ? { "--kind": kindTone(selected.kind) }
                              : null),
                          } as CSSProperties
                        }
                      >
                        <button
                          type="button"
                          className={`${label === selected.kind ? "is-kind" : ""}${
                            tag === label ? " is-on" : ""
                          }`}
                          onClick={() => pickTag(label)}
                        >
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              )}

              <ul className="rr-questions" key={`q-${selected.status}`}>
                {selected.questions.map((question, index) => {
                  const qThread = linkQuestionThreadId(pileId, selected.id, question.id);
                  const count = messagesByThread[qThread]?.length ?? 0;
                  return (
                    <li key={question.id} style={{ "--i": index } as CSSProperties}>
                      <button
                        type="button"
                        className={activeQuestion === question.id ? "is-active" : ""}
                        onClick={() => {
                          setActiveQuestion((current) =>
                            current === question.id ? null : question.id,
                          );
                          playSound("tap");
                        }}
                      >
                        <span className="rr-q-top">
                          <i aria-hidden="true">Q{index + 1}</i>
                          <b className={count > 0 ? "has-takes" : ""}>
                            {count === 0
                              ? "no takes"
                              : count === 1
                                ? "1 take"
                                : `${count} takes`}
                          </b>
                        </span>
                        <span className="rr-q-text">{question.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <ul className="rr-replies-list">
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <MemberFace
                      name={reply.from}
                      color={reply.color}
                      avatarUrl={reply.avatarUrl}
                      size="sm"
                    />
                    <div>
                      <span className="rr-reply-who">
                        {reply.from.toLowerCase()}
                        {reply.time ? <em>{reply.time}</em> : null}
                      </span>
                      <p>{reply.text}</p>
                    </div>
                  </li>
                ))}
                {replies.length === 0 && (
                  <li className="rr-replies-empty">
                    <p>
                      {activeQuestion
                        ? "nobody's taken this one. go first."
                        : "no takes yet — say something."}
                    </p>
                  </li>
                )}
              </ul>
            </div>

            <form
              className="rr-composer"
              onSubmit={(event) => {
                event.preventDefault();
                submitReply();
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={activeQuestion ? "your take…" : "add a reply…"}
              />
              <button type="submit">send</button>
            </form>

            <footer className="rr-actions">
              <button
                type="button"
                className={`rr-pin${selected.pinned ? " is-on" : ""}`}
                onClick={() => {
                  onPin?.(selected.id);
                  playSound("tap");
                }}
              >
                <i aria-hidden="true">🔥</i>
                {selected.pinned ? "pinned to hot" : "pin to hot"}
              </button>
              <button
                type="button"
                className={`rr-keep${selected.keptAt !== undefined ? " is-on" : ""}`}
                onClick={() => {
                  onKeep?.(selected.id);
                  playSound("place");
                  /* Get out of the way — the takeaway landing on the canvas
                     is the beat, and it can't be seen through the room. */
                  window.setTimeout(() => closeRoomRef.current?.(), 480);
                }}
                disabled={selected.keptAt !== undefined}
              >
                <i aria-hidden="true">✦</i>
                {selected.keptAt !== undefined ? "kept" : "keep takeaway"}
              </button>
            </footer>
          </aside>
        )}
      </div>
      {extra}
    </CanvasRoom>
  );
}
