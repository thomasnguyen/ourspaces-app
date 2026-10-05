import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties } from "react";
import { LOCKS, seeState } from "../lib/answerToSee";
import type { Widget } from "../data/types";
import { MemberFace } from "../components/MemberFace";
import { getDataMode } from "../live/dataMode";
import { getIdentity } from "../live/identity";
import { playSound } from "../lib/sounds";
import {
  dayIndexOf,
  findPerson,
  groupTotal,
  isRevealed,
  lineFor,
  logOf,
  loggableDay,
  rank,
  readCheckIn,
  readStandings,
  revealDate,
  revealLabel,
  streakOf,
  weekdayOf,
  withLog,
  type CheckInData,
} from "../lib/challenge";
import "./challenge.css";

type Style = CSSProperties;

/**
 * The board, for cards that read a sibling: standings ranks the check-in it
 * points at. `onWidgetData` stores a card's new data (mock: local overrides).
 */
export type BoardLink = {
  widgets: Widget[];
  onWidgetData?: (widgetId: string, data: Widget["data"]) => void;
  /** Live: log today for yourself only (convex/checkIns.ts `log`); the server picks the row. */
  onCheckIn?: (widgetId: string, day: number, value: number | null) => void;
  /** Open links (convex/links.ts): target widget id → the card it waits on. */
  waiting?: Record<string, string>;
};

const titleOf = (w: Widget | undefined) => {
  const d = (w?.data ?? {}) as Record<string, unknown>;
  return String(d.title ?? d.question ?? d.event ?? "the card before it").toLowerCase();
};

/**
 * A card that exists before its content does: it waits on another card
 * (a recipe's link, filled by code when the source resolves). The same
 * family as standings' "log yours to see", with another card as the key.
 */
export function WaitingOn({ widgetId }: { widgetId: string }) {
  const { waiting, widgets } = useContext(BoardLinkContext);
  const from = waiting?.[widgetId];
  if (!from) return null;
  return (
    <span className="card-waiting" data-testid="card-waiting" data-from={from}>
      waiting on {titleOf(widgets.find((w) => w.id === from))}
    </span>
  );
}
export const BoardLinkContext = createContext<BoardLink>({ widgets: [] });

/** "beat 40" on the standings opens the check-in's logger at 41. */
const OPEN_LOG = "ourspaces:checkin-open";
type OpenLog = { source: string; value?: number };

const param = (key: string) => new URLSearchParams(window.location.search).get(key);

/**
 * Whose seat you're in. Live: your name, if you're in the challenge. Mock:
 * `?as=<name>`, else the first person who hasn't logged today, so the demo
 * room always has a cell to tap.
 */
const mockSeats = new Map<string, string>();
function viewerOf(data: CheckInData, today: number): string | null {
  if (getDataMode() !== "mock") return findPerson(data, getIdentity().name)?.name ?? null;
  const asked = findPerson(data, param("as"));
  if (asked) return asked.name;
  // the seat is picked once per challenge, so logging doesn't hand you someone else's
  const key = `${data.title}:${data.start}`;
  const kept = findPerson(data, mockSeats.get(key));
  if (kept) return kept.name;
  const open = today >= 0 ? data.people.find((p) => logOf(data, p.name, today) == null) : undefined;
  const seat = (open ?? data.people[0])?.name ?? null;
  if (seat) mockSeats.set(key, seat);
  return seat;
}

/** Mock state URLs: `?challenge=logged` (you've logged today), `?challenge=final` (after the reveal). */
function useChallenge(raw: Widget["data"] | undefined) {
  /* the reveal flips it for everyone at the same moment: a timer to that minute */
  const [clock, setClock] = useState(0);
  const revealMs = revealDate(readCheckIn(raw ?? {}))?.getTime() ?? 0;
  useEffect(() => {
    const wait = revealMs - Date.now();
    if (wait <= 0 || wait > 2 ** 31 - 1) return;
    const t = window.setTimeout(() => setClock((n) => n + 1), wait + 50);
    return () => window.clearTimeout(t);
  }, [revealMs]);
  return useMemo(() => {
    const base = readCheckIn(raw ?? {});
    const lab = getDataMode() === "mock" ? param("challenge") : null;
    const now = new Date();
    const today = loggableDay(base, now);
    const viewer = viewerOf(base, today);
    let data = base;
    if (lab && viewer && today >= 0 && logOf(base, viewer, today) == null) {
      const last = [...(base.logs[viewer] ?? [])].reverse().find((v) => v != null);
      data = withLog(base, viewer, today, base.kind === "done" ? 1 : (last ?? 10));
    }
    return { data, today, day: dayIndexOf(base, now), viewer, final: lab === "final" || isRevealed(base, now) };
  }, [raw, clock]); // eslint-disable-line react-hooks/exhaustive-deps
}

const tilt = (seed: number) => ((seed * 37) % 9) - 4;

export function CheckInWidget({ widget, style }: { widget: Widget; style: Style }) {
  const { onWidgetData, onCheckIn } = useContext(BoardLinkContext);
  const { data, today, day, viewer, final } = useChallenge(widget.data);
  const mine = viewer && today >= 0 ? logOf(data, viewer, today) : null;
  const lastMine = viewer ? [...(data.logs[viewer] ?? [])].reverse().find((v) => v != null) : null;
  const [draft, setDraft] = useState<number | null>(null);
  const [stamped, setStamped] = useState<string | null>(null);
  const canLog = Boolean(viewer && today >= 0 && !final && (onCheckIn || onWidgetData));
  const me = findPerson(data, viewer);

  const openLogger = (value?: number) => {
    if (!canLog) return;
    playSound("tap");
    setDraft(value ?? mine ?? lastMine ?? 10);
  };

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenLog>).detail;
      if (detail.source === widget.id) openLogger(detail.value);
    };
    window.addEventListener(OPEN_LOG, onOpen);
    return () => window.removeEventListener(OPEN_LOG, onOpen);
  });

  const commit = (value: number | null) => {
    if (!viewer || today < 0) return;
    // the stored card keeps what people really logged, never a lab patch
    if (onCheckIn) onCheckIn(widget.id, today, value);
    else onWidgetData?.(widget.id, { ...withLog(readCheckIn(widget.data), viewer, today, value) });
    setDraft(null);
    if (value != null) {
      playSound("place");
      setStamped(`${viewer}:${today}`);
    }
  };

  const tapToday = () => {
    if (data.kind === "done") commit(mine == null ? 1 : null);
    else openLogger();
  };

  const total = groupTotal(data);
  const inToday = today >= 0 ? data.people.filter((p) => logOf(data, p.name, today) != null).length : 0;
  const reveal = revealLabel(data);
  const dayNo = Math.min(Math.max(day, 0), data.days - 1) + 1;
  const columns = Array.from({ length: data.days }, (_, i) => i);
  const done = data.kind === "done";

  return (
    <section
      className={`widget-shell widget-checkin${draft != null ? " is-logging" : ""}`}
      style={{ ...style, "--ci-days": data.days + (reveal ? 1 : 0), "--me": me?.color } as Style}
      data-testid="checkin"
      data-viewer={viewer ?? ""}
    >
      <span className="ci-tape" aria-hidden="true" />
      <header className="ci-head">
        <div className="ci-title">
          <span className="ci-kicker">
            {final ? "all days in" : `day ${dayNo} of ${data.days}`}
            {reveal ? <> · reveal {reveal}</> : null}
          </span>
          <h3>{data.title}</h3>
        </div>
        <div className="ci-total" data-testid="checkin-total">
          <strong key={total}>{total.toLocaleString("en-US")}</strong>
          <small>
            {done ? "check-ins" : data.unit} between us{data.goal ? <> · going for {data.goal.toLocaleString("en-US")}</> : null}
          </small>
        </div>
      </header>

      <div className="ci-grid" role="table">
        <div className="ci-row ci-days" aria-hidden="true">
          <span className="ci-who" />
          <div className="ci-cells">
            {columns.map((i) => (
              <span key={i} className={`ci-day${i === today && !final ? " is-today" : ""}`}>
                {weekdayOf(data, i)}
              </span>
            ))}
            {reveal ? <span className="ci-day ci-day-reveal">{reveal.split(" ")[1]}</span> : null}
          </div>
          <span className="ci-streak-head">in a row</span>
        </div>

        {data.people.map((person, p) => {
          const streak = streakOf(data, person.name, Math.max(day, 0));
          const yours = person.name === viewer;
          const hot = streak > 0 && today >= 0 && logOf(data, person.name, today) == null;
          return (
            <div
              key={person.name}
              className={`ci-row ci-person${yours ? " is-you" : ""}`}
              style={{ "--c": person.color, "--i": p } as Style}
              data-testid="checkin-row"
              data-person={person.name}
            >
              <span className="ci-who">
                <MemberFace name={person.name} color={person.color} size="sm" />
                <b>{person.name.toLowerCase()}</b>
                {yours ? <i>you</i> : null}
              </span>
              <div className="ci-cells">
                {columns.map((i) => {
                  const value = logOf(data, person.name, i);
                  const isToday = i === today && !final;
                  if (yours && isToday && canLog) {
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`ci-cell ci-cell-today${value != null ? " is-in" : " is-open"}${stamped === `${person.name}:${i}` ? " is-stamped" : ""}`}
                        data-testid="checkin-today"
                        onClick={tapToday}
                        style={{ "--t": `${tilt(p * 7 + i)}deg` } as Style}
                      >
                        {value == null ? (done ? "tap" : "＋") : done ? "✓" : value}
                      </button>
                    );
                  }
                  return (
                    <span
                      key={i}
                      className={`ci-cell${value != null ? " is-in" : i < Math.max(day, 0) || final ? " is-missed" : isToday ? " is-waiting" : " is-ahead"}`}
                      style={{ "--t": `${tilt(p * 7 + i)}deg` } as Style}
                    >
                      {value != null ? (done ? "✓" : value) : i < Math.max(day, 0) || final ? "×" : ""}
                    </span>
                  );
                })}
                {reveal ? <span className="ci-cell ci-cell-flag" aria-hidden="true">★</span> : null}
              </div>
              <span className={`ci-streak${hot ? " is-at-risk" : ""}${streak === 0 ? " is-cold" : ""}`} data-testid="checkin-streak">
                <strong key={streak}>{streak}</strong>
              </span>
            </div>
          );
        })}
      </div>

      <footer className="ci-foot">
        {draft != null && me ? (
          <div className="ci-logger" data-testid="checkin-logger">
            <span className="ci-logger-who">
              <MemberFace name={me.name} color={me.color} size="sm" />
              i did
            </span>
            <button type="button" className="ci-step" data-testid="checkin-less" onClick={() => { playSound("tap"); setDraft(Math.max(1, draft - 5)); }}>−5</button>
            <button type="button" className="ci-step" onClick={() => { playSound("tap"); setDraft(Math.max(1, draft - 1)); }}>−</button>
            <output className="ci-draft" data-testid="checkin-draft" key={draft}>{draft}</output>
            <button type="button" className="ci-step" onClick={() => { playSound("tap"); setDraft(draft + 1); }}>+</button>
            <button type="button" className="ci-step" data-testid="checkin-more" onClick={() => { playSound("tap"); setDraft(draft + 5); }}>+5</button>
            <button type="button" className="ci-log" data-testid="checkin-log" onClick={() => commit(draft)}>
              log it →
            </button>
          </div>
        ) : (
          <p className="ci-status" data-testid="checkin-status">
            {final ? (
              <>that's the lot. <b>{total.toLocaleString("en-US")}</b> {done ? "check-ins" : data.unit}.</>
            ) : today < 0 ? (
              <>starts {weekdayOf(data, 0)}</>
            ) : me && mine == null ? (
              <><b>{me.name.toLowerCase()}</b>, you're the one we're waiting on{canLog ? <> · tap today</> : null}</>
            ) : inToday === data.people.length ? (
              <>all {data.people.length} in today{me ? <> · tap yours to add more</> : null}</>
            ) : (
              <>{inToday} of {data.people.length} in today · waiting on <b>{data.people.filter((p) => logOf(data, p.name, today) == null).map((p) => p.name.toLowerCase()).join(", ")}</b></>
            )}
          </p>
        )}
      </footer>
    </section>
  );
}

export function StandingsWidget({ widget, style }: { widget: Widget; style: Style }) {
  const { widgets } = useContext(BoardLinkContext);
  const settings = readStandings(widget.data);
  const source = widgets.find((w) => w.id === settings.source && w.type === "checkIn");
  const { data, today, day, viewer, final } = useChallenge(source?.data);
  const rows = useMemo(() => rank(data, Math.max(day, 0)), [data, day]);
  const mine = viewer && today >= 0 ? logOf(data, viewer, today) : null;
  const inToday = today >= 0 ? data.people.filter((p) => logOf(data, p.name, today) != null).length : 0;
  /* the one "answer to see" lock (lib/answerToSee.ts LOCKS.standings): log yours, or the reveal opens it for all */
  const locked = Boolean(source) && !seeState(LOCKS.standings, { mine: mine != null, answered: inToday, of: data.people.length, now: Date.now(), resolved: final, player: viewer != null }).open;
  const you = locked ? undefined : rows.find((row) => row.name === viewer);
  const reveal = revealLabel(data);

  /* the flip plays when the lock opens under you, not on a load that's already open */
  /* decided in the render the lock opens in: an effect a frame later painted the
     open rows once, then hid them for the flip ("rows blank before the flip") */
  const [wasLocked, setWasLocked] = useState(locked);
  const [justOpened, setJustOpened] = useState(false);
  if (wasLocked !== locked) {
    setWasLocked(locked);
    if (wasLocked && !locked) setJustOpened(true);
  }

  const open = (value?: number) => {
    window.dispatchEvent(new CustomEvent<OpenLog>(OPEN_LOG, { detail: { source: settings.source, value } }));
  };

  return (
    <section
      className={`widget-shell widget-standings${locked ? " is-locked" : " is-open"}${justOpened ? " is-revealing" : ""}${final ? " is-final" : ""}`}
      style={{ ...style, "--me": findPerson(data, viewer)?.color } as Style}
      data-testid="standings"
      data-state={locked ? "locked" : final ? "final" : "open"}
    >
      <header className="st-head">
        <div>
          <span className="st-kicker">
            {final ? `final${reveal ? ` · ${reveal}` : ""}` : locked ? "face down" : `after day ${Math.min(Math.max(day, 0), data.days - 1) + 1}`}
          </span>
          <h3>{settings.title}</h3>
        </div>
        {!locked && rows[1] ? (
          <span className="st-gap" data-testid="standings-gap">
            <strong>{rows[0].total - rows[1].total}</strong> in it
          </span>
        ) : null}
      </header>

      {!source ? (
        <p className="st-empty" data-testid="standings-waiting">waiting on a check-in</p>
      ) : (
        <ol className="st-rows">
          {rows.map((row, i) => {
            const line = locked ? null : lineFor(row, rows, data, Math.max(day, 0), you);
            const isYou = row.name === viewer && !locked;
            return (
              <li
                key={locked ? i : row.name}
                className={`st-row${isYou ? " is-you" : ""}${i === 0 ? " is-first" : ""}`}
                style={{ "--c": row.color, "--i": i, "--n": rows.length - 1 - i } as Style}
                data-testid="standings-row"
                data-person={locked ? undefined : row.name}
              >
                <span className="st-rank">{i + 1}</span>
                {locked ? (
                  <span className="st-back" aria-hidden="true">
                    <i>?</i>
                  </span>
                ) : (
                  <span className="st-slot">
                  {/* while it flips, the slip it was stays under it until the face covers it */}
                  {justOpened ? (
                    <span className="st-back st-back-under" aria-hidden="true">
                      <i>?</i>
                    </span>
                  ) : null}
                  <span className="st-face">
                    <MemberFace name={row.name} color={row.color} size="md" />
                    <b className="st-name">{row.name.toLowerCase()}{isYou ? <i>you</i> : null}</b>
                    <strong className="st-total">{row.total.toLocaleString("en-US")}</strong>
                    <span className="st-line">
                      <small>{line?.text}</small>
                      {line?.beat && today >= 0 && !final ? (
                        <button type="button" className="st-beat" data-testid="standings-beat" onClick={() => open(line.beat)}>
                          {isYou ? `log ${line.beat}` : `beat ${line.beat! - 1}`}
                        </button>
                      ) : null}
                    </span>
                  </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {locked && source ? (
        <div className="st-lock" data-testid="standings-lock">
          <strong>log yours to see</strong>
          <small>
            {viewer
              ? `${inToday} of ${data.people.length} have logged today. you haven't.`
              : "only the people in it can look"}
          </small>
          {viewer ? (
            <button type="button" className="st-lock-go" data-testid="standings-log" onClick={() => open()}>
              log today →
            </button>
          ) : null}
        </div>
      ) : null}

      {settings.stake ? <p className="st-stake">{settings.stake}</p> : null}
    </section>
  );
}
