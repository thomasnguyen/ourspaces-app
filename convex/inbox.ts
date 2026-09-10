import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  droppedLinkValidator,
  droppedLinkPatchValidator,
} from "./widgetData";
import { ackInbound } from "./agentmail";
import schema from "./schema";
import { widgetsCounter } from "./stats";
import {
  extractUrls,
  hashJitter,
  routeBuildRoom,
  routeSmart,
  senderName,
  type InboundAck,
} from "./inboxRouting";


/**
 * The space's email brain. Every inbound email (convex/agentmail.ts webhook →
 * emailEvents) is routed here per space personality:
 *  - us two (couple): the email IS a letter — sealed envelope lands on canvas
 *  - the build room: URLs in the body drop into the link pile + Firecrawl
 *  - the crew (and any other space): AI reads the live canvas and files the
 *    email into the right widget (expense row, itinerary day, new widget) —
 *    falling back to an unfiled envelope when unsure
 */

/* ── shared helpers ─────────────────────────────────────────────────────── */

export const getEventContext = internalQuery({
  args: { eventId: v.id("emailEvents") },
  returns: v.union(
    v.object({
      event: schema.doc("emailEvents"),
      space: schema.doc("spaces"),
      widgets: v.array(schema.doc("widgets")),
    }),
    v.null(),
  ),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const space = await ctx.db.get(event.spaceId);
    if (!space) return null;
    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .collect();
    return { event, space, widgets };
  },
});

export const processInbound = internalAction({
  args: { eventId: v.id("emailEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const context = await ctx.runQuery(internal.inbox.getEventContext, { eventId });
    if (!context) return null;
    const { event, space, widgets } = context;
    const slug = space.slug ?? "";

    let ack: InboundAck = {};

    if (slug === "couple") {
      await ctx.runMutation(internal.inbox.addLetter, { eventId, unfiled: false });
      ack = { label: "letter", reply: "Sealed your letter onto the canvas. 💌" };
    } else if (slug === "buildroom") {
      const urls = extractUrls(`${event.subject}\n${event.body ?? event.summary}`);
      const pile = widgets.find((widget) => widget.type === "linkPile");
      if (urls.length > 0 && pile) {
        await routeBuildRoom(ctx, { event, pileId: pile._id, urls });
        ack = {
          label: "links",
          reply: `Dropped ${urls.length} link${urls.length === 1 ? "" : "s"} into the build room pile.`,
        };
      }
    } else {
      ack = await routeSmart(ctx, { event, space, widgets });
    }

    // reply in-thread + label the message with what the space did with it
    await ackInbound(ctx, {
      inboxId: space.inboxId,
      messageId: event.messageId,
      label: ack.label,
      reply: ack.reply,
    });
    return null;
  },
});

/* ── us two: letters ────────────────────────────────────────────────────── */

export const addLetter = internalMutation({
  args: {
    eventId: v.id("emailEvents"),
    unfiled: v.boolean(),
    because: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, unfiled, because }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", event.spaceId))
      .collect();
    const letters = widgets.filter((widget) => widget.type === "letter").length;
    const seed = String(eventId);
    // Letters stack loosely: base spot + a per-letter drift so they pile up.
    const base = unfiled ? { x: 64, y: 640 } : { x: 64, y: 620 };
    const widgetId = await ctx.db.insert("widgets", {
      spaceId: event.spaceId,
      type: "letter",
      x: base.x + (letters % 4) * 26 + hashJitter(seed, 18),
      y: base.y + Math.min(letters, 6) * 14 + hashJitter(`${seed}y`, 14),
      w: 250,
      h: 168,
      z: 20 + letters,
      rotate: (hashJitter(seed, 7) - 3),
      data: {
        from: senderName(event.from),
        fromAddress: event.from,
        subject: event.subject || "(no subject)",
        text: (event.body ?? event.summary).slice(0, 6_000),
        receivedAt: event.createdAt,
        sealed: true,
        unfiled,
        because,
      },
      createdBy: "mail",
      createdAt: Date.now(),
    });
    await widgetsCounter.inc(ctx);
    await ctx.db.patch(eventId, { widgetId, because });
    return null;
  },
});


export const prependDroppedLinks = internalMutation({
  args: { pileId: v.id("widgets"), dropped: v.array(droppedLinkValidator) },
  returns: v.null(),
  handler: async (ctx, { pileId, dropped }) => {
    const pile = await ctx.db.get(pileId);
    if (!pile) return null;
    const pileData = pile.data as Record<string, unknown>;
    const existing = Array.isArray(pileData.dropped) ? pileData.dropped : [];
    await ctx.db.patch(pileId, {
      data: { ...pileData, dropped: [...dropped, ...existing] },
    });
    return null;
  },
});

export const patchDroppedLink = internalMutation({
  args: {
    pileId: v.id("widgets"),
    linkId: v.string(),
    patch: droppedLinkPatchValidator,
  },
  returns: v.null(),
  handler: async (ctx, { pileId, linkId, patch }) => {
    const pile = await ctx.db.get(pileId);
    if (!pile) return null;
    const pileData = pile.data as Record<string, unknown>;
    const dropped = Array.isArray(pileData.dropped) ? pileData.dropped : [];
    await ctx.db.patch(pileId, {
      data: {
        ...pileData,
        dropped: dropped.map((entry: Record<string, unknown>) =>
          entry.id === linkId ? { ...entry, ...patch } : entry,
        ),
      },
    });
    return null;
  },
});

export const applyExpense = internalMutation({
  args: {
    eventId: v.id("emailEvents"),
    widgetId: v.string(), // "" → create a new tracker
    title: v.string(),
    who: v.string(),
    amount: v.number(),
    label: v.string(),
    because: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, widgetId, title, who, amount, label, because }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const rounded = Math.round(amount * 100) / 100;
    let target = widgetId ? await ctx.db.get(widgetId as Id<"widgets">) : null;
    if (target && (target.type !== "expenseSplit" || target.spaceId !== event.spaceId)) {
      target = null;
    }
    if (!target) {
      const newId = await ctx.db.insert("widgets", {
        spaceId: event.spaceId,
        type: "expenseSplit",
        x: 60 + hashJitter(String(eventId), 30),
        y: 700 + hashJitter(`${String(eventId)}y`, 40),
        w: 230,
        h: 205,
        z: 30,
        rotate: hashJitter(String(eventId), 5) - 2,
        data: { title: title.toLowerCase(), splits: [], total: 0, kicker: "from email" },
        createdBy: "mail",
        createdAt: Date.now(),
      });
      await widgetsCounter.inc(ctx);
      target = await ctx.db.get(newId);
      if (!target) return null;
    }
    const data = (target.data ?? {}) as Record<string, unknown>;
    const splits = Array.isArray(data.splits)
      ? [...(data.splits as { name: string; owes: number; paid: number }[])]
      : [];
    const row = splits.find(
      (entry) => entry.name.toLowerCase() === who.toLowerCase(),
    );
    if (row) {
      row.paid = Math.round((row.paid + rounded) * 100) / 100;
      if (row.owes > 0) row.owes = Math.max(0, Math.round((row.owes - rounded) * 100) / 100);
    } else {
      splits.push({ name: who, owes: 0, paid: rounded });
    }
    const total = Math.round(((Number(data.total) || 0) + rounded) * 100) / 100;
    await ctx.db.patch(target._id, {
      data: {
        ...data,
        splits,
        total,
        lastEmail: { who, amount: rounded, label, because },
      },
    });
    await ctx.db.patch(eventId, { widgetId: target._id, because });
    return null;
  },
});

export const applyItinerary = internalMutation({
  args: {
    eventId: v.id("emailEvents"),
    widgetId: v.string(), // "" → create a new itinerary
    title: v.string(),
    day: v.string(),
    plan: v.string(),
    because: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, widgetId, title, day, plan, because }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    let target = widgetId ? await ctx.db.get(widgetId as Id<"widgets">) : null;
    if (target && (target.type !== "itinerary" || target.spaceId !== event.spaceId)) {
      target = null;
    }
    if (!target) {
      const newId = await ctx.db.insert("widgets", {
        spaceId: event.spaceId,
        type: "itinerary",
        x: 320 + hashJitter(String(eventId), 30),
        y: 700 + hashJitter(`${String(eventId)}y`, 40),
        w: 260,
        h: 200,
        z: 30,
        rotate: hashJitter(String(eventId), 5) - 2,
        data: { title: title.toLowerCase(), days: [] },
        createdBy: "mail",
        createdAt: Date.now(),
      });
      await widgetsCounter.inc(ctx);
      target = await ctx.db.get(newId);
      if (!target) return null;
    }
    const data = (target.data ?? {}) as Record<string, unknown>;
    const days = Array.isArray(data.days)
      ? [...(data.days as { day: string; plan: string }[])]
      : [];
    days.push({ day, plan });
    await ctx.db.patch(target._id, {
      data: { ...data, days, lastEmail: { day, plan, because } },
    });
    await ctx.db.patch(eventId, { widgetId: target._id, because });
    return null;
  },
});
