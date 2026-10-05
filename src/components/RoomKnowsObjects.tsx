import type { CSSProperties, ReactNode } from "react";
import { getAvatarSrc } from "../data/avatars";
import type { Forgot, KnowLine, RoomKnows, Told } from "../lib/roomKnows";
import type { KnowsChange } from "./RoomKnows";
import { AwardRow } from "./games/GameInvite";

/**
 * The things on the room's own page (RoomKnows.tsx). Each line the space has
 * noticed is drawn as the object a group would actually have on a wall: a
 * tear-off day count, a week strip with the usual day circled, a receipt
 * stub, address slips, a tick list, word magnets. Nothing is added: every
 * number, name and title drawn here is read back out of the line's own
 * `key`, `text` and `why` (or a sibling line on the same page).
 */

type Person = RoomKnows["people"][number];

export type KnowsCtx = {
  people: Person[];
  lines: KnowLine[];
  gone: Map<string, Forgot>;
  onVisit: (line: KnowLine, from: HTMLElement) => void;
  onChange: (change: KnowsChange) => void;
};

const kindOf = (key: string) => (key.includes(":") ? key.slice(0, key.indexOf(":")) : key);
const whatOf = (key: string) => (key.includes(":") ? key.slice(key.indexOf(":") + 1) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Ink or white, whichever reads on a person's colour. */
export function inkOn(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "var(--color-ink)";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "var(--color-ink)" : "white";
}

/** A person as a die-cut sticker: their photo, or their initial on their colour. */
export function Face({ name, color, className = "" }: { name: string; color?: string; className?: string }) {
  const src = getAvatarSrc(name);
  return (
    <span className={`knows-face ${className}`} style={{ "--by": color || undefined, "--on": color ? inkOn(color) : undefined } as CSSProperties}>
      {src ? <img src={src} alt="" draggable={false} /> : <b>{name.trim().slice(0, 1)}</b>}
    </span>
  );
}

/** The people named in a stretch of text, in the order the room lists them. */
function namedIn(text: string, people: Person[]): Person[] {
  return people.filter((p) => new RegExp(`(^|[^\\w])${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w]|$)`, "i").test(text));
}

/** The marker stroke a cross-out draws over a line's words. */
function Strike() {
  return (
    <svg className="knows-strike" aria-hidden="true">
      <line pathLength={1} x1="1%" y1="38%" x2="99%" y2="26%" />
      <line pathLength={1} x1="98%" y1="34%" x2="3%" y2="70%" />
      <line pathLength={1} x1="4%" y1="66%" x2="97%" y2="60%" />
    </svg>
  );
}

/** Where a line came from. "said in 3 places: poll "x", availability "y" best + 1 more" becomes a count and slips. */
function Why({ line, cal }: { line: KnowLine; cal?: boolean }) {
  // The tear-off page already carries the date.
  const why = cal ? line.why.replace(/^.*?, (?=from )/, "") : line.why;
  const m = /^said in (\d+) places?: (.*?)(?: \+ (\d+) more)?$/.exec(line.why);
  const arrow = line.src.length > 0 && <i className="knows-go" aria-hidden="true"> ↗</i>;
  if (!m) {
    return (
      <span className="knows-why">
        {why}
        {arrow}
      </span>
    );
  }
  const from = [...m[2].matchAll(/(\w[\w ]*?) "([^"]+)"/g)].map((x) => ({ kind: x[1].trim(), title: x[2] }));
  return (
    <span className="knows-why is-places">
      <span className="knows-said">
        said in <b>{m[1]}</b> places
      </span>
      {from.map((f) => (
        <span key={f.kind + f.title} className="knows-src">
          <em>{f.kind}</em>
          {f.title}
        </span>
      ))}
      {m[3] && <span className="knows-src is-more">+ {m[3]} more</span>}
      {arrow}
    </span>
  );
}

/** What the object looks like: its head (the form) and its words. */
function body(line: KnowLine, ctx: KnowsCtx): { form: string; head?: ReactNode; text: ReactNode; wide?: boolean } {
  const kind = kindOf(line.key);
  const what = whatOf(line.key);
  const who = ctx.people.find((p) => same(p.name, what));
  const plain = { form: "plain", text: line.text };

  if (kind === "date" && line.n != null) {
    const [day] = line.why.split(", from");
    // A countdown titled with someone's name is theirs: their sticker goes on the page.
    const whose = namedIn(what, ctx.people);
    return {
      form: "cal",
      head: (
        <span className="knows-cal">
          {whose.length > 0 && (
            <span className="knows-cal-faces">
              {whose.map((p) => (
                <Face key={p.name} name={p.name} color={p.color} />
              ))}
            </span>
          )}
          <em>{day}</em>
          <b className="knows-n">{line.n}</b>
        </span>
      ),
      text: line.text,
    };
  }
  if (kind === "day" && WEEK.some((d) => same(d, what))) {
    return {
      form: "week",
      head: (
        <span className="knows-week">
          {WEEK.map((d) => (
            <i key={d} className={same(d, what) ? "is-on" : ""}>
              {d.slice(0, 3).toLowerCase()}
              {same(d, what) && (
                <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M52 5 C 22 2, 4 14, 5 31 C 6 50, 30 57, 55 55 C 82 53, 97 42, 95 27 C 93 11, 70 4, 40 7" />
                </svg>
              )}
            </i>
          ))}
        </span>
      ),
      text: line.text,
    };
  }
  if (kind === "time") {
    return { form: "time", head: <b className="knows-n">{what}</b>, text: line.text };
  }
  if (kind === "payer") {
    const title = /"([^"]+)"/.exec(line.why)?.[1];
    const split = title ? ctx.lines.find((l) => l.key === `split:${title}`) : undefined;
    const total = split ? /: ([\d][\d,.]*) split/.exec(split.text)?.[1] : undefined;
    return {
      form: "receipt",
      head: (
        <span className="knows-receipt">
          {title && <em>{title}</em>}
          {total && (
            <span>
              total<b>{total}</b>
            </span>
          )}
          <span>
            covered the most
            <b>
              <Face name={what} color={who?.color} />
              {what}
            </b>
          </span>
        </span>
      ),
      text: line.text,
    };
  }
  if (kind === "places") {
    const at = line.text.indexOf(":");
    const spots = line.text.slice(at + 1).split(",").map((s) => s.trim()).filter(Boolean);
    const lead = /and (.+?) is ahead in ".*" (\d+ of \d+)/.exec(line.why);
    return {
      form: "slips",
      wide: spots.length > 2,
      head: (
        <span className="knows-slips">
          {spots.map((s) => (
            <i key={s} className={lead && same(lead[1], s) ? "is-lead" : ""}>
              {s}
              {lead && same(lead[1], s) && <b>{lead[2]}</b>}
            </i>
          ))}
        </span>
      ),
      text: at > 0 ? line.text.slice(0, at) : line.text,
    };
  }
  if (kind === "claims") {
    const at = line.text.indexOf(":");
    const items = line.text.slice(at + 1).split(",").map((s) => s.trim()).filter(Boolean);
    return {
      form: "ticks",
      head: (
        <span className="knows-ticks" style={{ "--by": who?.color || undefined } as CSSProperties}>
          {items.map((it) => (
            <i key={it}>{it}</i>
          ))}
        </span>
      ),
      text: (
        <>
          <Face name={what} color={who?.color} />
          {at > 0 ? line.text.slice(0, at) : line.text}
        </>
      ),
    };
  }
  if (kind === "lowercase") {
    const m = /^(\d+) of (\d+)/.exec(line.why);
    // A specimen in their own hand: titles of cards already named on this page.
    const titles = ctx.lines
      .filter((l) => ["date", "poll", "rsvp", "split", "wheel"].includes(kindOf(l.key)))
      .map((l) => whatOf(l.key))
      .filter((t) => t && t === t.toLowerCase())
      .slice(0, 3);
    return {
      form: "specimen",
      head: (
        <span className="knows-specimen">
          {m && (
            <b className="knows-n">
              {m[1]}
              <small>of {m[2]}</small>
            </b>
          )}
          {titles.length > 0 && (
            <span>
              {titles.map((t) => (
                <i key={t}>{t}</i>
              ))}
            </span>
          )}
        </span>
      ),
      text: line.text,
    };
  }
  if (kind === "words") {
    const at = line.text.indexOf(":");
    const words = line.text.slice(at + 1).split(",").map((s) => s.trim()).filter(Boolean);
    return {
      form: "words",
      head: (
        <span className="knows-words">
          {words.map((w) => (
            <i key={w}>{w}</i>
          ))}
        </span>
      ),
      text: at > 0 ? line.text.slice(0, at) : line.text,
    };
  }
  if (kind === "poll") {
    const m = /^(.*): (.+) is ahead, (\d+) of (\d+)$/.exec(line.text);
    if (!m) return plain;
    const lead = Number(m[3]);
    const votes = Math.min(Number(m[4]), 24);
    return {
      form: "poll",
      head: (
        <span className="knows-tally">
          <span>
            {Array.from({ length: votes }, (_, k) => (
              <i key={k} className={k < lead ? "is-in" : ""} />
            ))}
          </span>
          <b>
            {m[3]} of {m[4]}
          </b>
        </span>
      ),
      text: (
        <>
          <em>{m[1]}</em>
          {m[2]} is ahead
        </>
      ),
    };
  }
  if (kind === "rsvp" || kind === "split" || kind === "wheel" || kind === "zones" || kind === "away") {
    const at = kind === "zones" || kind === "away" ? -1 : line.text.indexOf(": ");
    const rest = at > 0 ? line.text.slice(at + 2) : line.text;
    const parts = kind === "rsvp" ? rest.split(" · ") : [rest];
    return {
      form: kind === "away" ? "away" : "names",
      text: (
        <>
          {at > 0 && <em>{line.text.slice(0, at)}</em>}
          {parts.map((part) => {
            const faces = namedIn(part, ctx.people);
            return (
              <span key={part} className="knows-part">
                {faces.length > 0 && (
                  <span className="knows-faces">
                    {faces.map((p) => (
                      <Face key={p.name} name={p.name} color={p.color} />
                    ))}
                  </span>
                )}
                {part}
              </span>
            );
          })}
        </>
      ),
    };
  }
  if (line.section === "made") return { form: "made", text: line.text };
  return plain;
}

/** One noticed line, as its object. Tap it to go to its card; cross it out; put it back. */
export function KnowObject({ line, ctx, i }: { line: KnowLine; ctx: KnowsCtx; i: number }) {
  const gone = ctx.gone.get(line.key);
  const made = line.section === "made";
  const b = body(line, ctx);
  return (
    <li
      className={`knows-line is-${b.form} ${b.wide ? "is-wide" : ""} ${gone ? "is-gone" : ""} ${line.n != null ? "has-n" : ""}`}
      data-testid="room-knows-line"
      data-key={line.key}
      style={{ "--i": i, ...(gone ? { "--by": gone.color, "--on": inkOn(gone.color) } : {}) } as CSSProperties}
    >
      <button
        type="button"
        className="knows-fact"
        disabled={!line.src.length}
        onClick={(e) => ctx.onVisit(line, e.currentTarget)}
        title={line.src.length ? "see the card it came from" : undefined}
      >
        {b.head}
        <span className="knows-text">
          <span className="knows-words-of">{b.text}</span>
          <Strike />
        </span>
        <Why line={line} cal={b.form === "cal"} />
      </button>
      <span className="knows-side">
        {gone ? (
          <>
            <span className="knows-stamp">
              <Face name={gone.by} color={gone.color} />
              {gone.by} crossed this out
            </span>
            <button type="button" className="knows-act" data-testid="room-knows-restore" onClick={() => ctx.onChange({ kind: "restore", key: line.key })}>
              put back
            </button>
          </>
        ) : made ? (
          <span className={`knows-tag is-${line.status}`}>{line.status}</span>
        ) : (
          <button type="button" className="knows-act" data-testid="room-knows-forget" onClick={() => ctx.onChange({ kind: "forget", key: line.key, text: line.text })}>
            cross out
          </button>
        )}
      </span>
    </li>
  );
}

/** A fact a person told the space: a note in their colour, dropped on top. */
export function ToldNote({ told, onChange, i }: { told: Told; onChange: (c: KnowsChange) => void; i: number }) {
  return (
    <li className="knows-slot" style={{ "--i": i, "--by": told.color, "--on": inkOn(told.color) } as CSSProperties}>
      <div className="knows-line is-told" data-testid="room-knows-told">
      <span className="knows-fact">
        <span className="knows-text">{told.text}</span>
        <span className="knows-why">
          <Face name={told.by} color={told.color} />
          {told.by} said so
        </span>
      </span>
      <span className="knows-side">
        <button type="button" className="knows-act" data-testid="room-knows-untell" onClick={() => onChange({ kind: "untell", id: told.id })}>
          take back
        </button>
      </span>
      </div>
    </li>
  );
}

/** The group, as stickers. Someone away sits tilted under a strip of tape that says so. */
export function Portrait({ people, lines, gone }: { people: Person[]; lines: KnowLine[]; gone: Map<string, Forgot> }) {
  return (
    <div className="knows-people">
      {people.map((p, k) => {
        const away = p.away && !gone.has(`away:${p.name}`);
        const back = /, (back [^,]+)$/i.exec(lines.find((l) => l.key === `away:${p.name}`)?.text ?? "")?.[1];
        return (
          <span key={p.name} className={`knows-person ${away ? "is-away" : ""}`} style={{ "--i": k, "--by": p.color || undefined, "--on": p.color ? inkOn(p.color) : undefined } as CSSProperties}>
            <Face name={p.name} color={p.color} />
            <b>{p.name}</b>
            {away && <em>{back ?? "away"}</em>}
            <AwardRow name={p.name} />
          </span>
        );
      })}
    </div>
  );
}

