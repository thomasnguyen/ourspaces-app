import { useEffect, useState } from "react";
import { getAvatarSrc } from "../data/avatars";

const FACE_POSITIONS: Record<string, string> = {
  Maya: "31% 48%",
  Jules: "91% 48%",
  Sam: "66% 50%",
  Kenji: "12% 48%",
  Rio: "49% 48%",
  Ash: "78% 48%",
};

/** A person with no photo wears their initial on a colour: theirs, or a steady one from their name. */
const INITIAL_COLORS = ["var(--color-couple)", "var(--color-league)", "var(--color-trip)", "var(--color-fam)", "var(--color-crew)"];
function colorFromName(name: string) {
  let h = 0;
  for (const c of name.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return INITIAL_COLORS[h % INITIAL_COLORS.length];
}

export function MemberFace({
  name,
  emoji,
  color,
  avatarUrl,
  size = "md",
  className = "",
}: {
  name: string;
  emoji?: string;
  color?: string;
  avatarUrl?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const imageSrc = avatarUrl ?? getAvatarSrc(name);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageSrc]);
  const resolvedAvatar = imageSrc && !imageFailed ? imageSrc : undefined;
  const identityChip = Boolean(emoji) && !resolvedAvatar;
  // the crew photo crop is only for its own six; anyone else without a photo gets their initial
  const initialChip = !identityChip && !resolvedAvatar && !FACE_POSITIONS[name];
  return (
    <span
      role="img"
      aria-label={name}
      className={`member-face member-face-${size} ${identityChip || initialChip ? "identity-chip" : ""} ${initialChip ? "initial-chip" : ""} ${className}`}
      style={{
        ...(identityChip
          ? { backgroundColor: color ?? "#7C5CFF" }
          : initialChip
            ? { backgroundColor: color ?? colorFromName(name), color: "white", textShadow: "none", fontWeight: 800, fontFamily: "var(--font-display)" }
          : resolvedAvatar
            ? undefined
            : {
              backgroundImage: "url('/assets/the-crew-snapshot-thumb.webp')",
              backgroundPosition: FACE_POSITIONS[name] ?? "50% 50%",
            }),
      }}
    >
      {resolvedAvatar && (
        <img
          className="member-face-img"
          src={resolvedAvatar}
          alt={name}
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      )}
      {initialChip ? name.trim().slice(0, 1).toUpperCase() : emoji}
    </span>
  );
}
