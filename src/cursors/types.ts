import type { ComponentType } from "react";

/**
 * Props every cursor style must accept.
 * Keep this stable so new styles stay drop-in.
 */
export type CursorProps = {
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  /** Visible copy; identity name still drives the avatar. */
  label?: string;
  /** When true, prefer including MemberFace in the label. */
  showFace?: boolean;
};

/**
 * One entry in the cursor style catalog.
 * To add styles: create a Component, push a CursorStyle into CURSOR_STYLES.
 */
export type CursorStyle = {
  id: string;
  name: string;
  /** Short note for the lab — what vibe this is testing. */
  description: string;
  Component: ComponentType<CursorProps>;
};
