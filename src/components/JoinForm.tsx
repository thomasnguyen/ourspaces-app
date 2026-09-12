import { useState } from "react";
import { useJoin } from "../live/useJoin";

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

  if (stage === "done") {
    return (
      <div className="join-form is-done">
        <span className="claim-card-kicker">you&apos;re saved</span>
        <strong>{email}</strong>
        <span>this browser, your phone, next week — same you.</span>
        {onJoined && (
          <button type="button" className="claim-done" onClick={onJoined}>
            keep going <span aria-hidden="true">→</span>
          </button>
        )}
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
      <span className="claim-card-kicker">{onCode ? "check your email" : "keep this"}</span>
      <p className="join-form-reason">
        {onCode ? `six digits, sent to ${email}.` : reason}
      </p>

      <input
        className="claim-name-input"
        // A fresh input per step, so the browser doesn't offer the email
        // address as an autocomplete for the code field.
        key={stage}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        type={onCode ? "text" : "email"}
        inputMode={onCode ? "numeric" : "email"}
        autoComplete={onCode ? "one-time-code" : "email"}
        maxLength={onCode ? 6 : 64}
        placeholder={onCode ? "000000" : "you@email.com"}
        aria-label={onCode ? "The six-digit code from your email" : "Your email"}
        autoFocus
      />

      {error && <span className="join-form-error">{error}</span>}

      <button type="submit" className="claim-done" disabled={busy}>
        {busy
          ? onCode
            ? "checking…"
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
