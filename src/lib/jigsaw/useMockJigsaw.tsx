/**
 * The jigsaw in mock mode: one puzzle per room for this tab. This file is
 * the room-level state (who started it, are you in, what happened) and the
 * state URLs; the pieces and the hands are `engine.ts`, the rule is
 * `lib/games/rightOfWay.ts`.
 *
 *   ?jigsaw=start     you start one, as if you'd said "let's do a puzzle of the tahoe photo"
 *   ?jigsaw=invited   someone else starts one a moment after you arrive
 *   ?jigsaw=late      one is half done when you arrive (&in=<n> pieces already in)
 *   ?jigsaw=last      two pieces from the end, you're in (the finish, for takes)
 *   ?jigsaw=done      finished: the slip is on the photo
 *     &photo=friday|tahoe   which photo (default: the group photo)
 *     &players=<0-5>        how many simulated players (default 3)
 *     &seed=<n>             the cut, the scatter and what the players do
 *     &pieces=12|20|30      default 20 (12 on a phone)
 *     &you=play|reach|hold|none   script your own hand for a take (default: your real pointer)
 *     &beat=yield|nod       a player takes the piece the space reaches for, then lets go | places it
 *     &hand=1               draw your own cursor (headless recordings have none)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ROOM_JIGSAW, type JigsawPhoto } from "../../data/jigsaw";
import type { GamesApi } from "../games/useMockGames";
import type { Award, GamePerson } from "../games/types";
import type { Beat, JigsawResult, LocalMove, RemotePiece, YouMode } from "./engine";

export const JIGSAW_WIDGET_ID = "jigsaw-mat";
const PHONE = "(max-width: 800px)";

export type JigsawRun = {
  id: string;
  room: string;
  startedBy: GamePerson;
  photo: JigsawPhoto;
  startedAt: number;
  /** pieces already in when this tab first saw it */
  already: number;
  skipIntro: boolean;
  joined: boolean;
  phase: "on" | "done";
  result?: JigsawResult;
};

export type JigsawDone = JigsawResult & { id: string; room: string; photo: JigsawPhoto; at: number };

export type JigsawOptions = { players: number; seed: number; pieces: number; you: YouMode; beat: Beat; hand: boolean };

export type JigsawApi = {
  room: string;
  me: GamePerson;
  sims: GamePerson[];
  options: JigsawOptions;
  run?: JigsawRun;
  /** this room's finished puzzles, oldest first */
  done: JigsawDone[];
  /** pieces in so far, for the invitation */
  placed: number;
  inviteHidden: boolean;
  sheetOpen: boolean;
  phone: boolean;
  start: (photoKey?: string) => void;
  join: () => void;
  hideInvite: () => void;
  report: (placed: number) => void;
  finish: (result: JigsawResult) => void;
  close: () => void;
  openSheet: () => void;
  closeSheet: () => void;
  /** live rooms (src/live/useLiveJigsaw.ts): the pieces as Convex has them, and where your moves go */
  live?: {
    rows: RemotePiece[];
    /** resolves "wait" when the server gave the piece to someone else first */
    onLocal: (m: LocalMove) => Promise<string | void> | void;
    /** the space's hand waiting on a person for this piece (the ghost) */
    helper?: { piece: number; on: string } | null;
  };
};

const JigsawContext = createContext<JigsawApi | null>(null);
export const JigsawProvider = JigsawContext.Provider;
export const useJigsaw = () => useContext(JigsawContext);

const params = () => new URLSearchParams(window.location.search);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function readOptions(phone: boolean): JigsawOptions {
  const q = params();
  const num = (key: string, fallback: number) => (q.get(key) !== null && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : fallback);
  const you = q.get("you") ?? "real";
  const beat = q.get("beat") ?? "";
  return {
    players: Math.max(0, Math.min(5, num("players", 3))),
    seed: num("seed", 7),
    pieces: [12, 20, 30].includes(num("pieces", 0)) ? num("pieces", 0) : phone ? 12 : 20,
    you: (["play", "reach", "hold", "none"].includes(you) ? you : "real") as YouMode,
    beat: (beat === "yield" || beat === "nod" ? beat : "") as Beat,
    hand: q.get("hand") === "1" || ["play", "reach", "hold"].includes(you),
  };
}

export function useMockJigsaw(o: {
  room: string;
  meOf: (room: string) => GamePerson;
  castOf: (room: string) => Array<GamePerson & { away?: boolean }>;
  /** bring a card into view */
  flyTo: (widgetId: string) => void;
}): JigsawApi {
  const { room, meOf, castOf, flyTo } = o;
  const [phone] = useState(() => window.matchMedia(PHONE).matches);
  const [options] = useState(() => readOptions(phone));
  const [runs, setRuns] = useState<Record<string, JigsawRun>>({});
  const [done, setDone] = useState<JigsawDone[]>([]);
  const [placed, setPlaced] = useState(0);
  const [inviteHidden, setInviteHidden] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const seq = useRef(0);
  const config = ROOM_JIGSAW[room];
  const me = meOf(room);
  const sims = useMemo(
    () => castOf(room).filter((p) => !same(p.name, me.name)).slice(0, options.players).map(({ name, color }) => ({ name, color })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, me.name, options.players],
  );

  const open = useCallback(
    (roomId: string, by: GamePerson, more: Partial<JigsawRun> = {}, photoKey?: string) => {
      const cfg = ROOM_JIGSAW[roomId];
      if (!cfg) return;
      seq.current += 1;
      const photo = cfg.photos.find((p) => p.key === (photoKey ?? params().get("photo"))) ?? cfg.photos[0];
      const run: JigsawRun = { id: `${roomId}-jigsaw-${seq.current}`, room: roomId, startedBy: by, photo, startedAt: Date.now(), already: 0, skipIntro: false, joined: false, phase: "on", ...more };
      setPlaced(run.already);
      setInviteHidden(false);
      setRuns((r) => ({ ...r, [roomId]: run }));
    },
    [],
  );

  const enter = useCallback(() => {
    if (phone) return setSheetOpen(true);
    /* the mat is in the middle of the board; only move the camera if it isn't in view */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const r = document.querySelector(`[data-widget-id="${JIGSAW_WIDGET_ID}"]`)?.getBoundingClientRect();
        if (r && (r.left < 0 || r.top < 60 || r.right > window.innerWidth + 24 || r.bottom > window.innerHeight + 40)) flyTo(JIGSAW_WIDGET_ID);
      }),
    );
  }, [flyTo, phone]);

  const start = useCallback(
    (photoKey?: string) => {
      const on = runs[room];
      if (!on || on.phase === "done") open(room, meOf(room), { joined: true }, photoKey);
      else if (!on.joined) setRuns((r) => ({ ...r, [room]: { ...on, joined: true } }));
      enter();
    },
    [enter, meOf, open, room, runs],
  );

  const join = useCallback(() => {
    setRuns((r) => (r[room] ? { ...r, [room]: { ...r[room], joined: true } } : r));
    setInviteHidden(true);
    enter();
  }, [enter, room]);

  const finish = useCallback(
    (result: JigsawResult) => {
      setRuns((r) => {
        const run = r[room];
        if (!run || run.result) return r;
        setDone((d) => (d.some((x) => x.id === run.id) ? d : [...d, { ...result, id: run.id, room, photo: run.photo, at: Date.now() }]));
        return { ...r, [room]: { ...run, result } };
      });
    },
    [room],
  );

  const close = useCallback(() => {
    setRuns((r) => (r[room] ? { ...r, [room]: { ...r[room], phase: "done" } } : r));
    setSheetOpen(false);
  }, [room]);

  /* ---------- state URLs ---------- */
  useEffect(() => {
    const want = params().get("jigsaw");
    if (!want || !config) return;
    const cast = castOf(room).filter((p) => !same(p.name, me.name));
    const starter = cast.find((p) => same(p.name, config.starter)) ?? cast[0] ?? me;
    const by = { name: starter.name, color: starter.color };
    if (want === "start") {
      const t = window.setTimeout(() => {
        open(room, me, { joined: true });
        enter();
      }, 700);
      return () => window.clearTimeout(t);
    }
    if (want === "invited") {
      const t = window.setTimeout(() => open(room, by), 1500);
      return () => window.clearTimeout(t);
    }
    const total = options.pieces;
    if (want === "late") open(room, by, { already: Math.min(total - 3, Number(params().get("in") ?? Math.round(total * 0.45))), skipIntro: true });
    if (want === "last") {
      open(room, me, { already: total - 2, skipIntro: true, joined: true });
      enter();
    }
    if (want === "done") {
      const people = [me, ...sims];
      const counts: Record<string, number> = { "the space": 4 };
      people.forEach((p, i) => (counts[p.name] = [6, 4, 3, 3, 2, 2][i] ?? 2));
      const photo = config.photos.find((p) => p.key === params().get("photo")) ?? config.photos[0];
      setDone([{ id: `${room}-jigsaw-seed`, room, photo, at: Date.now(), ms: 48_000, total, by: people, counts, space: { placed: 4, waits: 3 }, finisher: me.name, lastCorner: people[1]?.name ?? me.name, patient: people[2]?.name }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = runs[room];
  return {
    room,
    me,
    sims,
    options,
    run,
    done: done.filter((d) => d.room === room),
    placed,
    inviteHidden,
    sheetOpen,
    phone,
    start,
    join,
    hideInvite: () => setInviteHidden(true),
    report: setPlaced,
    finish,
    close,
    openSheet: () => setSheetOpen(true),
    closeSheet: () => setSheetOpen(false),
  };
}

/** What a finished puzzle leaves on the scoreboard: a point for every two
    pieces you placed, and two stickers that aren't about who placed most. */
export function jigsawAwards(d: JigsawDone): Award[] {
  const base = { room: d.room, gameId: d.id, at: d.at };
  const out: Award[] = [];
  if (d.lastCorner) out.push({ ...base, id: `${d.id}:corner`, to: d.lastCorner, title: "found the last corner", glyph: "📐", prompt: `found the last corner of ${d.photo.caption}`, tone: 4 });
  if (d.patient) out.push({ ...base, id: `${d.id}:patient`, to: d.patient, title: "patient hands", glyph: "🧩", prompt: `turned one piece over the longest before it fit, in ${d.photo.caption}`, tone: 0 });
  return out;
}

export const jigsawPoints = (placed: number) => Math.round(placed / 2);

/** The games frame's scoreboard, with this room's finished puzzles added in. */
export function withJigsaw(games: GamesApi, jig: JigsawApi): GamesApi {
  if (jig.done.length === 0) return games;
  const awards = jig.done.flatMap(jigsawAwards);
  const rows = games.rows
    .map((row) => {
      const pieces = jig.done.reduce((sum, d) => sum + (d.counts[row.name] ?? 0), 0);
      const mine = awards.filter((a) => same(a.to, row.name));
      return pieces || mine.length ? { ...row, points: row.points + jigsawPoints(pieces), awards: [...row.awards, ...mine], played: row.played + (pieces ? 1 : 0) } : row;
    })
    .sort((a, b) => b.points - a.points || b.awards.length - a.awards.length);
  const played = games.played || jig.done.some((d) => (d.counts[jig.me.name] ?? 0) > 0);
  return { ...games, rows, awards: [...games.awards, ...awards], played };
}
