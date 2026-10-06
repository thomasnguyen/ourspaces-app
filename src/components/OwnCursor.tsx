import { useEffect, useRef } from "react";
import { LiveCursor } from "../cursors";
import type { LiveIdentity } from "../live/identity";
import { canFollowPointer, type GatePoint } from "./GateCursor";
import "./ownCursor.css";

/** Where the drawn cursor rides: the board, not the chrome around it. */
const BOARD = ".space-scroll";
/** Where the OS cursor comes back (ownCursor.css says the same in CSS). */
const NATIVE = "input, textarea, select, button, [contenteditable]:not([contenteditable='false'])";

function overBoard(target: EventTarget | Element | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(BOARD)) && !target.closest(NATIVE);
}

/** `?cursor=0` keeps the OS arrow (takes that want it). */
export function ownCursorWanted() {
  return canFollowPointer() && new URLSearchParams(window.location.search).get("cursor") !== "0";
}

/**
 * Your cursor, on the canvas, for as long as you're in the room.
 *
 * The door shows you your LiveCursor riding your pointer; this keeps it
 * after the door opens, so what you see is what the room sees. Local only:
 * presence still sends your position and filters you out of the peers
 * (usePresence `selfIds`). Written to the node on rAF, no React state per
 * move. The OS arrow is hidden over the board and comes back over inputs,
 * buttons and anything editable (ownCursor.css), where this one hides. The
 * voice stage hides it (body.voice-stage-up). Phones: nothing.
 */
export function OwnCursor({
  identity,
  initialPoint = null,
}: {
  identity: LiveIdentity;
  /** The door's last tip position: the handover lands here, no entrance. */
  initialPoint?: GatePoint | null;
}) {
  const node = useRef<HTMLDivElement | null>(null);
  const wanted = ownCursorWanted();

  useEffect(() => {
    if (!wanted) return;
    document.body.classList.add("own-cursor-on");
    const el = node.current;
    if (!el) return;
    let point: GatePoint | null = null;
    let over = false;
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (point) el.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
      el.classList.toggle("is-shown", over);
      if (el.parentElement) el.parentElement.dataset.shown = over ? "1" : "0";
    };
    const arrived = () => el.classList.add("has-arrived");
    el.addEventListener("animationend", arrived);
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    if (initialPoint) {
      point = initialPoint;
      over = overBoard(document.elementFromPoint(initialPoint.x, initialPoint.y));
      arrived();
      paint();
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      point = { x: event.clientX, y: event.clientY };
      over = overBoard(event.target);
      schedule();
    };
    const onOut = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      over = false;
      schedule();
    };
    const onBlur = () => {
      over = false;
      schedule();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("blur", onBlur);
    return () => {
      document.body.classList.remove("own-cursor-on");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
      el.removeEventListener("animationend", arrived);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [initialPoint, wanted]);

  if (!wanted) return null;

  return (
    <div className="own-cursor-layer" aria-hidden="true" data-testid="own-cursor" data-shown="0">
      <LiveCursor
        motionRef={node}
        name={identity.name}
        color={identity.color}
        emoji={identity.emoji}
        avatarUrl={identity.avatarUrl}
        label={identity.name}
        className="own-cursor"
      />
    </div>
  );
}
