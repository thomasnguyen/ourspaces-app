import { RateLimiter, MINUTE, HOUR, DAY } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/**
 * rate-limiter component: per-space token-bucket quotas on the paths that
 * cost real money or hit a free-tier cap (LLM calls, AgentMail sends) plus
 * a per-user quota on the highest-frequency write (paint strokes). Mostly keyed
 * by space rather than user, because a client-supplied userId is not a
 * trustworthy key (§1) — a space-scoped quota still protects spend and the
 * AgentMail free tier from a runaway loop or a single bad actor. The one
 * exception is otpSend, keyed on the destination email address.
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
  // Sign-in codes (convex/otp.ts). Keyed on the DESTINATION address, not the
  // caller: anonymous sign-in is free and unlimited so an attacker controls
  // their own userId, but the victim's inbox is the resource being protected.
  // Three in a burst so a typo'd address isn't a 20-minute lockout on stage,
  // refilling slowly enough that mailbombing a stranger stays pointless.
  otpSend: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 },
  // Per-user: a stroke lands once per completed drag, not per point, so this
  // is generous headroom for normal drawing while still bounding abuse.
  paintStroke: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  /* Token Factory, the voice orb (convex/guard.ts; nebius/eval/s3-audit.md).
     Keyed by the caller's seat, which the session proves, so these can be per
     person. One ask is about a dozen calls (≤6 speculative fills, the final
     fill, 3–4 decides): the burst covers five asks back to back, the refill
     an ask every ~15s all day. */
  voicePerson: { kind: "token bucket", rate: 50, period: MINUTE, capacity: 60 },
  /* Per room per day: 300 calls ≈ 30–60 asks ≈ $0.08–0.27 (b2-wired §e: a
     fast ask ≈ $0.0021 over ~8 calls, a brain ask ≈ $0.0045 over ~5). */
  // sharded: everyone asking in one room shares this row, and a busy minute shouldn't queue on one document
  voiceRoomDay: { kind: "fixed window", rate: 300, period: DAY, shards: 5 },
  // Firecrawl credit (convex/firecrawl.ts), per person: a link dropped on the
  // board, a topic searched, a site crawled (up to 50 pages each, so rare).
  firecrawlScrape: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 10 },
  firecrawlSearch: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },
  firecrawlCrawl: { kind: "token bucket", rate: 3, period: HOUR, capacity: 2 },
  // Tavily, the lookup (convex/tavily.ts): a search credit or two per ask, per room per day.
  tavilyRoomDay: { kind: "fixed window", rate: 40, period: DAY },
  // The orb's wake-up ping costs nothing, but it is not an open relay.
  voiceWarm: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 6 },
});

/**
 * The deployment's daily Token Factory ceiling (convex/guard.ts): estimated
 * dollars (tokens × list price) across every room, per UTC day. Past it the
 * voice orb stops calling the model and says so; what code answers alone
 * (edits, answers from the room's facts, cards filled from answers) still
 * works. Thomas's account holds a few dollars with no cap on Nebius's side.
 */
export const SPEND_CEILING_USD = 0.5;

/** List price, USD per million tokens (Token Factory /v1/models, Oct 2026). */
export const PRICE_PER_M = {
  nano: { prompt: 0.06, completion: 0.24 },
  lightning: { prompt: 0.06, completion: 0.24 },
  super: { prompt: 0.3, completion: 0.9 },
  ultra: { prompt: 1, completion: 3 },
} as const;
