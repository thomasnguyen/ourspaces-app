import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { adoptAuthUserId, updateIdentity, useIdentity } from "./identity";

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
 * guest sign-in lands — and, for a joined person, keeps the tab and the
 * account in step (docs/accounts.md):
 *
 *  - down: the account's saved name/colour/emoji/photo land on the tab once
 *    per sign-in. The account wins over whatever persona the tab minted.
 *    A freshly joined row has no name yet, so the tab's identity stands.
 *  - up: after that, every edit (name field, look row, photo) is mirrored
 *    to the row, debounced, only when something actually differs.
 *
 * Deliberately tolerant: while the session is still in flight `currentUser`
 * is undefined and while a visitor is unauthenticated it is null. In both
 * cases the tab keeps its locally-allocated id and the canvas works exactly
 * as before — guest is the rollback path, never a gate (§1).
 */
export function useAuthIdentity() {
  useGuestSession();
  const user = useQuery(api.auth.currentUser, {});
  const identity = useIdentity();
  const updateProfile = useMutation(api.auth.updateProfile);
  const hydratedFor = useRef<string | null>(null);
  const latestUser = useRef(user);
  latestUser.current = user;

  useEffect(() => {
    if (user?.userId) adoptAuthUserId(user.userId);
  }, [user?.userId]);

  const joinedId = user && !user.isAnonymous ? user.userId : null;

  // Down: once per joined user.
  useEffect(() => {
    if (!joinedId || hydratedFor.current === joinedId) return;
    hydratedFor.current = joinedId;
    const saved = latestUser.current;
    if (!saved?.name) return;
    updateIdentity({
      name: saved.name,
      ...(saved.color ? { color: saved.color } : {}),
      ...(saved.emoji ? { emoji: saved.emoji } : {}),
      ...(saved.image ? { avatarUrl: saved.image } : {}),
    });
  }, [joinedId]);

  // Up: mirror edits, after hydration, only when the row would change.
  useEffect(() => {
    if (!joinedId || hydratedFor.current !== joinedId) return;
    const timer = window.setTimeout(() => {
      const saved = latestUser.current;
      if (
        saved?.name === identity.name &&
        saved?.color === identity.color &&
        saved?.emoji === identity.emoji &&
        saved?.image === identity.avatarUrl
      ) {
        return;
      }
      void updateProfile({
        name: identity.name,
        color: identity.color,
        emoji: identity.emoji,
        image: identity.avatarUrl,
      }).catch(() => {
        // A guest token that hasn't refreshed yet; the next edit retries.
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [joinedId, identity.name, identity.color, identity.emoji, identity.avatarUrl, updateProfile]);
}

/** Renderless mount point, so the hook only runs inside the Convex provider. */
export function AuthIdentityBridge() {
  useAuthIdentity();
  return null;
}
