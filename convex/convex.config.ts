import { defineApp } from "convex/server";
import { v } from "convex/values";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import actionCache from "@convex-dev/action-cache/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import batchWorker from "@convex-dev/batch-worker/convex.config";
import agent from "@convex-dev/agent/convex.config";
import rag from "@convex-dev/rag/convex.config";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config";
import presence from "@convex-dev/presence/convex.config";
import prosemirrorSync from "@convex-dev/prosemirror-sync/convex.config";
import betterAuth from "@convex-dev/better-auth/convex.config";
import agentMail from "./components/agentMail/convex.config";

// Our own HTTP endpoints (convex/http.ts) are served under /api so the
// static site can own the root.
const app = defineApp({
  httpPrefix: "/api",
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    AI_PROXY_URL: v.optional(v.string()),
    AI_PROXY_TOKEN: v.optional(v.string()),
    AGENTMAIL_API_KEY: v.string(),
    AGENTMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(staticHosting, { httpPrefix: "/" });

// AgentMail: the space's inbox. Our own first-party component (the published
// @agentmail/convex 0.1.0 hangs on nested workpools — see
// docs/firecrawl-agentmail-setup.md). Owns inbound store + dedup and wraps the
// REST API; the app passes the key in and mounts the webhook (convex/http.ts).
app.use(agentMail);

// Firecrawl: links become structured cards. Webhook at /api/firecrawl/webhook.
app.use(firecrawl, {
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});

// Data/infra: backfills, tallies, live counters, quotas, resilient externals.
app.use(migrations);
// Two named instances: poll vote tallies (namespaced by widget) and
// per-space member counts — separate data structures, same component.
app.use(aggregate, { name: "pollTallies" });
app.use(aggregate, { name: "memberCounts" });
app.use(shardedCounter);
app.use(rateLimiter);
app.use(actionRetrier);
app.use(actionCache);

// Orchestration: bounded fan-out, durable multi-step flows, batch jobs.
app.use(workpool);
app.use(workflow);
app.use(batchWorker);

// AI: agent threads, retrieval, token streaming.
app.use(agent);
app.use(rag);
app.use(persistentTextStreaming);

// Realtime + collaboration.
app.use(presence);
app.use(prosemirrorSync);

// Auth.
app.use(betterAuth);

export default app;
