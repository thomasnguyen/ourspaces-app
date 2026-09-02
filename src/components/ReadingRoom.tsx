import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
}) {
  const ranked = useMemo(() => rankLinks(links, replyCounts), [links, replyCounts]);
  const hotIds = useMemo(
    () => new Set(ranked.slice(0, 5).map((link) => link.id)),
    [ranked],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState(
    () => initialLinkId ?? ranked[0]?.id ?? "",
  );
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [paste, setPaste] = useState("");
  const [research, setResearch] = useState("");
  const closeRoomRef = useRef<(() => void) | null>(null);

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
  const enriching = links.filter((link) => link.status === "pending").length;

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

  const dropCount = parseDroppedUrls(paste).length;

  const submitDrop = () => {
    const urls = parseDroppedUrls(paste);
    if (urls.length === 0) return;
    playSound("place");
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
      className="reading-room"
      origin={origin}
      label="back to the build room"
      closeRef={closeRoomRef}
      onClose={onClose}
    >
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
              {enriching > 0 && (
                <span className="rr-enriching">
                  <i aria-hidden="true">✦</i> {enriching} link
                  {enriching === 1 ? "" : "s"} enriching…
                </span>
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
                  {run.map((link, index) => (
                    <li
                      key={link.id}
                      className={`rr-row${link.id === selectedId ? " is-selected" : ""}${
                        link.status === "pending" ? " is-pending" : ""
                      }${link.status === "failed" ? " is-failed" : ""}`}
                      style={{ "--i": runOffsets[runIndex] + index } as CSSProperties}
                    >
                      <button
                        type="button"
                        className="rr-row-open"
                        onClick={() => {
                          setSelectedId(link.id);
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
                        </span>
                        <span className="rr-row-title">
                          <strong>{link.title || link.domain}</strong>
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
                          </em>
                        </span>
                        <span className="rr-row-desc">
                          {link.status === "pending"
                            ? "reading the page…"
                            : link.status === "failed"
                              ? "couldn't read that page"
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
                  ))}
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
          <aside className="rr-circle" aria-label="Reading circle">
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
                  <strong className="rr-hero-title">
                    {selected.title || selected.domain}
                  </strong>
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

              <section className="rr-why">
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

              <ul className="rr-questions">
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
    </CanvasRoom>
  );
}
