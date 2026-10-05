import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/**
 * Nebius Token Factory: NVIDIA Nemotron behind an OpenAI-compatible API.
 * This is the client the voice hot path will move onto; convex/ai.ts keeps
 * the existing calls until then.
 *
 * Thinking is on by default for every Nemotron model here, and a capped
 * answer then spends all its tokens reasoning. `chat_template_kwargs:
 * { enable_thinking: false }` turns it off (so does `reasoning_effort:
 * "none"`); a top-level `enable_thinking`, `reasoning: { enabled: false }`
 * and a `/no_think` prefix do nothing (spike, 2026-10-04).
 *
 * The key is NEBIUS_API_KEY. It is set on the dev deployment only, and read
 * from process.env because it isn't declared in convex.config.ts yet.
 */

// convex/tsconfig.json has no node types (same as auth.config.ts).
declare const process: { env: Record<string, string | undefined> };

export const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1";

export const NEMOTRON = {
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  lightning: "nvidia/Nemotron-3_5-Lightning",
  super: "nvidia/nemotron-3-super-120b-a12b",
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
} as const;
export type NemotronModel = keyof typeof NEMOTRON;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
  prompt_cache_hit_tokens?: number;
};

export type StreamResult = {
  status: number;
  content: string;
  usage: ChatUsage | null;
  finish: string | null;
  /** ms from request start; null when it never happened. */
  firstTokenMs: number | null;
  firstLineMs: number | null;
  totalMs: number;
  error?: string;
};

/** Streams one chat completion. `onLine` fires for each complete line of
 * content as it arrives, so a one-card-per-line answer can commit its first
 * card before the rest is written. Never throws: failures come back as a
 * status and an error string. */
export async function streamChat(opts: {
  model: NemotronModel;
  messages: ChatMessage[];
  maxTokens?: number;
  thinking?: boolean;
  onLine?: (line: string, ms: number) => void;
}): Promise<StreamResult> {
  const t0 = Date.now();
  const ms = () => Date.now() - t0;
  const out: StreamResult = {
    status: 0,
    content: "",
    usage: null,
    finish: null,
    firstTokenMs: null,
    firstLineMs: null,
    totalMs: 0,
  };
  const key = process.env.NEBIUS_API_KEY?.trim();
  if (!key) {
    out.error = "NEBIUS_API_KEY is not set";
    return out;
  }
  let pending = "";
  const emit = (line: string) => {
    if (!line.trim()) return;
    if (out.firstLineMs === null) out.firstLineMs = ms();
    opts.onLine?.(line, ms());
  };
  try {
    const res = await fetch(`${NEBIUS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: NEMOTRON[opts.model],
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 300,
        temperature: 0,
        stream: true,
        stream_options: { include_usage: true },
        ...(opts.thinking ? {} : { chat_template_kwargs: { enable_thinking: false } }),
      }),
    });
    out.status = res.status;
    if (!res.ok || !res.body) {
      out.error = (await res.text()).slice(0, 400);
      return out;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const event = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!event.startsWith("data:")) continue;
        const data = event.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: {
          usage?: ChatUsage;
          choices?: { finish_reason?: string | null; delta?: { content?: string | null; reasoning_content?: string | null } }[];
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.usage) out.usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) out.finish = choice.finish_reason;
        const text = choice.delta?.content ?? "";
        if ((text || choice.delta?.reasoning_content) && out.firstTokenMs === null) {
          out.firstTokenMs = ms();
        }
        if (!text) continue;
        out.content += text;
        pending += text;
        let cut;
        while ((cut = pending.indexOf("\n")) >= 0) {
          emit(pending.slice(0, cut));
          pending = pending.slice(cut + 1);
        }
      }
    }
    emit(pending);
  } catch (e) {
    out.error = String(e).slice(0, 400);
  }
  out.totalMs = ms();
  return out;
}

/** Times one request from inside a Convex action: the real path the app
 * will take. Used by the latency spike; returns the timings and the raw
 * answer, never the key. */
export const timeChat = internalAction({
  args: {
    model: v.union(v.literal("nano"), v.literal("lightning"), v.literal("super"), v.literal("ultra")),
    system: v.string(),
    user: v.string(),
    maxTokens: v.optional(v.number()),
    thinking: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const result = await streamChat({
      model: args.model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      maxTokens: args.maxTokens,
      thinking: args.thinking,
    });
    return { ...result, usage: result.usage ? JSON.stringify(result.usage) : null };
  },
});
