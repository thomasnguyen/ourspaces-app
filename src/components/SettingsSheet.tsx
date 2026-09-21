import { useRef, useState, type ReactNode } from "react";
import {
  isPersonaName,
  updateIdentity,
  useIdentity,
  type Persona,
} from "../live/identity";
import { playSound } from "../lib/sounds";
import { squareAvatar } from "../lib/avatarPhoto";
import { MemberFace } from "./MemberFace";
import { LookRow } from "./LookRow";

/**
 * The settings sheet: slides out beside the rail from the "you" tile at its
 * foot. Everything about who you are, in one place — name, look, your own
 * photo, the account that keeps it, sign out.
 *
 * Pure UI. Live wiring (upload to storage, the join form, sign out) comes in
 * through props so the mock page can show the same sheet with no backend.
 */
export function SettingsSheet({
  open,
  onClose,
  uploadPhoto,
  account,
  joinForm,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  /** Square 256px JPEG in, a url that can live on the identity out. */
  uploadPhoto: (photo: Blob) => Promise<string>;
  account?: { joined: boolean; email?: string };
  /** The email + code form, live only. Rendered when "keep this" is tapped. */
  joinForm?: (done: () => void) => ReactNode;
  onSignOut?: () => void;
}) {
  const identity = useIdentity();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [joining, setJoining] = useState(false);

  if (!open) return null;

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

  const onFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(await squareAvatar(file));
      updateIdentity({ avatarUrl: url });
      playSound("tap");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <div className="settings-scrim" onClick={onClose} aria-hidden="true" />
      <section className="settings-sheet" aria-label="Settings">
        <div className="claim-card-heading settings-heading">
          <div>
            <span className="claim-card-kicker">settings</span>
            <strong>you&apos;re {identity.name}</strong>
            <span>{account?.joined ? "kept on every device" : "just in this browser, for now"}</span>
          </div>
          <button type="button" className="claim-card-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-you">
          <button
            type="button"
            className={`settings-face${uploading ? " is-busy" : ""}`}
            style={{ "--look": identity.color } as React.CSSProperties}
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

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => void onFile(event.target.files?.[0])}
        />

        <div className="settings-account">
          <span className="claim-picker-label">account</span>
          {account?.joined ? (
            <div className="settings-account-row">
              <span className="settings-account-email" title={account.email}>
                saved to <strong>{account.email}</strong> ✓
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
      </section>
    </>
  );
}
