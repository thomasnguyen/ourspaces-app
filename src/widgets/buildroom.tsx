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

/** A compact count: the glyph carries it visually, the noun rides along in a
    visually-hidden span so "↑ 7" isn't a bare number to a reader or an
    extractor. `sr-only` is absolutely positioned, so the flex row is untouched. */
function CountBadge({
  glyph,
  value,
  one,
  many,
}: {
  glyph: string;
  value: number;
  one: string;
  many: string;
}) {
  return (
    <b>
      <i aria-hidden="true">{glyph}</i>
      {value}
      <span className="sr-only">{` ${value === 1 ? one : many}`}</span>
    </b>
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
  const faces = feed.faces.slice(0, 5);
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
              size="md"
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
                <CountBadge
                  glyph="↑"
                  value={link.voters.length}
                  one="vote"
                  many="votes"
                />
                <CountBadge
                  glyph="▤"
                  value={feed.replyCounts[link.id] ?? 0}
                  one="reply"
                  many="replies"
                />
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

/** Illustrated project captures for the three demo posts. Uploaded shots win. */
export function ShipPreview({ imageUrl }: { imageUrl: string }) {
  const demo = ["demo-day", "hack-weekend", "shipped-v01"].find(
    (name) => imageUrl === `/photos/hackathon/${name}.jpg`,
  );
  if (!demo) return <img src={imageUrl} alt="" draggable={false} />;
  const spec = demo === "hack-weekend";
  const release = demo === "shipped-v01";
  const ink = spec ? "var(--color-ink)" : "var(--color-card)";
  const muted = spec ? "var(--color-muted)" : "var(--color-mat)";
  return (
    <svg className="br-project-preview" viewBox="0 0 600 370" role="img" aria-label="Illustrated demo project preview">
      <rect width="600" height="370" fill={spec ? "var(--color-card)" : "var(--color-sticker)"} />
      <g fill={ink} opacity=".3">{[16, 27, 38].map(x => <circle key={x} cx={x} cy="14" r="3" />)}</g>
      <text x="65" y="18" fill={muted} fontSize="8">{spec ? "workspace / product / search" : "pulse / production / overview"}</text>
      <path d="M0 30H600M98 30V370" stroke={ink} strokeOpacity=".12" />
      <g fill={muted} fontSize="9">
        {["workspace", "overview", "projects", "activity", "settings"].map((label, i) => <text key={label} x="16" y={58 + i * 27}>{label}</text>)}
      </g>
      {spec ? <g fill={ink}>
        <text x="125" y="64" fontSize="22" fontWeight="700">Search, without the wait.</text>
        <text x="125" y="86" fill={muted} fontSize="10">Product spec · Jordan · ready for feedback</text>
        <path d="M125 103H570" stroke={ink} strokeOpacity=".15" />
        <text x="125" y="129" fontSize="12" fontWeight="700">Find the right thing on the first try</text>
        {["A single search across everything in your workspace.", "Typo tolerance, better ranking, and results as you type.", "Keep the useful details. Get out of the way."].map((t,i) => <text key={t} x="125" y={150+i*17} fill={muted} fontSize="10">{t}</text>)}
        <rect x="125" y="213" width="445" height="36" rx="4" fill="var(--color-mat)" fillOpacity=".3" />
        <text x="139" y="235" fontSize="11">⌕  Search projects, notes, people…</text>
        {["Migration plan", "Search relevance", "Release checklist"].map((t,i) => <g key={t}><path d={`M125 ${274+i*30}H570`} stroke={ink} strokeOpacity=".1" /><text x="136" y={268+i*30} fontSize="10">{t}</text><text x="488" y={268+i*30} fill={muted} fontSize="9">updated today</text></g>)}
      </g> : <g>
        <text x="121" y="62" fill={ink} fontSize="20" fontWeight="700">{release ? "v2.3.0 is out." : "Performance overview"}</text>
        <text x="121" y="81" fill={muted} fontSize="9">{release ? "Migration complete. All systems healthy." : "Query latency · last 24 hours"}</text>
        <rect x="494" y="47" width="82" height="24" rx="4" fill="var(--color-league)" fillOpacity=".2" />
        <text x="507" y="63" fontSize="9" fill="var(--color-league)">● healthy</text>
        {[['90 ms', 'p95 latency'], ['99.98%', 'uptime'], ['12.4k', 'requests']].map(([value,label],i) => <g key={label}><text x={124+i*153} y="119" fontSize="23" fill={ink} fontWeight="700">{value}</text><text x={124+i*153} y="137" fontSize="9" fill={muted}>{label}</text></g>)}
        <g stroke={ink} strokeOpacity=".1">{[168,198,228,258].map(y=><path key={y} d={`M122 ${y}H573`} />)}</g>
        <path d="M122 237 145 240 161 222 177 226 192 180 205 209 220 204 238 225 256 221 274 229 292 183 307 214 322 216 342 234 363 230 385 241 407 239 430 240 450 236 472 242 496 238 518 240 540 236 573 239" fill="none" stroke="var(--color-crew)" strokeWidth="3" />
        <path d="M122 248 183 250 235 244 288 248 336 246 400 251 455 247 507 250 573 248" fill="none" stroke="var(--color-league)" strokeWidth="2" />
        <g fontSize="9" fill={muted}>{["12:00", "16:00", "20:00", "00:00", "04:00"].map((t,i)=><text key={t} x={122+i*104} y="276">{t}</text>)}</g>
        {[release ? "✓  backfill complete" : "spaces:getSpaceWithWidgets", release ? "✓  dual-write verified" : "messages:listForWidget", release ? "✓  deployment healthy" : "widgets:updateWidget"].map((t,i)=><g key={t}><path d={`M122 ${297+i*24}H573`} stroke={ink} strokeOpacity=".1" /><text x="126" y={313+i*24} fontSize="9" fill={ink}>{t}</text><text x="528" y={313+i*24} fontSize="9" fill="var(--color-league)">{release ? "passed" : "42 ms"}</text></g>)}
      </g>}
    </svg>
  );
}

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
          <ShipPreview imageUrl={imageUrl} />
        ) : (
          <span className="br-ship-placeholder" aria-hidden="true">
            +
          </span>
        )}
        {feedbackWanted && <span className="br-ship-flag">feedback wanted</span>}
      </div>
      <footer className="br-ship-caption">
        <strong>{title}</strong>
        <span className="br-ship-byline">
          <MemberFace name={by} size="sm" />
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
