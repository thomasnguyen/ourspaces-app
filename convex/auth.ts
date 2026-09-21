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
import type { GenericMutationCtx, AnyDataModel } from "convex/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { EmailOtp, OTP_PROVIDER_ID } from "./otp";
import type { DataModel, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * Which `users` row a sign-in resolves to. Supplying this means we own ALL
 * user-row creation, including the silent guest path — so the non-OTP branch
 * below is load-bearing: get it wrong and nobody can walk in at all.
 *
 * Why it exists: it is what lets a guest keep their identity when they join.
 * The callback runs inside the `auth:store` mutation, which carries the
 * CALLER's identity — so `getAuthUserId` here is the anonymous guest who is
 * registering. We patch the email onto their existing row and return the same
 * id, and the library re-points the authAccounts row at it. Their votes,
 * name, colour and membership all survive because the id never changed.
 * That's §1's "upgrade, don't fork", with no data migration at all.
 */
async function createOrUpdateUser(
  rawCtx: GenericMutationCtx<AnyDataModel>,
  {
    existingUserId,
    type,
    provider,
    profile,
  }: {
    existingUserId: Id<"users"> | null;
    type: "oauth" | "credentials" | "email" | "phone" | "verification";
    provider: { id: string };
    profile: Record<string, unknown> & { email?: string };
  },
): Promise<Id<"users">> {
  const ctx = rawCtx as unknown as { db: GenericMutationCtx<DataModel>["db"] };
  const db = ctx.db;

  // Guest sign-in and anything else: stock behaviour. The whole product walks
  // through here on every first visit.
  if (provider.id !== OTP_PROVIDER_ID) {
    if (existingUserId) {
      await db.patch(existingUserId, profile);
      return existingUserId;
    }
    return await db.insert("users", profile);
  }

  // Step 1 — a code was requested. The address is a CLAIM, not a fact yet, so
  // the guest must not be touched: otherwise anyone could type a stranger's
  // address, never read the code, and still have permanently welded that
  // address onto their own account. Mint a throwaway stub instead.
  if (type === "email") {
    if (existingUserId) return existingUserId;
    return await db.insert("users", { email: profile.email });
  }

  // Step 2 — the code checked out, so this address is proven.
  const guestId = (await getAuthUserId(
    rawCtx as never,
  )) as Id<"users"> | null;
  const guest = guestId ? await db.get(guestId) : null;
  const stub = existingUserId ? await db.get(existingUserId) : null;
  const now = Date.now();

  // "Unclaimed stub" = made by step 1, never finished a verification. We are
  // the only writer of emailVerificationTime, so it is a safe discriminator.
  const stubIsUnclaimed =
    stub !== null &&
    stub.emailVerificationTime === undefined &&
    stub.isAnonymous !== true;

  // The demo path: a guest registers a fresh address. Adopt the email onto
  // the guest's OWN row, so the user id never changes and nothing needs
  // rewriting.
  if (guest?.isAnonymous === true && stubIsUnclaimed && guestId) {
    await db.patch(guestId, {
      email: profile.email,
      emailVerificationTime: now,
      isAnonymous: undefined, // patching undefined removes the field
    });
    await db.delete(stub._id);
    return guestId;
  }

  // Otherwise: a registered person signing in again (often on a new browser,
  // which is the whole point of joining). Their durable identity wins and is
  // returned as-is. This browser's throwaway guest rows are simply left
  // behind — see convex/identityMerge.ts for folding them in.
  if (existingUserId) {
    await db.patch(existingUserId, {
      email: profile.email,
      emailVerificationTime: now,
    });
    return existingUserId;
  }
  return await db.insert("users", {
    email: profile.email,
    emailVerificationTime: now,
  });
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Anonymous is the guest path; EmailOtp is "join". No email+password,
  // ever (§1 hard rules) — the emailed code is not a password.
  providers: [Anonymous<DataModel>(), EmailOtp],
  callbacks: { createOrUpdateUser },
});

/**
 * The caller, as a string, or throw. Server-derived — never an argument.
 *
 * Returns `string` rather than `Id<"users">` on purpose: every userId column
 * in the schema is `v.string()` so seeded crew ("seed:maya") can coexist with
 * real auth ids (§0), and this drops into them with no cast at the call site.
 */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("not signed in");
  return userId;
}

/**
 * Same, but rejects guests. Making and owning a space is the one thing an
 * account buys (§1) — everything else on the canvas stays open to guests.
 */
export async function requireRegisteredUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId as Parameters<typeof ctx.db.get>[0]);
  if ((user as { isAnonymous?: boolean } | null)?.isAnonymous === true) {
    throw new Error("register to create a space");
  }
  return userId;
}

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
      // Set once a guest registers. The UI reads this to tell "you're juno"
      // from "you're juno, and we'll remember you".
      email: v.optional(v.string()),
      // The profile that follows a joined person (docs/accounts.md): the
      // client hydrates its tab identity from these, and mirrors edits back.
      color: v.optional(v.string()),
      emoji: v.optional(v.string()),
      image: v.optional(v.string()),
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
      email:
        typeof user?.email === "string" && user.email ? user.email : undefined,
      color: user?.color || undefined,
      emoji: user?.emoji || undefined,
      image: user?.image || undefined,
    };
  },
});

/**
 * Your profile, on your row. Joined people only: a guest's name and look
 * stay in the tab (§1 — guest is complete without ever writing here), so
 * there is nothing to carry to a second device until they join.
 */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    emoji: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.isAnonymous === true) return null;
    await ctx.db.patch(userId, args);
    return null;
  },
});
