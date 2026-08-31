import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { completeJson } from "./ai";
import { rateLimiter } from "./rateLimits";

/** OpenAI as a structured decider (never a chatbot UI): an article becomes
 * two short conversation starters the group answers as threads. */

const questionsValidator = v.array(v.object({ id: v.string(), text: v.string() }));

const CANNED_PAIRS: [string, string][] = [
  ["what's the one idea here you'd actually steal?", "hot take — overhyped or underrated?"],
  ["did anything in this surprise you?", "would you use this for our own stuff?"],
  ["what's the takeaway in one sentence?", "who in this group needs to read this most?"],
  ["real talk: did anyone read past the intro?", "what would you ask the author?"],
];

function canned(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const pair = CANNED_PAIRS[hash % CANNED_PAIRS.length];
  return [
    { id: "q1", text: pair[0] },
    { id: "q2", text: pair[1] },
  ];
}

async function askOpenAi(title: string, description: string) {
  const parsed = await completeJson({
    temperature: 0.9,
    system:
      "You write conversation starters for a friend group's shared board. " +
      'Return JSON {"questions": ["...", "..."]} with exactly 2 questions. ' +
      "Each is under 12 words, lowercase, casual and direct, no emoji, and " +
      "answerable even by friends who only skimmed the article.",
    user: `Article: ${title}\n\n${description}`.slice(0, 1200),
  }).catch(() => null);
  if (!parsed) return null;
  try {
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
          .slice(0, 2)
      : [];
    if (questions.length < 2) return null;
    return questions.map((text, index) => ({ id: `q${index + 1}`, text: text.trim() }));
  } catch {
    return null;
  }
}

export const setQuestions = internalMutation({
  args: { widgetId: v.id("widgets"), questions: questionsValidator },
  returns: v.null(),
  handler: async (ctx, { widgetId, questions }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget) return null;
    await ctx.db.patch(widget._id, { data: { ...widget.data, questions } });
    return null;
  },
});

export const sparkQuestions = action({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    title: v.string(),
    description: v.string(),
  },
  returns: questionsValidator,
  handler: async (ctx, args) => {
    // rate-limiter: guard the LLM proxy from a runaway loop of link saves.
    await rateLimiter.limit(ctx, "sparkQuestions", { key: args.spaceId, throws: true });
    const questions =
      (await askOpenAi(args.title, args.description).catch(() => null)) ??
      canned(args.title);
    await ctx.runMutation(internal.questions.setQuestions, {
      widgetId: args.widgetId,
      questions,
    });
    return questions;
  },
});
