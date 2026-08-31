import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/**
 * rate-limiter component: per-space token-bucket quotas on the paths that
 * cost real money or hit a free-tier cap (LLM calls, AgentMail sends) plus
 * a per-user quota on the highest-frequency write (paint strokes). Keyed by
 * space rather than user — there's no authenticated identity yet (Better
 * Auth lands in a later phase); a space-scoped quota still protects spend
 * and the AgentMail free tier from a runaway loop or a single bad actor.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // "spark" conversation-starter generation (questions.ts) and the recap
  // "catch me up" / "ask" actions (recap.ts) all call the LLM proxy.
  sparkQuestions: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 5 },
  recapAsk: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 5 },
  recapGenerate: { kind: "token bucket", rate: 3, period: MINUTE, capacity: 3 },
  // AgentMail's free tier caps at 3 inboxes total — guard against a loop
  // burning through send quota.
  mailSend: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  // Per-user: a stroke lands once per completed drag, not per point, so this
  // is generous headroom for normal drawing while still bounding abuse.
  paintStroke: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
});
