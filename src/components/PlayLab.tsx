/**
 * Play lab — the take room for the demo video's opening. Hash route: /#/play.
 * Unlisted: linked from nowhere.
 *
 * A blank room in the crew's shell (convex/playLab.ts makes it; making it
 * again is the reset), two ghost cursors written through the same presence
 * mutations a second computer would use, and picker drops that arrive already
 * filled in like the crew's (src/lib/playPresets.ts, wired in LiveSpace's
 * placeItem). The person at the desk does the dragging.
 * docs/local/play-lab.md has the shoot-day steps.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Widget } from "../data/types";
import "../pages/labs.css";

type Ghost = {
  userId: string;
  name: string;
  color: string;
  emoji: string;
  /** takes hold of the first sticker on the board once there is one */
  grabs: boolean;
  /** where it idles, as a fraction of the canvas */
  idle: { x: number; y: number };
  phase: number;
};

const GHOSTS: Ghost[] = [
  {
    userId: "ghost-holly",
    name: "Holly",
    color: "#e9369d",
    emoji: "🎨",
    grabs: true,
    idle: { x: 0.55, y: 0.5 },
    phase: 0,
  },
  {
    userId: "ghost-sam",
    name: "Sam",
    color: "#3d6eff",
    emoji: "🍕",
    grabs: false,
    idle: { x: 0.68, y: 0.36 },
    phase: 2.1,
  },
];

const TICK_MS = 90; // same cadence as a real client

/** `#/play?rec=1` — the pill hides for the recording; ghosts keep running. */
const recordingRequested = () =>
  new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("rec") === "1";
const GRAB_AFTER_S = 1.2;

export function PlayLab({
  spaceId,
  widgets,
  canvas,
}: {
  /** the take room, once it exists; null before the first make */
  spaceId: string | null;
  widgets: Widget[];
  canvas: { w: number; h: number };
}) {
  const [ghosts, setGhosts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(recordingRequested);
  useEffect(() => {
    const onHash = () => setHidden(recordingRequested());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [status, setStatus] = useState(
    spaceId
      ? "ready · drag widgets from the picker, they arrive filled in"
      : "no take room yet · new blank room",
  );
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const prepareTake = useMutation(api.playLab.prepareTake);
  const heartbeat = useMutation(api.presence.heartbeat);
  const claimGesture = useMutation(api.presence.claimGesture);
  const updateGesture = useMutation(api.presence.updateGesture);
  const cancelGesture = useMutation(api.presence.cancelGesture);

  /* Make the take room in the crew's shell, empty — or wipe it back to empty.
     This is the reset; the crew itself is never touched. */
  const makeRoom = async () => {
    if (busy) return;
    setBusy(true);
    setGhosts(false);
    setStatus(spaceId ? "wiping the board…" : "making the room…");
    try {
      const result = await prepareTake({});
      setStatus(
        result.created
          ? "room made · enter it, ghosts on, then drag widgets in"
          : `board wiped (${result.removed} gone) · ghosts on, then drag widgets in`,
      );
    } catch (error) {
      setStatus(`failed · ${error instanceof Error ? error.message : String(error)}`);
    }
    setBusy(false);
  };

  /* The ghosts: presence rows on slow arcs. Holly takes hold of the first
     sticker as soon as there is one (the room starts blank) and lets go if it
     disappears. Same mutations, same 90ms cadence as a real client. */
  useEffect(() => {
    if (!ghosts || !spaceId) return;
    let alive = true;
    const timers: number[] = [];
    const space = spaceId as never;
    const startedAt = performance.now();
    const holds = new Map<string, { widget: Widget; sessionId: string }>();

    const tickFor = (ghost: Ghost) => async () => {
      if (!alive) return;
      const t = (performance.now() - startedAt) / 1000 + ghost.phase;
      const identity = { userId: ghost.userId, name: ghost.name, color: ghost.color, emoji: ghost.emoji };
      const wobble = { x: Math.sin(t * 0.7) * 48, y: Math.cos(t * 0.5) * 30 };
      const held = holds.get(ghost.userId);
      const stillThere = held && widgetsRef.current.some((widget) => widget.id === held.widget.id);
      if (held && !stillThere) holds.delete(ghost.userId);
      const sticker = ghost.grabs
        ? widgetsRef.current.find((widget) => widget.type === "sticker") ?? null
        : null;
      const home = held && stillThere
        ? { x: held.widget.x + held.widget.w / 2, y: held.widget.y + held.widget.h / 2 }
        : sticker
          ? { x: sticker.x + sticker.w / 2, y: sticker.y + sticker.h / 2 }
          : { x: canvas.w * ghost.idle.x, y: canvas.h * ghost.idle.y };
      const cursorX = home.x + wobble.x;
      const cursorY = home.y + wobble.y;
      try {
        if (held && stillThere) {
          await updateGesture({
            spaceId: space,
            ...identity,
            cursorX,
            cursorY,
            sessionId: held.sessionId,
            widgetId: held.widget.id as never,
            kind: "move",
            x: held.widget.x + wobble.x,
            y: held.widget.y + wobble.y,
            w: held.widget.w,
            h: held.widget.h,
            z: held.widget.z,
          });
          if (Math.floor(t) !== Math.floor(t - TICK_MS / 1000)) {
            await heartbeat({ spaceId: space, ...identity, x: cursorX, y: cursorY });
          }
        } else if (sticker && t - ghost.phase > GRAB_AFTER_S) {
          const sessionId = `${ghost.userId}-${Date.now()}`;
          const claim = await claimGesture({
            spaceId: space,
            ...identity,
            cursorX,
            cursorY,
            sessionId,
            widgetId: sticker.id as never,
            kind: "move",
            x: sticker.x,
            y: sticker.y,
            w: sticker.w,
            h: sticker.h,
            z: sticker.z,
          });
          if (claim.accepted) holds.set(ghost.userId, { widget: sticker, sessionId });
        } else {
          await heartbeat({ spaceId: space, ...identity, x: cursorX, y: cursorY });
        }
      } catch {
        /* a dropped tick is fine; the next one lands */
      }
      if (alive) timers.push(window.setTimeout(() => void tickFor(ghost)(), TICK_MS));
    };
    GHOSTS.forEach((ghost) => void tickFor(ghost)());

    return () => {
      alive = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      for (const [userId, held] of holds) {
        void cancelGesture({ spaceId: space, userId, sessionId: held.sessionId });
      }
    };
  }, [ghosts, spaceId, canvas.w, canvas.h, heartbeat, claimGesture, updateGesture, cancelGesture]);

  // Hidden for the take (#/play?rec=1): the component stays mounted, so the
  // ghost loop above keeps writing presence.
  if (hidden) return null;

  return (
    <div className="arrival-lab-bar play-lab-bar" role="toolbar" aria-label="Play lab">
      <span className="arrival-lab-kicker">play lab</span>
      <button type="button" className={spaceId ? "" : "is-main"} onClick={() => void makeRoom()} disabled={busy}>
        {spaceId ? "reset · blank room" : "new blank room"}
      </button>
      <i aria-hidden="true" />
      <button
        type="button"
        className={ghosts ? "is-on" : "is-main"}
        onClick={() => setGhosts((value) => !value)}
        disabled={!spaceId}
      >
        ghost cursors
      </button>
      <i aria-hidden="true" />
      <span className="play-lab-status">{status}</span>
    </div>
  );
}
