// Guest or join — never a login wall. Spec: docs/data-model-plan.md §1.
//
// Guest is the whole product: a silent anonymous sign-in on first load
// replaces the old sessionStorage crypto.randomUUID(), so every visitor has
// a real Convex identity without ever seeing a form. "Join" upgrades the
// same person rather than forking them.
//
// Passkey is NOT wired: @convex-dev/better-auth@0.12.5 pins
// better-auth >=1.6.11 <1.7.0 and @better-auth/passkey requires ^1.7.3, so
// the two cannot coexist today. See docs/local/road-to-60.md §1.
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins/anonymous";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env, query } from "./_generated/server";
import { v } from "convex/values";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: env.SITE_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Better Auth matches the external pathname, and convex.config.ts mounts
    // our router under "/api". convex/http.ts registers at "/auth/" so the
    // external path is "/api/auth/*" — which is also what the browser client
    // hits by default (site URL + "/api/auth").
    basePath: "/api/auth",
    database: authComponent.adapter(ctx),
    // Anonymous is the guest path. No email+password, ever (§1 hard rules).
    plugins: [anonymous(), convex({ authConfig })],
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await authComponent.safeGetAuthUser(ctx);
    return {
      userId: identity.subject,
      isAnonymous: (user as { isAnonymous?: boolean } | undefined)
        ?.isAnonymous === true,
      name: typeof user?.name === "string" && user.name ? user.name : undefined,
    };
  },
});
