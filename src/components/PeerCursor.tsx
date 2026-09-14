import { memo, useEffect, useRef } from "react";
import { LiveCursor } from "../cursors";
import type { PeerMotion } from "../live/peerMotion";

/**
 * One peer's cursor on the canvas.
 *
 * Deliberately knows nothing about where the peer IS — the position comes
 * from the motion engine, which writes the transform straight to this node on
 * rAF. That is why this is memo'd on identity alone: a peer sweeping their
 * cursor across the room re-renders exactly nothing.
 */
export const PeerCursor = memo(function PeerCursor({
  motion,
  motionKey,
  name,
  color,
  emoji,
  avatarUrl,
  label,
  active,
  className = "",
}: {
  motion: PeerMotion;
  motionKey: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  label: string;
  active: boolean;
  className?: string;
}) {
  const node = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => motion.attach(motionKey, node.current),
    [motion, motionKey],
  );

  return (
    <LiveCursor
      motionRef={node}
      name={name}
      color={color}
      emoji={emoji}
      avatarUrl={avatarUrl}
      label={label}
      active={active}
      className={className}
    />
  );
});
