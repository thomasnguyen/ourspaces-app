import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { playSound } from "../lib/sounds";

export type RoomOrigin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * The shared full-screen room: a native <dialog> that grows out of the card
 * that opened it and shrinks back into it on close. Both the reading room and
 * the ship room are content inside this shell — same entrance, same exit, one
 * set of timings to tune.
 */
export function CanvasRoom({
  className = "",
  origin,
  label,
  closeRef,
  onClose,
  children,
}: {
  className?: string;
  origin?: RoomOrigin;
  label: string;
  /** Lets the room's content trigger the same animated close the back button does. */
  closeRef?: RefObject<(() => void) | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    playSound("tap");
    window.setTimeout(onClose, 300);
  }, [closing, onClose]);

  useEffect(() => {
    if (!closeRef) return;
    closeRef.current = requestClose;
    return () => {
      closeRef.current = null;
    };
  }, [closeRef, requestClose]);

  /* Clicks inside the room must not reach the canvas underneath — WidgetCard's
     drag handlers sit on the React tree this portal renders through. */
  const swallow = (event: MouseEvent) => event.stopPropagation();

  return (
    <dialog
      ref={dialogRef}
      className={`canvas-room ${className}${closing ? " is-closing" : ""}`}
      aria-label={label}
      style={
        origin
          ? ({
              "--room-origin-top": `${origin.top}px`,
              "--room-origin-right": `${origin.right}px`,
              "--room-origin-bottom": `${origin.bottom}px`,
              "--room-origin-left": `${origin.left}px`,
            } as CSSProperties)
          : undefined
      }
      onClose={() => {
        if (dialogRef.current?.open) return;
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        swallow(event);
        if (event.target === dialogRef.current) requestClose();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="canvas-room-shell">
        <button type="button" className="canvas-room-back" onClick={requestClose}>
          <span aria-hidden="true">←</span>
          {label}
        </button>
        {children}
      </div>
    </dialog>
  );
}
