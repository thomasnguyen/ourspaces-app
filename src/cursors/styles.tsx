import type { ReactNode } from "react";
import { MemberFace } from "../components/MemberFace";
import type { CursorProps } from "./types";

// CSS can change the local pointer, but cannot paint it at a remote peer's
// coordinates. This is the unmodified macOS closed-hand cursor used by
// `cursor: grabbing`, retained as a data URL so the remote cursor matches it.
const DEFAULT_GRABBING_CURSOR =
  "data:image/png;base64,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";

/** Shared wrapper — positioning lives on the parent (lab cell or canvas). */
function Shell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`live-cursor cursor-style ${className}`}>{children}</div>
  );
}

function Face({
  name,
  size = "xs",
  color,
  emoji,
  avatarUrl,
}: {
  name: string;
  size?: "xs" | "sm";
  color?: string;
  emoji?: string;
  avatarUrl?: string;
}) {
  return <MemberFace name={name} color={color} emoji={emoji} avatarUrl={avatarUrl} size={size} />;
}

/** 1 — Current production look: filled arrow + pill with face. */
export function ClassicArrow({
  name,
  color,
  emoji,
  avatarUrl,
  label,
  showFace = true,
}: CursorProps) {
  return (
    <Shell className="cs-classic">
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden>
        <path
          d="M1 1L16 10.5L9.2 12.2L6.5 20L1 1Z"
          fill={color}
          stroke="#0a0a0b"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="cs-pill" style={{ backgroundColor: color }}>
        {showFace && <Face name={name} color={color} emoji={emoji} avatarUrl={avatarUrl} />}
        <span>{label ?? name}</span>
      </span>
    </Shell>
  );
}

/** Active manipulation state: mirror the browser's default grab cursor. */
export function SystemGrabCursor({
  name,
  color,
  emoji,
  avatarUrl,
  label,
  showFace = true,
}: CursorProps) {
  return (
    <Shell className="cs-system-grab">
      <img
        className="cs-system-grab-icon"
        src={DEFAULT_GRABBING_CURSOR}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="cs-pill" style={{ backgroundColor: color }}>
        {showFace && <Face name={name} color={color} emoji={emoji} avatarUrl={avatarUrl} />}
        <span>{label ?? name}</span>
      </span>
    </Shell>
  );
}

/** 2 — Fat sticker arrow, chrome edge, face sits on the tip. */
export function StickerChrome({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-sticker">
      <div className="cs-sticker-arrow" style={{ color }}>
        <svg width="28" height="32" viewBox="0 0 28 32" fill="none" aria-hidden>
          <path
            d="M2 2L25 15.5L14.2 18.2L10 30L2 2Z"
            fill="currentColor"
            stroke="#0a0a0b"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path
            d="M5 5.5L20 15L13.2 16.8L10.5 24.5L5 5.5Z"
            fill="white"
            opacity="0.28"
          />
        </svg>
        {showFace && (
          <span className="cs-sticker-face">
            <Face name={name} size="sm" />
          </span>
        )}
      </div>
      <span className="cs-sticker-tag" style={{ backgroundColor: color }}>
        {label ?? name}
      </span>
    </Shell>
  );
}

/** 3 — No pointer. Just a loud name chip that is the cursor. */
export function NameChip({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-chip">
      <span className="cs-chip-body" style={{ backgroundColor: color }}>
        {showFace && <Face name={name} />}
        <span>{label ?? name}</span>
      </span>
    </Shell>
  );
}

/** 4 — Face is the hotspot; small arrow tip peeks out. */
export function FaceFirst({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-face-first">
      <span className="cs-face-ring" style={{ borderColor: color }}>
        {showFace ? (
          <Face name={name} size="sm" />
        ) : (
          <span className="cs-face-fallback" style={{ background: color }} />
        )}
        <span className="cs-face-tip" style={{ backgroundColor: color }} />
      </span>
      <span className="cs-face-name" style={{ color }}>
        {label ?? name}
      </span>
    </Shell>
  );
}

/** 5 — Comic speech burst trailing the tip. */
export function ComicBurst({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-comic">
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden>
        <path
          d="M1 1L14 10L8 11.5L5.5 18.5L1 1Z"
          fill={color}
          stroke="#0a0a0b"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <span className="cs-comic-burst" style={{ backgroundColor: color }}>
        {showFace && <Face name={name} />}
        <span>{label ?? name}</span>
        <i className="cs-comic-tail" style={{ borderTopColor: color }} />
      </span>
    </Shell>
  );
}

/** 6 — Washi / masking-tape label with stamped type. */
export function TapeLabel({ name, color, label, showFace = false }: CursorProps) {
  return (
    <Shell className="cs-tape">
      <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden>
        <path
          d="M1 1L12.5 9L7.2 10.3L5 16.5L1 1Z"
          fill="#111114"
          stroke="#111114"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="cs-tape-strip"
        style={{ backgroundColor: color, ["--tape" as string]: color }}
      >
        {showFace && <Face name={name} />}
        <span>{label ?? name}</span>
      </span>
    </Shell>
  );
}

/** 7 — Hollow neon outline arrow, dark label. */
export function NeonOutline({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-neon">
      <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden>
        <path
          d="M2 2L17.5 11.5L10 13.4L7 21.5L2 2Z"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M5 5.5L13.5 10.8L9.2 12L7.4 16.8L5 5.5Z"
          fill={color}
          opacity="0.35"
        />
      </svg>
      <span className="cs-neon-label" style={{ borderColor: color, color }}>
        {showFace && <Face name={name} />}
        <span>{label ?? name}</span>
      </span>
    </Shell>
  );
}

/** 8 — Soft presence orb with trailing name — less "mouse", more "who's here". */
export function SoftOrb({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-orb">
      <span className="cs-orb-core" style={{ backgroundColor: color }}>
        {showFace && <Face name={name} size="sm" />}
        <span className="cs-orb-ring" style={{ borderColor: color }} />
      </span>
      <span className="cs-orb-name">{label ?? name}</span>
    </Shell>
  );
}

/** 9 — Paper cutout: kraft edge, slight tear, scrapbook energy. */
export function PaperCutout({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-paper">
      <svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden>
        <path
          d="M1.5 1.5L19 13.2L11.2 15.2L7.8 24L1.5 1.5Z"
          fill="#fffaf7"
          stroke="#111114"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M4 4.5L14.5 12L9.5 13.4L7.2 19L4 4.5Z"
          fill={color}
        />
      </svg>
      <span className="cs-paper-label">
        {showFace && <Face name={name} />}
        <span style={{ color }}>{label ?? name}</span>
      </span>
    </Shell>
  );
}

/** 10 — Minimal black arrow + color underline name. Quiet but present. */
export function QuietMark({ name, color, label, showFace = false }: CursorProps) {
  return (
    <Shell className="cs-quiet">
      <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden>
        <path
          d="M1 1L12.5 9L7.2 10.3L5 16.5L1 1Z"
          fill="#111114"
          stroke="#111114"
          strokeLinejoin="round"
        />
      </svg>
      <span className="cs-quiet-label">
        {showFace && <Face name={name} />}
        <span>
          {label ?? name}
          <i style={{ backgroundColor: color }} />
        </span>
      </span>
    </Shell>
  );
}

/** 11 — A tiny pennant planted at the hotspot. Crisp, social, easy to track. */
export function SignalFlag({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-signal">
      <span className="cs-signal-hotspot">
        <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden>
          <path
            d="M1.25 1.25L15.9 10.3L9.15 12.1L6.45 20.2L1.25 1.25Z"
            fill="#111114"
            stroke="#fffaf7"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <circle cx="4.25" cy="4.2" r="1.9" fill={color} />
        </svg>
      </span>
      <span
        className="cs-signal-flag"
        style={{ ["--cursor-color" as string]: color }}
      >
        {showFace && <Face name={name} />}
        <span>{label ?? name}</span>
        <i aria-hidden />
      </span>
    </Shell>
  );
}

/** 12 — A people-first map pin: face in the room, name on the pin. */
export function FriendPin({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-friend-pin">
      <span
        className="cs-friend-pin-body"
        style={{ ["--cursor-color" as string]: color }}
      >
        <span className="cs-friend-pin-face">
          {showFace ? (
            <Face name={name} size="sm" />
          ) : (
            <span className="cs-friend-pin-fallback" />
          )}
        </span>
      </span>
      <span className="cs-friend-pin-name" style={{ backgroundColor: color }}>
        {label ?? name}
      </span>
    </Shell>
  );
}

/** 13 — A compact two-part tag: loud identity block, quiet readable name. */
export function SplitTag({ name, color, label, showFace = true }: CursorProps) {
  return (
    <Shell className="cs-split-tag">
      <svg width="17" height="21" viewBox="0 0 17 21" fill="none" aria-hidden>
        <path
          d="M1.2 1.2L15.3 10L8.85 11.65L6.25 19.6L1.2 1.2Z"
          fill={color}
          stroke="#111114"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="cs-split-tag-body">
        <span className="cs-split-tag-color" style={{ backgroundColor: color }}>
          {showFace ? <Face name={name} /> : <span aria-hidden>•</span>}
        </span>
        <span className="cs-split-tag-name">{label ?? name}</span>
      </span>
    </Shell>
  );
}
