/**
 * Games in mock mode: the room's game state for one tab, with the other
 * players simulated. The rules are `engine.ts`; this file is only the clock,
 * the pretend people and the state URLs. A live room would replace it with
 * queries and mutations over the same `Game` rows.
 *
 *   ?game=start     you start one, as if you'd said "let's play most likely to"
 *   ?game=invited   someone else starts one a moment after you arrive
 *   ?game=late      a game is already on round three when you arrive
 *   ?game=lobby | round | answered | reveal | awards   held still, for sheets
 *     &round=<1-5>  which round the held state shows
 *     &live=1       let a held state run on from there (takes)
 *   &gameRoom=crew  the room it happens in (default: the one you opened)
 *   &reveal=a|b|c   the reveal direction (default: the pick)
 *   ?board=open     the scoreboard face up without playing
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ROOM_GAMES, type MockPrompt } from "../../data/games";
import { answer, awardsOf, beginRound, currentRound, everyoneIn, isIn, joinGame, newGame, nextRound, reveal, scoreRows } from "./engine";
import type { Award, Game, GamePerson, ScoreRow } from "./types";
import { panToWidget } from "../recapBoard";

export const GAME_WIDGET_ID = "game-card";
export const SCOREBOARD_WIDGET_ID = "game-scoreboard";

export type RevealLook = "a" | "b" | "c";
export type CastPerson = GamePerson & { away?: boolean };

export type GamesApi = {
  room: string;
  me: GamePerson;
  /** this room's game, live or just finished */
  game?: Game;
  /** rooms with a game on that you haven't joined, for the rail */
  onIn: Record<string, boolean>;
  rows: ScoreRow[];
  awards: Award[];
  /** you've played this week: the scoreboard is yours to see */
  played: boolean;
  resets: string;
  gameName: string;
  now: number;
  look: RevealLook;
  inviteHidden: boolean;
  /** phones play on a sheet over the board */
  sheetOpen: boolean;
  start: () => void;
  join: () => void;
  begin: () => void;
  pick: (name: string) => void;
  next: () => void;
  rematch: () => void;
  hideInvite: () => void;
  closeSheet: () => void;
  openSheet: () => void;
};

const GamesContext = createContext<GamesApi | null>(null);
export const GamesProvider = GamesContext.Provider;
export const useGames = () => useContext(GamesContext);

const params = () => new URLSearchParams(window.location.search);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const PHONE = "(max-width: 800px)";

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

/** How a simulated player votes: mostly with the prompt's lean. */
function leanPick(prompt: MockPrompt, cast: GamePerson[], rand: () => number): string {
  const weights = cast.map((person) => prompt.lean[person.name] ?? 0.35);
  let at = rand() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < cast.length; i += 1) {
    at -= weights[i];
    if (at <= 0) return cast[i].name;
  }
  return cast[0].name;
}

type Timed = { at: number; room: string; run: (game: Game, now: number) => Game };

export function useMockGames(o: {
  room: string;
  meOf: (room: string) => GamePerson;
  castOf: (room: string) => CastPerson[];
  /** fly the board to a card (and ring it) */
  flyTo: (widgetId: string) => void;
}): GamesApi {
  const { room, meOf, castOf, flyTo } = o;
  const [byRoom, setByRoom] = useState<Record<string, Game>>({});
  const [history, setHistory] = useState<Record<string, Game[]>>({});
  const [now, setNow] = useState(() => Date.now());
  const [inviteHidden, setInviteHidden] = useState<Record<string, boolean>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const games = useRef<Record<string, Game>>({});
  const timed = useRef<Timed[]>([]);
  const held = useRef(false);
  const dealt = useRef<Record<string, number>>({});
  const seq = useRef(0);
  const live = useRef({ meOf, castOf });
  live.current = { meOf, castOf };

  const commit = useCallback((next: Record<string, Game>) => {
    games.current = next;
    setByRoom(next);
  }, []);
  const apply = useCallback(
    (roomId: string, fn: (game: Game) => Game) => {
      const game = games.current[roomId];
      if (!game) return;
      const next = fn(game);
      if (next !== game) commit({ ...games.current, [roomId]: next });
    },
    [commit],
  );

  const simsOf = useCallback((roomId: string) => {
    const me = live.current.meOf(roomId);
    return live.current.castOf(roomId).filter((person) => !person.away && !same(person.name, me.name));
  }, []);

  /** the simulated players of a game answer the round on believable delays */
  const scheduleAnswers = useCallback((game: Game, at: number, only?: string) => {
    const round = currentRound(game);
    if (game.phase !== "round" || !round) return;
    const me = live.current.meOf(game.room);
    game.players
      .filter((player) => !same(player.name, me.name) && (!only || same(player.name, only)))
      .forEach((player, i) => {
        timed.current.push({
          at: at + 1500 + i * 900 + Math.random() * 1600,
          room: game.room,
          run: (g, t) => (g.round === round.n ? answer(g, player.name, leanPick(round.prompt as MockPrompt, g.cast, Math.random), t) : g),
        });
      });
  }, []);

  const deal = useCallback(
    (roomId: string, by: GamePerson, at: number): Game => {
      const config = ROOM_GAMES[roomId];
      const set = config.sets[(dealt.current[roomId] ?? 0) % config.sets.length];
      dealt.current[roomId] = (dealt.current[roomId] ?? 0) + 1;
      seq.current += 1;
      return newGame({ id: `${roomId}-game-${seq.current}`, room: roomId, name: config.name, by, cast: live.current.castOf(roomId).map(({ name, color }) => ({ name, color })), prompts: set, now: at });
    },
    [],
  );

  /** a game begins in a room: the sims find out and trickle in */
  const open = useCallback(
    (roomId: string, by: GamePerson) => {
      if (!ROOM_GAMES[roomId]) return;
      const at = Date.now();
      const prev = games.current[roomId];
      if (prev?.phase === "done") setHistory((h) => ({ ...h, [roomId]: [...(h[roomId] ?? []), prev] }));
      commit({ ...games.current, [roomId]: deal(roomId, by, at) });
      setInviteHidden((h) => ({ ...h, [roomId]: false }));
      simsOf(roomId)
        .filter((sim) => !same(sim.name, by.name))
        .forEach((sim, i) => {
          timed.current.push({
            at: at + 1100 + i * 1050 + Math.random() * 500,
            room: roomId,
            run: (g, t) => {
              const next = joinGame(g, { name: sim.name, color: sim.color }, t);
              if (next.phase === "round") scheduleAnswers(next, t, sim.name);
              return next;
            },
          });
        });
    },
    [commit, deal, scheduleAnswers, simsOf],
  );

  /* ---------- the clock ---------- */
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (held.current) return;
      const t = Date.now();
      setNow(t);
      const due = timed.current.filter((e) => e.at <= t);
      timed.current = timed.current.filter((e) => e.at > t);
      for (const event of due) apply(event.room, (game) => event.run(game, t));
      for (const game of Object.values(games.current)) {
        const me = live.current.meOf(game.room);
        if (game.phase === "invite" && game.phaseEndsAt && t >= game.phaseEndsAt) {
          /* a sim who started it waits for you a little, then goes */
          apply(game.room, (g) => beginRound(g, t, 0));
          scheduleAnswers(games.current[game.room], t);
        } else if (game.phase === "round") {
          const round = currentRound(game);
          if (everyoneIn(game) || (round?.endsAt && t >= round.endsAt)) apply(game.room, (g) => reveal(g, t));
        } else if (game.phase === "reveal" && game.phaseEndsAt && t >= game.phaseEndsAt) {
          /* in a game you're in, you turn the page; the room moves on alone otherwise */
          if (isIn(game, me.name) && t < game.phaseEndsAt + 20_000) continue;
          apply(game.room, (g) => nextRound(g, t));
          scheduleAnswers(games.current[game.room], t);
        }
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [apply, scheduleAnswers]);

  /* ---------- state URLs ---------- */
  useEffect(() => {
    const q = params();
    const want = q.get("game");
    const roomId = q.get("gameRoom") ?? room;
    const config = ROOM_GAMES[roomId];
    if (!want || !config) return;
    const me = meOf(roomId);
    const sims = simsOf(roomId);
    const starter = sims.find((sim) => same(sim.name, config.starter)) ?? sims[0];
    if (want === "start") {
      const t = window.setTimeout(() => open(roomId, me), 700);
      return () => window.clearTimeout(t);
    }
    if (want === "invited") {
      const t = window.setTimeout(() => open(roomId, { name: starter.name, color: starter.color }), 1500);
      return () => window.clearTimeout(t);
    }
    /* held states: build the game to the moment asked for */
    const at = Date.now();
    const rand = seeded(7);
    const upTo = Math.min(5, Math.max(1, Number(q.get("round") ?? (want === "late" ? 3 : 1)))) - 1;
    const mine = want !== "late";
    dealt.current[roomId] = 0;
    let game = deal(roomId, mine ? me : { name: starter.name, color: starter.color }, at);
    for (const sim of sims) game = joinGame(game, { name: sim.name, color: sim.color }, at);
    const playRound = (skip: string[] = []) => {
      const round = currentRound(game)!;
      for (const player of game.players) {
        if (skip.some((name) => same(name, player.name))) continue;
        const top = Object.entries((round.prompt as MockPrompt).lean).sort((a, b) => b[1] - a[1])[0][0];
        game = answer(game, player.name, same(player.name, me.name) ? top : leanPick(round.prompt as MockPrompt, game.cast, rand), at);
      }
    };
    const last = want === "awards" ? game.rounds.length : upTo;
    if (want !== "lobby") {
      game = beginRound(game, at, 0);
      for (let n = 0; n < last; n += 1) {
        playRound();
        game = nextRound(reveal(game, at), at);
      }
      const lateSims = sims.slice(-2).map((sim) => sim.name);
      if (want === "round") playRound([me.name, ...lateSims]);
      if (want === "answered") playRound(lateSims.slice(-1));
      if (want === "late") playRound(lateSims);
      if (want === "reveal") {
        playRound();
        game = reveal(game, at);
      }
    } else {
      game = { ...game, phaseEndsAt: at + 9_000 };
    }
    held.current = q.get("live") !== "1" && want !== "late";
    commit({ ...games.current, [roomId]: game });
    if (!held.current) {
      /* run on from here: the ones still out answer soon */
      const g = games.current[roomId];
      const round = currentRound(g);
      if (g.phase === "round" && round) {
        g.players
          .filter((player) => !same(player.name, me.name) && !round.answers.some((a) => same(a.by, player.name)))
          .forEach((player, i) => timed.current.push({ at: at + 2600 + i * 1300, room: roomId, run: (x, t) => (x.round === round.n ? answer(x, player.name, leanPick(round.prompt as MockPrompt, x.cast, Math.random), t) : x) }));
        if (round.endsAt) apply(roomId, (x) => ({ ...x, rounds: x.rounds.map((r) => (r.n === round.n ? { ...r, endsAt: at + 14_000 } : r)) }));
      }
    }
    if (window.matchMedia(PHONE).matches && want !== "late") setSheetOpen(true);
    else if (want !== "late" && roomId === room) window.setTimeout(() => panToWidget(GAME_WIDGET_ID), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- what the room page asks for ---------- */
  const me = meOf(room);
  const game = byRoom[room];
  const config = ROOM_GAMES[room];

  const enter = useCallback(() => {
    if (window.matchMedia(PHONE).matches) setSheetOpen(true);
    else requestAnimationFrame(() => requestAnimationFrame(() => flyTo(GAME_WIDGET_ID)));
  }, [flyTo]);

  const start = useCallback(() => {
    const on = games.current[room];
    if (on && on.phase !== "done") return enter();
    held.current = false;
    open(room, live.current.meOf(room));
    enter();
  }, [enter, open, room]);

  const join = useCallback(() => {
    const who = live.current.meOf(room);
    held.current = false;
    apply(room, (g) => joinGame(g, who, Date.now()));
    setInviteHidden((h) => ({ ...h, [room]: true }));
    enter();
  }, [apply, enter, room]);

  const begin = useCallback(() => {
    const t = Date.now();
    held.current = false;
    apply(room, (g) => (g.phase === "invite" ? beginRound(g, t, 0) : g));
    scheduleAnswers(games.current[room], t);
  }, [apply, room, scheduleAnswers]);

  const pick = useCallback(
    (name: string) => {
      const t = Date.now();
      const who = live.current.meOf(room);
      apply(room, (g) => answer(g, who.name, name, t));
      /* once you're in, nobody keeps you waiting long */
      let k = 0;
      timed.current = timed.current.map((e) => (e.room === room && e.at > t + 500 ? { ...e, at: t + 500 + (k += 1) * 420 } : e));
    },
    [apply, room],
  );

  const next = useCallback(() => {
    const t = Date.now();
    held.current = false;
    apply(room, (g) => nextRound(g, t));
    scheduleAnswers(games.current[room], t);
  }, [apply, room, scheduleAnswers]);

  const rematch = useCallback(() => {
    held.current = false;
    open(room, live.current.meOf(room));
  }, [open, room]);

  const score = useMemo(() => {
    if (!config) return { rows: [] as ScoreRow[], awards: [] as Award[] };
    const seedAwards: Award[] = config.seedAwards.map((a, i) => ({ ...a, id: `${room}:seed:${i}`, room, gameId: "seed", at: 0 }));
    const all = [...(history[room] ?? []), ...(game ? [game] : [])];
    const rows = scoreRows({ cast: castOf(room).map(({ name, color }) => ({ name, color })), seed: config.seed, seedAwards, games: all });
    return { rows, awards: [...seedAwards, ...all.flatMap(awardsOf)] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, game, history, room]);

  const played = params().get("board") === "open" || [...(history[room] ?? []), ...(game ? [game] : [])].some((g) => isIn(g, me.name) && g.rounds.some((r) => r.revealedAt !== undefined && r.answers.some((a) => same(a.by, me.name))));

  const onIn: Record<string, boolean> = {};
  for (const g of Object.values(byRoom)) if (g.phase !== "done" && !isIn(g, meOf(g.room).name)) onIn[g.room] = true;

  return {
    room,
    me,
    game,
    onIn,
    rows: score.rows,
    awards: score.awards,
    played,
    resets: config?.resets ?? "",
    gameName: config?.name ?? "",
    now,
    look: (["a", "b", "c"].includes(params().get("reveal") ?? "") ? params().get("reveal") : "a") as RevealLook,
    inviteHidden: Boolean(inviteHidden[room]),
    sheetOpen,
    start,
    join,
    begin,
    pick,
    next,
    rematch,
    hideInvite: () => setInviteHidden((h) => ({ ...h, [room]: true })),
    closeSheet: () => setSheetOpen(false),
    openSheet: () => setSheetOpen(true),
  };
}
