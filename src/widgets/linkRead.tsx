import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Widget } from "../data/types";
import type { LinkRead } from "../../convex/widgetData";
import { LookupTick, useSeenAt } from "../components/LookupTick";
import { LinkReadReceipt } from "../components/LinkReadReceipt";
import { WebPic } from "./webPic";
import "./link-read.css";

/* The plan card a pasted link (convex/tavily.ts readLink) or a voice ask makes ("let's do <place> on <day>", planPlace): it lands at once, reading (the host, a ticking
   numeral), names the venue when the post is read, then fills with one fee for one day from the venue's own site.
   `the post said …` is struck small under it only when the server found both and they differ. A small picture leads
   the venue: a link tile while the post is read, the kind of place (🎃, code's table) once it is named, and the
   first photo on the venue's own page when the read lands with one. */

const money = (n: number) => (n === 0 ? "free" : `$${n}`);
const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "").replace(/\/$/, "");

export function PlanReadWidget({ widget, style }: { widget: Widget; style: CSSProperties }) {
  const read = widget.data.read as LinkRead;
  const seen = useSeenAt(widget.id);
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("readReceipt") === "1");
  const done = read.step === "done";
  // a voice ask (tavily.ts planPlace): the place was searched, the post found, not pasted
  const asked = read.via === "voice";
  const [landedAt, setLandedAt] = useState<number | null>(done ? seen : null);
  useEffect(() => {
    if (done && landedAt === null) setLandedAt(Date.now());
  }, [done, landedAt]);
  const title = read.venue ?? read.host;
  const target = typeof widget.data.targetDate === "string" ? widget.data.targetDate : null;
  const date = target ? new Date(`${target}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toLowerCase() : null;
  return (
    <article className={`widget-shell widget-plan-read is-${read.step}`} style={style} data-testid="plan-read" data-step={read.step}>
      <header className="plan-read-kicker">
        <span>{!done ? (asked ? "an ask, searching" : "a link, pasted") : read.venue ? `the plan${date ? ` · ${date}` : ""}` : "a link, read"}</span>
        {done ? <em>read in {((read.ms ?? 0) / 1000).toFixed(1)}s</em> : <LookupTick since={seen} />}
      </header>
      <div className="plan-read-head">
        <WebPic img={done ? read.img : undefined} emoji={read.emoji ?? "🔗"} className="plan-read-pic" />
        <h3 className="plan-read-venue" key={title}>{title}</h3>
        {read.town && <p className="plan-read-town">{read.town}</p>}
      </div>
      {!done ? (
        <p className="plan-read-step" data-testid="plan-read-step">
          {asked
            ? read.step === "post"
              ? `searching for ${read.venue ?? "the place"}`
              : "reading its own page and a post"
            : read.step === "post"
              ? `reading ${read.host}`
              : `finding ${read.venue ?? "the venue"}'s own page`}
        </p>
      ) : read.fee ? (
        <div className="plan-read-fee" data-testid="plan-read-fee">
          <span className="plan-read-item">{read.fee.item}</span>
          <strong>{money(read.fee.amount)}</strong>
          <span className="plan-read-terms">
            {read.fee.cash ? "cash" : ""}
            {read.fee.cash && read.day ? " · " : ""}
            {read.day}
          </span>
          {read.post && (
            <s className="plan-read-struck" data-testid="plan-read-struck">
              {asked ? "a post" : "the post"} said {money(read.post.amount)}
            </s>
          )}
        </div>
      ) : (
        <p className="plan-read-step">{read.note}</p>
      )}
      {done && read.source && (
        <button
          type="button"
          className="plan-read-source"
          data-testid="plan-read-source"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          title={short(read.source.url)}
        >
          <i aria-hidden="true">↗</i>
          {read.source.label}
        </button>
      )}
      {open &&
        createPortal(
          <aside className="dev-context link-read-drawer" data-testid="dev-context-drawer">
            <header className="dev-context-head">
              <b>the read</b>
              <span>{asked ? read.said : short(read.url)}</span>
              <button type="button" data-testid="dev-context-close" onClick={() => setOpen(false)}>
                close
              </button>
            </header>
            <LinkReadReceipt widgetId={widget.id} since={read.at - 5000} />
          </aside>,
          document.body,
        )}
    </article>
  );
}

/** The who's-in line a read fills ("bring $30 cash"); while it runs, a quiet wait with the tick. */
export function RsvpBring({ widget }: { widget: Widget }) {
  const bring = typeof widget.data.bring === "string" ? widget.data.bring : "";
  const pending = widget.data.bringPending === true;
  const seen = useSeenAt(widget.id);
  if (!bring && !pending) return null;
  return pending ? (
    <p className="rsvp-bring is-pending" data-testid="rsvp-bring-pending">
      waiting on the page <LookupTick since={seen} />
    </p>
  ) : (
    <p className="rsvp-bring" data-testid="rsvp-bring" key={bring}>
      {bring}
    </p>
  );
}
