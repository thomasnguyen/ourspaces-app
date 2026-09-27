import type { AuthConfig } from "convex/server";

// convex/tsconfig.json has no node types; auth.config.ts is evaluated at push
// time, where process.env is available.
declare const process: { env: Record<string, string | undefined> };

/**
 * The provider Convex validates JWTs against. Convex Auth mints them with
 * `iss` = CONVEX_SITE_URL and `aud` = "convex". Getting this file wrong is the
 * classic silently-always-signed-out bug, so it stays minimal.
 *
 * This is the stock Convex Auth pairing, which makes Convex fetch
 * `${CONVEX_SITE_URL}/.well-known/openid-configuration`. Our app router lives
 * under httpPrefix "/api" and cannot answer at the root, so the authWellKnown
 * component publishes those documents instead — see its convex.config.ts.
 *
 * The `customJwt` provider looks like a tidier alternative (it takes an
 * explicit `jwks` URL, so the prefix would stop mattering) but it rejects
 * these tokens with "JWT may be missing a 'kid' (key ID) header": Convex Auth
 * signs with a bare `{ alg: "RS256" }` header and no key id. Don't retry it.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL ?? "",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
