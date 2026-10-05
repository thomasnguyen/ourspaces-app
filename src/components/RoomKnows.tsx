import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { knowsHash, normalSpaceHash, spacePageFromHash } from "../lib/routes";
import { panToWidget } from "../lib/recapBoard";
import { playSound } from "../lib/sounds";
import { TOLD_CHARS, standing, type KnowLine, type KnowSection, type RoomKnows } from "../lib/roomKnows";
import { KnowObject, Portrait, ToldNote, inkOn, type KnowsCtx } from "./RoomKnowsObjects";
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

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* The turn-over: board and page are two sides of one room, so going between
   them flips the room (a view transition on the room's <main>, both sides
   live). While a flip is running the page doesn't play its own way out. */
let flipping = false;
type FlipDoc = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

function turnRoom(room: HTMLElement | null, hash: string) {
  const doc = document as FlipDoc;
  if (!room || !doc.startViewTransition || reduced()) {
    window.location.hash = hash;
    return;
  }
  flipping = true;
  document.documentElement.classList.add("is-knows-flip");
  room.style.setProperty("view-transition-name", "knows-room");
  const done = () => {
    flipping = false;
    document.documentElement.classList.remove("is-knows-flip");
    room.style.removeProperty("view-transition-name");
  };
  try {
    doc
      .startViewTransition(() => {
        window.location.hash = hash;
        // The hashchange event itself comes a task later: tell the room now, so the new side is drawn before the flip.
        flushSync(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
      })
      .finished.then(done, done);
  } catch {
    done();
    window.location.hash = hash;
  }
}

/** Tap a line: its words lift off the page and ride to the card they came from. */
function flyToSource(from: HTMLElement, ids: string[], color: string) {
  const words = from.querySelector<HTMLElement>(".knows-words-of") ?? from;
  const target = () => ids.map((id) => document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)).find(Boolean)?.getBoundingClientRect();
  if (reduced() || !target()) return;
  const a = words.getBoundingClientRect();
  const fly = document.createElement("div");
  fly.className = "knows-fly";
  fly.textContent = words.textContent;
  fly.style.setProperty("--by", color);
  fly.style.setProperty("--on", inkOn(color));
  fly.style.left = `${a.left - 14}px`;
  fly.style.top = `${a.top - 8}px`;
  document.body.appendChild(fly);
  const w = fly.offsetWidth, h = fly.offsetHeight;
  const DUR = 900;
  const glide = (t: number) => 1 - Math.pow(1 - t, 4);
  let t0 = 0;
  const step = (now: number) => {
    t0 ||= now;
    const t = Math.min(1, (now - t0) / DUR);
    const b = target();
    if (!b || t >= 1) return fly.remove();
    const e = glide(t);
    // Chase the card while the camera is still moving: the landing spot is wherever it is now.
    const x = (b.left + b.width / 2 - w / 2 - (a.left - 14)) * e;
    const y = (b.top - h / 2 - (a.top - 8)) * e;
    fly.style.transform = `translate(${x}px, ${y}px) rotate(${-3 * Math.sin(Math.PI * e)}deg) scale(${1 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.6))})`;
    fly.style.opacity = String(t < 0.86 ? 1 : 1 - (t - 0.86) / 0.14);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function RoomKnowsPage({
  slug,
  roomName,
  knows,
  self,
  onChange,
  fixture = false,
  heldBack,
}: {
  slug: string;
  roomName: string;
  /** undefined = still loading; null = the space hasn't looked at this room yet. */
  knows: RoomKnows | null | undefined;
  self: { name: string; color: string };
  onChange: (change: KnowsChange) => void;
  /** Mock mode: the lines are fixtures and corrections stay on this screen. */
  fixture?: boolean;
  /** Right of Way's ledger: "what it held back" (components/RightOfWay.tsx `HeldBack`). */
  heldBack?: ReactNode;
}) {
  const page = useSpacePage();
  /* The page stays mounted for its own way out (a line being followed to its
     card, the browser's back); a flip swaps the two sides in one commit. */
  const [prev, setPrev] = useState(page);
  const [leaving, setLeaving] = useState(false);
  if (prev !== page) {
    setPrev(page);
    setLeaving(page === "board" && !flipping);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(false), 420);
    return () => window.clearTimeout(t);
  }, [leaving]);
  const [draft, setDraft] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  if (page !== "knows" && !leaving) return null;

  const back = () => {
    playSound("tap");
    turnRoom(root.current?.parentElement ?? null, normalSpaceHash(slug));
  };
  const visit = (line: KnowLine, from: HTMLElement) => {
    playSound("tap");
    window.location.hash = normalSpaceHash(slug);
    // The board is still mounted behind this page: move while the page lifts away.
    window.setTimeout(() => visitSources(line.src, self.color), 140);
    flyToSource(from, line.src, self.color);
  };
  const tell = () => {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text) return;
    playSound("place");
    onChange({ kind: "tell", text });
    setDraft("");
    // On a phone the notes sit under the fold: bring the new one up to be seen landing.
    window.setTimeout(() => {
      const note = root.current?.querySelector<HTMLElement>(".knows-notes li:last-child");
      const r = note?.getBoundingClientRect();
      if (note && r && (r.top < 0 || r.bottom > window.innerHeight - 80)) note.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    }, 60);
  };
  const change = (c: KnowsChange) => {
    playSound(c.kind === "forget" ? "place" : "tap");
    onChange(c);
  };

  const lines = knows?.lines ?? [];
  const told = knows?.told ?? [];
  const gone = new Map((knows?.forgot ?? []).map((f) => [f.key, f]));
  const of = (s: KnowSection) => lines.filter((l) => l.section === s);
  const people = knows?.people ?? [];
  const quiet = !!knows && !people.length && !told.length && !lines.some((l) => l.section !== "made");
  const empty = knows === null || quiet;
  const ctx: KnowsCtx = { people, lines, gone, onVisit: visit, onChange: change };
  const count = knows ? standing(knows) : 0;
  const awayCount = people.filter((p) => p.away && !gone.has(`away:${p.name}`)).length;
  let i = 0;
  const objects = (ls: KnowLine[]) => ls.map((l) => <KnowObject key={l.key} line={l} ctx={ctx} i={i++} />);
  const section = (s: KnowSection, ls: KnowLine[], extra?: ReactNode) => {
    if (!ls.length && !extra) return null;
    return (
      <section className={`knows-sec is-${s}`} data-testid={`room-knows-${s}`}>
        <h2>{TITLES[s]}</h2>
        {extra}
        {ls.length > 0 && <ul>{objects(ls)}</ul>}
      </section>
    );
  };
  const habits = (ls: KnowLine[]) =>
    (told.length > 0 || ls.length > 0) && (
      <section className="knows-sec is-habits" data-testid="room-knows-habits">
        <h2>{TITLES.habits}</h2>
        {told.length > 0 && (
          <ul className="knows-notes">
            {told.map((t) => (
              <ToldNote key={t.id} told={t} onChange={change} i={i++} />
            ))}
          </ul>
        )}
        {ls.length > 0 && <ul>{objects(ls)}</ul>}
      </section>
    );
  const peopleCount = people.length > 0 && (
    <p className="knows-count">
      {people.length} {people.length === 1 ? "person" : "people"}
      {awayCount ? ` · ${awayCount} away` : ""}
    </p>
  );
  return (
    <div ref={root} className={`room-knows ${leaving ? "is-leaving" : "is-open"}`} data-testid="room-knows" data-fixture={fixture || undefined}>
      <div className="knows-scroll">
        <button type="button" className="knows-back" data-testid="room-knows-close" onClick={back}>
          <span aria-hidden="true">←</span> back to the board
        </button>
        <header className="knows-head">
          <div className="knows-title">
            <p className="knows-kicker">{roomName} · the other side of the board</p>
            <h1>what this space knows</h1>
            <p className="knows-sub">
              {count > 0 && (
                <b key={count} className="knows-total">
                  {count}
                </b>
              )}
              {count > 0 ? ` things it has noticed about ${roomName}.` : `What it notices about ${roomName} shows up here.`} Tap one to see its card. Cross out anything it has wrong.
            </p>
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
          </div>
          {knows && (people.length > 0 || of("who").length > 0) && (
            <div className="knows-group">{section("who", of("who"), people.length > 0 && <>{peopleCount}<Portrait people={people} lines={lines} gone={gone} /></>)}</div>
          )}
        </header>

        {knows === undefined ? (
          <p className="knows-empty">opening…</p>
        ) : (
          <>
            <div className="knows-sheets">
              {empty && (
                <div className="knows-sheet knows-empty" data-testid="room-knows-empty">
                  <h2>it hasn’t noticed much yet</h2>
                  <p>
                    It learns from what’s on the board: a countdown, a poll with votes, an rsvp, a split, a saved place. Add one and it shows up here, or tell it something yourself.
                  </p>
                  <span className="knows-hints" aria-hidden="true">
                    {["a countdown", "a poll", "an rsvp", "a split", "a saved place"].map((h, k) => (
                      <i key={h} style={{ "--i": k } as CSSProperties}>{h}</i>
                    ))}
                  </span>
                </div>
              )}
              {(of("soon").length > 0 || of("made").length > 0) && (
                <div className="knows-sheet is-a">
                  {section("soon", of("soon"))}
                  {section("made", of("made"))}
                </div>
              )}
              {(told.length > 0 || of("habits").length > 0) && <div className="knows-sheet is-b">{habits(of("habits"))}</div>}
              {of("decided").length > 0 && <div className="knows-sheet is-c">{section("decided", of("decided"))}</div>}
              {heldBack && <div className="knows-sheet is-d">{heldBack}</div>}
            </div>
          </>
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
    <a
      className="space-knows-chip"
      data-testid="room-knows-open"
      href={knowsHash(slug)}
      title="what this space knows about the group, and why"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        playSound("tap");
        turnRoom(e.currentTarget.closest("main"), knowsHash(slug));
      }}
    >
      <span>this space knows</span>
      {count != null && count > 0 && <b key={count}>{count}</b>}
    </a>
  );
}
