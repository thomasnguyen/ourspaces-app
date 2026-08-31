import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { completeJson } from "./ai";
import schema from "./schema";
import { widgetsCounter } from "./stats";

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

function senderName(from: string): string {
  // `Alice Chen <alice@x.com>` → "Alice Chen"; bare address → "alice"
  const display = from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim();
  if (display) return display;
  return from.split("@")[0].replace(/[._-]+/g, " ").trim() || "someone";
}

function hashJitter(seed: string, span: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % span;
}

function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  const cleaned = found.map((url) => url.replace(/[.,;:!?]+$/, ""));
  return [...new Set(cleaned)].slice(0, 10);
}

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

    if (slug === "couple") {
      await ctx.runMutation(internal.inbox.addLetter, { eventId, unfiled: false });
      return null;
    }

    if (slug === "buildroom") {
      const urls = extractUrls(`${event.subject}\n${event.body ?? event.summary}`);
      if (urls.length === 0) return null;
      const pile = widgets.find((widget) => widget.type === "linkPile");
      if (!pile) return null;
      await routeBuildRoom(ctx, { event, pileId: pile._id, urls });
      return null;
    }

    await routeSmart(ctx, { event, space, widgets });
    return null;
  },
});

/* ── us two: letters ────────────────────────────────────────────────────── */

export const addLetter = internalMutation({
  args: { eventId: v.id("emailEvents"), unfiled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { eventId, unfiled }) => {
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
      },
      createdBy: "mail",
      createdAt: Date.now(),
    });
    await widgetsCounter.inc(ctx);
    await ctx.db.patch(eventId, { widgetId });
    return null;
  },
});

/* ── the build room: emailed links → the pile ───────────────────────────── */

async function routeBuildRoom(
  ctx: ActionCtx,
  { event, pileId, urls }: { event: Doc<"emailEvents">; pileId: Id<"widgets">; urls: string[] },
) {
  const batchKey = `mail-${String(event._id).slice(-8)}`;
  const dropped = urls.map((url, index) => ({
    id: `${batchKey}-${index}`,
    url,
    domain: url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0],
    title: "",
    description: "",
    imageUrl: "",
    kind: "article",
    whyItMatters: "",
    questions: [],
    status: "pending",
    batchKey,
    droppedBy: `email:${event.from}`,
    droppedByName: `${senderName(event.from)} ✉`,
    droppedAt: event.createdAt,
    voters: [],
  }));
  await ctx.runMutation(internal.inbox.prependDroppedLinks, { pileId, dropped });

  // Sequential on purpose: each patch read-modify-writes the pile document.
  for (const link of dropped) {
    let patch: Record<string, unknown>;
    try {
      const scraped: {
        title: string;
        description: string;
        imageUrl: string;
        siteName: string;
      } = await ctx.runAction(api.firecrawl.scrapeLink, { url: link.url });
      patch = {
        title: scraped.title,
        description: scraped.description,
        imageUrl: scraped.imageUrl,
        domain: scraped.siteName || link.domain,
        whyItMatters: scraped.description,
        questions: [
          { id: "q1", text: `What would we actually use from "${(scraped.title || link.domain).slice(0, 60)}"?` },
          { id: "q2", text: "Who has tried something like this?" },
        ],
        status: "ready",
      };
    } catch {
      patch = { status: "failed", title: link.domain };
    }
    await ctx.runMutation(internal.inbox.patchDroppedLink, {
      pileId,
      linkId: link.id,
      patch,
    });
  }
}

export const prependDroppedLinks = internalMutation({
  args: { pileId: v.id("widgets"), dropped: v.array(v.any()) },
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
  args: { pileId: v.id("widgets"), linkId: v.string(), patch: v.any() },
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

/* ── the crew: AI files the email into the right widget ─────────────────── */

function widgetInventory(widgets: Doc<"widgets">[]): string {
  const lines: string[] = [];
  for (const widget of widgets) {
    const data = (widget.data ?? {}) as Record<string, unknown>;
    if (widget.type === "expenseSplit") {
      const splits = Array.isArray(data.splits) ? data.splits : [];
      const names = splits
        .map((s: Record<string, unknown>) => String(s.name ?? ""))
        .filter(Boolean)
        .join(", ");
      lines.push(
        `- id=${widget._id} type=expenseSplit title="${String(data.title ?? "")}" people=[${names}] total=$${String(data.total ?? 0)}`,
      );
    } else if (widget.type === "itinerary") {
      const days = Array.isArray(data.days) ? data.days : [];
      const preview = days
        .map((d: Record<string, unknown>) => String(d.day ?? ""))
        .filter(Boolean)
        .join(" | ");
      lines.push(
        `- id=${widget._id} type=itinerary title="${String(data.title ?? "")}" days=[${preview}]`,
      );
    } else if (widget.type === "frame") {
      lines.push(
        `- id=${widget._id} type=frame title="${String(data.title ?? "")}" subtitle="${String(data.subtitle ?? "")}"`,
      );
    } else if (widget.type === "countdown") {
      lines.push(
        `- id=${widget._id} type=countdown event="${String(data.event ?? "")}" target=${String(data.targetDate ?? "")}`,
      );
    }
  }
  return lines.join("\n");
}

async function routeSmart(
  ctx: ActionCtx,
  { event, space, widgets }: { event: Doc<"emailEvents">; space: Doc<"spaces">; widgets: Doc<"widgets">[] },
) {
  const today = new Date(event.createdAt).toISOString().slice(0, 10);
  const decision = await completeJson({
    system: [
      `You are the mail sorter for "${space.name}", a friend group's shared canvas.`,
      "An email arrived at the group's inbox. Decide where it belongs on the canvas.",
      "Rules:",
      "- A receipt, IOU, payment request, or 'I paid for X' → action \"expense\". Pick the expense widget whose title/people best match what the money was for. Money about a PAST trip/event goes to that event's tracker.",
      "- A booking, reservation, ticket, or confirmation with FUTURE dates → action \"itinerary\". Pick the itinerary whose title/dates match.",
      "- If the right kind of widget doesn't exist for a clear receipt/booking, use action \"create\" (kind \"expenseSplit\" or \"itinerary\") with a short title naming the trip/event.",
      "- Obvious spam, marketing, or automated junk → action \"discard\".",
      "- Anything else, or if you are not confident → action \"unfiled\".",
      `Today is ${today}.`,
      "Reply with ONLY a JSON object:",
      `{"action":"expense"|"itinerary"|"create"|"unfiled"|"discard","widgetId":"<id from inventory or empty>","kind":"expenseSplit"|"itinerary"|"","title":"<for create>","expense":{"who":"<person the money came from>","amount":<number>,"label":"<what for, 2-5 words>"},"day":"<short day label e.g. 'nov 8'>","plan":"<itinerary entry, 3-8 words>"}`,
      "Include only the fields the action needs. Amounts are numbers, no $.",
    ].join("\n"),
    user: [
      `Canvas widgets:\n${widgetInventory(widgets) || "(none)"}`,
      `\nEmail:\nFrom: ${event.from}\nSubject: ${event.subject}\n\n${(event.body ?? event.summary).slice(0, 4_000)}`,
    ].join("\n"),
    temperature: 0.2,
  });

  const action = String(decision?.action ?? "unfiled");
  if (action === "discard") return;

  if (action === "expense" || (action === "create" && decision?.kind === "expenseSplit")) {
    const expense = (decision?.expense ?? {}) as Record<string, unknown>;
    const amount = Number(expense.amount);
    const who = String(expense.who ?? senderName(event.from)).slice(0, 24);
    const label = String(expense.label ?? event.subject).slice(0, 48);
    if (Number.isFinite(amount) && amount > 0) {
      await ctx.runMutation(internal.inbox.applyExpense, {
        eventId: event._id,
        widgetId: action === "expense" ? String(decision?.widgetId ?? "") : "",
        title: String(decision?.title ?? label),
        who,
        amount,
        label,
      });
      return;
    }
  }

  if (action === "itinerary" || (action === "create" && decision?.kind === "itinerary")) {
    const day = String(decision?.day ?? "").slice(0, 20);
    const plan = String(decision?.plan ?? event.subject).slice(0, 80);
    if (day && plan) {
      await ctx.runMutation(internal.inbox.applyItinerary, {
        eventId: event._id,
        widgetId: action === "itinerary" ? String(decision?.widgetId ?? "") : "",
        title: String(decision?.title ?? "trip plan"),
        day,
        plan,
      });
      return;
    }
  }

  // Unfiled (or the model was unsure/unavailable): a sealed envelope on canvas.
  await ctx.runMutation(internal.inbox.addLetter, { eventId: event._id, unfiled: true });
}

export const applyExpense = internalMutation({
  args: {
    eventId: v.id("emailEvents"),
    widgetId: v.string(), // "" → create a new tracker
    title: v.string(),
    who: v.string(),
    amount: v.number(),
    label: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, widgetId, title, who, amount, label }) => {
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
      data: { ...data, splits, total, lastEmail: { who, amount: rounded, label } },
    });
    await ctx.db.patch(eventId, { widgetId: target._id });
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
  },
  returns: v.null(),
  handler: async (ctx, { eventId, widgetId, title, day, plan }) => {
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
    await ctx.db.patch(target._id, { data: { ...data, days } });
    await ctx.db.patch(eventId, { widgetId: target._id });
    return null;
  },
});
