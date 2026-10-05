/**
 * How the room finds out. `GameInvite`: a strip in the starter's colour for
 * people who are here and not in the game yet; one join control; it sits out
 * of the way and can be put away (the "your turn" ticket stays). `GameSheet`:
 * the game card as a phone's play surface. `AwardDots`: the stickers a person
 * has won, small enough to ride on an avatar.
 */
import { isIn } from "../../lib/games/engine";
import { SCOREBOARD_WIDGET_ID, useGames } from "../../lib/games/useMockGames";
import { GameCard } from "./GameCard";
import { useJigsaw } from "../../lib/jigsaw/useMockJigsaw";
import { AwardSticker, byStyle, GameFace, useNoticeAside } from "./parts";
import "./games.css";

export function GameInvite() {
  const api = useGames();
  const game = api?.game;
  const showing = Boolean(api && game && game.phase !== "done" && !api.inviteHidden && !isIn(game, api.me.name));
  useNoticeAside(showing);
  if (!api || !game || !showing) return null;
  const lobby = game.phase === "invite";
  const left = game.phaseEndsAt ? Math.max(0, Math.ceil((game.phaseEndsAt - api.now) / 1000)) : undefined;
  /* the person a hot seat is about gets their own wording */
  const seated = game.seat?.length === 1 && game.seat[0].name.toLowerCase() === api.me.name.toLowerCase();
  if (seated)
    return (
      <aside className="gmi" style={byStyle(game.startedBy)} data-testid="game-invite" data-seat="you" key={game.id}>
        <GameFace person={game.startedBy} />
        <p>
          <b>you're in the hot seat</b>
          <span>
            {game.startedBy.name.toLowerCase()} started a game about you · {game.players.length} in{lobby && left !== undefined ? ` · starts in ${left}` : ""}
          </span>
        </p>
        <button type="button" className="gmi-join" data-testid="game-invite-join" onClick={api.join}>
          sit down →
        </button>
        <button type="button" className="gmi-hide" data-testid="game-invite-hide" aria-label="not now" onClick={api.hideInvite}>
          ×
        </button>
      </aside>
    );
  return (
    <aside className="gmi" style={byStyle(game.startedBy)} data-testid="game-invite" key={game.id}>
      <GameFace person={game.startedBy} />
      <p>
        <b>
          {game.startedBy.name.toLowerCase()} started {game.name}
        </b>
        <span>
          {game.players.length} in · {lobby ? (left !== undefined ? `starts in ${left}` : "starting soon") : `${game.kind === "hot-seat" ? "question" : "round"} ${game.round + 1} of ${game.rounds.length}, jump in`}
        </span>
      </p>
      <button type="button" className="gmi-join" data-testid="game-invite-join" onClick={api.join}>
        join →
      </button>
      <button type="button" className="gmi-hide" data-testid="game-invite-hide" aria-label="not now" onClick={api.hideInvite}>
        ×
      </button>
    </aside>
  );
}

/** The header chip: where games live. Flies to the scoreboard; while a game
    is on it says so and takes you to it (joining if you aren't in). */
export function GameDoor({ onGo }: { onGo: (widgetId: string) => void }) {
  const api = useGames();
  const jig = useJigsaw();
  if (!api || !api.gameName) return null;
  const game = api.game;
  const on = game && game.phase !== "done";
  /* a puzzle on the board is a game that's on, too */
  if (!on && jig?.run?.phase === "on")
    return (
      <button type="button" className="gm-door is-on" data-testid="game-door" onClick={() => jig.start()}>
        <i aria-hidden="true">▶</i>a puzzle is on
      </button>
    );
  return (
    <button
      type="button"
      className={`gm-door ${on ? "is-on" : ""}`}
      data-testid="game-door"
      onClick={() => (on ? (isIn(game, api.me.name) ? api.start() : api.join()) : onGo(SCOREBOARD_WIDGET_ID))}
    >
      <i aria-hidden="true">▶</i>
      {on ? `${game.kind === "hot-seat" ? "the hot seat" : game.name} is on` : "games"}
    </button>
  );
}

export function GameSheet() {
  const api = useGames();
  if (!api?.game || !api.sheetOpen) return null;
  return (
    <div className="gm-sheet" data-testid="game-sheet">
      <GameCard sheet />
    </div>
  );
}

/** A small tab that brings a phone's play sheet back while a game is on. */
export function GameSheetTab() {
  const api = useGames();
  const game = api?.game;
  if (!api || !game || api.sheetOpen || game.phase === "done" || !isIn(game, api.me.name)) return null;
  return (
    <button type="button" className="gm-sheet-tab" data-testid="game-sheet-tab" onClick={api.openSheet} style={byStyle(game.startedBy)}>
      back to {game.kind === "hot-seat" ? "the hot seat" : game.name} →
    </button>
  );
}

export function AwardDots({ name, max = 3 }: { name: string; max?: number }) {
  const api = useGames();
  const mine = api?.awards.filter((a) => a.to.toLowerCase() === name.toLowerCase()) ?? [];
  if (mine.length === 0) return null;
  return (
    <span className="gm-dots-on" data-testid="award-dots">
      {mine.slice(-max).map((a, i) => (
        <AwardSticker key={a.id} award={a} size="dot" i={i} />
      ))}
    </span>
  );
}

/** The same, as full stickers under a name ("what this space knows"). */
export function AwardRow({ name }: { name: string }) {
  const api = useGames();
  const mine = api?.awards.filter((a) => a.to.toLowerCase() === name.toLowerCase()) ?? [];
  if (mine.length === 0) return null;
  return (
    <span className="gm-award-row" data-testid="award-row">
      {mine.slice(-3).map((a, i) => (
        <AwardSticker key={a.id} award={a} size="md" i={i} />
      ))}
    </span>
  );
}
