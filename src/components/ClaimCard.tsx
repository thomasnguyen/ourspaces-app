import { useEffect, useRef, useState } from "react";
import {
  IDENTITY_COLORS,
  updateIdentity,
  useIdentity,
} from "../live/identity";
import { getAvatarSrc, VISITOR_AVATAR_NAMES } from "../data/avatars";
import { MemberFace } from "./MemberFace";

export type InviteContext = {
  spaceName: string;
  spaceColor: string;
  memberNames: string[];
  presenceCount: number;
};

export function ClaimCard({
  open,
  onClose,
  variant = "popover",
  inviteContext,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "gate" | "popover";
  inviteContext?: InviteContext;
}) {
  const identity = useIdentity();
  const [draftName, setDraftName] = useState(identity.name);
  const fallbackName = useRef(identity.name);

  useEffect(() => {
    if (!open) return;
    fallbackName.current = identity.name;
    setDraftName(identity.name);
  }, [open, identity.name]);

  if (!open) return null;

  const commitName = (value: string) => {
    setDraftName(value);
    if (value.trim()) updateIdentity({ name: value.trim() });
  };

  const restoreName = () => {
    if (draftName.trim()) return;
    const name = fallbackName.current;
    setDraftName(name);
    updateIdentity({ name });
  };

  return (
    <aside
      className={`claim-card is-${variant}${inviteContext ? " has-invite-context" : ""}`}
      aria-label="Choose your identity"
    >
      {inviteContext && variant === "gate" && (
        <div className="claim-invite-context">
          <span className="claim-invite-kicker">you&apos;re walking into</span>
          <div className="claim-invite-space">
            <span
              className="claim-invite-color"
              style={{ backgroundColor: inviteContext.spaceColor }}
              aria-hidden="true"
            />
            <strong>{inviteContext.spaceName}</strong>
          </div>
          <div className="claim-invite-presence">
            <div className="claim-invite-faces" aria-hidden="true">
              {inviteContext.memberNames.slice(0, 5).map((name) => (
                <MemberFace key={name} name={name} size="sm" />
              ))}
            </div>
            <span>
              {inviteContext.presenceCount} here right now
            </span>
          </div>
        </div>
      )}
      <div className="claim-card-heading">
        <div>
          <span className="claim-card-kicker">your live identity</span>
          <strong>
            you&apos;re {identity.emoji} {identity.name}
          </strong>
          <span>that&apos;s your cursor</span>
        </div>
        {variant === "popover" && (
          <button
            type="button"
            className="claim-card-close"
            onClick={onClose}
            aria-label="Dismiss identity card"
          >
            ×
          </button>
        )}
      </div>

      <label className="claim-name-label">
        name
        <input
          className="claim-name-input"
          value={draftName}
          maxLength={14}
          onChange={(event) => commitName(event.target.value)}
          onBlur={restoreName}
          aria-label="Your display name"
        />
      </label>

      <div className="claim-picker-section">
        <span className="claim-picker-label">color</span>
        <div className="claim-color-row">
          {IDENTITY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`claim-color-dot${identity.color === color ? " is-selected" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => updateIdentity({ color })}
              aria-label={`Choose ${color} cursor color`}
              aria-pressed={identity.color === color}
            />
          ))}
        </div>
      </div>

      <div className="claim-picker-section">
        <span className="claim-picker-label">face</span>
        <div className="claim-avatar-row">
          {VISITOR_AVATAR_NAMES.map((name) => {
            const avatarUrl = getAvatarSrc(name);
            return (
            <button
              key={name}
              type="button"
              className={`claim-avatar-button${identity.avatarUrl === avatarUrl ? " is-selected" : ""}`}
              onClick={() => updateIdentity({ avatarUrl })}
              aria-label={`Choose ${name} face`}
              aria-pressed={identity.avatarUrl === avatarUrl}
            >
              <MemberFace name={name} avatarUrl={avatarUrl} size="md" />
            </button>
            );
          })}
        </div>
      </div>

      <button type="button" className="claim-done" onClick={onClose}>
        {variant === "gate" ? (
          "enter the room →"
        ) : (
          <>
            done <span aria-hidden="true">↗</span>
          </>
        )}
      </button>
    </aside>
  );
}
