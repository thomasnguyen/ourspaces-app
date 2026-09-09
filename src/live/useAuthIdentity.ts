import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { adoptAuthUserId } from "./identity";

/**
 * Adopts the authenticated user id as this tab's identity once the silent
 * guest sign-in lands (see src/lib/authClient.ts).
 *
 * Deliberately tolerant: while the session is still in flight `currentUser`
 * is undefined and while a visitor is unauthenticated it is null. In both
 * cases the tab keeps its locally-allocated id and the canvas works exactly
 * as before — guest is the rollback path, never a gate (§1).
 */
export function useAuthIdentity() {
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
