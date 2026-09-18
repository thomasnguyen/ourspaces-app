import { v } from "convex/values";
import { embed } from "ai";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { embeddingModel } from "./ai";
import { summarizeWidget } from "./recap";
import type { Id } from "./_generated/dataModel";

/**
 * "Already on the board" — the space's own vector index.
 *
 * Distinct from `convex/rag.ts`, which retrieves *context to answer a
 * question*. This answers a different one, asked at arrival time: has this
 * room already got this? Two people mailing the same Airbnb link a day apart
 * used to produce two identical cards and no hint that they were the same
 * thing. Now the second arrival says so in the live strip instead.
 *
 * It is a first-party `widgets.by_embedding` vector index rather than a second
 * rag namespace because the query is over one table's live rows, filtered to
 * one space, and wants the widget id back — not a text blob to paste into a
 * prompt.
 *
 * Degrades quietly: with no embedding model reachable there is no embedding,
 * so nothing is written and every echo check returns null. Arrival is
 * unaffected.
 */

/** Cosine floor for "this is the same thing" rather than merely "related".
 *  Measured against the seeded crew board with text-embedding-3-small: the
 *  same thing restated scores 0.62-0.79 (cake poll 0.674, dinner potluck
 *  0.618, birthday countdown 0.788), a related-but-different plan 0.354, and
 *  unrelated mail 0.30-0.31. 0.55 sits in the gap with ~0.06 of margin below
 *  the weakest true match and ~0.20 above the strongest false one. */
const ECHO_THRESHOLD = 0.55;
const ECHO_CANDIDATES = 4;
const EMBED_CHARS = 2_000;

/** An echo: a widget already on this board that means the same thing. The
 *  explicit type is load-bearing — `echoCheck` is an action that calls a query
 *  in this same file, so without it TypeScript cannot break the cycle. */
export type Echo = {
  widgetId: Id<"widgets">;
  type: string;
  summary: string;
  score: number;
  createdAt: number;
};

export const echoValidator = v.object({
  widgetId: v.id("widgets"),
  type: v.string(),
  summary: v.string(),
  score: v.number(),
  createdAt: v.number(),
});

async function embedText(text: string): Promise<number[] | null> {
  const model = embeddingModel();
  const trimmed = text.trim().slice(0, EMBED_CHARS);
  if (!model || !trimmed) return null;
  try {
    const { embedding } = await embed({ model, value: trimmed });
    return embedding;
  } catch {
    // Same contract as the rest of the AI layer: an unreachable model degrades
    // the feature, it never fails the arrival that triggered it.
    return null;
  }
}

/** What a widget is *about*, in one line — the same summariser the recap uses,
 *  so a widget reads the same way to the digest and to the vector index. */
export const widgetText = internalQuery({
  args: { widgetId: v.id("widgets") },
  returns: v.union(
    v.object({ spaceId: v.id("spaces"), type: v.string(), text: v.string() }),
    v.null(),
  ),
  handler: async (ctx, { widgetId }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget) return null;
    const summary = summarizeWidget(widget.type, widget.data as Record<string, unknown>);
    if (!summary) return null;
    return { spaceId: widget.spaceId, type: widget.type, text: `${widget.type}: ${summary}` };
  },
});

export const storeEmbedding = internalMutation({
  args: {
    widgetId: v.id("widgets"),
    embedding: v.array(v.float64()),
    embeddedText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { widgetId, embedding, embeddedText }) => {
    // The widget may have been deleted while the embedding was in flight.
    if (!(await ctx.db.get(widgetId))) return null;
    await ctx.db.patch(widgetId, { embedding, embeddedText });
    return null;
  },
});

/** Embed one widget and store the vector. Scheduled after a widget lands, so
 *  the next arrival can be compared against it. */
export const embedWidget = internalAction({
  args: { widgetId: v.id("widgets") },
  returns: v.boolean(),
  handler: async (ctx, { widgetId }) => {
    const target = await ctx.runQuery(internal.similar.widgetText, { widgetId });
    if (!target) return false;
    const embedding = await embedText(target.text);
    if (!embedding) return false;
    await ctx.runMutation(internal.similar.storeEmbedding, {
      widgetId,
      embedding,
      embeddedText: target.text,
    });
    return true;
  },
});

/** Resolve vector hits back to rows. `ctx.vectorSearch` hands back ids and
 *  scores only, so the documents are fetched in a query the way Convex's
 *  vector-search docs prescribe. */
export const hydrateEchoes = internalQuery({
  args: {
    ids: v.array(v.id("widgets")),
    scores: v.array(v.number()),
    excludeWidgetId: v.optional(v.id("widgets")),
  },
  returns: v.array(echoValidator),
  handler: async (ctx, { ids, scores, excludeWidgetId }): Promise<Echo[]> => {
    const out: Echo[] = [];
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === excludeWidgetId) continue;
      const widget = await ctx.db.get(ids[i]);
      if (!widget) continue;
      const summary = summarizeWidget(widget.type, widget.data as Record<string, unknown>);
      if (!summary) continue;
      out.push({
        widgetId: widget._id,
        type: widget.type,
        summary,
        score: scores[i],
        createdAt: widget.createdAt,
      });
    }
    return out;
  },
});

/**
 * The arrival-time question: is this already on the board? Returns the single
 * closest widget above ECHO_THRESHOLD, or null. Actions only — `vectorSearch`
 * is not available to queries or mutations.
 */
export const echoCheck = internalAction({
  args: {
    spaceId: v.id("spaces"),
    text: v.string(),
    excludeWidgetId: v.optional(v.id("widgets")),
    /** Override the cosine floor. Exists so the threshold can be re-measured
     *  against a real board instead of guessed. */
    threshold: v.optional(v.number()),
  },
  returns: v.union(echoValidator, v.null()),
  handler: async (ctx, { spaceId, text, excludeWidgetId, threshold }): Promise<Echo | null> => {
    const vector = await embedText(text);
    if (!vector) return null;
    const hits = await ctx.vectorSearch("widgets", "by_embedding", {
      vector,
      limit: ECHO_CANDIDATES,
      filter: (q) => q.eq("spaceId", spaceId),
    });
    const floor = threshold ?? ECHO_THRESHOLD;
    const above = hits.filter((hit) => hit._score >= floor);
    if (above.length === 0) return null;
    const echoes: Echo[] = await ctx.runQuery(internal.similar.hydrateEchoes, {
      ids: above.map((hit) => hit._id),
      scores: above.map((hit) => hit._score),
      excludeWidgetId,
    });
    return echoes[0] ?? null;
  },
});

/** Widgets in a space that have never been embedded. */
export const unembedded = internalQuery({
  args: { spaceId: v.id("spaces"), limit: v.number() },
  returns: v.array(v.id("widgets")),
  handler: async (ctx, { spaceId, limit }) => {
    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return widgets.filter((widget) => !widget.embedding).slice(0, limit).map((w) => w._id);
  },
});

/** Backfill a space so the first arrival has something to compare against.
 *  Demo-scale (tens of widgets per room), so a bounded sweep is enough. */
export const backfillSpace = internalAction({
  args: { spaceId: v.id("spaces"), limit: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, { spaceId, limit }) => {
    if (!embeddingModel()) return 0;
    const ids = await ctx.runQuery(internal.similar.unembedded, {
      spaceId,
      limit: limit ?? 40,
    });
    let embedded = 0;
    for (const widgetId of ids) {
      if (await ctx.runAction(internal.similar.embedWidget, { widgetId })) embedded += 1;
    }
    return embedded;
  },
});
