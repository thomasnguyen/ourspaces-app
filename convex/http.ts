import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { streamAsk } from "./streaming";
import { auth } from "./auth";

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

type WebhookAttachment = {
  attachmentId: string;
  filename: string;
  contentType: string;
  size: number;
  inline: boolean;
};

/** AgentMail's snake_case attachment metadata → the component's shape. */
function attachmentsFrom(raw: unknown[]): WebhookAttachment[] {
  const out: WebhookAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const attachmentId = str(item.attachment_id);
    if (!attachmentId) continue;
    out.push({
      attachmentId,
      filename: str(item.filename),
      contentType: str(item.content_type),
      size: typeof item.size === "number" ? item.size : 0,
      inline: str(item.content_disposition) === "inline",
    });
  }
  return out;
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string").join(", ");
  return "";
}

// Registered with AgentMail as https://<deployment>.convex.site/api/agentmail/webhook
// Room radio "now playing". The audio is Radio Paradise (SomaFM 403s browsers),
// and RP's now_playing API has no CORS header, so the title comes through here.
// Serenity has no API channel: its title is sniffed off the stream's ICY metadata.
const RADIO_CHANNELS: Record<string, number | "serenity"> = {
  indiepop: 0,
  groovesalad: 1,
  lush: "serenity",
  folkfwd: 3,
  poptron: 2,
  thetrip: 5,
};

async function icyTitle(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { "Icy-MetaData": "1" },
      signal: controller.signal,
    });
    const metaint = Number(response.headers.get("icy-metaint"));
    if (!metaint || !response.body) return null;
    const reader = response.body.getReader();
    let buf = new Uint8Array(0);
    while (buf.length < metaint + 4096) {
      const { value, done } = await reader.read();
      if (done) break;
      const next = new Uint8Array(buf.length + value.length);
      next.set(buf);
      next.set(value, buf.length);
      buf = next;
    }
    controller.abort();
    const len = (buf[metaint] ?? 0) * 16;
    const meta = new TextDecoder().decode(buf.slice(metaint + 1, metaint + 1 + len));
    const title = meta.match(/StreamTitle='([^']*)'/)?.[1] ?? "";
    const dash = title.indexOf(" - ");
    if (dash < 0) return null;
    return { artist: title.slice(0, dash), title: title.slice(dash + 3) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

http.route({
  path: "/radio/now",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const station = new URL(request.url).searchParams.get("station") ?? "";
    const chan = RADIO_CHANNELS[station];
    let track: { artist: string; title: string } | null = null;
    if (chan === "serenity") {
      track = await icyTitle("https://stream.radioparadise.com/serenity");
    } else if (typeof chan === "number") {
      try {
        const data = (await (
          await fetch(`https://api.radioparadise.com/api/now_playing?chan=${chan}`)
        ).json()) as { artist?: string; title?: string | null };
        track = data.artist && data.title ? { artist: data.artist, title: data.title } : null;
      } catch {
        track = null;
      }
    }
    return new Response(JSON.stringify({ track }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  }),
});

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
    // `attachments` absent entirely (vs. an empty array) means this webhook
    // shape doesn't carry them — the mail path re-fetches the message instead
    // of assuming the email had none.
    const attachments = Array.isArray(message.attachments)
      ? attachmentsFrom(message.attachments)
      : undefined;
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
      attachments,
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
        attachments,
      });
    }
    return new Response("ok", { status: 200 });
  }),
});

// Convex Auth's HTTP routes, minus the two OIDC discovery documents. Those
// must live at the root and this router is under httpPrefix "/api", so the
// authWellKnown component serves them (convex.config.ts). The OAuth start +
// callback routes the library registers as "/api/auth/…" are re-homed here
// as "/auth/…", which the prefix then serves at exactly the "/api/auth/…"
// URLs the library redirects to. Guest + email code never touch these.
const authRoutes = httpRouter();
auth.addHttpRoutes(authRoutes);
for (const [path, method, handler] of authRoutes.getRoutes()) {
  if (!path.startsWith("/api/auth/")) continue;
  const local = path.slice("/api".length);
  if (local.endsWith("*")) {
    http.route({ pathPrefix: local.slice(0, -1), method, handler });
  } else {
    http.route({ path: local, method, handler });
  }
}

export default http;
