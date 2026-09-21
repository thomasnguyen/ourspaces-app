import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useJoin } from "../live/useJoin";
import { CodeSlots } from "./CodeSlots";

/**
 * The join form: email in, six digits back. Lives inside the claim card.
 * (Making a space has its own inline copy of these steps — SpaceMaker.tsx —
 * because there the code should open the room, not stamp a card.)
 *
 * Deliberately not a wall. Every copy line here is about keeping what you
 * already have, never about unlocking the app (§1).
 */
export function JoinForm({
  reason,
  title = "keep this",
  onJoined,
  onCancel,
}: {
  /** One line saying why this is worth doing, in the voice of the moment. */
  reason: string;
  /** The kicker over the email step: "keep this" for a guest, "sign in" for a return. */
  title?: string;
  onJoined?: () => void;
  onCancel?: () => void;
}) {
  const { stage, email, busy, error, sendCode, verify, restart, google } = useJoin();
  const options = useQuery(api.auth.signInOptions, {});
  const [draft, setDraft] = useState("");

  // Each step gets an empty field. Without this the address you just typed
  // is still sitting in `draft` when the code slots mount, and six boxes
  // open pre-filled with "turbot".
  useEffect(() => {
    setDraft("");
  }, [stage]);

  if (stage === "done") {
    return (
      <div className="join-form is-done">
        <span className="join-stamp">you&apos;re in the book</span>
        <strong>{email}</strong>
        <span>this browser, your phone, next week — same you.</span>
        <button
          type="button"
          className="claim-done"
          onClick={() => {
            // A reload, deliberately. signIn swaps the stored token, but the
            // live ConvexReactClient keeps using the old one — verified: 40s
            // after joining, currentUser still answered as the guest and
            // createSpace still refused. Reloading re-reads the token from
            // localStorage and everything downstream is simply correct.
            onJoined?.();
            window.location.reload();
          }}
        >
          keep going <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  const onCode = stage === "code";

  return (
    <form
      className="join-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        void (onCode ? verify(draft) : sendCode(draft));
      }}
    >
      <span className="claim-card-kicker">
        {onCode ? "check your email" : title}
      </span>
      <p className="join-form-reason">
        {onCode ? `six numbers, on their way to ${email}.` : reason}
      </p>

      {onCode ? (
        <CodeSlots
          value={draft}
          onChange={setDraft}
          onComplete={(code) => void verify(code)}
          disabled={busy}
        />
      ) : (
        <input
          className="claim-name-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={64}
          placeholder="you@email.com"
          aria-label="Your email"
          autoFocus
        />
      )}

      {error && <span className="join-form-error">{error}</span>}

      {!onCode && options?.google && (
        <button
          type="button"
          className="join-google"
          disabled={busy}
          onClick={() => void google()}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" fill="#4285F4" />
            <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" fill="#34A853" />
            <path d="M6.4 14a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5Z" fill="#FBBC04" />
            <path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6Z" fill="#EA4335" />
          </svg>
          continue with Google
        </button>
      )}

      <button type="submit" className="claim-done" disabled={busy}>
        {busy
          ? onCode
            ? "letting you in…"
            : "sending…"
          : onCode
            ? "that's me →"
            : "send me a code"}
      </button>

      <button
        type="button"
        className="join-form-back"
        onClick={() => {
          if (onCode) {
            setDraft("");
            restart();
          } else {
            onCancel?.();
          }
        }}
      >
        {onCode ? "use a different email" : "not now"}
      </button>
    </form>
  );
}
