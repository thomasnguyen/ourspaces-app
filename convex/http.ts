import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { streamAsk } from "./streaming";
import { createAuth } from "./auth";

const http = httpRouter();

// persistent-text-streaming: token-by-token "ask the space" answers.
http.route({ path: "/ask-stream", method: "POST", handler: streamAsk });
http.route({
  path: "/ask-stream",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Digest, Authorization",
          "Access-Control-Max-Age": "86400",
        }),
      });
    }
    return new Response();
  }),
});

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

/** Standard-webhooks (svix) HMAC check: sign `${id}.${ts}.${body}` with the
 *  base64 secret after `whsec_`, compare against the `v1,` signatures. */
async function svixVerified(req: Request, payload: string): Promise<boolean> {
  const secret = env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured — accept (dev convenience)
  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signatures = req.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signatures) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(secret.replace(/^whsec_/, "")).buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${payload}`),
  );
  const expected = bytesToB64(new Uint8Array(signed));
  return signatures
    .split(" ")
    .some((part) => part.split(",")[1] === expected);
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string").join(", ");
  return "";
}

// Registered with AgentMail as https://<deployment>.convex.site/api/agentmail/webhook
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const payload = await req.text();
    if (!(await svixVerified(req, payload))) {
      return new Response("bad signature", { status: 401 });
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return new Response("bad json", { status: 400 });
    }
    const type = str(event.event_type ?? event.type);
    if (type !== "message.received") return new Response("ignored", { status: 200 });
    const message = (event.message ?? {}) as Record<string, unknown>;
    const inboxId = str(message.inbox_id);
    const messageId = str(message.message_id);
    const threadId = str(message.thread_id);
    const from = str(message.from_ ?? message.from);
    const to = str(message.to);
    const subject = str(message.subject);
    const text = str(message.text ?? message.preview);
    // Component owns dedup (AgentMail can redeliver) + the inbound store.
    const { isNew } = await ctx.runMutation(components.agentMail.lib.ingestWebhook, {
      eventId: str(event.event_id ?? event.id) || messageId,
      inboxId,
      messageId,
      threadId: threadId || undefined,
      from,
      to,
      subject,
      text,
    });
    if (isNew) {
      await ctx.runMutation(internal.agentmail.onMessageReceived, {
        inboxId,
        messageId: messageId || undefined,
        threadId: threadId || undefined,
        from,
        to,
        subject,
        text,
      });
    }
    return new Response("ok", { status: 200 });
  }),
});

// Better Auth's own routes. Registered by hand rather than with
// authComponent.registerRoutes because convex.config.ts mounts this router
// under httpPrefix "/api": registerRoutes would register at the same path
// Better Auth then matches against, and Better Auth matches the EXTERNAL
// pathname. So we register at "/auth/" (external "/api/auth/") while
// createAuth carries basePath "/api/auth" so both agree.
//
// CORS is hand-rolled for the same reason. In production the static site and
// this router share an origin so it never fires, but `npm run dev` serves the
// app from localhost against the deployed convex.site — cross-origin, with
// credentials, so the origin must be echoed back (never "*").
function allowedAuthOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
  if (env.SITE_URL && origin === env.SITE_URL.replace(/\/$/, "")) return origin;
  return null;
}

const authHandler = httpAction(async (ctx, request) => {
  const allowed = allowedAuthOrigin(request);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowed
        ? {
            "Access-Control-Allow-Origin": allowed,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, Better-Auth-Cookie",
            "Access-Control-Max-Age": "86400",
            Vary: "Origin",
          }
        : {},
    });
  }

  const response = await createAuth(ctx).handler(request);
  if (!allowed) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowed);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Expose-Headers", "Set-Better-Auth-Cookie");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
});

for (const method of ["GET", "POST", "OPTIONS"] as const) {
  http.route({ pathPrefix: "/auth/", method, handler: authHandler });
}

export default http;
