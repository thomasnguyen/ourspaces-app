/**
 * Play lab — the take room (docs/local/play-lab.md, route /#/play).
 *
 * The demo video's opening take runs on a disposable room, never on the crew
 * itself. `prepareTake` makes (or wipes) a space with slug "play": the crew's
 * row fields and members, and an empty board — the person at the desk drags
 * the widgets in, and they arrive pre-filled (src/lib/playPresets.ts). Running
 * it again is the reset. It has no inbox, so mail never lands here.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { memberCounts } from "./spaces";
import { spacesCounter, widgetsCounter } from "./stats";
import { pollTallies } from "./votes";

export const TAKE_SLUG = "play";

export const prepareTake = mutation({
  args: {
    source: v.optional(v.string()),
    /** copy the source's board too (off by default: the take starts blank) */
    copyWidgets: v.optional(v.boolean()),
  },
  returns: v.object({
    spaceId: v.id("spaces"),
    created: v.boolean(),
    removed: v.number(),
    copied: v.number(),
  }),
  handler: async (ctx, { source = "crew", copyWidgets = false }) => {
    const now = Date.now();
    const from = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", source))
      .unique();
    if (!from) throw new Error(`no space with slug "${source}" to copy`);

    let take = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", TAKE_SLUG))
      .unique();
    let created = false;
    if (!take) {
      const takeId = await ctx.db.insert("spaces", {
        name: from.name,
        type: from.type,
        icon: from.icon,
        color: from.color,
        slug: TAKE_SLUG,
        tagline: from.tagline,
        canvasW: from.canvasW,
        canvasH: from.canvasH,
        createdAt: now,
        lastActivityAt: now,
      });
      await spacesCounter.inc(ctx);
      for (const member of await ctx.db
        .query("members")
        .withIndex("by_space", (q) => q.eq("spaceId", from._id))
        .collect()) {
        const memberId = await ctx.db.insert("members", {
          spaceId: takeId,
          userId: member.userId,
          name: member.name,
          color: member.color,
          emoji: member.emoji,
          avatarUrl: member.avatarUrl,
          lastSeen: now,
        });
        const memberDoc = await ctx.db.get(memberId);
        if (memberDoc) await memberCounts.insert(ctx, memberDoc);
      }
      take = await ctx.db.get(takeId);
      created = true;
    }
    if (!take) throw new Error("take room vanished mid-make");

    // Wipe the take's board: widgets, their votes, and any cursors still on it.
    let removed = 0;
    for (const widget of await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", take._id))
      .collect()) {
      for (const vote of await ctx.db
        .query("votes")
        .withIndex("by_widget", (q) => q.eq("widgetId", widget._id))
        .collect()) {
        await pollTallies.delete(ctx, vote);
        await ctx.db.delete(vote._id);
      }
      await ctx.db.delete(widget._id);
      await widgetsCounter.dec(ctx);
      removed += 1;
    }
    for (const row of await ctx.db
      .query("presence")
      .withIndex("by_space", (q) => q.eq("spaceId", take._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }

    let copied = 0;
    if (copyWidgets) {
      for (const widget of await ctx.db
        .query("widgets")
        .withIndex("by_space", (q) => q.eq("spaceId", from._id))
        .collect()) {
        await ctx.db.insert("widgets", {
          spaceId: take._id,
          type: widget.type,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
          z: widget.z,
          rotate: widget.rotate,
          data: widget.data,
          createdBy: "play",
          createdAt: now,
        });
        await widgetsCounter.inc(ctx);
        copied += 1;
      }
    }

    await ctx.db.patch(take._id, { lastActivityAt: now });
    return { spaceId: take._id, created, removed, copied };
  },
});
