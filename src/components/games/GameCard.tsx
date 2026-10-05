/**
 * The game card: one card on the board with a life. invite → round → reveal
 * → done, all on the same surface, so a game's result is still there after.
 * The same component is the phone's play sheet (`sheet`). It reads the room's
 * game through `useGames()` and knows nothing about who is simulated.
 */
import type { CSSProperties } from "react";
import { AnswerToSee, SeeSlip } from "../AnswerToSee";
import { seeSecondsLeft, type SeeLock } from "../../lib/answerToSee";
import { awardsOf, closestCall, currentRound, isIn, pointsOf, ROUND_MS, tally } from "../../lib/games/engine";
import type { Game, GamePerson, GameRound } from "../../lib/games/types";
import { SCOREBOARD_WIDGET_ID, useGames, type GamesApi } from "../../lib/games/useMockGames";
import { AwardSticker, byStyle, GameFace, nameList } from "./parts";
import { goToTurnWidget } from "../YourTurn";
import "./games.css";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const personOf = (game: Game, name: string): GamePerson =>
  game.players.find((p) => same(p.name, name)) ?? game.cast.find((p) => same(p.name, name)) ?? { name, color: "#7c5cff" };
const you = (name: string, me: GamePerson) => (same(name, me.name) ? "you" : name.toLowerCase());

export function GameCard({ sheet = false }: { sheet?: boolean }) {
  const api = useGames();
  const game = api?.game;
  if (!api || !game) return null;
  const round = currentRound(game);
  const playing = isIn(game, api.me.name);
  return (
    <section
      className={`gm at-${game.phase} ${sheet ? "is-sheet" : "widget-shell"} ${playing ? "is-playing" : "is-watching"}`}
      data-testid={sheet ? "game-sheet" : "game-card"}
      data-phase={game.phase}
      data-round={game.round + 1}
      data-cast={game.cast.length}
      style={byStyle(game.startedBy)}
    >
      <header className="gm-head">
        <span className="gm-name">
          <i aria-hidden="true" />
          {game.name}
        </span>
        <span className="gm-dots" aria-label={`round ${game.round + 1} of ${game.rounds.length}`}>
          {game.rounds.map((r) => (
            <i key={r.n} className={r.revealedAt !== undefined ? "is-done" : r.n === game.round && game.phase !== "invite" ? "is-on" : ""} />
          ))}
        </span>
        {sheet && (
          <button type="button" className="gm-close" data-testid="game-sheet-close" onClick={api.closeSheet}>
            board ↗
          </button>
        )}
      </header>
      {game.phase === "invite" && <Lobby api={api} game={game} />}
      {(game.phase === "round" || game.phase === "reveal") && round && <Round api={api} game={game} round={round} />}
      {game.phase === "done" && <AwardsWall api={api} game={game} />}
    </section>
  );
}

/* ---------- invite ---------- */

function Lobby({ api, game }: { api: GamesApi; game: Game }) {
  const { me } = api;
  const mine = same(game.startedBy.name, me.name);
  const playing = isIn(game, me.name);
  const waiting = game.cast.filter((person) => !isIn(game, person.name)).slice(0, Math.max(0, 6 - game.players.length));
  const left = game.phaseEndsAt ? Math.max(0, Math.ceil((game.phaseEndsAt - api.now) / 1000)) : undefined;
  return (
    <div className="gm-lobby" data-testid="game-lobby">
      <p className="gm-kicker">
        {you(game.startedBy.name, me)} started a game · {game.rounds.length} quick ones about us
      </p>
      <h3 className="gm-title">{game.name}…</h3>
      <p className="gm-how">tap a face. everyone's picks turn over at the same moment.</p>
      <div className="gm-seats">
        {game.players.map((player, i) => (
          <span key={player.name} className="gm-seat is-in" style={{ "--i": i } as CSSProperties}>
            <GameFace person={player} />
            <b>{you(player.name, me)}</b>
          </span>
        ))}
        {waiting.map((person) => (
          <span key={person.name} className="gm-seat is-out">
            <span className="gm-face is-empty" />
            <b>{person.name.toLowerCase()}</b>
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
            join →
          </button>
        ) : mine ? (
          <button type="button" className="gm-go" data-testid="game-begin" onClick={api.begin} disabled={game.players.length < 2}>
            {game.players.length < 2 ? "waiting for one more" : "start →"}
          </button>
        ) : (
          <span className="gm-wait">you're in. {game.startedBy.name.toLowerCase()} starts it</span>
        )}
      </div>
    </div>
  );
}

/* ---------- round + reveal ---------- */

function Round({ api, game, round }: { api: GamesApi; game: Game; round: GameRound }) {
  const { me } = api;
  const playing = isIn(game, me.name);
  const mine = round.answers.find((a) => same(a.by, me.name));
  const out = game.players.filter((p) => !round.answers.some((a) => same(a.by, p.name)));
  const revealed = game.phase === "reveal";
  /* the round's answers: face down until everyone is in or the timer ends,
     then turned over for the whole room at the same moment */
  const lock: SeeLock = { until: { everyone: true, at: round.revealedAt ?? round.endsAt }, hides: "answers", revealsTo: "everyone" };
  const facts = {
    mine: Boolean(mine),
    answered: round.answers.length,
    of: game.players.length,
    now: revealed ? (round.revealedAt ?? api.now) : Math.min(api.now, (round.endsAt ?? api.now + 1) - 1),
    waitingOn: out.filter((p) => !same(p.name, me.name)).map((p) => p.name),
  };
  const left = seeSecondsLeft(lock, api.now) ?? 0;
  return (
    <div className={`gm-round ${mine ? "has-mine" : ""}`} data-testid="game-round">
      {!revealed && (
        <>
          <div className="gm-prompt" key={round.n}>
            <span className="gm-kicker">
              {round.n + 1} of {game.rounds.length} · {game.name}…
            </span>
            <h3>{round.prompt.text}</h3>
            <em>{round.prompt.from}</em>
          </div>
          <div className="gm-cast">
            {game.cast.map((person, i) => (
              <button
                key={person.name}
                type="button"
                className={`gm-pick ${mine && same(mine.pick, person.name) ? "is-mine" : ""}`}
                style={byStyle(person, { "--i": i })}
                data-testid="game-pick"
                data-name={person.name}
                disabled={!playing || Boolean(mine)}
                onClick={() => api.pick(person.name)}
              >
                <GameFace person={person} />
                <b>{you(person.name, me)}</b>
                {mine && same(mine.pick, person.name) && <span className="gm-yours">your pick</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <AnswerToSee
        lock={lock}
        facts={facts}
        className="gm-see"
        testId="game-see"
        cover={
          <div className="gm-slips">
            {game.players.map((player, i) => {
              const down = round.answers.some((a) => same(a.by, player.name));
              return (
                <SeeSlip key={player.name} down={down} mark="✓" i={i}>
                  <GameFace person={player} />
                </SeeSlip>
              );
            })}
            <span className="gm-timer" aria-hidden="true">
              <i style={{ scale: `${Math.max(0, Math.min(1, ((round.endsAt ?? api.now) - api.now) / ROUND_MS))} 1` }} />
            </span>
            <b className="gm-left">{left}</b>
          </div>
        }
        action={
          !playing ? (
            <button type="button" className="gm-go" data-testid="game-join" onClick={api.join}>
              join at round {round.n + 1} →
            </button>
          ) : undefined
        }
      >
        <Reveal api={api} game={game} round={round} />
      </AnswerToSee>
    </div>
  );
}

function Reveal({ api, game, round }: { api: GamesApi; game: Game; round: GameRound }) {
  const { me, look } = api;
  const rows = tally(game, round);
  const voted = rows.filter((row) => row.voters.length > 0);
  const winners = round.winners.map((name) => personOf(game, name));
  const top = voted[0]?.voters.length ?? 0;
  const mine = round.answers.find((a) => same(a.by, me.name));
  const called = Boolean(mine && round.winners.some((w) => same(w, mine.pick)));
  const last = round.n === game.rounds.length - 1;
  const award = awardsOf(game).find((a) => a.id.startsWith(`${game.id}:${round.n}:`));
  const two = game.cast.length === 2;
  const headline = winners.length === 0 ? (two ? "a split" : "nobody agrees") : nameList(winners.map((w) => you(w.name, me)));
  const said = winners.length === 0 ? (two ? round.answers.map((a) => `${you(a.by, me)} said ${you(a.pick, me)}`).join(" · ") : "no sticker for this one") : two ? "you both said so" : `${top} of ${round.answers.length} said so`;
  /* the order votes land in: one per face in turn, so the count builds */
  const order = new Map<string, number>();
  let k = 0;
  for (let depth = 0; depth < top; depth += 1) for (const row of voted) if (row.voters[depth]) order.set(`${row.person.name}:${row.voters[depth]}`, k++);
  const votes = k;
  const foot = (
    <div className="gm-rv-foot">
      {mine ? <span className={`gm-called ${called ? "is-yes" : ""}`}>{called ? "you called it · +1" : `you said ${you(mine.pick, me)}`}</span> : <span className="gm-called">you sat this one out</span>}
      <button type="button" className="gm-go" data-testid="game-next" onClick={api.next}>
        {last ? "the awards →" : "next →"}
      </button>
    </div>
  );
  const promptLine = (
    <p className="gm-rv-prompt">
      {game.name} <b>{round.prompt.text}</b>
    </p>
  );
  const sticker = award && winners.length > 0 && <AwardSticker award={award} size="lg" land />;

  if (look === "b") {
    /* B · the slips: who said who, turned over one at a time */
    const slips = [...round.answers].sort((a, b) => rows.findIndex((r) => same(r.person.name, a.pick)) - rows.findIndex((r) => same(r.person.name, b.pick)));
    return (
      <div className="gm-rv gm-rv-b" data-testid="game-reveal" style={{ "--votes": slips.length } as CSSProperties}>
        {promptLine}
        <ul className="gm-rv-slips">
          {slips.map((a, i) => (
            <li key={a.by} style={byStyle(personOf(game, a.pick), { "--i": i })} className={round.winners.some((w) => same(w, a.pick)) ? "is-top" : ""}>
              <GameFace person={personOf(game, a.by)} />
              <span>{you(a.by, me)} said</span>
              <b>{you(a.pick, me)}</b>
              <GameFace person={personOf(game, a.pick)} />
            </li>
          ))}
        </ul>
        <div className="gm-rv-win" style={winners[0] ? byStyle(winners[0]) : undefined}>
          <div>
            <h3>{headline}</h3>
            <span>{said}</span>
          </div>
          {sticker}
        </div>
        {foot}
      </div>
    );
  }

  if (look === "c") {
    /* C · the count: votes stack up in rows, the longest row wins */
    return (
      <div className="gm-rv gm-rv-c" data-testid="game-reveal" style={{ "--votes": votes } as CSSProperties}>
        {promptLine}
        <ul className="gm-rv-rows">
          {voted.map((row) => (
            <li key={row.person.name} style={byStyle(row.person)} className={round.winners.some((w) => same(w, row.person.name)) ? "is-top" : ""}>
              <GameFace person={row.person} />
              <span className="gm-rv-bar">
                {row.voters.map((voter) => (
                  <span key={voter} style={{ "--i": order.get(`${row.person.name}:${voter}`) ?? 0 } as CSSProperties}>
                    <GameFace person={personOf(game, voter)} />
                  </span>
                ))}
              </span>
              <b>{row.voters.length}</b>
            </li>
          ))}
        </ul>
        <div className="gm-rv-win" style={winners[0] ? byStyle(winners[0]) : undefined}>
          <div>
            <h3>{headline}</h3>
            <span>{said}</span>
          </div>
          {sticker}
        </div>
        {foot}
      </div>
    );
  }

  /* A · the flood: votes land on the faces, then the card goes the winner's colour */
  return (
    <div className={`gm-rv gm-rv-a ${winners.length === 0 ? "is-split" : ""}`} data-testid="game-reveal" style={{ ...(winners[0] ? byStyle(winners[0]) : {}), "--votes": votes } as CSSProperties}>
      <div className="gm-rv-landing">
        {promptLine}
        <div className="gm-cast">
          {game.cast.map((person) => {
            const row = rows.find((r) => same(r.person.name, person.name));
            return (
              <span key={person.name} className="gm-pick" style={byStyle(person)}>
                <GameFace person={person} />
                <b>{you(person.name, me)}</b>
                <span className="gm-chips">
                  {row?.voters.map((voter) => (
                    <span key={voter} style={{ "--i": order.get(`${person.name}:${voter}`) ?? 0 } as CSSProperties}>
                      <GameFace person={personOf(game, voter)} />
                    </span>
                  ))}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="gm-flood">
        {promptLine}
        <div className="gm-hero">
          {(winners.length ? winners : voted.map((row) => row.person)).slice(0, 3).map((person) => (
            <GameFace key={person.name} person={person} />
          ))}
          {winners.length > 0 && <strong className="gm-num">{top}</strong>}
        </div>
        <h3>{headline}</h3>
        <span className="gm-said">{said}</span>
        {sticker}
        {/* the receipt: who said who stays on the card, it's the part people roast */}
        <ul className="gm-receipt">
          {voted.map((row) => (
            <li key={row.person.name}>
              <span className="gm-receipt-faces">
                {row.voters.map((voter) => (
                  <GameFace key={voter} person={personOf(game, voter)} />
                ))}
              </span>
              <span>
                {nameList(row.voters.map((voter) => you(voter, me)))} said <b>{row.voters.some((voter) => same(voter, row.person.name)) && row.voters.length === 1 ? (same(row.person.name, me.name) ? "yourself" : "themselves") : you(row.person.name, me)}</b>
              </span>
            </li>
          ))}
        </ul>
        {foot}
      </div>
    </div>
  );
}

/* ---------- done: what stays on the card ---------- */

function AwardsWall({ api, game }: { api: GamesApi; game: Game }) {
  const { me } = api;
  const awards = awardsOf(game);
  const counts = new Map<string, number>();
  for (const a of awards) counts.set(a.to, (counts.get(a.to) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  const champs = [...counts].filter(([, n]) => n === most && most > 0).map(([name]) => name);
  const close = closestCall(game);
  const points = pointsOf(game)[me.name] ?? 0;
  const played = isIn(game, me.name);
  const people = game.cast.filter((p) => counts.has(p.name));
  return (
    <div className="gm-wall" data-testid="game-awards">
      <p className="gm-kicker">the awards · {game.rounds.length} rounds</p>
      <h3 className="gm-title">
        {champs.length ? nameList(champs.map((name) => you(name, me))) : "nobody"} <span>took {most > 1 ? `${most} stickers` : most === 1 ? "one each" : "none"}</span>
      </h3>
      <ul className="gm-wall-list">
        {people.map((person, i) => (
          <li key={person.name} style={byStyle(person, { "--i": i })}>
            <GameFace person={person} />
            <b>{you(person.name, me)}</b>
            <span className="gm-wall-stickers">
              {awards
                .filter((a) => same(a.to, person.name))
                .map((a, j) => (
                  <AwardSticker key={a.id} award={a} i={i + j} />
                ))}
            </span>
          </li>
        ))}
      </ul>
      {close && (
        <p className="gm-close-call">
          <span>closest call</span> {close.round.prompt.text}: {close.line}
        </p>
      )}
      <div className="gm-foot">
        <p className="gm-count">{played ? <><b>{points}</b> of {game.rounds.length} called</> : <>you missed this one</>}</p>
        <button type="button" className="gm-ghost" data-testid="game-to-board" onClick={() => (api.sheetOpen ? api.closeSheet() : goToTurnWidget(SCOREBOARD_WIDGET_ID))}>
          scoreboard
        </button>
        <button type="button" className="gm-go" data-testid="game-rematch" onClick={api.rematch}>
          rematch →
        </button>
      </div>
    </div>
  );
}
