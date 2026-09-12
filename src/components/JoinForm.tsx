import { useEffect, useState } from "react";
import { useJoin } from "../live/useJoin";
import { CodeSlots } from "./CodeSlots";

/**
 * The join form: email in, six digits back. Lives inside the claim card and
 * inside the "make your own space" nudge — same two steps either place.
 *
 * Deliberately not a wall. Every copy line here is about keeping what you
 * already have, never about unlocking the app (§1).
 */
export function JoinForm({
  reason,
  onJoined,
  onCancel,
}: {
  /** One line saying why this is worth doing, in the voice of the moment. */
  reason: string;
  onJoined?: () => void;
  onCancel?: () => void;
}) {
  const { stage, email, busy, error, sendCode, verify, restart } = useJoin();
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
        {onCode ? "check your email" : "keep this"}
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
