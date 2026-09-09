import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

// The provider Convex validates JWTs against. Better Auth mints them; the
// JWKS is read from the component's own table unless JWKS is set as an env
// var (see docs/data-model-plan.md §1). Getting this file wrong is the
// classic silently-always-signed-out bug, so it stays minimal.
export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
