import { useEffect, useRef, useState } from "react";
import { LiveCursor } from "../cursors";
import type { LiveIdentity } from "../live/identity";

export type GatePoint = { x: number; y: number };
export type GatePointRef = { current: GatePoint | null };

/** A mouse or trackpad — the only pointer a preview can ride. */
export function canFollowPointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/**
 * Your cursor, shown to you, for as long as the entry gate is up.
 *
 * Nobody sees their own cursor on the canvas, so the gate is the one moment
 * the app shows you what the room will: the same LiveCursor the canvas draws
 * for a peer, riding your real pointer over the blurred room. Tap a look on
 * the card and it recolours under your hand. The scrim hides the OS arrow
 * (cursor: none) so there is exactly one cursor on screen. Phones get the
 * parked copy inside the card instead (see .claim-you-perch).
 */
export function GateCursor({
  identity,
  leaving,
  positionRef,
}: {
  identity: LiveIdentity;
  leaving: boolean;
  /** The tip's last position — the collapse in ClaimCard aims at it. */
  positionRef: GatePointRef;
}) {
  const node = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  const follow = canFollowPointer();

  useEffect(() => {
    if (!follow) return;
    let seen = false;
    const onMove = (event: PointerEvent) => {
      positionRef.current = { x: event.clientX, y: event.clientY };
      if (node.current) {
        node.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      }
      if (!seen) {
        seen = true;
        setShown(true);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [follow, positionRef]);

  if (!follow) return null;

  return (
    <div className="gate-cursor-layer" aria-hidden="true">
      <LiveCursor
        motionRef={node}
        name={identity.name}
        color={identity.color}
        emoji={identity.emoji}
        avatarUrl={identity.avatarUrl}
        label={identity.name}
        className={`gate-cursor ${shown ? "is-shown" : "is-hidden"}${leaving ? " is-leaving" : ""}`}
      />
    </div>
  );
}
