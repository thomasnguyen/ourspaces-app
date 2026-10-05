import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { knowsHash, normalSpaceHash, spacePageFromHash } from "../lib/routes";
import { panToWidget } from "../lib/recapBoard";
import { playSound } from "../lib/sounds";
import { TOLD_CHARS, type Forgot, type KnowLine, type KnowSection, type RoomKnows, type Told } from "../lib/roomKnows";
import "./room-knows.css";

/**
 * "What this space knows": the room's own page, behind the board
 * (`#/space/<slug>/knows`). Everything the space has noticed about the group,
 * in plain words, each line with where it came from; tap one and you're back
 * on the board with the camera on that card. Anyone can cross a line out or
 * tell it something, and the page shows who did. No model writes any of it:
 * the lines come from `convex/roomBrief.ts` (`knows`), or in mock mode from
 * the fixtures in `src/data/roomKnows.ts`.
 */

export type KnowsChange =
  | { kind: "tell"; text: string }
  | { kind: "untell"; id: string }
  | { kind: "forget"; key: string; text: string }
  | { kind: "restore"; key: string };

/** Which page of the room the hash is on, kept in step with back and forward. */
export function useSpacePage() {
  const [page, setPage] = useState(spacePageFromHash);
  useEffect(() => {
    const onHash = () => setPage(spacePageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return page;
}

/** Back on the board: glide to the cards a line came from and ring them once. */
export function visitSources(ids: string[], color: string) {
  const els = ids
    .map((id) => document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)?.closest<HTMLElement>(".widget-group"))
    .filter((el): el is HTMLElement => !!el);
  if (!els.length) return;
  panToWidget(ids.find((id) => document.querySelector(`[data-widget-id="${id}"]`)) ?? ids[0]);
  for (const el of els) {
    el.style.setProperty("--knows-color", color);
    el.classList.remove("is-knows-source");
    void el.offsetWidth;
    el.classList.add("is-knows-source");
    window.setTimeout(() => el.classList.remove("is-knows-source"), 2600);
  }
}

const TITLES: Record<KnowSection, string> = {
  who: "who we are",
  soon: "coming up",
  decided: "where things stand",
  habits: "how we usually do things",
  made: "what it has made",
};

function Line({ line, gone, onVisit, onChange, i }: { line: KnowLine; gone?: Forgot; onVisit: (l: KnowLine) => void; onChange: (c: KnowsChange) => void; i: number }) {
  const made = line.section === "made";
  return (
    <li className={`knows-line ${gone ? "is-gone" : ""} ${line.n != null ? "has-n" : ""}`} data-testid="room-knows-line" data-key={line.key} style={{ "--i": i, ...(gone ? { "--by": gone.color } : {}) } as CSSProperties}>
      <button type="button" className="knows-fact" disabled={!line.src.length} onClick={() => onVisit(line)} title={line.src.length ? "see the card it came from" : undefined}>
        {line.n != null && <b className="knows-n">{line.n}</b>}
        <span className="knows-text">{line.text}</span>
        <span className="knows-why">
          {line.why}
          {line.src.length > 0 && <i aria-hidden="true"> ↗</i>}
        </span>
      </button>
      <span className="knows-side">
        {gone ? (
          <>
            <span className="knows-tag is-person"><i />{gone.by} crossed this out</span>
            <button type="button" className="knows-act" data-testid="room-knows-restore" onClick={() => onChange({ kind: "restore", key: line.key })}>put back</button>
          </>
        ) : made ? (
          <span className={`knows-tag is-${line.status}`}>{line.status}</span>
        ) : (
          <>
            <span className="knows-tag">noticed</span>
            <button type="button" className="knows-act" data-testid="room-knows-forget" onClick={() => onChange({ kind: "forget", key: line.key, text: line.text })}>cross out</button>
          </>
        )}
      </span>
    </li>
  );
}

function ToldLine({ told, onChange, i }: { told: Told; onChange: (c: KnowsChange) => void; i: number }) {
  return (
    <li className="knows-line is-told" data-testid="room-knows-told" style={{ "--i": i, "--by": told.color } as CSSProperties}>
      <span className="knows-fact">
        <span className="knows-text">{told.text}</span>
        <span className="knows-why">{told.by} told the space</span>
      </span>
      <span className="knows-side">
        <span className="knows-tag is-person"><i />{told.by} said so</span>
        <button type="button" className="knows-act" data-testid="room-knows-untell" onClick={() => onChange({ kind: "untell", id: told.id })}>take back</button>
      </span>
    </li>
  );
}

export function RoomKnowsPage({
  slug,
  roomName,
  knows,
  self,
  onChange,
  fixture = false,
}: {
  slug: string;
  roomName: string;
  /** undefined = still loading; null = the space hasn't looked at this room yet. */
  knows: RoomKnows | null | undefined;
  self: { name: string; color: string };
  onChange: (change: KnowsChange) => void;
  /** Mock mode: the lines are fixtures and corrections stay on this screen. */
  fixture?: boolean;
}) {
  const page = useSpacePage();
  /* The page turns in and turns back out: it stays mounted for the way out. */
  const [phase, setPhase] = useState<"closed" | "open" | "leaving">(page === "knows" ? "open" : "closed");
  useEffect(() => {
    if (page === "knows") {
      setPhase("open");
      return;
    }
    setPhase((p) => (p === "open" ? "leaving" : p));
    const t = window.setTimeout(() => setPhase("closed"), 420);
    return () => window.clearTimeout(t);
  }, [page]);
  const [draft, setDraft] = useState("");
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  if (phase === "closed") return null;

  const back = () => {
    playSound("tap");
    window.location.hash = normalSpaceHash(slug);
  };
  const visit = (line: KnowLine) => {
    back();
    // The board is still mounted behind this page: move while the page turns away.
    window.setTimeout(() => visitSources(line.src, self.color), 140);
  };
  const tell = () => {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text) return;
    playSound("place");
    onChange({ kind: "tell", text });
    setDraft("");
  };

  const lines = knows?.lines ?? [];
  const told = knows?.told ?? [];
  const gone = new Map((knows?.forgot ?? []).map((f) => [f.key, f]));
  const of = (s: KnowSection) => lines.filter((l) => l.section === s);
  const people = knows?.people ?? [];
  const quiet = !!knows && !people.length && !told.length && !lines.some((l) => l.section !== "made");
  const empty = knows === null || quiet;
  let i = 0;
  const section = (s: KnowSection, extra?: ReactNode) => {
    const ls = of(s);
    if (!ls.length && !extra) return null;
    return (
      <section className={`knows-sec is-${s}`} data-testid={`room-knows-${s}`}>
        <h2>{TITLES[s]}</h2>
        {extra}
        {ls.length > 0 && (
          <ul>
            {ls.map((l) => (
              <Line key={l.key} line={l} gone={gone.get(l.key)} onVisit={visit} onChange={onChange} i={i++} />
            ))}
          </ul>
        )}
      </section>
    );
  };
  const awayCount = people.filter((p) => p.away).length;

  return (
    <div className={`room-knows ${phase === "leaving" ? "is-leaving" : "is-open"}`} data-testid="room-knows" data-fixture={fixture || undefined}>
      <div className="knows-scroll">
        <button type="button" className="knows-back" data-testid="room-knows-close" onClick={back}>
          <span aria-hidden="true">←</span> back to the board
        </button>
        <header className="knows-head">
          <div>
            <p className="knows-kicker">{roomName} · the other side of the board</p>
            <h1>what this space knows</h1>
            <p className="knows-sub">
              Everything it has noticed about {roomName}, and where it got it. Tap a line to see the card it came from. Cross out anything it has wrong.
            </p>
          </div>
          <form
            className="knows-tell"
            onSubmit={(e) => {
              e.preventDefault();
              tell();
            }}
          >
            <input
              data-testid="room-knows-tell"
              value={draft}
              maxLength={TOLD_CHARS}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={narrow ? "tell it something" : "tell it something, like “we never do mondays”"}
              aria-label="tell this space something"
            />
            <button type="submit" data-testid="room-knows-tell-send" disabled={!draft.trim()}>tell it</button>
          </form>
        </header>

        {knows === undefined ? (
          <p className="knows-empty">opening…</p>
        ) : (
          <div className="knows-sheets">
            {empty && (
              <div className="knows-sheet knows-empty" data-testid="room-knows-empty">
                <h2>it hasn’t noticed much yet</h2>
                <p>
                  It learns from what’s on the board: a countdown, a poll with votes, an rsvp, a split, a saved place. Add one and it shows up here, or tell it something yourself.
                </p>
              </div>
            )}
            {(people.length > 0 || of("who").length > 0 || of("soon").length > 0) && (
              <div className="knows-sheet is-a">
                {section(
                  "who",
                  people.length > 0 && (
                    <>
                      <p className="knows-count">
                        {people.length} {people.length === 1 ? "person" : "people"}
                        {awayCount ? ` · ${awayCount} away` : ""}
                      </p>
                      <div className="knows-people">
                        {people.map((p) => (
                          <span key={p.name} className={p.away && !gone.has(`away:${p.name}`) ? "is-away" : ""} style={{ "--by": p.color } as CSSProperties}>
                            <i />
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </>
                  ),
                )}
                {section("soon")}
              </div>
            )}
            {(told.length > 0 || of("habits").length > 0) && (
              <div className="knows-sheet is-b">
                <i className="knows-tape" aria-hidden="true" />
                <section className="knows-sec is-habits" data-testid="room-knows-habits">
                  <h2>{TITLES.habits}</h2>
                  <ul>
                    {told.map((t) => (
                      <ToldLine key={t.id} told={t} onChange={onChange} i={i++} />
                    ))}
                    {of("habits").map((l) => (
                      <Line key={l.key} line={l} gone={gone.get(l.key)} onVisit={visit} onChange={onChange} i={i++} />
                    ))}
                  </ul>
                </section>
              </div>
            )}
            {(of("decided").length > 0 || of("made").length > 0) && (
              <div className="knows-sheet is-c">
                {section("decided")}
                {section("made")}
              </div>
            )}
          </div>
        )}
        <p className="knows-foot" data-testid="room-knows-honest">
          It reads names and what’s on the board, nothing else. Everyone in {roomName} sees this same page. It keeps nothing private about any one person.
        </p>
      </div>
    </div>
  );
}

/** The door: a chip by the room's name that turns the board over. */
export function RoomKnowsDoor({ slug, count }: { slug: string; count?: number }) {
  return (
    <a className="space-knows-chip" data-testid="room-knows-open" href={knowsHash(slug)} title="what this space knows about the group, and why">
      <span>this space knows</span>
      {count != null && count > 0 && <b>{count}</b>}
    </a>
  );
}
