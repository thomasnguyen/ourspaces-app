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
import { AwardSticker, byStyle, GameFace } from "./parts";
import "./games.css";

export function GameInvite() {
  const api = useGames();
  const game = api?.game;
  if (!api || !game || game.phase === "done" || api.inviteHidden || isIn(game, api.me.name)) return null;
  const lobby = game.phase === "invite";
  const left = game.phaseEndsAt ? Math.max(0, Math.ceil((game.phaseEndsAt - api.now) / 1000)) : undefined;
  return (
    <aside className="gmi" style={byStyle(game.startedBy)} data-testid="game-invite" key={game.id}>
      <GameFace person={game.startedBy} />
      <p>
        <b>
          {game.startedBy.name.toLowerCase()} started {game.name}
        </b>
        <span>
          {game.players.length} in · {lobby ? (left !== undefined ? `starts in ${left}` : "starting soon") : `round ${game.round + 1} of ${game.rounds.length}, jump in`}
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
  if (!api || !api.gameName) return null;
  const game = api.game;
  const on = game && game.phase !== "done";
  return (
    <button
      type="button"
      className={`gm-door ${on ? "is-on" : ""}`}
      data-testid="game-door"
      onClick={() => (on ? (isIn(game, api.me.name) ? api.start() : api.join()) : onGo(SCOREBOARD_WIDGET_ID))}
    >
      <i aria-hidden="true">▶</i>
      {on ? `${game.name} is on` : "games"}
    </button>
  );
}

export function GameSheet() {
  const api = useGames();
  if (!api?.game || !api.sheetOpen) return null;
  return (
    <div className="gm-sheet">
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
      back to {game.name} →
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
