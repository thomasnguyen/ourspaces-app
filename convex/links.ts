import { query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { rightOfWay } from "./rightOfWay";

/**
 * Links: a card that waits on another card and fills itself from it (a
 * recipe's flow, src/lib/deck/recipes.ts). A link is data, one `links` row:
 *
 *   from   the source card
 *   to     the target card, which shows "waiting on <source>" until resolved
 *   when   what counts as resolved: "always" (at once: standings → its
 *          check-in), and declared for the flows to come: "closed",
 *          "winner", "time" (`at`), "threshold"
 *   fill   which field of the target it writes ("source", "title", …)
 *   value  what it writes there: "id" (the source's widget id), and for the
 *          flows to come "winner", "yes", "unclaimed", "date"
 *
 * Code applies it, never a model: `applyLinks` runs in the mutation that
 * changed the source, and every write a link makes goes through
 * `writeLinked`, the one place Right of Way's check will sit.
 */

export type LinkSpec = { when: string; fill: string; value: string; at?: number };

/** Is the source resolved for this link? Only "always" is used today. */
function resolved(link: Doc<"links">, from: Doc<"widgets">, now: number): boolean {
  switch (link.when) {
    case "always":
      return true;
    case "time":
      return link.at !== undefined && now >= link.at;
    case "closed":
      return (from.data as { closed?: boolean }).closed === true;
    default:
      // "winner", "threshold": the flows that need them define them (W2)
      return false;
  }
}

/** What the link writes into the target's field. */
function valueOf(link: Doc<"links">, from: Doc<"widgets">): unknown {
  switch (link.value) {
    case "id":
      return from._id;
    default:
      return undefined;
  }
}

/**
 * The one write a link makes: the target's `fill` field set to `value`.
 * It passes the one door first (rightOfWay.ts), like every AI write.
 */
export async function writeLinked(ctx: MutationCtx, link: Doc<"links">, value: unknown, now: number) {
  const to = await ctx.db.get(link.to);
  if (!to || value === undefined) return false;
  // the one door every AI write passes (rightOfWay.ts)
  const door = await rightOfWay(ctx, { kind: "link", spaceId: to.spaceId, widgetId: to._id, by: { name: "link" }, fields: [{ field: link.fill, old: (to.data as Record<string, unknown>)[link.fill], new: value }], replay: { kind: "link", linkId: link._id, fill: link.fill, value } });
  // wait: someone holds the target; it fills when they let go (rightOfWay.ts landWaiting)
  if (door.verdict !== "go") return false;
  await ctx.db.patch(to._id, { data: { ...(to.data as object), [link.fill]: value } as Doc<"widgets">["data"] });
  await ctx.db.patch(link._id, { resolvedAt: now });
  return true;
}

/** Resolve every open link from this card that can resolve now. Call after a source changes. */
export async function applyLinks(ctx: MutationCtx, fromId: Id<"widgets">) {
  const links = await ctx.db.query("links").withIndex("by_from", (q) => q.eq("from", fromId)).take(20);
  const open = links.filter((l) => l.resolvedAt === undefined);
  if (!open.length) return 0;
  const from = await ctx.db.get(fromId);
  if (!from) return 0;
  const now = Date.now();
  let n = 0;
  for (const link of open) if (resolved(link, from, now) && (await writeLinked(ctx, link, valueOf(link, from), now))) n++;
  return n;
}

/** Declare a link (a recipe's commit does), then resolve it if it already can. */
export async function addLink(ctx: MutationCtx, spaceId: Id<"spaces">, from: Id<"widgets">, to: Id<"widgets">, spec: LinkSpec) {
  await ctx.db.insert("links", { spaceId, from, to, ...spec });
  await applyLinks(ctx, from);
}

/** The room's open links: each target card shows "waiting on <source>" until its link resolves. */
export const waiting = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.object({ from: v.id("widgets"), to: v.id("widgets"), when: v.string() })),
  handler: async (ctx, { spaceId }) => {
    const rows = await ctx.db.query("links").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(100);
    return rows.filter((l) => l.resolvedAt === undefined).map((l) => ({ from: l.from, to: l.to, when: l.when }));
  },
});
