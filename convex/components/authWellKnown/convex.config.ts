import { defineComponent } from "convex/server";
import { v } from "convex/values";

// Serves Convex Auth's OIDC discovery documents at the ROOT of convex.site.
//
// Why a component exists just for two static JSON files: the app's own router
// is mounted under httpPrefix "/api" (convex.config.ts) so the static site can
// own "/", but Convex validates JWTs by fetching
// `${CONVEX_SITE_URL}/.well-known/openid-configuration` from the root — where
// static hosting would answer with the SPA's index.html and auth would fail
// silently. Component httpPrefixes are absolute from the root, so mounting
// this at "/.well-known" puts the documents exactly where Convex looks.
//
// This is the only reason `auth.addHttpRoutes(http)` isn't used; see
// convex/auth.config.ts.
export default defineComponent("authWellKnown", {
  env: { JWKS: v.optional(v.string()) },
});
