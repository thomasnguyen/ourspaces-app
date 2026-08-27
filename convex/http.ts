import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { agentmail } from "./agentmail";

const http = httpRouter();

// Register with AgentMail as https://<deployment>.convex.site/api/agentmail/webhook
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => agentmail.handleWebhook(ctx as any, req)),
});

export default http;
