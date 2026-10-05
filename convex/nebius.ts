import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { chatTarget, type AiJob } from "./ai";
import { decideFiling } from "./inboxRouting";

/**
 * Nebius Token Factory: NVIDIA Nemotron behind an OpenAI-compatible API.
 * When NEBIUS_API_KEY is set, convex/ai.ts routes every chat feature here
 * (its NEMOTRON_BY_JOB table picks the model per feature); streamChat below
 * is the streaming client for the voice hot path.
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

/** The Token Factory key, or undefined when this deployment has none (prod). */
export function nebiusKey(): string | undefined {
  return process.env.NEBIUS_API_KEY?.trim() || undefined;
}

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
  /** The whole answer so far, after every piece of it that arrives. */
  onText?: (content: string, ms: number) => void;
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
  const key = nebiusKey();
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
        opts.onText?.(out.content, ms());
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

/** A free request to Token Factory (the model list, no tokens): wakes the
 * action runtime and the connection before a voice ask needs them. */
export async function pingTokenFactory(): Promise<{ status: number; ms: number }> {
  const key = nebiusKey();
  const t0 = Date.now();
  if (!key) return { status: 0, ms: 0 };
  try {
    const res = await fetch(`${NEBIUS_BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` } });
    await res.body?.cancel();
    return { status: res.status, ms: Date.now() - t0 };
  } catch {
    return { status: 0, ms: Date.now() - t0 };
  }
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

const JOBS: AiJob[] = ["recap", "ask", "mail", "questions", "digest"];

/** Where each AI job's chat call goes on this deployment: host, model and
 * thinking, never the key. With NEBIUS_API_KEY set every row should read
 * api.tokenfactory.nebius.com and a Nemotron model. */
export const routes = internalAction({
  args: {},
  returns: v.array(
    v.object({ job: v.string(), kind: v.string(), host: v.string(), model: v.string(), thinking: v.boolean() }),
  ),
  handler: async () =>
    JOBS.map((job) => {
      const target = chatTarget(job);
      return {
        job,
        kind: target?.kind ?? "none",
        host: target ? new URL(target.url).host : "",
        model: target?.model ?? "",
        thinking: target?.kind === "nebius" ? target.thinking : false,
      };
    }),
});

/** Runs the mail brain on a synthetic email against a real space's board and
 * returns its decision and how long the model took. Writes nothing. */
export const fileDryRun = internalAction({
  args: { slug: v.string(), from: v.string(), subject: v.string(), body: v.string() },
  returns: v.object({ ms: v.number(), decision: v.union(v.string(), v.null()) }),
  handler: async (ctx, { slug, from, subject, body }) => {
    const space = await ctx.runQuery(internal.agentmail.getSpaceBySlug, { slug });
    if (!space) throw new Error(`no space ${slug}`);
    const widgets = await ctx.runQuery(api.widgets.listWidgets, { spaceId: space._id });
    const t0 = Date.now();
    const decision = await decideFiling({
      event: { from, subject, body, summary: body.slice(0, 200), attachments: [], createdAt: Date.now() },
      space,
      widgets,
    });
    return { ms: Date.now() - t0, decision: decision ? JSON.stringify(decision) : null };
  },
});

export type LetterResult = {
  status: number;
  /** The most likely valid letter, its probability (summed over token variants), and the runners-up. */
  letter: string | null;
  conf: number | null;
  top: { letter: string; p: number }[];
  usage: ChatUsage | null;
  ms: number;
  error?: string;
};

/** One-token multiple choice with logprobs (the decide pass, nebius/eval/decide).
 * Never throws. Duplicate token strings are counted once (Lightning lists the
 * sampled token twice), and " E" and "E" add up. */
export async function chooseLetter(opts: { model: NemotronModel; messages: ChatMessage[]; letters: string[] }): Promise<LetterResult> {
  const t0 = Date.now();
  const out: LetterResult = { status: 0, letter: null, conf: null, top: [], usage: null, ms: 0 };
  const key = nebiusKey();
  if (!key) return { ...out, error: "NEBIUS_API_KEY is not set" };
  try {
    const res = await fetch(`${NEBIUS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: NEMOTRON[opts.model],
        messages: opts.messages,
        max_tokens: 1,
        temperature: 0,
        logprobs: true,
        top_logprobs: 20,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    out.status = res.status;
    const text = await res.text();
    if (!res.ok) return { ...out, ms: Date.now() - t0, error: text.slice(0, 400) };
    const j = JSON.parse(text) as {
      usage?: ChatUsage;
      choices?: { message?: { content?: string }; logprobs?: { content?: { top_logprobs?: { token: string; logprob: number }[] }[] } }[];
    };
    out.usage = j.usage ?? null;
    const probs = new Map<string, number>();
    const seen = new Set<string>();
    for (const t of j.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? []) {
      if (seen.has(t.token)) continue;
      seen.add(t.token);
      const k = t.token.trim();
      if (opts.letters.includes(k)) probs.set(k, (probs.get(k) ?? 0) + Math.exp(t.logprob));
    }
    out.top = [...probs].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([letter, p]) => ({ letter, p: Math.round(p * 1000) / 1000 }));
    const said = (j.choices?.[0]?.message?.content ?? "").trim().toUpperCase().slice(0, 1);
    out.letter = out.top[0]?.letter ?? (opts.letters.includes(said) ? said : null);
    out.conf = out.top[0]?.p ?? null;
  } catch (e) {
    out.error = String(e).slice(0, 400);
  }
  out.ms = Date.now() - t0;
  return out;
}
