import type { CSSProperties } from "react";
import type { BuildRoomLink } from "../data/buildroom";
import type { Widget } from "../data/types";
import { MemberFace } from "../components/MemberFace";
import {
  kindTone,
  linkMonogram,
  linkTone,
  pileCounts,
  rankLinks,
} from "../lib/linkRanking";

type Style = CSSProperties;

/** Everything the build room's widgets need from the space, threaded as one prop. */
export type BuildRoomFeed = {
  links: BuildRoomLink[];
  replyCounts: Record<string, number>;
  faces: { name: string; color?: string; avatarUrl?: string }[];
  /** Opens the reading room, optionally straight to one link. */
  onOpenPile?: (linkId?: string) => void;
};

const EMPTY_FEED: BuildRoomFeed = { links: [], replyCounts: {}, faces: [] };

/** The flat monogram tile that stands in for a cover — see data/buildroom.ts. */
function LinkTile({ link, className = "" }: { link: BuildRoomLink; className?: string }) {
  return (
    <span
      className={`br-tile ${className}`}
      style={{ background: linkTone(link) }}
      aria-hidden="true"
    >
      {link.imageUrl ? (
        <img src={link.imageUrl} alt="" referrerPolicy="no-referrer" draggable={false} />
      ) : (
        <i>{linkMonogram(link)}</i>
      )}
    </span>
  );
}

/* ── the pile ────────────────────────────────────────────────────────────── */

export function LinkPileWidget({
  widget,
  style,
  feed = EMPTY_FEED,
}: {
  widget: Widget;
  style: Style;
  feed?: BuildRoomFeed;
}) {
  const counts = pileCounts(feed.links, feed.replyCounts);
  const fan = rankLinks(feed.links, feed.replyCounts).slice(0, 3);
  const faces = feed.faces.slice(0, 4);
  const extraFaces = Math.max(0, feed.faces.length - faces.length);

  return (
    <section className="widget-shell widget-link-pile" style={style}>
      <span className="br-pile-fan" aria-hidden="true">
        {fan.map((link, index) => (
          <LinkTile
            key={link.id}
            link={link}
            className={`br-pile-fan-card is-${index + 1}`}
          />
        ))}
      </span>

      <div className="br-pile-card">
        <p className="br-pile-total">
          <strong>{counts.total}</strong>
          <span>links</span>
        </p>
        <p className="br-pile-line">
          <b>+{counts.today}</b> today
          <i aria-hidden="true">·</i>
          {counts.discussed} discussed
          <i aria-hidden="true">·</i>
          <em>{counts.kept} kept</em>
        </p>

        <div className="br-pile-faces">
          {faces.map((face) => (
            <MemberFace
              key={face.name}
              name={face.name}
              color={face.color}
              avatarUrl={face.avatarUrl}
              size="sm"
            />
          ))}
          {extraFaces > 0 && <span className="br-pile-face-more">+{extraFaces}</span>}
        </div>

        <button
          type="button"
          className="br-pile-open"
          onClick={(event) => {
            event.stopPropagation();
            feed.onOpenPile?.();
          }}
        >
          {String(widget.data.cta ?? "open reading room")}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

/* ── hot now ─────────────────────────────────────────────────────────────── */

export function HotLinksWidget({
  widget,
  style,
  feed = EMPTY_FEED,
}: {
  widget: Widget;
  style: Style;
  feed?: BuildRoomFeed;
}) {
  const limit = Number(widget.data.limit ?? 3) || 3;
  const hot = rankLinks(feed.links, feed.replyCounts).slice(0, limit);

  return (
    <section className="widget-shell widget-hot-links" style={style}>
      <ol className="br-hot-list">
        {hot.map((link, index) => (
          <li
            key={link.id}
            className={`br-hot-row${link.pinned ? " is-pinned" : ""}`}
            style={{ "--i": index } as CSSProperties}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                feed.onOpenPile?.(link.id);
              }}
            >
              <LinkTile link={link} className="br-hot-tile" />
              <span className="br-hot-copy">
                <span className="br-kind" style={{ background: kindTone(link.kind) }}>
                  {link.kind}
                </span>
                <strong>{link.title}</strong>
                <span className="br-hot-domain">{link.domain}</span>
              </span>
              <span className="br-hot-counts">
                <b>
                  <i aria-hidden="true">↑</i>
                  {link.voters.length}
                </b>
                <b>
                  <i aria-hidden="true">▤</i>
                  {feed.replyCounts[link.id] ?? 0}
                </b>
              </span>
            </button>
          </li>
        ))}
        {hot.length === 0 && (
          <li className="br-hot-empty">nothing hot yet — drop some links in the pile.</li>
        )}
      </ol>
    </section>
  );
}

/* ── shipping wall ───────────────────────────────────────────────────────── */

export function ShipPostWidget({ widget, style }: { widget: Widget; style: Style }) {
  const title = String(widget.data.title ?? "untitled ship");
  const by = String(widget.data.by ?? "someone");
  const date = String(widget.data.date ?? "");
  const imageUrl = String(widget.data.imageUrl ?? "");
  const feedbackWanted = Boolean(widget.data.feedbackWanted);

  return (
    <article
      className={`widget-shell widget-ship-post${imageUrl ? "" : " is-empty"}`}
      style={style}
    >
      <span className="br-ship-tape" aria-hidden="true" />
      <div className="br-ship-shot">
        {imageUrl ? (
          <img src={imageUrl} alt="" draggable={false} />
        ) : (
          <span className="br-ship-placeholder" aria-hidden="true">
            +
          </span>
        )}
        {feedbackWanted && <span className="br-ship-flag">feedback wanted</span>}
      </div>
      <footer className="br-ship-caption">
        <strong>{title}</strong>
        <span>
          by {by}
          {date ? ` · ${date}` : ""}
        </span>
      </footer>
    </article>
  );
}

/* ── roundtable ──────────────────────────────────────────────────────────── */

export type RoundtableReply = {
  id: string;
  from: string;
  fromColor?: string;
  fromAvatarUrl?: string;
  text: string;
  time?: string;
};

export function RoundtableWidget({
  widget,
  style,
  replies = [],
  replyCount,
  onOpen,
}: {
  widget: Widget;
  style: Style;
  replies?: RoundtableReply[];
  replyCount?: number;
  onOpen?: () => void;
}) {
  const category = String(widget.data.category ?? "topic");
  const title = String(widget.data.title ?? "what should we talk about?");
  const preview = replies.slice(-2);
  const total = replyCount ?? replies.length;

  return (
    <section className="widget-shell widget-roundtable" style={style}>
      <header className="br-table-head">
        <span className="br-table-kind">{category}</span>
        <h3>{title}</h3>
      </header>

      <ul className="br-table-replies">
        {preview.map((reply, index) => (
          <li key={reply.id} style={{ "--i": index } as CSSProperties}>
            <MemberFace
              name={reply.from}
              color={reply.fromColor}
              avatarUrl={reply.fromAvatarUrl}
              size="sm"
            />
            <div>
              <span className="br-table-who">{reply.from.toLowerCase()}</span>
              <p>{reply.text}</p>
            </div>
          </li>
        ))}
        {preview.length === 0 && (
          <li className="br-table-empty">
            <p>{String(widget.data.body ?? "nobody's answered yet. go first.")}</p>
          </li>
        )}
      </ul>

      <button
        type="button"
        className="br-table-open"
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.();
        }}
      >
        {total > 0 ? `${total} ${total === 1 ? "reply" : "replies"} · add yours` : "add a reply"}
      </button>
    </section>
  );
}
