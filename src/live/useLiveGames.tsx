/**
 * Games in a live room: the same `GamesApi` the cards read in mock mode, from
 * Convex (`convex/games.ts`). Nobody is simulated here, ever: every player is
 * a person with a seat in the room. The server owns the clocks and the
 * reveal; this hook only ticks a local `now` for the countdowns it draws.
 *
 * Invitations by presence: a game that starts while you're in the room shows
 * the strip; one that was already on when you arrived is a ticket in "waiting
 * on you" (yourTurn's `game` item) and no strip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Award, Game, ScoreRow } from "../lib/games/types";
import { isIn } from "../lib/games/engine";
import { keepsakeOf, seatName } from "../lib/games/hotSeat";
import { GAME_WIDGET_ID, type ChallengeBoard, type GamesApi } from "../lib/games/useMockGames";
import { gameAsk } from "../lib/deck/verbs";

const PHONE = "(max-width: 800px)";

type RoomGames = { game: Game | null; rows: ScoreRow[]; awards: Award[]; challenge: ChallengeBoard | null; me: { name: string; color: string; guest: boolean } | null; played: boolean };

export function useLiveGames(o: {
  room: string;
  spaceId?: Id<"spaces">;
  identity: { userId: string; name: string; color: string };
  enabled: boolean;
  flyTo: (widgetId: string) => void;
}): GamesApi | null {
  const { room, spaceId, identity, enabled, flyTo } = o;
  const data = useQuery(api.games.forRoom, enabled && spaceId ? { spaceId, userId: identity.userId } : "skip") as RoomGames | undefined;
  const offer = useQuery(api.games.offer, enabled && spaceId ? { spaceId } : "skip");
  const startGame = useMutation(api.games.start);
  const joinGame = useMutation(api.games.join);
  const beginGame = useMutation(api.games.begin);
  const pickIn = useMutation(api.games.pick);
  const nextIn = useMutation(api.games.next);
  const reactIn = useMutation(api.games.react);
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState("");
  /* when this screen first saw the room's games: a game older than that was already on */
  const arrived = useRef<number | null>(null);
  if (data && arrived.current === null) arrived.current = Date.now();
  useEffect(() => {
    arrived.current = null;
  }, [room]);

  const raw = data?.game ?? null;
  const game = useMemo(() => (raw ? { ...raw, room } : undefined), [raw, room]);
  const on = Boolean(game && game.phase !== "done");
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [on]);

  const me = data?.me ? { name: data.me.name, color: data.me.color } : { name: identity.name, color: identity.color };
  const gameId = game?.id as Id<"games"> | undefined;

  const enter = useCallback(() => {
    if (window.matchMedia(PHONE).matches) setSheetOpen(true);
    else requestAnimationFrame(() => requestAnimationFrame(() => flyTo(GAME_WIDGET_ID)));
  }, [flyTo]);

  const begin = useCallback(
    async (kind: "most-likely" | "hot-seat", about?: string) => {
      if (!spaceId) return;
      if (on) return enter();
      const res = await startGame({ spaceId, userId: identity.userId, kind, ...(about ? { about } : {}) });
      setNotice(res.ok ? "" : (res.reason ?? ""));
      if (res.ok) enter();
    },
    [enter, identity.userId, on, spaceId, startGame],
  );

  const join = useCallback(() => {
    if (gameId) void joinGame({ gameId, userId: identity.userId });
    if (gameId) setHidden((h) => ({ ...h, [gameId]: true }));
    enter();
  }, [enter, gameId, identity.userId, joinGame]);

  /* by voice: the router hands the words here; the start goes through the same mutation (and the one door) */
  const voice = async (said: string): Promise<string> => {
    if (!spaceId) return "no games in this room";
    const ask = gameAsk(said, me.name);
    if (ask.kind === "jigsaw") return "the puzzle starts from the scoreboard in live rooms";
    const res = await startGame({ spaceId, userId: identity.userId, kind: ask.kind, said, ...(ask.about ? { about: ask.about } : {}) });
    if (!res.ok) return res.reason ?? "couldn't start it";
    enter();
    return res.reason === "already on" ? `${res.name} is already on. jump in` : `started ${res.name}. everyone here gets the invite`;
  };

  if (!enabled || !spaceId) return null;
  const picks = (offer ?? []).map((p) => ({ ...p, color: p.color }));
  const started = game?.startedAt ?? 0;
  const lateForIt = arrived.current !== null && started < arrived.current - 3000;
  return {
    room,
    me,
    game,
    onIn: {},
    rows: data?.rows ?? [],
    awards: data?.awards ?? [],
    played: Boolean(data?.played),
    resets: "sun 9:00",
    gameName: (game?.kind === "most-likely" ? game.name : null) ?? "most likely to",
    now,
    look: "a",
    inviteHidden: Boolean(game && (hidden[game.id] || lateForIt)),
    sheetOpen,
    seatPicks: picks,
    seatName: picks[0] ? seatName([picks[0].name]) : "",
    keepsake: game && game.kind === "hot-seat" && game.phase === "done" ? keepsakeOf(game) : undefined,
    startSeat: (about?: string) => void begin("hot-seat", about),
    reseat: () => {},
    react: (kind) => gameId && void reactIn({ gameId, userId: identity.userId, kind }),
    start: () => (game && on && !isIn(game, me.name) ? join() : void begin("most-likely")),
    join,
    begin: () => gameId && void beginGame({ gameId, userId: identity.userId }),
    pick: (name: string) => gameId && void pickIn({ gameId, userId: identity.userId, pick: name }),
    next: () => gameId && void nextIn({ gameId, userId: identity.userId }),
    rematch: () => void begin(game?.kind === "hot-seat" ? "hot-seat" : "most-likely", game?.kind === "hot-seat" ? picks.find((p) => !p.away && p.known > 1 && !game.seat?.some((s) => s.name === p.name))?.name : undefined),
    hideInvite: () => game && setHidden((h) => ({ ...h, [game.id]: true })),
    closeSheet: () => setSheetOpen(false),
    openSheet: () => setSheetOpen(true),
    live: true,
    voice,
    notice,
    challenge: data?.challenge ?? null,
  };
}
