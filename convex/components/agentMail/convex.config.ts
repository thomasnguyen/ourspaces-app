import { defineComponent } from "convex/server";

// First-party AgentMail component: owns the inbound-mail store + dedup and wraps
// the AgentMail REST API (create inbox, send, reply, label). Deliberately has NO
// nested workpool — that was the resolve bug in the abandoned @agentmail/convex
// 0.1.0 (see docs/firecrawl-agentmail-setup.md). The app passes the API key /
// webhook secret in as args (components can't read process.env).
export default defineComponent("agentMail");
