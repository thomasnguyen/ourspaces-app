import { v } from "convex/values";
import { defineBatchWorkerValidators, ping } from "@convex-dev/batch-worker";
import { api, components, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { LinkCardData } from "./widgetData";

/**
 * batch-worker: refresh stale linkCard scrapes a few at a time instead of
 * hammering Firecrawl for every stale link the moment it goes stale. The
 * cron below enqueues work; the component drains it in bounded batches,
 * resuming from a commit-order cursor if a run is interrupted.
 */
const BATCH_SIZE = 5;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const { vQueryArgs, vQueryReturns, vMutationArgs } = defineBatchWorkerValidators({
  batch: {
    items: v.array(v.object({ id: v.id("linkRefreshQueue"), widgetId: v.id("widgets") })),
  },
});

export const getBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { cursor }) => {
    const rows = await ctx.db
      .query("linkRefreshQueue")
      .withIndex("queuedAt", (q) => (cursor ? q.gte("queuedAt", cursor) : q))
      .take(BATCH_SIZE);
    if (rows.length === 0) return { kind: "idle" as const };
    return {
      kind: "work" as const,
      batch: { items: rows.map((row) => ({ id: row._id, widgetId: row.widgetId })) },
      cursor: rows.at(-1)!.queuedAt,
    };
  },
});

// The worker owns cleanup: dequeue immediately, then hand the actual
// network-bound scrape off to an action (mutations can't call fetch).
export const processBatch = internalMutation({
  args: vMutationArgs,
  returns: v.null(),
  handler: async (ctx, { items }) => {
    for (const { id, widgetId } of items) {
      await ctx.db.delete(id);
      await ctx.scheduler.runAfter(0, internal.batch.refreshOne, { widgetId });
    }
    return null;
  },
});

export const getWidgetUrl = internalQuery({
  args: { widgetId: v.id("widgets") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { widgetId }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget || widget.type !== "linkCard") return null;
    return (widget.data as LinkCardData).url;
  },
});

export const applyRefresh = internalMutation({
  args: {
    widgetId: v.id("widgets"),
    title: v.string(),
    description: v.string(),
    imageUrl: v.string(),
    siteName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { widgetId, ...scraped }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget || widget.type !== "linkCard") return null;
    await ctx.db.patch(widgetId, {
      data: { ...(widget.data as LinkCardData), ...scraped, savedAt: Date.now() },
    });
    return null;
  },
});

export const refreshOne = internalAction({
  args: { widgetId: v.id("widgets") },
  returns: v.null(),
  handler: async (ctx, { widgetId }) => {
    const url = await ctx.runQuery(internal.batch.getWidgetUrl, { widgetId });
    if (!url) return null;
    try {
      const scraped = await ctx.runAction(api.firecrawl.scrapeLink, { url });
      await ctx.runMutation(internal.batch.applyRefresh, {
        widgetId,
        title: scraped.title,
        description: scraped.description,
        imageUrl: scraped.imageUrl,
        siteName: scraped.siteName,
      });
    } catch {
      // Leave the card as-is; it's re-queued next sweep if still stale.
    }
    return null;
  },
});

/** Cron target: find every linkCard not refreshed in 7+ days and enqueue it. */
export const enqueueStaleLinkRefresh = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const staleBefore = Date.now() - STALE_MS;
    // Demo-scale table (tens of widgets) — a full scan here is a weekly,
    // low-frequency sweep, not a hot path worth an index for.
    const widgets = await ctx.db.query("widgets").collect();
    let queued = 0;
    for (const widget of widgets) {
      if (widget.type !== "linkCard") continue;
      if ((widget.data as LinkCardData).savedAt >= staleBefore) continue;
      await ctx.db.insert("linkRefreshQueue", {
        widgetId: widget._id,
        queuedAt: ctx.db.vars.commitTs,
      });
      queued += 1;
    }
    if (queued > 0) {
      await ping(ctx, components.batchWorker, {
        name: "linkRefresh",
        workQuery: internal.batch.getBatch,
        workerMutation: internal.batch.processBatch,
      });
    }
    return queued;
  },
});
