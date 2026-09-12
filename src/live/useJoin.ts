import { useCallback, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * "Join" — the emailed six-digit code (convex/otp.ts). Two steps, one card:
 * ask for a code, then type it back.
 *
 * Joining never forks the person. The server patches the email onto the
 * guest's existing row and hands back the same user id, so the name, colour,
 * votes and memberships they already have just keep working (§1: upgrade,
 * don't fork). Nothing here has to migrate anything.
 */
export type JoinStage = "email" | "code" | "done";

/**
 * The rate limiter (convex/rateLimits.ts `otpSend`) is by far the likeliest
 * failure here, and "try again" is useless advice without a rough when — so
 * read the retryAfter it hands back rather than guessing.
 */
function sendFailureMessage(thrown: unknown) {
  const data = (thrown as { data?: { kind?: string; retryAfter?: number } })
    ?.data;
  if (data?.kind === "RateLimited") {
    const minutes = Math.max(1, Math.ceil((data.retryAfter ?? 0) / 60000));
    return `too many codes just now — try again in ${minutes} min`;
  }
  return "couldn't send that. check the address?";
}

export function useJoin() {
  const { signIn } = useAuthActions();
  const [stage, setStage] = useState<JoinStage>("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = useCallback(
    async (value: string) => {
      const address = value.trim().toLowerCase();
      if (!address.includes("@")) {
        setError("that doesn't look like an email");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await signIn("email-otp", { email: address });
        setEmail(address);
        setStage("code");
      } catch (thrown) {
        setError(sendFailureMessage(thrown));
      } finally {
        setBusy(false);
      }
    },
    [signIn],
  );

  const verify = useCallback(
    async (code: string) => {
      const digits = code.replace(/\D/g, "");
      if (digits.length !== 6) {
        setError("six digits, from the email");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await signIn("email-otp", { email, code: digits });
        setStage("done");
      } catch {
        setError("that code didn't work. check it, or start over");
      } finally {
        setBusy(false);
      }
    },
    [email, signIn],
  );

  const restart = useCallback(() => {
    setStage("email");
    setError(null);
  }, []);

  return { stage, email, busy, error, sendCode, verify, restart };
}

/**
 * Who the visitor is to the backend: a guest, or someone who joined.
 * `undefined` while the query is in flight — callers treat that as "guest",
 * because the canvas renders for everyone either way.
 */
export function useAccount() {
  const user = useQuery(api.auth.currentUser, {});
  return {
    loading: user === undefined,
    joined: user?.isAnonymous === false,
    email: user?.email,
  };
}
