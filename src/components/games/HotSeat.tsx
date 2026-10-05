/**
 * The hot seat ("how well do you know maya"), drawn on the game card: the
 * same four beats as any game, with a question about one person where "most
 * likely to" has faces to tap. The questions and their facts come from
 * `lib/games/hotSeat.ts`; this file never words or checks one. Also here:
 * the keepsake a finished game pins to the board, and the scoreboard's pill.
 */
import { useState, type CSSProperties } from "react";
import { AnswerToSee, SeeSlip } from "../AnswerToSee";
import { seeSecondsLeft, type SeeLock } from "../../lib/answerToSee";
import { awardsOf, isIn, ROUND_MS, roundPlayers } from "../../lib/games/engine";
import { askAbout, askFor, distance, SEAT_REACTIONS, seatRanking } from "../../lib/games/hotSeat";
import type { Game, GamePerson, GameRound, HotQuestion, SeatReaction } from "../../lib/games/types";
import { KEEPSAKE_WIDGET_ID, useGames, type GamesApi } from "../../lib/games/useMockGames";
import { AwardSticker, byStyle, GameFace, nameList } from "./parts";
import { goToTurnWidget } from "../YourTurn";
import "./games.css";
import "./hot-seat.css";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const personOf = (game: Game, name: string): GamePerson => game.players.find((p) => same(p.name, name)) ?? game.cast.find((p) => same(p.name, name)) ?? { name, color: "#7c5cff" };
const you = (name: string, me: GamePerson) => (same(name, me.name) ? "you" : name.toLowerCase());
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A number answer as people say it: "6 days", "3 pm". */
function shown(ask: HotQuestion, value: string | number): string {
  const n = Number(value);
  if (ask.range?.clock) return `${n % 12 === 0 ? 12 : n % 12} ${n < 12 ? "am" : "pm"}`;
  return ask.form === "number" ? `${n}` : String(value);
}
const unitOf = (ask: HotQuestion, value: string | number) => (ask.range?.clock || !ask.range?.unit ? "" : Number(value) === 1 ? ask.range.unit.replace(/s$/, "") : ask.range.unit);

/** Leave the game for the card a question came from (a phone's sheet steps aside first). */
function goToFact(api: GamesApi, card?: string) {
  if (!card) return;
  if (api.sheetOpen) {
    api.closeSheet();
    window.setTimeout(() => goToTurnWidget(card), 380);
  } else goToTurnWidget(card);
}

export function HotSeatBody({ api, game, round }: { api: GamesApi; game: Game; round?: GameRound }) {
  if (game.phase === "invite") return <SeatLobby api={api} game={game} />;
  if (game.phase === "done" || !round) return <SeatDone api={api} game={game} />;
  return <SeatRound api={api} game={game} round={round} />;
}

/* ---------- invite: who's in the seat ---------- */

function SeatLobby({ api, game }: { api: GamesApi; game: Game }) {
  const { me } = api;
  const seat = game.seat ?? [];
  const duo = seat.length === 2;
  const mine = same(game.startedBy.name, me.name);
  const playing = isIn(game, me.name);
  const inSeat = !duo && seat.some((p) => same(p.name, me.name));
  const who = duo ? "each other" : you(seat[0].name, me);
  const n = game.rounds.length;
  const short = n < 5;
  const left = game.phaseEndsAt ? Math.max(0, Math.ceil((game.phaseEndsAt - api.now) / 1000)) : undefined;
  const others = api.seatPicks.filter((p) => !seat.some((s) => same(s.name, p.name)));
  return (
    <div className="gm-lobby hs-lobby" data-testid="game-lobby" data-seat={seat.map((p) => p.name).join("+")}>
      <p className="gm-kicker">
        {you(game.startedBy.name, me)} started a game · {plural(n, "question")} the space can answer
      </p>
      <div className="hs-bill">
        <h3 className="gm-title hs-title">
          <span>how well do you know</span>
          {who}
        </h3>
        <span className="hs-chair" key={seat.map((p) => p.name).join("+")}>
          {seat.map((p) => (
            <GameFace key={p.name} person={p} />
          ))}
          <b>{duo ? "both in the seat" : inSeat ? "you're in the hot seat" : "in the hot seat"}</b>
        </span>
      </div>
      {game.seatWhy && (
        <p className="hs-why" data-testid="hot-seat-why">
          <i>the space's pick</i> {game.seatWhy}
        </p>
      )}
      {short && (
        <p className="hs-short" data-testid="hot-seat-short">
          {n < 2
            ? `it doesn't know enough about ${who} to ask yet.`
            : `it knows ${plural(game.known ?? n, "thing")} about ${who} for sure. a round of ${n}, nothing made up.`}
        </p>
      )}
      <p className="gm-how">
        {duo ? "you each answer about the other. both turn over together." : inSeat ? "you don't answer. you watch, and after each reveal you get one tap." : `everyone answers on their own screen. ${seat[0].name.toLowerCase()} watches, then reacts.`}
      </p>
      {mine && !duo && (
        <div className="hs-others" data-testid="hot-seat-others">
          <span>someone else?</span>
          {others.map((p) => (
            <button key={p.name} type="button" data-testid="hot-seat-pick" data-name={p.name} disabled={p.away || p.known < 2} onClick={() => api.reseat(p.name)} title={p.away ? "away: the seat has to be here to react" : `${plural(p.known, "thing")} to ask`}>
              <GameFace person={p} />
              <b>{you(p.name, me)}</b>
              <i>{p.away ? "away" : p.known}</i>
            </button>
          ))}
        </div>
      )}
      <div className="gm-seats hs-seats">
        {game.players.map((player, i) => (
          <span key={player.name} className="gm-seat is-in" style={{ "--i": i } as CSSProperties}>
            <GameFace person={player} />
            <b>{you(player.name, me)}</b>
          </span>
        ))}
      </div>
      <div className="gm-foot">
        <p className="gm-count">
          <b>{game.players.length}</b> in
          {left !== undefined && !mine && <> · starts in {left}</>}
        </p>
        {!playing ? (
          <button type="button" className="gm-go" data-testid="game-join" onClick={api.join}>
            {inSeat ? "sit down →" : "join →"}
          </button>
        ) : mine ? (
          <button type="button" className="gm-go" data-testid="game-begin" onClick={api.begin} disabled={game.players.length < 2 || n < 2}>
            {n < 2 ? "pick someone else" : game.players.length < 2 ? "waiting for one more" : short ? `play ${n} →` : "start →"}
          </button>
        ) : (
          <span className="gm-wait">you're in. {game.startedBy.name.toLowerCase()} starts it</span>
        )}
      </div>
    </div>
  );
}

/* ---------- round ---------- */

function Slider({ ask, onLock }: { ask: HotQuestion; onLock: (value: string) => void }) {
  const range = ask.range ?? { min: 0, max: 10, unit: "" };
  const [value, setValue] = useState(Math.round((range.min + range.max) / 2));
  return (
    <div className="hs-slider">
      <p className="hs-readout">
        <b data-testid="hot-seat-value">{shown(ask, value).split(" ")[0]}</b>
        <span>{shown(ask, value).split(" ")[1] ?? unitOf(ask, value)}</span>
      </p>
      <input type="range" min={range.min} max={range.max} step={1} value={value} data-testid="hot-seat-slider" style={{ "--at": (value - range.min) / (range.max - range.min) } as CSSProperties} onChange={(e) => setValue(Number(e.target.value))} />
      <p className="hs-ends">
        <span>{shown(ask, range.min)}</span>
        <em>closest wins</em>
        <span>{shown(ask, range.max)}</span>
      </p>
      <button type="button" className="gm-go" data-testid="hot-seat-lock" onClick={() => onLock(String(value))}>
        lock it in →
      </button>
    </div>
  );
}

function SeatRound({ api, game, round }: { api: GamesApi; game: Game; round: GameRound }) {
  const { me } = api;
  const playing = isIn(game, me.name);
  const players = roundPlayers(game);
  /* yours to answer: the one that isn't about you. In the seat: the one that is */
  const ask = playing ? askFor(round, me.name) : undefined;
  const mineToWatch = askAbout(round, me.name) ?? round.asks?.[0];
  const mine = round.answers.find((a) => same(a.by, me.name));
  const out = players.filter((p) => !round.answers.some((a) => same(a.by, p.name)));
  const revealed = game.phase === "reveal";
  /* the same lock as any game round: face down until everyone's in or the timer ends */
  const lock: SeeLock = { until: { everyone: true, at: round.revealedAt ?? round.endsAt }, hides: "right-answer", revealsTo: "everyone" };
  const facts = {
    mine: Boolean(mine) || !ask,
    answered: round.answers.length,
    of: players.length,
    now: revealed ? (round.revealedAt ?? api.now) : Math.min(api.now, (round.endsAt ?? api.now + 1) - 1),
    waitingOn: out.filter((p) => !same(p.name, me.name)).map((p) => p.name),
  };
  const left = seeSecondsLeft(lock, api.now) ?? 0;
  const q = ask ?? mineToWatch;
  if (!q) return null;
  const about = personOf(game, q.about);
  const inSeat = playing && !ask;
  return (
    <div className={`gm-round hs-round ${mine ? "has-mine" : ""}`} data-testid="game-round" data-form={q.form}>
      {!revealed && (
        <>
          <div className="gm-prompt hs-prompt" key={round.n}>
            <span className="gm-kicker">
              {round.n + 1} of {game.rounds.length} · about {you(q.about, me)}
            </span>
            <h3>{q.text}</h3>
            <span className="hs-prompt-face" style={byStyle(about)}>
              <GameFace person={about} />
            </span>
          </div>
          {ask && ask.form === "choice" && (
            <div className="hs-opts" data-n={ask.options.length}>
              {ask.options.map((option, i) => (
                <button key={option} type="button" className={`hs-opt ${mine && same(mine.pick, option) ? "is-mine" : ""}`} style={{ "--i": i } as CSSProperties} data-testid="hot-seat-option" data-option={option} disabled={Boolean(mine)} onClick={() => api.pick(option)}>
                  <b>{option}</b>
                  {mine && same(mine.pick, option) && <span className="gm-yours">your answer</span>}
                </button>
              ))}
            </div>
          )}
          {ask && ask.form === "number" && !mine && <Slider key={ask.id} ask={ask} onLock={api.pick} />}
          {ask && ask.form === "number" && mine && (
            <div className="hs-slider is-locked">
              <p className="hs-readout">
                <b>{shown(ask, mine.pick).split(" ")[0]}</b>
                <span>{shown(ask, mine.pick).split(" ")[1] ?? unitOf(ask, mine.pick)}</span>
              </p>
              <span className="gm-yours">your answer</span>
            </div>
          )}
          {!ask && (
            <div className="hs-watch" data-testid="hot-seat-watch">
              <p>{inSeat ? "they're guessing. only you can see this:" : "join to answer. the options:"}</p>
              {q.form === "choice" ? (
                <div className="hs-opts is-shown" data-n={q.options.length}>
                  {q.options.map((option, i) => (
                    <span key={option} className={`hs-opt ${inSeat && same(option, q.right) ? "is-right" : ""}`} style={{ "--i": i } as CSSProperties}>
                      <b>{option}</b>
                      {inSeat && same(option, q.right) && <span className="gm-yours">the answer</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="hs-slider is-locked">
                  <p className="hs-readout">
                    <b>{inSeat ? shown(q, q.right).split(" ")[0] : "?"}</b>
                    <span>{inSeat ? (shown(q, q.right).split(" ")[1] ?? unitOf(q, q.right)) : q.range?.unit}</span>
                  </p>
                  {inSeat && <span className="gm-yours">the answer</span>}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <AnswerToSee
        lock={lock}
        facts={facts}
        className="gm-see"
        cover={
          <div className="gm-slips" data-testid="game-see">
            {players.map((player, i) => (
              <SeeSlip key={player.name} down={round.answers.some((a) => same(a.by, player.name))} mark="✓" i={i}>
                <GameFace person={player} />
              </SeeSlip>
            ))}
            <span className="gm-timer" aria-hidden="true">
              <i style={{ scale: `${Math.max(0, Math.min(1, ((round.endsAt ?? api.now) - api.now) / ROUND_MS))} 1` }} />
            </span>
            <b className="gm-left">{left}</b>
          </div>
        }
        action={
          !playing ? (
            <button type="button" className="gm-go" data-testid="game-join" onClick={api.join}>
              join at question {round.n + 1} →
            </button>
          ) : undefined
        }
      >
        <SeatReveal api={api} game={game} round={round} />
      </AnswerToSee>
    </div>
  );
}

/* ---------- reveal ---------- */

function ReactionSticker({ kind, by, late }: { kind: SeatReaction; by: GamePerson; late: boolean }) {
  const r = SEAT_REACTIONS.find((x) => x.kind === kind) ?? SEAT_REACTIONS[0];
  return (
    <span className={`hs-react is-landed ${late ? "is-late" : ""}`} style={byStyle(by)} data-testid="hot-seat-reaction" data-kind={kind}>
      <i aria-hidden="true">{r.glyph}</i>
      <b>{r.label}</b>
      <em>{by.name.toLowerCase()}</em>
    </span>
  );
}

function SeatReveal({ api, game, round }: { api: GamesApi; game: Game; round: GameRound }) {
  const { me } = api;
  const asks = round.asks ?? [];
  const duo = asks.length > 1;
  const last = round.n === game.rounds.length - 1;
  const mine = round.answers.find((a) => same(a.by, me.name));
  const myAsk = askFor(round, me.name);
  const got = Boolean(mine && round.winners.some((w) => same(w, me.name)));
  const flood = duo ? game.startedBy : personOf(game, asks[0]?.about ?? game.startedBy.name);
  let k = 0;
  const order = new Map<string, number>();
  for (const a of round.answers) order.set(a.by, k++);
  const foot = (
    <div className="gm-rv-foot">
      {mine && myAsk ? (
        <span className={`gm-called ${got ? "is-yes" : ""}`}>{got ? (myAsk.form === "number" ? (distance(myAsk, mine.pick) === 0 ? "spot on · +1" : "closest · +1") : "you knew · +1") : `you said ${shown(myAsk, mine.pick)}`}</span>
      ) : (
        <span className="gm-called">{isIn(game, me.name) ? "you're in the seat" : "you sat this one out"}</span>
      )}
      <button type="button" className="gm-go" data-testid="game-next" onClick={api.next}>
        {last ? (duo ? "how you did →" : "who knows best →") : "next →"}
      </button>
    </div>
  );
  return (
    <div className={`gm-rv gm-rv-a hs-rv ${duo ? "is-duo" : ""}`} data-testid="game-reveal" style={{ ...byStyle(flood), "--votes": Math.max(1, round.answers.length) } as CSSProperties}>
      <div className="gm-rv-landing">
        {asks.map((ask) => {
          const answers = round.answers.filter((a) => askFor(round, a.by) === ask);
          return (
            <div key={ask.id} className="hs-land">
              <p className="gm-rv-prompt">
                <b>{ask.text}</b>
              </p>
              {ask.form === "choice" ? (
                <ul className="hs-land-opts">
                  {ask.options.map((option) => (
                    <li key={option}>
                      <b>{option}</b>
                      <span className="hs-chips">
                        {answers
                          .filter((a) => same(a.pick, option))
                          .map((a) => (
                            <span key={a.by} style={{ "--i": order.get(a.by) ?? 0 } as CSSProperties}>
                              <GameFace person={personOf(game, a.by)} />
                            </span>
                          ))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="hs-track">
                  {answers.map((a) => (
                    <span key={a.by} style={{ "--i": order.get(a.by) ?? 0, "--at": (Number(a.pick) - (ask.range?.min ?? 0)) / Math.max(1, (ask.range?.max ?? 1) - (ask.range?.min ?? 0)) } as CSSProperties}>
                      <GameFace person={personOf(game, a.by)} />
                      <b>{shown(ask, a.pick)}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="gm-flood hs-flood">
        {asks.map((ask) => {
          const about = personOf(game, ask.about);
          const answers = round.answers.filter((a) => askFor(round, a.by) === ask);
          const right = answers.filter((a) => round.winners.some((w) => same(w, a.by)));
          const reaction = round.reactions?.find((r) => same(r.by, ask.about));
          const mineToReact = same(ask.about, me.name) && isIn(game, me.name);
          /* who said what: the right answer's row first */
          const groups =
            ask.form === "choice"
              ? [ask.right, ...ask.options.filter((o) => !same(o, ask.right))].map((option) => ({ option, ok: same(option, ask.right), who: answers.filter((a) => same(a.pick, option)).map((a) => a.by) })).filter((g) => g.who.length > 0)
              : [...answers].sort((a, b) => distance(ask, a.pick) - distance(ask, b.pick)).map((a) => ({ option: `${shown(ask, a.pick)}${unitOf(ask, a.pick) ? ` ${unitOf(ask, a.pick)}` : ""}`, ok: right.includes(a), who: [a.by] }));
          const knew = ask.form === "choice" ? (answers.length === 0 ? "nobody answered" : `${right.length} of ${answers.length} knew`) : right.length ? `${nameList(right.map((a) => you(a.by, me)))} ${right.some((a) => distance(ask, a.pick) === 0) ? "got it exactly" : "came closest"}` : "nobody answered";
          return (
            <section key={ask.id} className="hs-ask" data-about={ask.about}>
              <p className="gm-rv-prompt">{ask.text}</p>
              <div className={`hs-answer is-${ask.form}`}>
                <GameFace person={about} />
                <h3 data-testid="hot-seat-answer">
                  {shown(ask, ask.right)}
                  {unitOf(ask, ask.right) && <small> {unitOf(ask, ask.right)}</small>}
                </h3>
                {reaction && <ReactionSticker kind={reaction.kind} by={about} late={reaction.at - (round.revealedAt ?? reaction.at) > 1200} />}
              </div>
              <span className="gm-said">{knew}</span>
              {!reaction && mineToReact && (
                <div className="hs-reacts" data-testid="hot-seat-reacts" style={byStyle(about)}>
                  <span>your one tap:</span>
                  {SEAT_REACTIONS.map((r, i) => (
                    <button key={r.kind} type="button" style={{ "--i": i } as CSSProperties} data-testid="hot-seat-react" data-kind={r.kind} onClick={() => api.react(r.kind)}>
                      <i aria-hidden="true">{r.glyph}</i>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              {!reaction && !mineToReact && isIn(game, ask.about) && <span className="hs-pending">{ask.about.toLowerCase()} is picking a reaction…</span>}
              <ul className="gm-receipt">
                {groups.map((g) => (
                  <li key={g.option + g.who.join()} className={g.ok ? "is-ok" : ""}>
                    <span className="gm-receipt-faces">
                      {g.who.map((voter) => (
                        <GameFace key={voter} person={personOf(game, voter)} />
                      ))}
                    </span>
                    <span>
                      {nameList(g.who.map((voter) => you(voter, me)))} said <b>{g.option}</b>
                    </span>
                    {g.ok && <i aria-hidden="true">✓</i>}
                  </li>
                ))}
                <li className="hs-fact-row">
                  <button type="button" className="hs-fact" data-testid="hot-seat-fact" data-card={ask.fact.card} data-key={ask.fact.key} onClick={() => goToFact(api, ask.fact.card)}>
                    <span>↳ {ask.fact.from}</span>
                    {ask.fact.card && <i>see it →</i>}
                  </button>
                </li>
              </ul>
            </section>
          );
        })}
        {foot}
      </div>
    </div>
  );
}

/* ---------- done: who knows them best ---------- */

function SeatDone({ api, game }: { api: GamesApi; game: Game }) {
  const { me } = api;
  const seat = game.seat ?? [];
  const duo = seat.length === 2;
  const rows = seatRanking(game);
  const awards = awardsOf(game);
  const who = duo ? "each other" : you(seat[0]?.name ?? "", me);
  const best = rows[0];
  const tied = duo && rows[1] && rows[1].points === best?.points;
  const reactions = game.rounds.flatMap((r) => r.reactions ?? []);
  const line = (i: number, points: number) => (i === 0 ? "reads the room's notes" : points === rows[i - 1].points ? `level with ${you(rows[i - 1].name, me)}` : i === rows.length - 1 && rows.length > 2 ? "was there, though" : `${rows[i - 1].points - points} behind ${you(rows[i - 1].name, me)}`);
  return (
    <div className="gm-wall hs-done" data-testid="game-awards">
      <p className="gm-kicker">
        {plural(game.rounds.length, "question")} · every answer is on the board somewhere
      </p>
      <h3 className="gm-title">
        {!best || best.points === 0 ? "nobody" : tied ? "you two" : you(best.name, me)}{" "}
        <span>{tied ? "know each other the same" : duo ? `know${best && same(best.name, me.name) ? "" : "s"} ${you(seat.find((p) => !same(p.name, best?.name ?? ""))?.name ?? "", me)} best` : `know${best && same(best.name, me.name) ? "" : "s"} ${who} best`}</span>
      </h3>
      <ol className="hs-podium" data-testid="hot-seat-podium">
        {rows.map((row, i) => {
          const award = awards.find((a) => same(a.to, row.name));
          return (
            <li key={row.name} className={same(row.name, me.name) ? "is-me" : ""} style={byStyle(row, { "--i": i })} data-testid="hot-seat-rank" data-name={row.name}>
              <b className="hs-place">{i + 1}</b>
              <GameFace person={row} />
              <span className="hs-rank-name">
                <b>{you(row.name, me)}</b>
                {award && i > 0 ? <AwardSticker award={award} i={i} /> : <em>{line(i, row.points)}</em>}
              </span>
              {award && i === 0 && <AwardSticker award={award} i={i} land />}
              <strong>
                {row.points}
                <small>/{row.of}</small>
              </strong>
            </li>
          );
        })}
      </ol>
      {reactions.length > 0 && !duo && seat[0] && (
        <p className="hs-said" style={byStyle(seat[0])}>
          <GameFace person={seat[0]} />
          <span>{you(seat[0].name, me)} said</span>
          {SEAT_REACTIONS.map((r) => {
            const n = reactions.filter((x) => x.kind === r.kind).length;
            return n ? (
              <b key={r.kind}>
                {r.glyph} {r.label}
                {n > 1 ? ` ×${n}` : ""}
              </b>
            ) : null;
          })}
        </p>
      )}
      <div className="gm-foot">
        <button type="button" className="gm-ghost" data-testid="hot-seat-to-keepsake" onClick={() => goToFact(api, KEEPSAKE_WIDGET_ID)}>
          it's on the board ↗
        </button>
        <button type="button" className="gm-go" data-testid="game-rematch" onClick={api.rematch}>
          {duo ? "again →" : "someone else →"}
        </button>
      </div>
    </div>
  );
}

/* ---------- what stays on the board ---------- */

const when = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();

/** The keepsake: the questions, the right answers and the reactions, as a
    paper card pinned by the cards the answers came from. */
export function Keepsake() {
  const api = useGames();
  const keep = api?.keepsake;
  if (!api || !keep) return null;
  const { me } = api;
  return (
    <section className="widget-shell hs-keep" data-testid="hot-seat-keepsake" style={byStyle(keep.seat[0])}>
      <span className="hs-keep-tape" aria-hidden="true" />
      <header>
        <span className="hs-keep-faces">
          {keep.seat.map((p) => (
            <GameFace key={p.name} person={p} />
          ))}
        </span>
        <span>
          <em>
            played {when(keep.at)}
            {keep.why ? ` · ${keep.why.replace(/ in \d+ days?$/, " week")}` : ""}
          </em>
          <h3>{keep.title}</h3>
        </span>
      </header>
      <ol>
        {keep.rows.map((row, i) => {
          const reaction = SEAT_REACTIONS.find((r) => r.kind === row.reaction);
          return (
            <li key={row.ask.id + i}>
              <button type="button" data-testid="keepsake-row" data-card={row.ask.fact.card} onClick={() => row.ask.fact.card && goToTurnWidget(row.ask.fact.card)} title={row.ask.fact.from}>
                <span>{row.ask.text}</span>
                <b>
                  {shown(row.ask, row.ask.right)}
                  {unitOf(row.ask, row.ask.right) ? ` ${unitOf(row.ask, row.ask.right)}` : ""}
                </b>
                <small>
                  {row.got} of {row.of}
                </small>
              </button>
              {reaction && (
                <span className="hs-keep-react" style={{ "--i": i } as CSSProperties} title={`${row.ask.about.toLowerCase()} said`}>
                  {reaction.glyph} {reaction.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {keep.best && keep.best.points > 0 && (
        <footer style={byStyle(keep.best)}>
          <GameFace person={keep.best} />
          <span>
            <b>{you(keep.best.name, me)}</b> knew best · {keep.best.points} of {keep.best.of}
          </span>
        </footer>
      )}
    </section>
  );
}

/** The scoreboard's third pill. */
export function SeatStart() {
  const api = useGames();
  if (!api || !api.seatName || (api.game && api.game.phase !== "done")) return null;
  return (
    <button type="button" className="gm-go" data-testid="hot-seat-start" onClick={() => api.startSeat()}>
      {api.seatName} →
    </button>
  );
}
