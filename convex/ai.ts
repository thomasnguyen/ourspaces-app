import { env } from "./_generated/server";
import { getServiceToken } from "convex/server";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { wrapEmbeddingModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { NEBIUS_BASE_URL, NEMOTRON, nebiusKey, type NemotronModel } from "./nebius";

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
 *
 * NVIDIA Nemotron on Nebius Token Factory sits in front of all of that: when
 * NEBIUS_API_KEY is set, every chat call (completeJson and the agent's
 * languageModel) goes to api.tokenfactory.nebius.com with the Nemotron model
 * its job calls for, below. Without the key (prod today) the order above is
 * untouched. Embeddings never go to Nebius: Token Factory's only embedding
 * model is Qwen3-Embedding-8B, not 1536-dim text-embedding-3-small, and every
 * stored vector (rag, widgets.by_embedding) is the latter.
 */

/** Which feature is calling. The model follows from the job. */
export type AiJob = "recap" | "ask" | "mail" | "questions" | "digest";

/**
 * Nemotron by job. Numbers are from the 2026-10-04 latency spike, measured
 * inside a Convex action with thinking off unless the row says on.
 *
 * | job       | feature (caller)                          | model     | thinking | why |
 * |-----------|-------------------------------------------|-----------|----------|-----|
 * | recap     | "catch me up" (recap.ts buildRecap)       | ultra     | off      | someone is waiting on 2-4 lines that must cite real widget/message ids; Ultra was the only model at 100% valid JSON and right on every multi-step pick, ~730 ms |
 * | ask       | ask the space (agent.ts → recap.ask, streaming.ts) | ultra | off  | same job, one cited answer while the asker watches |
 * | mail      | mail filing (inboxRouting.ts decideFiling) | ultra    | off      | a multi-rule pick of action + widget id, which is where Lightning slipped; the arrival is watched on the canvas, so no thinking delay |
 * | questions | link-card conversation starters (questions.ts) | lightning | off  | two short lowercase lines, no ids to get right; fastest and cheapest, and action-cached per link |
 * | digest    | the weekly email (digest.ts)              | super     | on       | a cron with nobody waiting and a 2048-token budget, so it can afford to reason before writing 3-6 lines that must not invent events |
 */
const NEMOTRON_BY_JOB: Record<AiJob, { model: NemotronModel; thinking: boolean }> = {
  recap: { model: "ultra", thinking: false },
  ask: { model: "ultra", thinking: false },
  mail: { model: "ultra", thinking: false },
  questions: { model: "lightning", thinking: false },
  digest: { model: "super", thinking: true },
};

/** Thinking is on by default on every Nemotron model; this is the switch
 * that turns it off (see convex/nebius.ts). */
const THINKING_OFF = { chat_template_kwargs: { enable_thinking: false } };

const GATEWAY_BASE_URL = "https://ai-gateway.convex.dev/v1";
/** Gateway model ids are `provider/model`; chat ids are inlined at the
 * call sites in chatTarget() below. */
const GATEWAY_EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** The gateway rejects an embeddings batch larger than this. */
const GATEWAY_MAX_EMBEDDINGS_PER_CALL = 512;
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
  | { kind: "proxy" | "openai"; url: string; model: string; token: string }
  | { kind: "nebius"; url: string; model: string; token: string; thinking: boolean };

export function chatTarget(job: AiJob): ChatTarget | null {
  const nebius = nebiusKey();
  if (nebius) {
    const pick = NEMOTRON_BY_JOB[job];
    return {
      kind: "nebius",
      url: `${NEBIUS_BASE_URL}/chat/completions`,
      token: nebius,
      model: NEMOTRON[pick.model],
      thinking: pick.thinking,
    };
  }
  if (gatewayEnabled()) {
    return {
      kind: "gateway",
      url: `${GATEWAY_BASE_URL}/chat/completions`,
      model: "openai/gpt-4o-mini",
    };
  }
  const proxyUrl = env.AI_PROXY_URL?.trim().replace(/\/$/, "");
  const proxyToken = env.AI_PROXY_TOKEN?.trim();
  if (proxyUrl && proxyToken) {
    return {
      kind: "proxy",
      url: `${proxyUrl}/chat/completions`,
      token: proxyToken,
      model: "@cf/openai/gpt-oss-120b",
    };
  }
  const openai = env.OPENAI_API_KEY?.trim();
  if (openai) {
    return {
      kind: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      token: openai,
      model: "gpt-4o-mini",
    };
  }
  return null;
}

/** Same chat backend as completeJson, wrapped as an AI SDK model for the
 * agent component. Never throws at construction — agent.ts builds this at
 * module load, and an unconfigured target fails at call time the same way
 * completeJson already degrades.
 *
 * One sharp edge on the gateway path: `convexGateway()` builds its provider
 * without `supportsStructuredOutputs`, so an AI SDK `generateObject` cannot
 * send `response_format: json_schema` — it silently downgrades to
 * `json_object` (it logs an AI SDK warning) and OpenAI answers 400 to a
 * json_object request whose messages never contain the word "json". So every
 * generateObject through this model must name JSON in its prompt; recap.ts's
 * `ask` does. streamText is unaffected — it sends no response_format.
 *
 * On Nemotron the provider does declare structured outputs, so generateObject
 * sends a real json_schema (Token Factory accepts it), and thinking is
 * switched off in the request body unless the job's row turns it on. */
export function languageModel(job: AiJob = "ask"): LanguageModelV4 {
  const target = chatTarget(job);
  if (target?.kind === "gateway") return convexGateway(target.model);
  if (target?.kind === "nebius") {
    const thinking = target.thinking;
    return createOpenAICompatible({
      baseURL: NEBIUS_BASE_URL,
      name: "nebius",
      apiKey: target.token,
      supportsStructuredOutputs: true,
      transformRequestBody: (body) => (thinking ? body : { ...body, ...THINKING_OFF }),
    })(target.model);
  }
  const provider = createOpenAICompatible({
    baseURL: (target?.url ?? "https://api.openai.com/v1/chat/completions").replace(
      /\/chat\/completions$/,
      "",
    ),
    name: target?.kind === "proxy" ? "ourspaces-proxy" : "openai",
    apiKey: target?.token ?? "unconfigured",
  });
  return provider(target?.model ?? "gpt-4o-mini");
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
 * All four targets speak OpenAI's /v1/chat/completions, so the only thing
 * that changes between them is the URL, the model id and how the request is
 * authorized (plus Nemotron's thinking switch).
 */
export async function completeJson(args: {
  job: AiJob;
  system: string;
  user: string;
  temperature?: number;
}): Promise<Record<string, unknown> | null> {
  const target = chatTarget(args.job);
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
  if (target.kind === "nebius" && !target.thinking) Object.assign(body, THINKING_OFF);

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
