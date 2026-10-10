import type { LanguageModelV4 } from "@ai-sdk/provider";
import { NEBIUS_BASE_URL, NEMOTRON, nebiusKey, nemotronLanguageModel, type NemotronModel } from "./nebius";

/**
 * Model routing for the whole app: every chat call is NVIDIA Nemotron on
 * Nebius Token Factory (api.tokenfactory.nebius.com). The job names the feature, NEMOTRON_BY_JOB below
 * picks the model and whether it thinks, and convex/nebius.ts owns the
 * endpoint, the key (NEBIUS_API_KEY) and the streaming client the voice hot
 * path uses. Without the key there is no chat target: completeJson returns
 * null and every caller degrades to its canned output, the same as a model
 * that answered prose.
 *
 * Embeddings are the one exception and live in convex/rag.ts (Token Factory
 * has no embedding model matching the stored 1536-dim vectors).
 */

/** Width of every stored vector (rag, widgets.by_embedding). */
export const EMBEDDING_DIMENSIONS = 1536;

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

type ChatTarget = { kind: "nebius"; url: string; model: string; token: string; thinking: boolean };

export function chatTarget(job: AiJob): ChatTarget | null {
  const token = nebiusKey();
  if (!token) return null;
  const pick = NEMOTRON_BY_JOB[job];
  return {
    kind: "nebius",
    url: `${NEBIUS_BASE_URL}/chat/completions`,
    token,
    model: NEMOTRON[pick.model],
    thinking: pick.thinking,
  };
}

/** Same chat backend as completeJson, wrapped as an AI SDK model for the
 * agent component. Never throws at construction — agent.ts builds this at
 * module load, and a deployment with no key fails at call time the same way
 * completeJson already degrades. The provider declares structured outputs,
 * so generateObject sends a real json_schema (Token Factory accepts it), and
 * thinking is switched off in the request body unless the job turns it on. */
export function languageModel(job: AiJob = "ask"): LanguageModelV4 {
  const pick = NEMOTRON_BY_JOB[job];
  return nemotronLanguageModel(NEMOTRON[pick.model], nebiusKey() ?? "unconfigured", pick.thinking);
}

/**
 * One-shot structured extraction: prompt in, one JSON object out. Not the
 * `agent` component and not `rag` — those own the durable ask-the-space thread
 * and its retrieval; this is the no-history path (mail routing, recap, digest,
 * spark questions). Takes no ctx, so retry/cache/quota can't live here: they
 * sit at the call site — workflow retry in digest.ts, action-cache in
 * questions.ts, workpool + rate-limiter in recap.ts, none on inbound mail.
 * Token Factory speaks the standard /v1/chat/completions shape; the job
 * picks the Nemotron model and whether it thinks first.
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
  body.response_format = { type: "json_object" };
  if (!target.thinking) Object.assign(body, THINKING_OFF);

  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.token}`,
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
