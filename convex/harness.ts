import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { widgetDataValidator } from "./widgetData";
import { widgetsCounter } from "./stats";
import { touchSpace } from "./activity";
import { removeWidget } from "./widgets";

/**
 * Seeding and sweeping for eval scripts, with the deploy credentials instead
 * of a seat (S3, nebius/eval/HARNESS-AUTH.md). Internal only: reachable with
 * `npx convex run harness:place|sweep` against the deployment, never from a
 * browser. Everything a person would do goes through a signed seat instead
 * (nebius/eval/lib/seat.mjs).
 */

/** A fixture card, with the maker the script names (`harness:<run>`). */
export const place = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    type: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    data: widgetDataValidator,
    createdBy: v.string(),
    rotate: v.optional(v.number()),
  },
  returns: v.id("widgets"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("widgets", { ...args, createdAt: now });
    await widgetsCounter.inc(ctx);
    await touchSpace(ctx, args.spaceId, now);
    return id;
  },
});

/** Delete cards by recorded id only (standing order 10a); returns how many were there. */
export const sweep = internalMutation({
  args: { ids: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, { ids }) => {
    let n = 0;
    for (const raw of ids.slice(0, 200)) {
      const id = ctx.db.normalizeId("widgets", raw);
      const widget = id && (await ctx.db.get(id));
      if (!widget) continue;
      await removeWidget(ctx, widget);
      n++;
    }
    return n;
  },
});
