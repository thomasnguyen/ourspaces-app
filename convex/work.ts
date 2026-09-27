import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * The space saying what it is doing while it does it (`work` in schema.ts).
 *
 * The brain's slow parts all live inside actions — reading an emailed PDF,
 * asking a site for a page, deciding which widget an email belongs to. Each
 * of those runs for seconds behind a canvas that, until this table, showed
 * nothing and then showed the finished thing. Every real boundary inside
 * those actions calls `logWork` here, the canvas subscribes to `recent`, and
 * the live strip reads the newest line out loud.
 *
 * The one rule: a row is written where the work actually happened, never on
 * a timer. If a step has no boundary to hang a row on, it gets no row — a
 * shorter honest sequence beats a longer invented one. (The reading room's
 * `ARRIVAL_STEPS` clock is the thing this replaces; see docs/todos.md.)
 */

/**
 * Rows kept per space. Generous enough that a whole email run plus the link
 * scrapes it kicked off are all still readable together, small enough that
 * the trim below stays a cheap indexed range read.
 */
const CAP_PER_SPACE = 40;
const LINE_MAX = 120;
const SUBJECT_MAX = 80;

/** One work event. Appends, then trims this space back to CAP_PER_SPACE. */
export const log = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    runId: v.string(),
    kind: v.union(
      v.literal("mail"),
      v.literal("link"),
      v.literal("search"),
      v.literal("crawl"),
    ),
    step: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    line: v.string(),
    subject: v.optional(v.string()),
    widgetId: v.optional(v.id("widgets")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = args.line.trim().slice(0, LINE_MAX);
    if (!line) return null;

    await ctx.db.insert("work", {
      spaceId: args.spaceId,
      runId: args.runId.slice(0, 64),
      kind: args.kind,
      step: args.step.slice(0, 32),
      status: args.status,
      line,
      subject: args.subject?.trim().slice(0, SUBJECT_MAX) || undefined,
      widgetId: args.widgetId,
      createdAt: Date.now(),
    });

    // Trim on write rather than on a cron: the table only grows when the
    // brain runs, so the write is exactly where the bound is worth paying
    // for. The read set is this space's own recent rows, so the only thing
    // it can lose an OCC conflict to is another work write in the same room
    // — and those are sequential within a run.
    const recent = await ctx.db
      .query("work")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .order("desc")
      .take(CAP_PER_SPACE + 1);
    if (recent.length > CAP_PER_SPACE) {
      for (const stale of recent.slice(CAP_PER_SPACE)) {
        await ctx.db.delete(stale._id);
      }
    }
    return null;
  },
});

/**
 * Call-site sugar for the actions that do the work. Deliberately swallows its
 * own failures: narration is the least important thing in any of these
 * pipelines, and a dropped line must never be the reason an email fails to
 * file or a link fails to scrape.
 */
export async function logWork(
  ctx: ActionCtx,
  event: {
    spaceId: Id<"spaces">;
    runId: string;
    kind: "mail" | "link" | "search" | "crawl";
    step: string;
    status: "running" | "done" | "failed";
    line: string;
    subject?: string;
    widgetId?: Id<"widgets">;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.work.log, event);
  } catch {
    // Narration is never load-bearing.
  }
}

/**
 * What the canvas watches. Bounded by the caller's `since` because a query
 * may not read the clock — a `Date.now()` in here would freeze at whatever
 * the first subscriber saw and never re-evaluate (same reason as
 * `stats.getLiveCounts` and `mailArrival.recentInbound`).
 *
 * Oldest first: the strip wants the newest line, but the reading room wants
 * the run in order, and one ordering both can use beats two queries.
 */
export const recent = query({
  args: { spaceId: v.id("spaces"), since: v.number() },
  returns: v.array(
    v.object({
      id: v.id("work"),
      runId: v.string(),
      kind: v.string(),
      step: v.string(),
      status: v.string(),
      line: v.string(),
      subject: v.optional(v.string()),
      widgetId: v.optional(v.id("widgets")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { spaceId, since }) => {
    const rows = await ctx.db
      .query("work")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", since))
      .order("desc")
      .take(CAP_PER_SPACE);
    return rows
      .map((row) => ({
        id: row._id,
        runId: row.runId,
        kind: row.kind,
        step: row.step,
        status: row.status,
        line: row.line,
        subject: row.subject,
        widgetId: row.widgetId,
        createdAt: row.createdAt,
      }))
      .reverse();
  },
});
