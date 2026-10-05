import { mutation } from "./_generated/server";
import { recheck } from "./choiceVotes";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { touchSpace } from "./activity";
import { applyLinks } from "./links";
import type { CheckInWidgetData } from "./widgetData";

/**
 * Log today's number on a check-in, as yourself only (src/widgets/challenge.tsx,
 * and a spoken "i did 40"). The row written is the caller's own: their
 * member name in this space, matched to a person in the challenge. Nobody
 * can log for someone else, whatever the client sends.
 *
 * `day` is the caller's local day index (the server's clock is UTC, a
 * family's evening is tomorrow there). It is trusted only inside the
 * challenge and within a day of the server's own count.
 */
export const log = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    /** The tab's id, as every live write sends it (votes, claims); the signed-in id wins when it has a seat here. */
    userId: v.string(),
    day: v.number(),
    /** null clears today's slot. */
    value: v.union(v.number(), v.null()),
  },
  returns: v.union(v.null(), v.object({ name: v.string(), day: v.number(), value: v.union(v.number(), v.null()) })),
  handler: async (ctx, { widgetId, spaceId, userId: tabId, day, value }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget || widget.spaceId !== spaceId || widget.type !== "checkIn") return null;
    const seat = (userId: string) =>
      ctx.db.query("members").withIndex("by_space_user", (q) => q.eq("spaceId", spaceId).eq("userId", userId)).unique();
    const authId = await getAuthUserId(ctx);
    // the signed-in seat only: a tab id the client sends could name anyone (convex/seat.ts)
    void tabId;
    const me = authId ? await seat(authId) : null;
    if (!me) return null;
    const data = widget.data as CheckInWidgetData;
    const person = data.people.find((p) => p.name.trim().toLowerCase() === me.name.trim().toLowerCase());
    if (!person) return null;
    const serverDay = Math.round((Date.now() - Date.parse(`${data.start}T00:00:00Z`)) / 86_400_000 - 0.5);
    if (!Number.isInteger(day) || day < 0 || day >= data.days || Math.abs(day - serverDay) > 1) return null;
    const v = value === null ? null : Math.max(0, Math.min(9999, Math.round(value)));
    const row = Array.from({ length: data.days }, (_, i) => data.logs[person.name]?.[i] ?? null);
    row[day] = v;
    await ctx.db.patch(widgetId, { data: { ...data, logs: { ...data.logs, [person.name]: row } } });
    await recheck(ctx, widgetId);
    await applyLinks(ctx, widgetId);
    await touchSpace(ctx, spaceId);
    return { name: person.name, day, value: v };
  },
});
