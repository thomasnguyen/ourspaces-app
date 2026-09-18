export type CanvasGestureKind = "move" | "resize";

export type CanvasLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type LocalGesture = CanvasLayout & {
  sessionId: string;
  widgetId: string;
  kind: CanvasGestureKind;
};

export type LiveGesture = LocalGesture & {
  updatedAt: number;
};

export type LivePeer = {
  userId: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  x: number;
  y: number;
  /** "cozy:<boardId>" when the peer is in the coloring room (x/y are 0..1) */
  zone?: string;
  updatedAt: number;
  gesture?: LiveGesture;
};

export type GestureClaim =
  | { accepted: true }
  | {
      accepted: false;
      reason: "locked" | "missing";
      owner?: Pick<LivePeer, "userId" | "name" | "color">;
    };

/**
 * "I'm in this room" and "my pointer is here" ride the same presence row, so
 * a person who hasn't moved a pointer yet needs coordinates that mean neither.
 * Real ones are clamped into the canvas (usePresence's pointer handler), so an
 * off-canvas point can only ever mean "no pointer yet" — and the cursor layer
 * skips those rows instead of parking a phantom arrow on the door for every
 * idle tab in the room. They are still here: the header faces them, the count
 * counts them, they just aren't pointing at anything.
 */
export const NO_POINTER = { x: -1, y: -1 };

/* Clients shipped before NO_POINTER wrote the door (72,72) as their standing
 * position, and a tab that was already open keeps writing it until it reloads.
 * A pointer that has really reported lands on a float off a rect ratio, so an
 * exact 72,72 is that old write rather than a hand. Safe to delete once no
 * pre-NO_POINTER tab can still be open. */
const LEGACY_DOOR = { x: 72, y: 72 };

/** Has this row ever carried a real pointer? See NO_POINTER. */
export function isPointing(peer: { x: number; y: number }) {
  if (peer.x === LEGACY_DOOR.x && peer.y === LEGACY_DOOR.y) return false;
  return peer.x >= 0 && peer.y >= 0;
}
