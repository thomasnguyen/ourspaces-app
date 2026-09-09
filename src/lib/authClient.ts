// Better Auth browser client. Guest or join, never a wall —
// docs/data-model-plan.md §1.
//
// Only the anonymous plugin is wired. Passkey needs better-auth >=1.7.3 and
// @convex-dev/better-auth@0.12.5 pins <1.7.0, so "join" has no second mode
// yet; see convex/auth.ts.
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as
  | string
  | undefined;

export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  // crossDomainClient carries the session token explicitly, so local dev
  // (localhost app + convex.site auth) does not depend on third-party cookies.
  plugins: [crossDomainClient(), convexClient(), anonymousClient()],
});

let guestSignInPromise: Promise<void> | null = null;

/**
 * Silent guest sign-in. Idempotent and safe to call on every mount: it
 * resolves immediately when a session already exists, and it never surfaces
 * an error to the UI — a visitor who cannot sign in still gets the canvas,
 * because guest is the rollback path, not a gate.
 */
export function ensureGuestSession(): Promise<void> {
  if (guestSignInPromise) return guestSignInPromise;
  guestSignInPromise = (async () => {
    try {
      const session = await authClient.getSession();
      if (session.data) return;
      await authClient.signIn.anonymous();
    } catch {
      // Stay a local-only visitor. The canvas is never behind sign-in.
    }
  })();
  return guestSignInPromise;
}
