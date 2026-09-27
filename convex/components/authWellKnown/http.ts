import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

// Mounted at "/.well-known" by the app's convex.config.ts, so these paths are
// "/.well-known/openid-configuration" and "/.well-known/jwks.json" at the root
// of convex.site — the two URLs Convex fetches to validate a Convex Auth JWT.
const http = httpRouter();

const json = (body: string) =>
  new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });

http.route({
  path: "/openid-configuration",
  method: "GET",
  // The issuer must equal the `iss` Convex Auth stamps on its tokens, which is
  // CONVEX_SITE_URL. Reading it off the request origin keeps this component
  // free of extra env wiring and correct on every deployment.
  handler: httpAction(async (_ctx, request) => {
    const origin = new URL(request.url).origin;
    return json(
      JSON.stringify({
        issuer: origin,
        jwks_uri: `${origin}/.well-known/jwks.json`,
        authorization_endpoint: `${origin}/oauth/authorize`,
      }),
    );
  }),
});

http.route({
  path: "/jwks.json",
  method: "GET",
  handler: httpAction(async (ctx) => json(await ctx.runQuery(api.lib.jwks, {}))),
});

export default http;
