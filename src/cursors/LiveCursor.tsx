import type { CSSProperties, Ref } from "react";
import {
  CURSOR_STYLES,
  DEFAULT_CURSOR_STYLE_ID,
  getCursorStyle,
} from "./registry";
import { SystemGrabCursor } from "./styles";
import type { CursorProps } from "./types";

export type LiveCursorProps = CursorProps & {
  /** Registry id — defaults to the space default. */
  styleId?: string;
  className?: string;
  style?: CSSProperties;
  x?: number;
  y?: number;
  active?: boolean;
  /** Hand the positioner to src/live/peerMotion.ts and it owns the transform:
   *  no x/y, no CSS transition, a new interpolated position every frame. */
  motionRef?: Ref<HTMLDivElement>;
};

/**
 * Renders a registered cursor style.
 * Used on the space canvas and anywhere presence needs a tip.
 */
export function LiveCursor({
  styleId = DEFAULT_CURSOR_STYLE_ID,
  className = "",
  style,
  x,
  y,
  active = false,
  motionRef,
  ...props
}: LiveCursorProps) {
  const entry = getCursorStyle(styleId) ?? CURSOR_STYLES[0];
  const Component = active ? SystemGrabCursor : entry.Component;

  return (
    <div
      ref={motionRef}
      className={`live-cursor-positioner pointer-events-none ${
        active ? "is-active" : ""
      } ${motionRef ? "is-motion-driven" : ""} ${className}`}
      style={
        motionRef
          ? { ...style, left: 0, top: 0 }
          : x == null || y == null
            ? style
            : {
                ...style,
                left: 0,
                top: 0,
                transform: `translate3d(${x}px, ${y}px, 0)`,
              }
      }
    >
      <div
        className="live-cursor-entrance"
        data-cursor-style={entry.id}
        data-cursor-state={active ? "grabbing" : "pointing"}
      >
        <Component {...props} />
      </div>
    </div>
  );
}
