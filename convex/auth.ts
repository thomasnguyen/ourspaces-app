// Guest or join — never a login wall. Spec: docs/data-model-plan.md §1.
//
// Guest is the whole product: a silent anonymous sign-in on first load
// replaces the old sessionStorage crypto.randomUUID(), so every visitor has
// a real Convex identity without ever seeing a form. "Join" upgrades the
// same person rather than forking them.
//
// Passkey is NOT wired: @convex-dev/auth@0.0.95 ships Anonymous,
// ConvexCredentials, Email, Password and Phone providers only — there is no
// WebAuthn provider, and Auth.js's passkey provider needs adapter hooks this
// library doesn't implement. The claim card already has the slot for it.
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { v } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Anonymous is the guest path. No email+password, ever (§1 hard rules).
  providers: [Anonymous<DataModel>()],
});

/**
 * The signed-in person, or null for a visitor whose anonymous session has
 * not landed yet. Never throws: the canvas must render for everyone, so
 * callers treat null as "still a guest" rather than as an error.
 */
export const currentUser = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.string(),
      isAnonymous: v.boolean(),
      name: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    return {
      userId,
      // Anonymous() stamps isAnonymous on the users row; anything else is a
      // real join.
      isAnonymous:
        (user as { isAnonymous?: boolean } | null)?.isAnonymous === true,
      name: typeof user?.name === "string" && user.name ? user.name : undefined,
    };
  },
});
