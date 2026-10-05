/**
 * The jigsaw in a live room: the same `JigsawApi` the mat reads in mock
 * mode, from Convex (`convex/puzzles.ts`). Real players only; the space's
 * hand is absent (its live behaviour is the Right of Way gate's task). Your
 * moves go out as leased writes; a move is sent at most every 80 ms.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ROOM_JIGSAW } from "../data/jigsaw";
import type { LocalMove, RemotePiece } from "../lib/jigsaw/engine";
import { JIGSAW_WIDGET_ID, type JigsawApi, type JigsawOptions } from "../lib/jigsaw/useMockJigsaw";

type Room = {
  id: Id<"games">; phase: string; photo: string; pieces: number; startedAt: number;
  startedBy: { name: string; color: string };
  players: Array<{ name: string; color: string; userId: string }>;
  rows: Array<RemotePiece & { until: number; holderId: string | null }>;
} | null;

export function useLiveJigsaw(o: {
  room: string;
  spaceId?: Id<"spaces">;
  identity: { userId: string; name: string; color: string };
  enabled: boolean;
  flyTo: (widgetId: string) => void;
}): JigsawApi | null {
  const { room, spaceId, identity, enabled, flyTo } = o;
  const config = ROOM_JIGSAW[room];
  const data = useQuery(api.puzzles.forRoom, enabled && config && spaceId ? { spaceId } : "skip") as Room | undefined;
  const startIn = useMutation(api.puzzles.start);
  const grab = useMutation(api.puzzles.grab);
  const move = useMutation(api.puzzles.move);
  const drop = useMutation(api.puzzles.drop);
  const [hidden, setHidden] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const seenOn = useRef(new Set<string>());
  /* one move write in flight at a time; the newest position waits behind it (a drop never queues behind a backlog) */
  const flight = useRef<{ busy: boolean; next: Parameters<typeof move>[0] | null }>({ busy: false, next: null });
  const gameId = data?.id;

  const onLocal = useCallback(
    async (m: LocalMove): Promise<string | void> => {
      if (!gameId) return;
      const base = { gameId, userId: identity.userId, i: m.id, x: Math.round(m.x), y: Math.round(m.y) };
      if (m.kind === "grab") return (await grab(base)).kind;
      if (m.kind === "move") {
        const f = flight.current;
        if (f.busy) {
          f.next = base;
          return;
        }
        f.busy = true;
        let next: Parameters<typeof move>[0] | null = base;
        while (next) {
          f.next = null;
          await move(next).catch(() => false);
          next = f.next;
        }
        f.busy = false;
        return;
      }
      flight.current.next = null;
      await drop({ ...base, placed: m.kind === "place" });
    },
    [drop, gameId, grab, identity.userId, move],
  );
  const rows = data?.rows;
  const live = useMemo(() => (rows ? { rows, onLocal } : undefined), [rows, onLocal]);
  const sims = useMemo(() => (data?.players ?? []).filter((p) => p.userId !== identity.userId).map(({ name, color }) => ({ name, color })), [data?.players, identity.userId]);
  const options = useMemo<JigsawOptions>(() => ({ players: 0, seed: (data?.startedAt ?? 7) % 100_000, pieces: data?.pieces ?? 20, you: "real", beat: "", hand: false }), [data?.startedAt, data?.pieces]);

  if (!enabled || !config || !spaceId) return null;
  const photo = config.photos.find((p) => p.key === data?.photo) ?? config.photos[0];
  const placed = (rows ?? []).filter((r) => r.placed).length;
  const joined = Boolean(data?.players.some((p) => p.userId === identity.userId));
  /* a screen that saw it running keeps it until its own finish has played (the photo whole, then home) */
  if (data && gameId && data.phase !== "done") seenOn.current.add(gameId);
  const on = Boolean(data && gameId && closed !== gameId && (data.phase !== "done" || seenOn.current.has(gameId)));
  const enter = () => requestAnimationFrame(() => requestAnimationFrame(() => flyTo(JIGSAW_WIDGET_ID)));
  return {
    room,
    me: { name: identity.name, color: identity.color },
    sims,
    options,
    run: data && gameId
      ? { id: gameId, room, startedBy: data.startedBy, photo, startedAt: data.startedAt, already: 0, skipIntro: true, joined, phase: on ? "on" : "done" }
      : undefined,
    done: [],
    placed,
    inviteHidden: hidden === gameId,
    sheetOpen: false,
    phone: false,
    start: (photoKey?: string) => {
      if (on && data?.phase !== "done") return enter();
      void startIn({ spaceId, userId: identity.userId, photo: photoKey ?? config.photos[0].key, pieces: 20 }).then((r) => r.ok && enter());
    },
    join: () => {
      setHidden(gameId ?? null);
      enter();
    },
    hideInvite: () => setHidden(gameId ?? null),
    report: () => {},
    finish: () => {},
    close: () => setClosed(gameId ?? null),
    openSheet: () => {},
    closeSheet: () => {},
    live,
  };
}
