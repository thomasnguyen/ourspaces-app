import type { Widget } from "../data/types";

/** AI conversation starters attached to a web post (max 2, PRD: links become
 * something to talk about). Each one is its own thread in the reading circle. */
export type LinkQuestion = { id: string; text: string };

export function linkCardQuestions(widget: Widget): LinkQuestion[] {
  if (widget.type !== "linkCard") return [];
  const raw = Array.isArray(widget.data.questions) ? widget.data.questions : [];
  return raw
    .filter(
      (entry): entry is LinkQuestion =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as LinkQuestion).id === "string" &&
        typeof (entry as LinkQuestion).text === "string" &&
        (entry as LinkQuestion).text.trim().length > 0,
    )
    .slice(0, 2);
}

/** Question threads ride the existing message pipes under a namespaced id. */
export function questionThreadId(widgetId: string, questionId: string) {
  return `${widgetId}::q:${questionId}`;
}

const CANNED_PAIRS: [string, string][] = [
  [
    "what's the one idea here you'd actually steal?",
    "hot take — overhyped or underrated?",
  ],
  [
    "did anything in this surprise you?",
    "would you use this for our own stuff?",
  ],
  [
    "what's the takeaway in one sentence?",
    "who in this group needs to read this most?",
  ],
  [
    "real talk: did anyone read past the intro?",
    "what would you ask the author?",
  ],
];

/** Offline/mock stand-in for the OpenAI starters — deterministic per title. */
export function cannedLinkQuestions(seed: string): LinkQuestion[] {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const pair = CANNED_PAIRS[hash % CANNED_PAIRS.length];
  return [
    { id: "q1", text: pair[0] },
    { id: "q2", text: pair[1] },
  ];
}
