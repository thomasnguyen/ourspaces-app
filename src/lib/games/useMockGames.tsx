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
 *   &fly=scoreboard the camera goes to the scoreboard (there's no header chip any more)
 *   &play=seat      the game is the hot seat ("how well do you know maya")
 *     &about=Sam    who sits (default: the space's pick)
 *     &react=ha|wrong|who-told-you   a held reveal with your reaction already on it
 *   ?game=keepsake&play=seat   a finished hot seat, only its keepsake left on the board
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ROOM_GAMES, SEAT_SKILL, type MockPrompt } from "../../data/games";
import { mockRoomKnows } from "../../data/roomKnows";
import { getSpace } from "../../data/spaces";
import { answer, awardsOf, beginRound, currentRound, everyoneIn, isIn, joinGame, newGame, newSeatGame, nextRound, react, reveal, roundPlayers, scoreRows } from "./engine";
import { askAbout, askFor, dealSeat, keepsakeOf, seatName, seatPicks, type Keepsake, type SeatPick, type SeatRoom } from "./hotSeat";
import type { Award, Game, GamePerson, GameRound, ScoreRow, SeatReaction } from "./types";
import { panToWidget } from "../recapBoard";

export const GAME_WIDGET_ID = "game-card";
export const SCOREBOARD_WIDGET_ID = "game-scoreboard";
export const KEEPSAKE_WIDGET_ID = "game-keepsake";

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
  /** hot seat: who the space would put in the seat here, best offer first */
  seatPicks: SeatPick[];
  /** the hot seat's name in this room ("how well do you know maya") */
  seatName: string;
  /** what the last hot seat left on the board */
  keepsake?: Keepsake;
  startSeat: (about?: string) => void;
  /** the starter picks someone else, before it begins */
  reseat: (name: string) => void;
  /** the person in the seat's one tap after a reveal */
  react: (kind: SeatReaction) => void;
  hideInvite: () => void;
  closeSheet: () => void;
  openSheet: () => void;
  /** live rooms: the data is Convex's, the players are real (useLiveGames) */
  live?: boolean;
  /** one plain line after a start the server refused ("join the space to start a game") */
  notice?: string;
  /** a running challenge in this room, ranked on the same card (face down until you log) */
  challenge?: ChallengeBoard | null;
  /** a spoken start ("let's play most likely to", "how well do you know maya"): the slip's line */
  voice?: (said: string) => Promise<string>;
  /** mock only: the people the tab is pretending to be, for the dev readout */
  simulated?: string[];
};

export type ChallengeBoard = { widgetId: string; title: string; unit: string; day: number; days: number; open: boolean; rows: Array<{ name: string; color: string; total: number; streak: number } | null> };

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

/** The room as the hot seat reads it: the knows page's lines and the cards behind them. */
function seatRoomOf(roomId: string, people: CastPerson[]): SeatRoom {
  const knows = mockRoomKnows(roomId, "");
  const config = ROOM_GAMES[roomId];
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cards = getSpace(roomId).widgets.map((w) => ({ id: w.id, type: w.type as string, x: w.x, y: w.y, w: w.w, h: w.h, data: w.data as Record<string, unknown> }));
  return { people, lines: knows.lines, forgot: knows.forgot, cards, today, awards: config?.seedAwards ?? [], points: config?.seed ?? {} };
}

/** A simulated guess: right about as often as they know the person, off by a little on a slider. */
function simAnswer(game: Game, round: GameRound, name: string, rand: () => number): string {
  const ask = askFor(round, name);
  if (game.kind !== "hot-seat" || !ask) return leanPick(round.prompt as MockPrompt, game.cast, rand);
  const skill = SEAT_SKILL[game.room]?.[name] ?? 0.55;
  if (ask.form === "number" && ask.range) {
    const off = Math.round((rand() + rand() - 1) * (ask.range.max - ask.range.min) * (1 - skill) * 0.5);
    return String(Math.max(ask.range.min, Math.min(ask.range.max, Number(ask.right) + off)));
  }
  if (rand() < skill) return ask.right;
  const wrong = ask.options.filter((o) => !same(o, ask.right));
  return wrong[Math.floor(rand() * wrong.length)] ?? ask.right;
}

/** How a simulated person in the seat reacts: by how many knew. */
function simReaction(round: GameRound, about: string): SeatReaction {
  const mine = round.answers.filter((a) => askFor(round, a.by) === askAbout(round, about));
  const got = mine.filter((a) => round.winners.some((w) => same(w, a.by))).length;
  if (mine.length > 0 && got === mine.length) return "who-told-you";
  return got * 3 <= mine.length ? "wrong" : "ha";
}

type Play = { kind: "hot-seat"; about?: string };

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
    roundPlayers(game)
      .filter((player) => !same(player.name, me.name) && (!only || same(player.name, only)))
      .forEach((player, i) => {
        timed.current.push({
          at: at + 1500 + i * 900 + Math.random() * 1600,
          room: game.room,
          run: (g, t) => (g.round === round.n ? answer(g, player.name, simAnswer(g, round, player.name, Math.random), t) : g),
        });
      });
  }, []);

  /** hot seat: a simulated person in the seat reacts once the reveal has landed */
  const scheduleReactions = useCallback((game: Game, at: number) => {
    const round = currentRound(game);
    if (game.kind !== "hot-seat" || game.phase !== "reveal" || !round) return;
    const me = live.current.meOf(game.room);
    for (const ask of round.asks ?? []) {
      if (same(ask.about, me.name) || !isIn(game, ask.about)) continue;
      timed.current.push({ at: at + 3300 + Math.random() * 700, room: game.room, run: (g, t) => (g.round === round.n ? react(g, ask.about, simReaction(currentRound(g) ?? round, ask.about), t) : g) });
    }
  }, []);

  const dealSeatGame = useCallback((roomId: string, by: GamePerson, at: number, about?: string): Game => {
    const cast = live.current.castOf(roomId);
    const sr = seatRoomOf(roomId, cast);
    const picks = seatPicks(sr, seeded(3), at);
    const asked = about && cast.find((p) => same(p.name, about) && !p.away);
    const names = cast.length === 2 ? cast.map((p) => p.name) : [asked ? asked.name : picks[0].name];
    const dealt = dealSeat(sr, names, seeded(11), at);
    seq.current += 1;
    return newSeatGame({
      id: `${roomId}-seat-${seq.current}`,
      room: roomId,
      by,
      cast: cast.map(({ name, color }) => ({ name, color })),
      seat: names.map((name) => { const p = cast.find((c) => same(c.name, name))!; return { name: p.name, color: p.color }; }),
      why: cast.length === 2 ? undefined : picks.find((p) => same(p.name, names[0]))?.why,
      asks: dealt.asks,
      known: dealt.known,
      now: at,
    });
  }, []);

  const deal = useCallback(
    (roomId: string, by: GamePerson, at: number, play?: Play): Game => {
      if (play) return dealSeatGame(roomId, by, at, play.about);
      const config = ROOM_GAMES[roomId];
      const set = config.sets[(dealt.current[roomId] ?? 0) % config.sets.length];
      dealt.current[roomId] = (dealt.current[roomId] ?? 0) + 1;
      seq.current += 1;
      return newGame({ id: `${roomId}-game-${seq.current}`, room: roomId, name: config.name, by, cast: live.current.castOf(roomId).map(({ name, color }) => ({ name, color })), prompts: set, now: at });
    },
    [dealSeatGame],
  );

  /** a game begins in a room: the sims find out and trickle in */
  const open = useCallback(
    (roomId: string, by: GamePerson, play?: Play) => {
      if (!ROOM_GAMES[roomId]) return;
      const at = Date.now();
      const prev = games.current[roomId];
      if (prev?.phase === "done") setHistory((h) => ({ ...h, [roomId]: [...(h[roomId] ?? []), prev] }));
      const fresh = deal(roomId, by, at, play);
      commit({ ...games.current, [roomId]: fresh });
      setInviteHidden((h) => ({ ...h, [roomId]: false }));
      /* whoever's in the seat sits down first */
      const seated = (name: string) => Number(Boolean(fresh.seat?.some((p) => same(p.name, name))));
      simsOf(roomId)
        .sort((a, b) => seated(b.name) - seated(a.name))
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
          /* your own hot seat waits for you: you may still be choosing who sits */
          if (game.kind === "hot-seat" && same(game.startedBy.name, me.name)) continue;
          /* a sim who started it waits for you a little, then goes */
          apply(game.room, (g) => beginRound(g, t, 0));
          scheduleAnswers(games.current[game.room], t);
        } else if (game.phase === "round") {
          const round = currentRound(game);
          if (everyoneIn(game) || (round?.endsAt && t >= round.endsAt)) {
            apply(game.room, (g) => reveal(g, t));
            scheduleReactions(games.current[game.room], t);
          }
        } else if (game.phase === "reveal" && game.phaseEndsAt && t >= game.phaseEndsAt) {
          /* in a game you're in, you turn the page; the room moves on alone otherwise */
          if (isIn(game, me.name) && t < game.phaseEndsAt + 20_000) continue;
          apply(game.room, (g) => nextRound(g, t));
          scheduleAnswers(games.current[game.room], t);
        }
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [apply, scheduleAnswers, scheduleReactions]);

  /* ---------- state URLs ---------- */
  useEffect(() => {
    if (params().get("fly") !== "scoreboard") return;
    const t = window.setTimeout(() => panToWidget(SCOREBOARD_WIDGET_ID), 600);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const q = params();
    const want = q.get("game");
    const roomId = q.get("gameRoom") ?? room;
    const config = ROOM_GAMES[roomId];
    if (!want || !config) return;
    const me = meOf(roomId);
    const sims = simsOf(roomId);
    const starter = sims.find((sim) => same(sim.name, config.starter)) ?? sims[0];
    const play: Play | undefined = q.get("play") === "seat" ? { kind: "hot-seat", about: q.get("about") ?? undefined } : undefined;
    if (want === "start") {
      const t = window.setTimeout(() => {
        open(roomId, me, play);
        /* you started it: a phone goes straight to its play sheet */
        if (roomId === room && window.matchMedia(PHONE).matches) setSheetOpen(true);
      }, 700);
      return () => window.clearTimeout(t);
    }
    if (want === "invited") {
      const t = window.setTimeout(() => open(roomId, { name: starter.name, color: starter.color }, play), 1500);
      return () => window.clearTimeout(t);
    }
    /* held states: build the game to the moment asked for */
    const at = Date.now();
    const rand = seeded(7);
    const mine = want !== "late";
    dealt.current[roomId] = 0;
    let game = deal(roomId, mine ? me : { name: starter.name, color: starter.color }, at, play);
    const upTo = Math.min(game.rounds.length, Math.max(1, Number(q.get("round") ?? (want === "late" ? 3 : 1)))) - 1;
    for (const sim of sims) game = joinGame(game, { name: sim.name, color: sim.color }, at);
    /* one stream per simulated player, so who knows what doesn't depend on who else is in */
    const streams: Record<string, () => number> = {};
    const randOf = (name: string) => (play ? (streams[name] ??= seeded(7 + name.length * 131 + name.charCodeAt(0) * 17)) : rand);
    const playRound = (skip: string[] = []) => {
      const round = currentRound(game)!;
      for (const player of roundPlayers(game)) {
        if (skip.some((name) => same(name, player.name))) continue;
        const ask = askFor(round, player.name);
        /* you: the room's pick, or the right answer (but nobody gets them all) */
        const top = ask ? (round.n === 2 && ask.form === "choice" ? (ask.options.find((o) => !same(o, ask.right)) ?? ask.right) : ask.right) : Object.entries((round.prompt as MockPrompt).lean).sort((a, b) => b[1] - a[1])[0][0];
        game = answer(game, player.name, same(player.name, me.name) ? top : simAnswer(game, round, player.name, randOf(player.name)), at - 9000 + game.players.indexOf(player) * 700);
      }
    };
    /* hot seat: the reactions a finished round already has */
    const reactAll = (mineToo: boolean) => {
      const round = currentRound(game)!;
      for (const ask of round.asks ?? []) {
        const said = q.get("react") as SeatReaction | null;
        if (same(ask.about, me.name) && !mineToo && !said) continue;
        game = react(game, ask.about, same(ask.about, me.name) && said ? said : simReaction(round, ask.about), at);
      }
    };
    const done = want === "awards" || want === "keepsake";
    const last = done ? game.rounds.length : upTo;
    if (want !== "lobby") {
      game = beginRound(game, at, 0);
      for (let n = 0; n < last; n += 1) {
        playRound();
        game = reveal(game, at);
        reactAll(true);
        game = nextRound(game, at);
      }
      const lateSims = sims.slice(-2).map((sim) => sim.name);
      if (want === "round") playRound([me.name, ...lateSims]);
      if (want === "answered") playRound(lateSims.slice(-1));
      if (want === "late") playRound(lateSims);
      if (want === "reveal") {
        playRound();
        game = reveal(game, at);
        if (q.get("live") !== "1") reactAll(false);
      }
    } else {
      game = { ...game, phaseEndsAt: at + 9_000 };
    }
    held.current = q.get("live") !== "1" && want !== "late";
    if (want === "keepsake") {
      /* the game is over and put away: only what it left is on the board */
      const over = game;
      setHistory((h) => ({ ...h, [roomId]: [...(h[roomId] ?? []), over] }));
      window.setTimeout(() => panToWidget(KEEPSAKE_WIDGET_ID), 350);
      return;
    }
    commit({ ...games.current, [roomId]: game });
    if (!held.current) {
      /* run on from here: the ones still out answer soon */
      const g = games.current[roomId];
      const round = currentRound(g);
      if (g.phase === "round" && round) {
        g.players
          .filter((player) => !same(player.name, me.name) && !round.answers.some((a) => same(a.by, player.name)))
          .filter((player) => game.kind !== "hot-seat" || askFor(round, player.name))
          .forEach((player, i) => timed.current.push({ at: at + 2600 + i * 1300, room: roomId, run: (x, t) => (x.round === round.n ? answer(x, player.name, simAnswer(x, round, player.name, Math.random), t) : x) }));
        if (round.endsAt) apply(roomId, (x) => ({ ...x, rounds: x.rounds.map((r) => (r.n === round.n ? { ...r, endsAt: at + 14_000 } : r)) }));
      }
      if (g.phase === "reveal") scheduleReactions(g, at - 1200);
    }
    if (window.location.hash.endsWith("/knows")) return;
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

  const startSeat = useCallback(
    (about?: string) => {
      const on = games.current[room];
      if (on && on.phase !== "done") return enter();
      held.current = false;
      open(room, live.current.meOf(room), { kind: "hot-seat", about });
      enter();
    },
    [enter, open, room],
  );

  const reseat = useCallback(
    (name: string) => {
      apply(room, (g) => {
        if (g.kind !== "hot-seat" || g.phase !== "invite") return g;
        const fresh = dealSeatGame(room, g.startedBy, g.startedAt, name);
        return { ...fresh, id: g.id, players: g.players, phaseEndsAt: g.phaseEndsAt };
      });
    },
    [apply, dealSeatGame, room],
  );

  const reactNow = useCallback(
    (kind: SeatReaction) => {
      held.current = false;
      apply(room, (g) => react(g, live.current.meOf(room).name, kind, Date.now()));
    },
    [apply, room],
  );

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
    const prev = games.current[room];
    if (prev?.kind !== "hot-seat") return open(room, live.current.meOf(room));
    /* again: the next person the space would offer */
    const cast = live.current.castOf(room);
    const next = seatPicks(seatRoomOf(room, cast), seeded(3), Date.now()).find((p) => !p.away && p.known > 1 && !prev.seat?.some((s) => same(s.name, p.name)));
    open(room, live.current.meOf(room), { kind: "hot-seat", about: next?.name });
  }, [open, room]);

  const score = useMemo(() => {
    if (!config) return { rows: [] as ScoreRow[], awards: [] as Award[] };
    const seedAwards: Award[] = config.seedAwards.map((a, i) => ({ ...a, id: `${room}:seed:${i}`, room, gameId: "seed", at: 0 }));
    const all = [...(history[room] ?? []), ...(game ? [game] : [])];
    const rows = scoreRows({ cast: castOf(room).map(({ name, color }) => ({ name, color })), seed: config.seed, seedAwards, games: all });
    return { rows, awards: [...seedAwards, ...all.flatMap(awardsOf)] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, game, history, room]);

  const everything = [...(history[room] ?? []), ...(game ? [game] : [])];
  const played = params().get("board") === "open" || everything.some((g) => isIn(g, me.name) && g.rounds.some((r) => r.revealedAt !== undefined && (r.answers.some((a) => same(a.by, me.name)) || Boolean(askAbout(r, me.name)))));
  const seat = useMemo(() => {
    if (!config) return { picks: [] as SeatPick[], name: "" };
    const cast = castOf(room);
    const picks = seatPicks(seatRoomOf(room, cast), seeded(3), Date.now());
    return { picks, name: seatName(cast.length === 2 ? cast.map((p) => p.name) : [picks[0]?.name ?? ""]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, room]);
  const keepsake = [...everything].reverse().map(keepsakeOf).find(Boolean);

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
    seatPicks: seat.picks,
    seatName: seat.name,
    keepsake,
    startSeat,
    reseat,
    react: reactNow,
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
