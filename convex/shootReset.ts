import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { CREW_WIDGETS } from "../src/data/spaces";
import { widgetsCounter } from "./stats";
import { pollTallies } from "./votes";
import type { Doc } from "./_generated/dataModel";

/**
 * The take reset (docs/mail-arrival.md). Each take of the mail beat is a real
 * email, so each take leaves an event, a filed row and a reply. Between
 * takes: drop the take's inbound events and anything mail created, put the
 * seeded crew widgets the take touches back to their fixtures (the tahoe
 * tracker, the potluck, the cake poll), and clear the recap cache. Nothing
 * else on the board is touched — people's own widgets stay.
 *
 *   npx convex run shootReset:shootReset '{"slug":"crew","sinceMinutes":180}'
 */
export const shootReset = internalMutation({
  args: { slug: v.optional(v.string()), sinceMinutes: v.optional(v.number()) },
  returns: v.object({
    events: v.number(),
    widgets: v.number(),
    votes: v.number(),
    recaps: v.number(),
    restored: v.array(v.string()),
  }),
  handler: async (ctx, { slug = "crew", sinceMinutes = 180 }) => {
    const since = Date.now() - sinceMinutes * 60_000;
    const out = { events: 0, widgets: 0, votes: 0, recaps: 0, restored: [] as string[] };
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!space) return out;

    // 1 · the take's mail: every event since, in and out
    for (const event of await ctx.db
      .query("emailEvents")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id).gte("_creationTime", since))
      .collect()) {
      await ctx.db.delete(event._id);
      out.events += 1;
    }

    // 2 · anything mail created since (a fresh tracker, an unfiled letter)
    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .collect();
    for (const widget of widgets) {
      if (widget.createdBy === "mail" && widget.createdAt >= since) {
        await ctx.db.delete(widget._id);
        await widgetsCounter.dec(ctx);
        out.widgets += 1;
      }
    }

    // 3 · the seeded widgets the beat touches, back to their fixtures
    if (slug === "crew") {
      const fixtures = {
        expenseSplit: CREW_WIDGETS.find((w) => w.id === "expense-split"),
        potluck: CREW_WIDGETS.find((w) => w.id === "potluck"),
        poll: CREW_WIDGETS.find((w) => w.id === "poll-cake"),
      };
      for (const widget of widgets) {
        const fixture = fixtures[widget.type as keyof typeof fixtures];
        if (!fixture) continue;
        const data = widget.data as Record<string, unknown>;
        const title = String(data.title ?? data.question ?? "");
        const fixtureTitle = String(fixture.data.title ?? fixture.data.question ?? "");
        if (title !== fixtureTitle) continue;
        await ctx.db.patch(widget._id, { data: fixture.data as Doc<"widgets">["data"] });
        out.restored.push(`${widget.type} · ${title}`);
        if (widget.type === "poll") {
          // votes cast during the take, and their tally
          for (const vote of await ctx.db
            .query("votes")
            .withIndex("by_widget", (q) => q.eq("widgetId", widget._id).gte("_creationTime", since))
            .collect()) {
            await ctx.db.delete(vote._id);
            await pollTallies.delete(ctx, vote);
            out.votes += 1;
          }
        }
      }
    }

    // 4 · the recap cache, so catch-me-up doesn't replay the last take
    for (const recap of await ctx.db
      .query("recaps")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .collect()) {
      await ctx.db.delete(recap._id);
      out.recaps += 1;
    }
    return out;
  },
});
