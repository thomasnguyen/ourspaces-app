import { env } from "./_generated/server";
import { getServiceToken } from "convex/server";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { wrapEmbeddingModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";

/**
 * Model routing for the whole app. This is the job Convex's AI Gateway does,
 * and as of 2026-09-17 it does it: the gateway is live on this deployment, so
 * it is the preferred target for both chat and embeddings. Every request
 * authenticates as the deployment itself — `getServiceToken("ai-gateway")`
 * mints a short-lived credential inside the running action — so there is no
 * third-party proxy in the path and no API key of ours to carry or leak.
 *
 * The two targets that predate the gateway are still here as the config-time
 * fallbacks they always were, now reachable by setting `AI_GATEWAY_DISABLED`
 * to any non-empty value, which routes around a gateway incident without a
 * deploy: RoomDone's shared Cloudflare Worker when `AI_PROXY_URL` +
 * `AI_PROXY_TOKEN` are set, direct OpenAI when `OPENAI_API_KEY` is. The order
 * stays a config-time preference, not a failover — a 500 from the chosen
 * target is not retried against the next one.
 */

const GATEWAY_BASE_URL = "https://ai-gateway.convex.dev/v1";
/** Gateway model ids are `provider/model`. */
const GATEWAY_CHAT_MODEL = "openai/gpt-4o-mini";
const GATEWAY_EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** The gateway rejects an embeddings batch larger than this. */
const GATEWAY_MAX_EMBEDDINGS_PER_CALL = 512;
/** RoomDone's shared Cloudflare Worker — OpenAI-shaped /v1 in front of Workers AI. */
const PROXY_CHAT_MODEL = "@cf/openai/gpt-oss-120b";
const OPENAI_CHAT_MODEL = "gpt-4o-mini";
// The shared proxy is chat-only (no /v1/embeddings) — on that path rag needs
// real OpenAI. The gateway has both, and routes this id to the same model.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** The gateway needs no configuration: it authenticates as this deployment.
 *  So it is on unless someone deliberately turns it off. */
function gatewayEnabled(): boolean {
  return !env.AI_GATEWAY_DISABLED?.trim();
}

/** The gateway as an AI SDK provider. `@convex-dev/ai-sdk-provider@0.1.0`
 *  ships only the chat model (`convexGateway.embeddingModel` lands in 0.2.x),
 *  so the embedding side is assembled here out of the same two pieces that
 *  package uses: an OpenAI-compatible provider whose `fetch` mints the
 *  deployment's service token. Building it touches no network — the token is
 *  minted per request, inside the action that made the call. */
function gatewayProvider() {
  return createOpenAICompatible({
    name: "convexGateway",
    baseURL: GATEWAY_BASE_URL,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${await getServiceToken("ai-gateway")}`);
      return await globalThis.fetch(input, { ...init, headers });
    },
  });
}

type ChatTarget =
  | { kind: "gateway"; url: string; model: string }
  | { kind: "proxy" | "openai"; url: string; model: string; token: string };

export function chatTarget(): ChatTarget | null {
  if (gatewayEnabled()) {
    return {
      kind: "gateway",
      url: `${GATEWAY_BASE_URL}/chat/completions`,
      model: GATEWAY_CHAT_MODEL,
    };
  }
  const proxyUrl = env.AI_PROXY_URL?.trim().replace(/\/$/, "");
  const proxyToken = env.AI_PROXY_TOKEN?.trim();
  if (proxyUrl && proxyToken) {
    return {
      kind: "proxy",
      url: `${proxyUrl}/chat/completions`,
      token: proxyToken,
      model: PROXY_CHAT_MODEL,
    };
  }
  const openai = env.OPENAI_API_KEY?.trim();
  if (openai) {
    return {
      kind: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      token: openai,
      model: OPENAI_CHAT_MODEL,
    };
  }
  return null;
}

/** Same chat backend as completeJson, wrapped as an AI SDK model for the
 * agent component. Never throws at construction — agent.ts builds this at
 * module load, and an unconfigured target fails at call time the same way
 * completeJson already degrades. */
export function languageModel(): LanguageModelV4 {
  const target = chatTarget();
  if (target?.kind === "gateway") return convexGateway(target.model);
  const provider = createOpenAICompatible({
    baseURL: (target?.url ?? "https://api.openai.com/v1/chat/completions").replace(
      /\/chat\/completions$/,
      "",
    ),
    name: target?.kind === "proxy" ? "ourspaces-proxy" : "openai",
    apiKey: target?.token ?? "unconfigured",
  });
  return provider(target?.model ?? OPENAI_CHAT_MODEL);
}

/** rag's and similar's embedding model. The gateway's
 * `openai/text-embedding-3-small` is the same 1536-dim model every vector
 * already in `widgets.by_embedding` and in the rag component was built with —
 * measured cosine 1.0000 against a direct-OpenAI embedding of the same string
 * on 2026-09-17 — so moving to the gateway invalidated nothing. Null only when
 * the gateway is switched off and there is no OPENAI_API_KEY either; callers
 * check before indexing/searching rather than call rag with a broken model. */
export function embeddingModel() {
  if (gatewayEnabled()) {
    return wrapEmbeddingModel({
      model: gatewayProvider().embeddingModel(GATEWAY_EMBEDDING_MODEL),
      middleware: {
        specificationVersion: "v4",
        overrideMaxEmbeddingsPerCall: () => GATEWAY_MAX_EMBEDDINGS_PER_CALL,
      },
    });
  }
  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (!openaiKey) return null;
  return createOpenAI({ apiKey: openaiKey }).embedding(EMBEDDING_MODEL);
}

/**
 * One-shot structured extraction: prompt in, one JSON object out. Not the
 * `agent` component and not `rag` — those own the durable ask-the-space thread
 * and its retrieval; this is the no-history path (mail routing, recap, digest,
 * spark questions). Takes no ctx, so retry/cache/quota can't live here: they
 * sit at the call site — workflow retry in digest.ts, action-cache in
 * questions.ts, workpool + rate-limiter in recap.ts, none on inbound mail.
 * All three targets speak OpenAI's /v1/chat/completions, so the only thing
 * that changes between them is the URL, the model id and how the request is
 * authorized.
 */
export async function completeJson(args: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<Record<string, unknown> | null> {
  const target = chatTarget();
  if (!target) return null;

  const body: Record<string, unknown> = {
    model: target.model,
    temperature: args.temperature ?? 0.7,
    max_tokens: 2048,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  };
  // gpt-oss on the proxy rejects extra guided_json; prompt-only JSON is enough.
  if (target.kind !== "proxy") body.response_format = { type: "json_object" };

  // The gateway's credential is minted here, per call, and never stored.
  const token =
    target.kind === "gateway" ? await getServiceToken("ai-gateway") : target.token;

  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  // null, not throw, for every "no usable JSON" case, so callers can degrade to
  // canned output. Cost: a 503 here reads the same as a model answering prose,
  // and neither is retried. A rejected fetch does throw — that's what lets the
  // digest workflow step retry.
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseJsonObject(payload.choices?.[0]?.message?.content ?? "");
}

/** Salvages the object out of a reply that wrapped its JSON in prose. The shape
 * is checked against nothing — each caller coerces the fields it needs. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
