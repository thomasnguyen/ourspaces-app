import { env } from "./_generated/server";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";

/** RoomDone's shared Cloudflare Worker — OpenAI-shaped /v1 in front of Workers AI. */
const PROXY_CHAT_MODEL = "@cf/openai/gpt-oss-120b";
const OPENAI_CHAT_MODEL = "gpt-4o-mini";

type ChatTarget = {
  url: string;
  token: string;
  model: string;
  viaProxy: boolean;
};

export function chatTarget(): ChatTarget | null {
  const proxyUrl = env.AI_PROXY_URL?.trim().replace(/\/$/, "");
  const proxyToken = env.AI_PROXY_TOKEN?.trim();
  if (proxyUrl && proxyToken) {
    return {
      url: `${proxyUrl}/chat/completions`,
      token: proxyToken,
      model: PROXY_CHAT_MODEL,
      viaProxy: true,
    };
  }
  const openai = env.OPENAI_API_KEY?.trim();
  if (openai) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      token: openai,
      model: OPENAI_CHAT_MODEL,
      viaProxy: false,
    };
  }
  return null;
}

/** Same chat backend as completeJson, wrapped as an AI SDK model for the
 * agent component. Never throws at construction — an unconfigured target
 * fails at call time the same way completeJson already degrades. */
export function languageModel(): LanguageModelV4 {
  const target = chatTarget();
  const provider = createOpenAICompatible({
    baseURL: (target?.url ?? "https://api.openai.com/v1/chat/completions").replace(
      /\/chat\/completions$/,
      "",
    ),
    name: target?.viaProxy ? "ourspaces-proxy" : "openai",
    apiKey: target?.token ?? "unconfigured",
  });
  return provider(target?.model ?? OPENAI_CHAT_MODEL);
}

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
  if (!target.viaProxy) body.response_format = { type: "json_object" };

  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseJsonObject(payload.choices?.[0]?.message?.content ?? "");
}

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
