import { v } from "convex/values";
import { RAG } from "@convex-dev/rag";
import { createOpenAI } from "@ai-sdk/openai";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { embeddingModel, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./ai";

const REINDEX_STALE_MS = 5 * 60 * 1000;

/**
 * rag component: semantic search over a space's widgets + recent chat,
 * grounding recap.ask with retrieved context instead of a raw snapshot
 * dump. Real OpenAI embeddings only (see ai.ts) — never crashes at
 * module load when unconfigured, matching the languageModel() fallback
 * pattern; callers check embeddingModel() before indexing/searching.
 */
export const rag = new RAG(components.rag, {
  textEmbeddingModel:
    embeddingModel() ?? createOpenAI({ apiKey: "unconfigured" }).embedding(EMBEDDING_MODEL),
  embeddingDimension: EMBEDDING_DIMENSIONS,
});

export const getIndexedAt = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { spaceId }) => (await ctx.db.get(spaceId))?.ragIndexedAt ?? null,
});

export const setIndexedAt = internalMutation({
  args: { spaceId: v.id("spaces"), indexedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { spaceId, indexedAt }) => {
    await ctx.db.patch(spaceId, { ragIndexedAt: indexedAt });
    return null;
  },
});

/** Re-index a space's widgets + global chat. Demo-scale content (tens of
 * widgets/messages), so a full sweep is cheap — reuses `key` per widget/
 * message so re-adding replaces the prior entry instead of duplicating. */
export const indexSpace = internalAction({
  args: { spaceId: v.id("spaces") },
  returns: v.number(),
  handler: async (ctx, { spaceId }) => {
    if (!embeddingModel()) return 0;
    const snap = await ctx.runQuery(internal.recap.snapshot, { spaceId });
    let indexed = 0;
    for (const widget of snap.widgets) {
      await rag.add(ctx, { namespace: spaceId, key: `widget:${widget.id}`, text: widget.summary });
      indexed += 1;
    }
    for (const message of snap.chat) {
      await rag.add(ctx, {
        namespace: spaceId,
        key: `message:${message.id}`,
        text: `${message.from}: ${message.text}`,
      });
      indexed += 1;
    }
    await ctx.runMutation(internal.rag.setIndexedAt, { spaceId, indexedAt: Date.now() });
    return indexed;
  },
});

/** Ensure a space's index is fresh (within REINDEX_STALE_MS), then return
 * the top matches for the question as ready-to-prompt text. Empty string
 * when rag is unconfigured or nothing scores above threshold. */
export const groundQuestion = internalAction({
  args: { spaceId: v.id("spaces"), question: v.string() },
  returns: v.string(),
  handler: async (ctx, { spaceId, question }) => {
    if (!embeddingModel()) return "";
    const indexedAt = await ctx.runQuery(internal.rag.getIndexedAt, { spaceId });
    if (!indexedAt || Date.now() - indexedAt > REINDEX_STALE_MS) {
      await ctx.runAction(internal.rag.indexSpace, { spaceId });
    }
    const { text } = await rag.search(ctx, {
      namespace: spaceId,
      query: question,
      limit: 6,
      vectorScoreThreshold: 0.4,
    });
    return text;
  },
});
