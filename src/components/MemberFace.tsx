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
  return (
    <span
      role="img"
      aria-label={name}
      className={`member-face member-face-${size} ${identityChip ? "identity-chip" : ""} ${className}`}
      style={{
        ...(identityChip
          ? { backgroundColor: color ?? "#7C5CFF" }
          : resolvedAvatar
            ? undefined
            : {
              backgroundImage: "url('/assets/the-crew-snapshot-thumb.jpg')",
              backgroundPosition: FACE_POSITIONS[name] ?? "50% 50%",
            }),
      }}
    >
      {resolvedAvatar && (
        <img
          className="member-face-img"
          src={resolvedAvatar}
          alt=""
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      )}
      {emoji}
    </span>
  );
}
