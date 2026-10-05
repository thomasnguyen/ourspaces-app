import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { dropFor, recheck } from "./choiceVotes";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { widgetDataValidator, type PotluckData } from "./widgetData";
import schema from "./schema";
import { widgetsCounter } from "./stats";
import { touchSpace } from "./activity";
import { editedLabels, noteOutcome } from "./voiceBuild";
import { applyLinks } from "./links";
import { canRead, requireSeat, seatOrMaker } from "./seat";

/** Drives the canvas — every widget in a space, rendered by type (PRD §11). */
export const listWidgets = query({
  args: { spaceId: v.id("spaces") },
  returns: v.array(schema.doc("widgets")),
  handler: async (ctx, { spaceId }) => {
    if (!(await canRead(ctx, spaceId))) return [];
    return await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
  },
});

/** The same board for the server's own readers (mail filing, the answer verb), which have no session. */
export const board = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.array(schema.doc("widgets")),
  handler: async (ctx, { spaceId }) =>
    await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect(),
});

export const createWidget = mutation({
  args: {
    spaceId: v.id("spaces"),
    type: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    data: widgetDataValidator,
    /** Ignored: the maker is the caller's seat (S3). Kept so older screens still validate. */
    createdBy: v.optional(v.string()),
    rotate: v.optional(v.number()),
  },
  returns: v.id("widgets"),
  handler: async (ctx, args) => {
    const me = await requireSeat(ctx, args.spaceId);
    const now = Date.now();
    const id = await ctx.db.insert("widgets", { ...args, createdBy: me.userId, createdAt: now });
    await widgetsCounter.inc(ctx);
    await touchSpace(ctx, args.spaceId, now);
    return id;
  },
});

/** Committed on drop, optimistic on the client (PRD §11). */

/**
 * Load a widget only if it really belongs to the space the caller claims to be
 * editing. Widget ids are handed to every client on the canvas, so without
 * this a client in one space can patch or delete a widget in another simply by
 * holding its id. `paint.addStroke` and `presence.claimGesture` already scope
 * their writes this way; these mutations did not.
 *
 * And only for a caller with a seat in that room (S3, nebius/eval/s3-audit.md):
 * no session or no seat and the write is ignored. Not an ownership check: any
 * seat may move anyone's card, and the tour's rooms give every visitor a seat
 * at the gate (docs/data-model-plan.md §1).
 */
async function widgetInSpace(
  ctx: MutationCtx,
  widgetId: Id<"widgets">,
  spaceId: Id<"spaces">,
) {
  const widget = await ctx.db.get(widgetId);
  if (!widget || widget.spaceId !== spaceId) return null;
  return (await seatOrMaker(ctx, spaceId)) ? widget : null;
}

export const moveWidget = mutation({
  args: {
    id: v.id("widgets"),
    spaceId: v.id("spaces"),
    x: v.number(),
    y: v.number(),
    z: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { id, spaceId, x, y, z }) => {
    if (!(await widgetInSpace(ctx, id, spaceId))) return null;
    await ctx.db.patch(id, z === undefined ? { x, y } : { x, y, z });
    await touchSpace(ctx, spaceId);
    return null;
  },
});

export const deleteWidget = mutation({
  args: { id: v.id("widgets"), spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, { id, spaceId }) => {
    const widget = await widgetInSpace(ctx, id, spaceId);
    if (!widget) return null;
    await removeWidget(ctx, widget);
    return null;
  },
});

/** A card off the board with everything that hangs on it (deleteWidget, and convex/harness.ts sweeps). */
export async function removeWidget(ctx: MutationCtx, widget: Doc<"widgets">) {
  await ctx.db.delete(widget._id);
  await noteOutcome(ctx, widget, { kind: "deleted" });
  await dropFor(ctx, widget._id);
  await widgetsCounter.dec(ctx);
  await touchSpace(ctx, widget.spaceId);
}

export const claimItem = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    itemName: v.string(),
    /** Ignored: the claimant is the caller's seat (S3). Kept so older screens still validate. */
    claimantName: v.optional(v.string()),
    claimantUserId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const widget = await widgetInSpace(ctx, a.widgetId, a.spaceId);
    if (!widget) return null;
    const me = (await seatOrMaker(ctx, a.spaceId))!;
    const args = { ...a, claimantName: me.name, claimantUserId: me.userId };
    const potluckData = widget.data as PotluckData;
    const items = Array.isArray(potluckData?.items) ? potluckData.items : [];
    const nextItems = items.map((item) => {
      if (item.name !== args.itemName) return item;
      if (item.claimed && item.byUserId === args.claimantUserId) {
        const { byUserId: _byUserId, by: _by, claimed: _claimed, ...rest } = item;
        return { ...rest, claimed: false };
      }
      return { ...item, claimed: true, by: args.claimantName, byUserId: args.claimantUserId };
    });
    await ctx.db.patch(widget._id, { data: { ...potluckData, items: nextItems } });
    await recheck(ctx, widget._id);
    await touchSpace(ctx, args.spaceId);
    return null;
  },
});

/** Merge only the wheel outcome so remote clients animate from the same data. */
export const spinWheel = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    spinNonce: v.number(),
    resultIndex: v.number(),
    spunBy: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { widgetId, spaceId, ...spin }) => {
    const widget = await widgetInSpace(ctx, widgetId, spaceId);
    if (!widget) return null;
    const me = (await seatOrMaker(ctx, spaceId))!;
    await ctx.db.patch(widget._id, { data: { ...widget.data, ...spin, spunBy: me.name || spin.spunBy } });
    await touchSpace(ctx, spaceId);
    return null;
  },
});

/** Room radio station + who started it. Audio itself stays local. */
export const tuneRadio = mutation({
  args: {
    widgetId: v.id("widgets"),
    spaceId: v.id("spaces"),
    stationId: v.string(),
    playing: v.boolean(),
    playedBy: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { widgetId, spaceId, ...tune }) => {
    const widget = await widgetInSpace(ctx, widgetId, spaceId);
    if (!widget) return null;
    const me = (await seatOrMaker(ctx, spaceId))!;
    await ctx.db.patch(widget._id, { data: { ...widget.data, ...tune, playedBy: me.name || tune.playedBy } });
    await touchSpace(ctx, spaceId);
    return null;
  },
});

export const resizeWidget = mutation({
  args: {
    id: v.id("widgets"),
    spaceId: v.id("spaces"),
    w: v.number(),
    h: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { id, spaceId, w, h }) => {
    if (!(await widgetInSpace(ctx, id, spaceId))) return null;
    await ctx.db.patch(id, { w, h });
    await touchSpace(ctx, spaceId);
    return null;
  },
});

export const updateWidgetData = mutation({
  args: {
    id: v.id("widgets"),
    spaceId: v.id("spaces"),
    data: widgetDataValidator,
  },
  returns: v.null(),
  handler: async (ctx, { id, spaceId, data }) => {
    const widget = await widgetInSpace(ctx, id, spaceId);
    if (!widget) return null;
    await writeWidgetData(ctx, widget, data);
    return null;
  },
});

/** A card's data, written the way the card's own edit writes it: the outcome log, its links, the room's stamp. Voice edits (edits.ts) come through here too. */
export async function writeWidgetData(ctx: MutationCtx, widget: Doc<"widgets">, data: Doc<"widgets">["data"], opts: { stampLater?: boolean } = {}) {
  await ctx.db.patch(widget._id, { data });
  const field = editedLabels(widget.type, widget.data, data);
  if (field) await noteOutcome(ctx, widget, { kind: "edited", field });
  // a card waiting on this one may resolve now; a vote waiting on people's choices here may be moot (choiceVotes.ts)
  await applyLinks(ctx, widget._id);
  await recheck(ctx, widget._id);
  // the room's stamp re-runs every query that reads the space doc: a voice edit stamps it right after, like voiceBuild.commit
  if (opts.stampLater) await ctx.scheduler.runAfter(0, internal.widgets.stamp, { spaceId: widget.spaceId, at: Date.now() });
  else await touchSpace(ctx, widget.spaceId);
}

export const stamp = internalMutation({
  args: { spaceId: v.id("spaces"), at: v.number() },
  returns: v.null(),
  handler: async (ctx, { spaceId, at }) => {
    await touchSpace(ctx, spaceId, at);
    return null;
  },
});
