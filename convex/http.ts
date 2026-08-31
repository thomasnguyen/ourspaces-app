import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

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
    await ctx.runMutation(internal.agentmail.onMessageReceived, {
      inboxId: str(message.inbox_id),
      from: str(message.from_ ?? message.from),
      to: str(message.to),
      subject: str(message.subject),
      text: str(message.text ?? message.preview),
    });
    return new Response("ok", { status: 200 });
  }),
});

export default http;
