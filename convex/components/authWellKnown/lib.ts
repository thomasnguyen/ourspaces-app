import { query } from "./_generated/server";
import { v } from "convex/values";
import { env } from "./_generated/server";

/**
 * The public half of the Convex Auth signing key, as a JWKS document.
 * Public by design — it is published at /.well-known/jwks.json so Convex can
 * verify the tokens it was handed. The private key (JWT_PRIVATE_KEY) never
 * leaves the deployment.
 */
export const jwks = query({
  args: {},
  returns: v.string(),
  handler: async () => env.JWKS ?? '{"keys":[]}',
});
