/**
 * The room scoreboard: this week's points and award stickers across games,
 * and where a game is started from. Face down until you've played one
 * ("answer to see", per person). Kind on purpose: every row gets a line worth
 * reading, and last place gets the best one.
 */
import type { CSSProperties } from "react";
import { AnswerToSee, SeeSlip } from "../AnswerToSee";
import { LOCKS, type SeeLock } from "../../lib/answerToSee";
import type { ScoreRow } from "../../lib/games/types";
import { useGames } from "../../lib/games/useMockGames";
import { AwardSticker, byStyle, GameFace } from "./parts";
import { JigsawStart } from "./Jigsaw";
import { SeatStart } from "./HotSeat";
import "./games.css";

const LOCK: SeeLock = LOCKS.scoreboard;

/** One line per row. Nobody's line is a number alone. */
function kindLine(row: ScoreRow, i: number, rows: ScoreRow[]): string {
  const last = i === rows.length - 1 && rows.length > 2;
  const mostStickers = row.awards.length > 0 && row.awards.length === Math.max(...rows.map((r) => r.awards.length));
  if (i === 0) return "reads the room";
  if (last) return row.awards.length ? "last. loved anyway" : "last place calls the rematch";
  if (mostStickers) return row.awards.length > 1 ? `${row.awards.length} stickers. famous in here` : "famous in here";
  if (row.points === rows[i - 1].points) return `level with ${rows[i - 1].name.toLowerCase()}`;
  return `${rows[i - 1].points - row.points} behind ${rows[i - 1].name.toLowerCase()}`;
}

export function Scoreboard() {
  const api = useGames();
  if (!api) return null;
  const { rows, me, game } = api;
  const on = game && game.phase !== "done";
  const start = (
    <button type="button" className="gm-go" data-testid="game-start" onClick={api.start}>
      {on ? "it's on. go →" : `play ${api.gameName} →`}
    </button>
  );
  return (
    <section className="widget-shell sb" data-testid="scoreboard">
      <header className="sb-head">
        <span className="sb-kicker">this week · resets {api.resets}</span>
        <h3>scoreboard</h3>
      </header>
      <AnswerToSee
        lock={LOCK}
        facts={{ mine: api.played, answered: rows.filter((r) => r.played > 0).length, of: rows.length, now: api.now }}
        className="sb-see"
        cover={
          <div className="sb-rows is-down" data-testid="scoreboard-locked">
            {rows.slice(0, 6).map((row, i) => (
              <SeeSlip key={row.name} down i={i}>
                <b className="sb-rank">{i + 1}</b>
              </SeeSlip>
            ))}
            <div className="sb-gate">
              <strong>play one to see</strong>
              <span>{rows.filter((r) => r.points > 0).length} of us are on it this week</span>
            </div>
          </div>
        }
      >
        <ol className="sb-rows" data-testid="scoreboard-open">
          {rows.slice(0, 7).map((row, i) => (
            <li key={row.name} className={`sb-row ${row.name === me.name ? "is-me" : ""}`} style={byStyle(row, { "--i": i })} data-testid="scoreboard-row">
              <b className="sb-rank">{i + 1}</b>
              <span className="sb-who">
                <GameFace person={row} />
                {row.awards.slice(-3).map((a, j) => (
                  <AwardSticker key={a.id} award={a} size="dot" i={j} />
                ))}
              </span>
              <span className="sb-name">
                <b>{row.name === me.name && me.name === "You" ? "you" : row.name.toLowerCase()}</b>
                <em>{kindLine(row, i, rows)}</em>
              </span>
              <strong className="sb-pts">{row.points}</strong>
            </li>
          ))}
        </ol>
      </AnswerToSee>
      <footer className="sb-foot" style={{ "--n": rows.length } as CSSProperties}>
        {api.challenge ? (
          /* a running challenge in this room rides on the same card, behind the same kind of lock */
          <div className="sb-slot sb-challenge" data-testid="scoreboard-challenge" data-open={api.challenge.open ? "true" : "false"}>
            <span>
              {api.challenge.title.toLowerCase()} · day {api.challenge.day} of {api.challenge.days}
            </span>
            {api.challenge.open ? (
              <ol>
                {api.challenge.rows.slice(0, 4).map((r, i) =>
                  r ? (
                    <li key={r.name} style={byStyle(r)} data-testid="scoreboard-challenge-row">
                      <b>{i + 1}</b>
                      <GameFace person={r} />
                      <em>{r.name.toLowerCase()}</em>
                      <strong>{r.total}</strong>
                    </li>
                  ) : null,
                )}
              </ol>
            ) : (
              <em>{api.challenge.rows.length} in · face down until you log today</em>
            )}
          </div>
        ) : (
          <span className="sb-slot">the challenge · standings land here</span>
        )}
        {api.notice ? <span className="sb-notice" data-testid="game-notice">{api.notice}</span> : null}
        {start}
        <SeatStart />
        <JigsawStart />
      </footer>
    </section>
  );
}
