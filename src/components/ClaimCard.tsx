import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  isPersonaName,
  updateIdentity,
  useIdentity,
  type Persona,
} from "../live/identity";
import { LiveCursor } from "../cursors";
import { playSound } from "../lib/sounds";
import { MemberFace } from "./MemberFace";
import { LookRow } from "./LookRow";
import { JoinForm } from "./JoinForm";
import { useAccount } from "../live/useJoin";
import { useAvatarUpload } from "../live/useAvatarUpload";
import { useAuthActions } from "@convex-dev/auth/react";
import { PhotoInput } from "./PhotoInput";
import { resetIdentity } from "../live/identity";
import { canFollowPointer, type GatePointRef } from "./GateCursor";

/** The room named at the top of the gate: where you are, who lives here, who's in. */
export type RoomContext = {
  spaceName: string;
  spaceColor: string;
  memberNames: string[];
  presenceCount: number;
};

const GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";
const COLLAPSE_MS = 440;

/**
 * The entry gate (variant "gate") and the identity popover (variant "popover").
 *
 * The gate is a doorway, not a form: the room is named at the top, your real
 * cursor rides the pointer outside the card (GateCursor), a look is one tap,
 * and Enter walks you in. On `leaving` the whole card collapses into the
 * cursor tip — both variants; the popover leaves the same way (see enterRoom
 * and closeClaim in LiveSpace).
 */
export function ClaimCard({
  open,
  onClose,
  variant = "popover",
  room,
  leaving = false,
  cursorPosition,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "gate" | "popover";
  room?: RoomContext;
  /** The door is opening: collapse into the cursor and stop taking input. */
  leaving?: boolean;
  /** Where the gate cursor's tip is right now, so the collapse has a target. */
  cursorPosition?: GatePointRef;
}) {
  const identity = useIdentity();
  const account = useAccount();
  /* Which door into the join form: "keep this" (a guest saving what they
     have) or "sign in" (someone who joined before, on a new browser). Same
     form, different first line. */
  const [joining, setJoining] = useState<"keep" | "signin" | null>(null);
  const [changingLook, setChangingLook] = useState(false);
  const uploadPhoto = useAvatarUpload();
  const { signOut } = useAuthActions();
  const photoRef = useRef<HTMLInputElement | null>(null);
  const [draftName, setDraftName] = useState(identity.name);
  const fallbackName = useRef(identity.name);
  const cardRef = useRef<HTMLFormElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    fallbackName.current = identity.name;
    setDraftName(identity.name);
  }, [open, identity.name]);

  /* Desktop lands with the name selected: one keystroke replaces "momo",
     Enter walks in. Phones keep the keyboard down until you ask for it. */
  useEffect(() => {
    if (!open || variant !== "gate" || !canFollowPointer()) return;
    const timer = window.setTimeout(() => {
      nameRef.current?.focus({ preventScroll: true });
      nameRef.current?.select();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [open, variant]);

  /* The collapse: the card travels to the cursor tip and shrinks into it, on
     glide — exits never overshoot. Aims just above its own centre when there
     is no pointer to aim at. */
  useEffect(() => {
    if (!leaving) return;
    const card = cardRef.current;
    if (!card) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const target = cursorPosition?.current ?? { x: centerX, y: centerY - 60 };
    const dx = target.x - centerX;
    const dy = target.y - centerY;
    card.style.transformOrigin = "50% 50%"; // the popover's is top right
    card.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        { opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0 },
      ],
      { duration: COLLAPSE_MS, easing: GLIDE, fill: "forwards" },
    );
  }, [leaving, cursorPosition]);

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

  const pickLook = (persona: Persona) => {
    const keepName = !isPersonaName(identity.name);
    updateIdentity({
      color: persona.color,
      emoji: persona.emoji,
      avatarUrl: persona.avatarUrl,
      ...(keepName ? {} : { name: persona.name }),
    });
    if (!keepName) setDraftName(persona.name);
    playSound("tap");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (leaving) return;
    onClose();
  };

  if (joining) {
    return (
      <section
        className={`claim-card is-${variant}`}
        aria-label="Keep this identity"
      >
        <JoinForm
          title={joining === "signin" ? "sign in" : "keep this"}
          reason={
            joining === "signin"
              ? "type the email you joined with — your name and look come back with it."
              : "your name, your look, the spaces you're in — kept, so you're the same person on your phone."
          }
          onJoined={() => setJoining(null)}
          onCancel={() => setJoining(null)}
        />
      </section>
    );
  }

  /* Sign out = become a fresh guest. The token swap needs a reload (see
     JoinForm), and the tab's remembered persona goes with it. */
  const leaveAccount = () => {
    void signOut().finally(() => {
      resetIdentity();
      window.location.reload();
    });
  };

  const isGate = variant === "gate";
  const here = room?.presenceCount ?? 0;

  return (
    /* When the gate is up it IS the page — it blocks the room behind it. */
    <form
      ref={cardRef}
      className={`claim-card is-${variant}${leaving ? " is-leaving" : ""}`}
      aria-label={isGate ? "Enter the room" : "Your identity"}
      onSubmit={submit}
    >
      {isGate && room ? (
        <div className="claim-room">
          <span className="claim-card-kicker">you&apos;re walking into</span>
          <div className="claim-room-name">
            <span
              className="claim-room-color"
              style={{ backgroundColor: room.spaceColor }}
              aria-hidden="true"
            />
            <strong>{room.spaceName}</strong>
          </div>
          <div className="claim-room-here">
            {room.memberNames.length > 0 && (
              <div className="claim-room-faces" aria-hidden="true">
                {room.memberNames.slice(0, 5).map((name) => (
                  <MemberFace key={name} name={name} size="sm" />
                ))}
              </div>
            )}
            <span>
              <i aria-hidden="true" />
              {here > 0 ? `${here} here right now` : "nobody in yet · you're first"}
            </span>
          </div>
        </div>
      ) : (
        <div className="claim-card-heading">
          <div>
            <span className="claim-card-kicker">your live identity</span>
            <strong>you&apos;re {identity.name}</strong>
            <span>that&apos;s your cursor</span>
          </div>
          <button
            type="button"
            className="claim-card-close"
            onClick={onClose}
            aria-label="Dismiss identity card"
          >
            ×
          </button>
        </div>
      )}

      {/* Phones can't ride the pointer, so the cursor parks here instead.
          Hidden on hover devices — there it follows the mouse (GateCursor). */}
      {isGate && (
        <div className="claim-you-perch" aria-hidden="true">
          <LiveCursor
            x={0}
            y={0}
            name={identity.name}
            color={identity.color}
            emoji={identity.emoji}
            avatarUrl={identity.avatarUrl}
            label={identity.name}
            className="claim-perch-cursor"
          />
          <span>that&apos;s you</span>
        </div>
      )}

      {/* The door says it's a door. Everything under here — a name field, a
          row of faces — reads like a sign-up sheet to anyone who hasn't
          used the app, and to any reader that only gets the text (a link
          preview, a crawler, someone with images off). It isn't one: the
          name is your label to the room, the account below is optional,
          and there is no wall. Say so before the fields start. */}
      {isGate && (
        <p className="claim-gate-note">
          {account.joined
            ? "you're back — this is the name and look you saved"
            : "no account needed — your name is just what the room sees"}
        </p>
      )}

      <label className="claim-name-label">
        {isGate ? "your name" : "name"}
        <input
          ref={nameRef}
          className="claim-name-input"
          value={draftName}
          maxLength={14}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => commitName(event.target.value)}
          onBlur={restoreName}
          aria-label="Your display name"
        />
      </label>

      {/* A joined person on the gate already has a look: show it, and keep
          the eight behind one link. Everyone else picks. */}
      {isGate && account.joined && !changingLook ? (
        <div className="claim-return">
          <button
            type="button"
            className="claim-return-face"
            style={{ "--look": identity.color } as CSSProperties}
            onClick={() => photoRef.current?.click()}
            title="use a photo of you"
          >
            <MemberFace name={identity.name} avatarUrl={identity.avatarUrl} size="lg" />
          </button>
          <div className="claim-return-copy">
            <span className="claim-picker-label">your look</span>
            <button type="button" className="claim-join-link claim-return-change" onClick={() => setChangingLook(true)}>
              change look
            </button>
          </div>
        </div>
      ) : (
        <div className="claim-picker-section">
          <span className="claim-picker-label">{isGate ? "pick a look" : "your look"}</span>
          <LookRow
            name={identity.name}
            avatarUrl={identity.avatarUrl}
            onPick={pickLook}
            onPhoto={isGate ? undefined : () => photoRef.current?.click()}
          />
        </div>
      )}
      <PhotoInput ref={photoRef} upload={uploadPhoto} />

      <button type="submit" className="claim-done">
        {isGate ? (
          "enter the room →"
        ) : (
          <>
            done <span aria-hidden="true">↗</span>
          </>
        )}
      </button>

      {/* The second CTA §1 always planned. Never a wall: it sits UNDER the way
          in, it is one quiet line, and "not now" is always there. */}
      {account.joined ? (
        <span className="claim-joined-note" title={account.email}>
          saved to {account.email} ✓
          {" · "}
          <button type="button" className="claim-join-link claim-signout-link" onClick={leaveAccount}>
            not you? sign out
          </button>
        </span>
      ) : (
        <span className="claim-join-links">
          <button
            type="button"
            className="claim-join-link"
            onClick={() => setJoining("keep")}
          >
            keep this on your other devices
          </button>
          <button
            type="button"
            className="claim-join-link"
            onClick={() => setJoining("signin")}
          >
            been here before? sign in
          </button>
        </span>
      )}
    </form>
  );
}
