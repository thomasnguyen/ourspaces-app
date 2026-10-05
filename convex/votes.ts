import { mutation, query } from "./_generated/server";
import { applyLinks } from "./links";
import { recheck } from "./choiceVotes";
import { v } from "convex/values";
import { touchSpace } from "./activity";
import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";

// aggregate mirror: per-option vote tallies, namespaced by poll widget.
// O(log n) counts instead of collecting every vote row to count them.
export const pollTallies = new TableAggregate<{
  Namespace: Id<"widgets">;
  Key: string;
  DataModel: DataModel;
  TableName: "votes";
}>(components.pollTallies, {
  namespace: (doc) => doc.widgetId,
  sortKey: (doc) => doc.optionId,
});

export const getResults = query({
  args: { widgetId: v.id("widgets"), spaceId: v.id("spaces") },
  returns: v.array(schema.doc("votes").extend({ voterName: v.string() })),
  handler: async (ctx, { widgetId, spaceId }) => {
    const widget = await ctx.db.get(widgetId);
    // Scoped: results carry voter names, so an unscoped read leaked the member
    // roster of any space to anyone holding a widget id.
    if (!widget || widget.spaceId !== spaceId) return [];

    // Not counted through pollTallies, on purpose. A poll bar names the people
    // behind it and lists who still owes a vote (`voters` / `waitingOn` in
    // src/live/useLivePoll.ts, rendered by PollWidget), so this query's payload
    // *is* one row per voter. The aggregate stores widgetId -> optionId -> vote
    // id and nothing else — no userId, no name — so it can hand back the number
    // but never the row, and once the rows are read `rows.length` is the same
    // number for free. pollTallies is the right tool where only the number is
    // wanted and the rows are not: recap.ts's countBatch across a space's polls.
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_widget", (q) => q.eq("widgetId", widgetId))
      .collect();

    // Name only the people who actually voted, instead of collecting the whole
    // roster: this read now scales with the rows we return, not with the size
    // of the space, and a stranger joining no longer invalidates every open
    // poll subscription. (memberCounts in spaces.ts is no help — it counts
    // members, it cannot name them, and spaces.ts already imports pollTallies
    // from this file, so importing it back would make an import cycle.)
    const voters = await Promise.all(
      votes.map((vote) =>
        ctx.db
          .query("members")
          .withIndex("by_space_user", (q) =>
            q.eq("spaceId", spaceId).eq("userId", vote.userId),
          )
          .unique(),
      ),
    );

    return votes.map((vote, index) => ({
      ...vote,
      voterName: voters[index]?.name ?? "Guest",
    }));
  },
});

export const vote = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    userId: v.string(),
    optionId: v.string(),
  },
  // Nullable because a rejected vote is a no-op, not an error: widget ids are
  // public (listWidgets returns them for any space), so an unscoped vote let
  // anyone vote in another space's poll — and an unchecked optionId wrote a
  // junk key straight into the pollTallies aggregate, where it persists.
  returns: v.union(v.id("votes"), v.null()),
  handler: async (ctx, { widgetId, spaceId, userId, optionId }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget || widget.spaceId !== spaceId || widget.type !== "poll") {
      return null;
    }
    const options = (widget.data as { options?: { id: string }[] }).options;
    if (!Array.isArray(options) || !options.some((o) => o.id === optionId)) {
      return null;
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_widget_user", (q) =>
        q.eq("widgetId", widgetId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { optionId });
      await pollTallies.replace(ctx, existing, { ...existing, optionId });
      await touchSpace(ctx, spaceId);
      // a card waiting on this poll (a flow, links.ts) may resolve now: everyone voted
      await applyLinks(ctx, widgetId);
      // a vote on this card waiting on these voters may be moot now (choiceVotes.ts)
      await recheck(ctx, widgetId);
      return existing._id;
    }

    const id = await ctx.db.insert("votes", { widgetId, userId, optionId });
    const doc = await ctx.db.get(id);
    await pollTallies.insert(ctx, doc!);
    await touchSpace(ctx, spaceId);
    await applyLinks(ctx, widgetId);
    return id;
  },
});

/** Every poll's votes in one room, for "your turn" (src/lib/yourTurn.ts): the
    board subscribes to one poll's results, but a ticket needs to know, for
    every poll, whether you voted and who else has. Same scoping and the same
    rows as getResults, one subscription for the room. */
export const inSpace = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ widgetId: v.id("widgets"), userId: v.string(), optionId: v.string(), voterName: v.string() })),
  handler: async (ctx, { spaceId }) => {
    const polls = (
      await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).collect()
    ).filter((widget) => widget.type === "poll");
    const rows = (
      await Promise.all(
        polls.map((poll) =>
          ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", poll._id)).collect(),
        ),
      )
    ).flat();
    const names = new Map<string, string>();
    for (const userId of new Set(rows.map((row) => row.userId))) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_space_user", (q) => q.eq("spaceId", spaceId).eq("userId", userId))
        .unique();
      names.set(userId, member?.name ?? "Guest");
    }
    return rows.map((row) => ({ widgetId: row.widgetId, userId: row.userId, optionId: row.optionId, voterName: names.get(row.userId) ?? "Guest" }));
  },
});
