import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { adoptAuthUserId } from "./identity";

/**
 * Silent guest sign-in. Runs once the provider has settled and reports the
 * visitor as signed out; Convex Auth persists the tokens in localStorage, so
 * a returning visitor skips straight past this.
 *
 * Deliberately swallows failures: a visitor who cannot sign in still gets the
 * canvas, because guest is the rollback path, not a gate (§1).
 */
function useGuestSession() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const started = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || started.current) return;
    started.current = true;
    void signIn("anonymous").catch(() => {
      // Stay a local-only visitor. The canvas is never behind sign-in.
    });
  }, [isLoading, isAuthenticated, signIn]);
}

/**
 * Adopts the authenticated user id as this tab's identity once the silent
 * guest sign-in lands.
 *
 * Deliberately tolerant: while the session is still in flight `currentUser`
 * is undefined and while a visitor is unauthenticated it is null. In both
 * cases the tab keeps its locally-allocated id and the canvas works exactly
 * as before — guest is the rollback path, never a gate (§1).
 */
export function useAuthIdentity() {
  useGuestSession();
  const user = useQuery(api.auth.currentUser, {});
  useEffect(() => {
    if (user?.userId) adoptAuthUserId(user.userId);
  }, [user?.userId]);
}

/** Renderless mount point, so the hook only runs inside the Convex provider. */
export function AuthIdentityBridge() {
  useAuthIdentity();
  return null;
}
