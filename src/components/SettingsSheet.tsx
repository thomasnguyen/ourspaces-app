import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  isPersonaName,
  updateIdentity,
  useIdentity,
  type Persona,
} from "../live/identity";
import { playSound } from "../lib/sounds";
import { MemberFace } from "./MemberFace";
import { LookRow } from "./LookRow";
import { PhotoInput } from "./PhotoInput";

export type AccountProps = {
  /** Square 256px JPEG in, a url that can live on the identity out. */
  uploadPhoto: (photo: Blob) => Promise<string>;
  account?: { joined: boolean; email?: string };
  /** The email + code form, live only. Rendered when "keep this" is tapped. */
  joinForm?: (done: () => void) => ReactNode;
  onSignOut?: () => void;
};

/**
 * Everything about who you are: name, your face, the looks (+ your own
 * photo), and the account that keeps it. The body is shared by the sheet
 * beside the rail and the `#/me` page.
 */
export function SettingsBody({ uploadPhoto, account, joinForm, onSignOut }: AccountProps) {
  const identity = useIdentity();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [joining, setJoining] = useState(false);

  const pickLook = (persona: Persona) => {
    const keepName = !isPersonaName(identity.name);
    updateIdentity({
      color: persona.color,
      emoji: persona.emoji,
      avatarUrl: persona.avatarUrl,
      ...(keepName ? {} : { name: persona.name }),
    });
    playSound("tap");
  };

  return (
    <>
      <div className="settings-you">
        <button
          type="button"
          className={`settings-face${uploading ? " is-busy" : ""}`}
          style={{ "--look": identity.color } as CSSProperties}
          onClick={() => fileRef.current?.click()}
          title="use a photo of you"
        >
          <MemberFace name={identity.name} avatarUrl={identity.avatarUrl} size="lg" />
          <span className="settings-face-hint">{uploading ? "…" : "photo"}</span>
        </button>
        <label className="claim-name-label settings-name">
          your name
          <input
            className="claim-name-input"
            value={identity.name}
            maxLength={14}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value;
              if (value.trim()) updateIdentity({ name: value });
            }}
            aria-label="Your display name"
          />
        </label>
      </div>

      <div className="claim-picker-section">
        <span className="claim-picker-label">your look</span>
        <LookRow
          name={identity.name}
          avatarUrl={identity.avatarUrl}
          onPick={pickLook}
          onPhoto={() => fileRef.current?.click()}
        />
      </div>

      <PhotoInput ref={fileRef} upload={uploadPhoto} onBusy={setUploading} />

      <div className="settings-account">
        <span className="claim-picker-label">account</span>
        {account?.joined ? (
          <div className="settings-account-row">
            <span className="settings-account-email" title={account.email}>
              saved to <strong>{account.email}</strong> ✓ — this name and look come
              back on every device you sign in on.
            </span>
            <button type="button" className="settings-signout" onClick={onSignOut}>
              sign out
            </button>
          </div>
        ) : joining && joinForm ? (
          joinForm(() => setJoining(false))
        ) : (
          <div className="settings-account-row">
            <span className="settings-account-email">
              this name and look live in this browser only.
            </span>
            <button
              type="button"
              className="claim-done settings-keep"
              onClick={() => (joinForm ? setJoining(true) : undefined)}
            >
              keep this on my other devices →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The settings sheet: slides out beside the rail from the "you" tile at its
 * foot. Pure UI — live wiring (upload, join form, sign out) comes in through
 * props so the mock page can show the same sheet with no backend.
 */
export function SettingsSheet({
  open,
  onClose,
  ...body
}: { open: boolean; onClose: () => void } & AccountProps) {
  const identity = useIdentity();
  if (!open) return null;
  return (
    <>
      <div className="settings-scrim" onClick={onClose} aria-hidden="true" />
      <section className="settings-sheet" aria-label="Settings">
        <div className="claim-card-heading settings-heading">
          <div>
            <span className="claim-card-kicker">settings</span>
            <strong>you&apos;re {identity.name}</strong>
            <span>{body.account?.joined ? "kept on every device" : "just in this browser, for now"}</span>
          </div>
          <button type="button" className="claim-card-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <SettingsBody {...body} />
        <a className="settings-me-link" href="#/me">
          your page <span aria-hidden="true">↗</span>
        </a>
      </section>
    </>
  );
}
