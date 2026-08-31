import { Agent } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { languageModel } from "./ai";

/**
 * agent component: durable thread + message history for "ask the space".
 * One thread per space (spaces.askThreadId), reused across every follow-up
 * question so the agent has real conversational context instead of each
 * ask being a stateless one-shot call — replaces the hand-rolled
 * completeJson call for this path.
 */
export const askAgent = new Agent(components.agent, {
  name: "ask-the-space",
  languageModel: languageModel(),
  instructions:
    "You answer one follow-up about a friend group's shared canvas (widgets, " +
    "chat). Reply in 1-2 sentences, lowercase, casual, specific. Cite at most " +
    "one widgetId or messageId from the board snapshot given in the prompt — " +
    "never invent one. If you can't tell, say so. You are not a general " +
    "chatbot and you never write to the canvas.",
});
