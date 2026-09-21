import type { CSSProperties } from "react";
import { PERSONAS, type Persona } from "../live/identity";
import { MemberFace } from "./MemberFace";

/** True when the url is one of ours (a persona), false when it's a photo of you. */
export function isPersonaLook(avatarUrl?: string) {
  return PERSONAS.some((persona) => persona.avatarUrl === avatarUrl);
}

/**
 * The eight looks, one tap each. Shared by the entry gate, the identity
 * popover and the settings sheet. `onPhoto` adds a ninth tile: your own
 * photo (or the dashed slot to add one).
 */
export function LookRow({
  avatarUrl,
  onPick,
  onPhoto,
  name,
}: {
  avatarUrl?: string;
  onPick: (persona: Persona) => void;
  onPhoto?: () => void;
  name: string;
}) {
  const ownPhoto = avatarUrl && !isPersonaLook(avatarUrl) ? avatarUrl : undefined;
  return (
    <div className="claim-look-row">
      {PERSONAS.map((persona) => {
        const selected = avatarUrl === persona.avatarUrl;
        return (
          <button
            key={persona.name}
            type="button"
            className={`claim-look${selected ? " is-selected" : ""}`}
            style={{ "--look": persona.color } as CSSProperties}
            onClick={() => onPick(persona)}
            title={persona.name}
            aria-pressed={selected}
          >
            <MemberFace name={persona.name} avatarUrl={persona.avatarUrl} size="md" />
            {selected && <YouBadge />}
          </button>
        );
      })}
      {onPhoto && (
        <button
          type="button"
          className={`claim-look claim-look-photo${ownPhoto ? " is-selected has-photo" : ""}`}
          onClick={onPhoto}
          title={ownPhoto ? "change your photo" : "use my photo"}
          aria-pressed={Boolean(ownPhoto)}
        >
          {ownPhoto ? (
            <MemberFace name={name} avatarUrl={ownPhoto} size="md" />
          ) : (
            <span className="claim-look-photo-slot">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-2h5.4l1.2 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="12.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              <small>my photo</small>
            </span>
          )}
          {ownPhoto && <YouBadge />}
        </button>
      )}
    </div>
  );
}

function YouBadge() {
  return (
    <span className="claim-look-selected">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="m2 6 2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      you
    </span>
  );
}
