import { v } from "convex/values";
import { touchSpace } from "./activity";
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
import { ackInbound, inboundAttachmentValidator } from "./agentmail";
import schema from "./schema";
import { widgetsCounter } from "./stats";
import {
  extractUrls,
  hashJitter,
  routeBuildRoom,
  routableText,
  routeSmart,
  senderName,
  type InboundAck,
} from "./inboxRouting";
import { logWork } from "./work";


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
  args: {
    eventId: v.id("emailEvents"),
    attachments: v.optional(v.array(inboundAttachmentValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, attachments }) => {
    const context = await ctx.runQuery(internal.inbox.getEventContext, { eventId });
    if (!context) return null;
    const { space, widgets } = context;
    let { event } = context;
    const slug = space.slug ?? "";

    /* The canvas narrates this run as it happens (convex/work.ts). One runId
       per email, and every line below sits at a boundary this action really
       crosses — nothing here is on a timer. */
    const runId = `mail-${String(eventId).slice(-10)}`;
    const who = senderName(event.from);
    const work = (
      step: string,
      status: "running" | "done" | "failed",
      line: string,
      widgetId?: Id<"widgets">,
    ) => logWork(ctx, {
      spaceId: space._id,
      runId,
      kind: "mail",
      step,
      status,
      line,
      subject: who,
      widgetId,
    });

    // The envelope on every open canvas is watching this row
    // (docs/mail-arrival.md): "reading" starts now.
    await ctx.runMutation(internal.inbox.markEvent, { eventId, readingAt: Date.now() });
    await work("open", "running", `opening mail from ${who}`);

    // Attachments first: a receipt PDF with an empty email body has to be
    // readable *before* anything decides where the email goes. AgentMail's
    // download_url → Firecrawl parse → text on the event.
    //
    // Only announced when something is actually attached — an email with no
    // PDF crosses this boundary in milliseconds and a line about it would be
    // narration of nothing.
    const attachedCount = attachments?.length ?? 0;
    if (attachedCount > 0) {
      await work(
        "read",
        "running",
        attachedCount === 1 ? "reading the attachment" : `reading ${attachedCount} attachments`,
      );
    }
    const parsed = await ctx.runAction(internal.agentmail.parseAttachments, {
      inboxId: space.inboxId,
      messageId: event.messageId,
      attachments,
    });
    if (parsed.length > 0) {
      await ctx.runMutation(internal.agentmail.setEventAttachments, {
        eventId,
        attachments: parsed,
      });
      event = { ...event, attachments: parsed };
      await work("read", "done", `read ${parsed.map((file) => file.filename).join(", ")}`);
    } else if (attachedCount > 0) {
      await work("read", "failed", "couldn't open what was attached");
    }

    /* Before anything is filed: has this room already got this? The space's
       own vector index over `widgets.by_embedding` answers it
       (convex/similar.ts). The answer is said out loud, not acted on — a
       second copy is sometimes exactly what someone meant to send. */
    const echo = await ctx.runAction(internal.similar.echoCheck, {
      spaceId: space._id,
      text: routableText(event),
    });
    if (echo) {
      await work(
        "echo",
        "done",
        `already on the board: ${echo.summary.toLowerCase()}`,
        echo.widgetId,
      );
    }

    let ack: InboundAck = {};

    if (slug === "couple") {
      await ctx.runMutation(internal.inbox.addLetter, { eventId, unfiled: false, label: "letter" });
      await work("file", "done", `sealed ${who}'s letter onto the canvas`);
      ack = { label: "letter", reply: "Sealed your letter onto the canvas. 💌" };
    } else if (slug === "buildroom") {
      const urls = extractUrls(routableText(event));
      const pile = widgets.find((widget) => widget.type === "linkPile");
      if (urls.length > 0 && pile) {
        // Verdict + destination land before the scrapes run, so the envelope
        // flies to the pile and each link narrates its own arrival from there.
        await ctx.runMutation(internal.inbox.markEvent, {
          eventId,
          label: "links",
          widgetId: pile._id,
          because: `${urls.length} link${urls.length === 1 ? "" : "s"} inside`,
        });
        await work(
          "file",
          "done",
          `${urls.length} link${urls.length === 1 ? "" : "s"} from ${who} into the pile`,
          pile._id,
        );
        // Each link narrates its own fetch from here (routeBuildRoom logs
        // under the same runId, so the canvas reads it as one arrival).
        await routeBuildRoom(ctx, { event, pileId: pile._id, urls, runId });
        ack = {
          label: "links",
          reply: `Dropped ${urls.length} link${urls.length === 1 ? "" : "s"} into the dev guild pile.`,
        };
      } else {
        await ctx.runMutation(internal.inbox.markEvent, { eventId, label: "unfiled" });
        await work("file", "done", `left ${who}'s note on the canvas`);
      }
    } else {
      await work("decide", "running", `working out where ${who}'s mail goes`);
      ack = await routeSmart(ctx, { event, space, widgets });
      if (ack.label === "spam") {
        await ctx.runMutation(internal.inbox.markEvent, { eventId, label: "spam" });
      }
      // The router's own sentence is already the best thing anyone could say
      // about where this landed — read it back off the event rather than
      // writing a second, worse one here.
      const verdict = await ctx.runQuery(internal.inbox.eventVerdict, { eventId });
      await work(
        "file",
        "done",
        verdict?.because ?? `filed ${who}'s mail`,
        verdict?.widgetId,
      );
    }

    // reply in-thread + label the message with what the space did with it
    const replied = await ackInbound(ctx, {
      inboxId: space.inboxId,
      messageId: event.messageId,
      label: ack.label,
      reply: ack.reply,
    });
    if (replied) {
      await ctx.runMutation(internal.inbox.markEvent, { eventId, repliedAt: Date.now() });
      await work("reply", "done", `told ${who} what happened`);
    }

    /* Embed whatever this email became, so the next arrival can be compared
       against it. Scheduled rather than awaited: the arrival is over, and an
       embedding must never sit between a letter and its reply. */
    const landed = await ctx.runQuery(internal.inbox.eventVerdict, { eventId });
    if (landed?.widgetId) {
      await ctx.scheduler.runAfter(0, internal.similar.embedWidget, {
        widgetId: landed.widgetId,
      });
    }
    return null;
  },
});

/** What the router decided, for the line the canvas reads after it filed. */
export const eventVerdict = internalQuery({
  args: { eventId: v.id("emailEvents") },
  returns: v.union(
    v.object({
      label: v.optional(v.string()),
      because: v.optional(v.string()),
      widgetId: v.optional(v.id("widgets")),
    }),
    v.null(),
  ),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    return { label: event.label, because: event.because, widgetId: event.widgetId };
  },
});

/** The arrival's state ticks that no filing mutation owns: reading started,
 *  a verdict with no widget (spam, unfiled-with-nothing), the build room's
 *  pile as destination, the reply going out. Patches only what it's given. */
export const markEvent = internalMutation({
  args: {
    eventId: v.id("emailEvents"),
    label: v.optional(v.string()),
    widgetId: v.optional(v.id("widgets")),
    because: v.optional(v.string()),
    readingAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, ...fields }) => {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) return null;
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    await ctx.db.patch(eventId, patch);
    return null;
  },
});

/* ── us two: letters ────────────────────────────────────────────────────── */

export const addLetter = internalMutation({
  args: {
    eventId: v.id("emailEvents"),
    unfiled: v.boolean(),
    because: v.optional(v.string()),
    // the arrival's stamp word: "letter" (us two) or "unfiled" (the crew)
    label: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, unfiled, because, label }) => {
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
    await ctx.db.patch(eventId, { widgetId, because, label: label ?? (unfiled ? "unfiled" : "letter") });
    await touchSpace(ctx, event.spaceId);
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
  returns: v.union(v.object({ heads: v.number(), each: v.number() }), v.null()),
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

    /* The split. One person paying is a logged row, not help — spread what
       they paid across everybody else so the card answers "who is paying me
       back" without anyone typing a number. Whole dollars: nobody venmos
       $20.98, and the leftover cents ride with the payer.

       Who counts: the space's cast, not its footfall. These demo spaces are
       public and every anonymous visitor writes a members row — the crew has
       six seeded friends and ~100 drive-by juno/wren rows behind them. Split
       across all of them and the answer is 81 cents each. So: if a space has
       a seeded cast, that IS the group; a real user's space has none and
       splits across everyone on it. */
    const roster = await ctx.db
      .query("members")
      .withIndex("by_space", (q) => q.eq("spaceId", event.spaceId))
      .collect();
    const cast = roster.some((m) => m.userId.startsWith("seed:"))
      ? roster.filter((m) => m.userId.startsWith("seed:"))
      : roster;
    const owing = cast.filter((m) => m.name.toLowerCase() !== who.toLowerCase());
    let share: { heads: number; each: number } | null = null;
    if (owing.length > 0) {
      const each = Math.max(1, Math.round(rounded / owing.length));
      share = { heads: owing.length, each };
      for (const member of owing) {
        const existing = splits.find(
          (entry) => entry.name.toLowerCase() === member.name.toLowerCase(),
        );
        if (existing) existing.owes = Math.round((existing.owes + each) * 100) / 100;
        else splits.push({ name: member.name, owes: each, paid: 0 });
      }
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
    // verdict + destination + reason in one tick, so the stamp has a word
    await ctx.db.patch(eventId, { widgetId: target._id, because, label: "receipt" });
    await touchSpace(ctx, event.spaceId);
    return share;
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
    await ctx.db.patch(eventId, { widgetId: target._id, because, label: "booking" });
    await touchSpace(ctx, event.spaceId);
    return null;
  },
});
