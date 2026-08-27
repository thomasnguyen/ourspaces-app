import { defineApp } from "convex/server";
import { v } from "convex/values";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";

// Our own HTTP endpoints (convex/http.ts) are served under /api so the
// static site can own the root.
const app = defineApp({
  httpPrefix: "/api",
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(staticHosting, { httpPrefix: "/" });

// AgentMail: every space gets an inbox. Webhook mounted in convex/http.ts.
app.use(agentmail);

// Firecrawl: links become structured cards. Webhook at /api/firecrawl/webhook.
app.use(firecrawl, {
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});

export default app;
