import { type Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { completeJson } from "./ai";
import { droppedLinkPatchValidator } from "./widgetData";

/** What to reply + how to label an inbound email once the router has filed it. */
export type InboundAck = { label?: string; reply?: string };

/**
 * The deciding half of the space's email brain. `convex/inbox.ts` receives the
 * mail and owns the mutations that write to the canvas; everything here works
 * out *where* a message should land:
 *  - the build room: URLs in the body drop into the link pile + Firecrawl
 *  - the crew (and any other space): the model reads the live canvas and files
 *    the email into the right widget, falling back to an unfiled envelope
 *
 * Split out of inbox.ts so each half stays readable on its own.
 */

/* ── shared helpers ──────────────────────────────────────────────── */

export function senderName(from: string): string {
  // `Alice Chen <alice@x.com>` → "Alice Chen"; bare address → "alice"
  const display = from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim();
  if (display) return display;
  return from.split("@")[0].replace(/[._-]+/g, " ").trim() || "someone";
}

export function hashJitter(seed: string, span: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % span;
}

/**
 * The router's one-line reason, in house voice: lowercase, short, no ids.
 * Models like to echo Convex ids and say "the email" — strip both. Returns
 * undefined when there's nothing worth showing, so the flap stays bare.
 */
export function cleanBecause(raw: unknown): string | undefined {
  let text = String(raw ?? "")
    .replace(/\b[a-z0-9]{24,}\b/gi, "") // convex ids
    .replace(/["`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/, "");
  if (text.length < 4) return undefined;
  if (text.length > 88) text = `${text.slice(0, 87).trimEnd()}…`;
  return text;
}

/**
 * Everything in an email that a router should read: subject, body, and the
 * text Firecrawl pulled out of any attached document. A booking confirmation
 * whose body is "see attached" is a real email, and this is what makes it one.
 */
export function routableText(event: Doc<"emailEvents">): string {
  const parts = [event.subject, event.body ?? event.summary];
  for (const file of event.attachments ?? []) {
    parts.push(`\n--- attached: ${file.filename} ---\n${file.text}`);
  }
  return parts.filter(Boolean).join("\n");
}

export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  const cleaned = found.map((url) => url.replace(/[.,;:!?]+$/, ""));
  return [...new Set(cleaned)].slice(0, 10);
}

/* ── the build room: emailed links → the pile ───────────────────────────── */

export async function routeBuildRoom(
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
    let patch: Infer<typeof droppedLinkPatchValidator>;
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

/** The parsed attachment text, framed for the model. Empty when nothing was
 *  attached, so the prompt stays identical to what it was before. */
function attachmentBlock(event: Doc<"emailEvents">): string {
  const files = event.attachments ?? [];
  if (files.length === 0) return "";
  return files
    .map((file) => `\nAttached document (${file.filename}):\n${file.text.slice(0, 4_000)}`)
    .join("\n");
}

export async function routeSmart(
  ctx: ActionCtx,
  { event, space, widgets }: { event: Doc<"emailEvents">; space: Doc<"spaces">; widgets: Doc<"widgets">[] },
): Promise<InboundAck> {
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
      "- When a document is attached, it is the authoritative source for amounts, dates and vendors — a body that only says \"see attached\" is not a reason to give up.",
      `Today is ${today}.`,
      "",
      "ALSO write \"because\": one short sentence the group reads on the canvas,",
      "in the voice of a friend who just moved something for them.",
      "- all lowercase, no period, 10 words or fewer, ordinary grammar",
      "- state what is now TRUE for the group, not what you did",
      "- use first names from the canvas when it is about someone",
      "- never name a thing on the board: no widget, tracker, itinerary, list,",
      "  poll, countdown, potluck, canvas, board",
      "- never say: email, message, sender, filed, logged, added, updated",
      "- never include ids",
      "Good: \"this clears jules' tahoe iou\" · \"sam covered maya's half too\"",
      "· \"nov 8 has a dinner now\" · \"the cabin is booked for nov 7\"",
      "· \"deb says hi, nothing to do\" · \"not sure who this one is for\"",
      "Bad: \"bar nonna dinner now on japan itinerary\" (names the board) ·",
      "\"filed the receipt to the expense widget\" (says what you did) ·",
      "\"An email from Jules was processed.\" (not a person talking)",
      "",
      "Reply with ONLY a JSON object:",
      `{"action":"expense"|"itinerary"|"create"|"unfiled"|"discard","widgetId":"<id from inventory or empty>","kind":"expenseSplit"|"itinerary"|"","title":"<for create>","expense":{"who":"<person the money came from>","amount":<number>,"label":"<what for, 2-5 words>"},"day":"<short day label e.g. 'nov 8'>","plan":"<itinerary entry, 3-8 words>","because":"<one lowercase sentence>"}`,
      "Include only the fields the action needs. Amounts are numbers, no $.",
    ].join("\n"),
    user: [
      `Canvas widgets:\n${widgetInventory(widgets) || "(none)"}`,
      `\nEmail:\nFrom: ${event.from}\nSubject: ${event.subject}\n\n${(event.body ?? event.summary).slice(0, 4_000)}`,
      attachmentBlock(event),
    ].filter(Boolean).join("\n"),
    temperature: 0.2,
  });

  // Naming the file back to the sender is the whole tell that we opened it.
  const files = event.attachments ?? [];
  const read = files.length > 0 ? ` Read ${files.map((f) => f.filename).join(", ")}.` : "";

  const action = String(decision?.action ?? "unfiled");
  if (action === "discard") return { label: "spam" };
  const because = cleanBecause(decision?.because);

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
        because,
      });
      return {
        label: "receipt",
        reply: `Logged $${amount} from ${who}${label ? ` for ${label}` : ""} on the expense tracker.${read}`,
      };
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
        because,
      });
      return { label: "booking", reply: `Added "${plan}" to the ${day} plan.${read}` };
    }
  }

  // Unfiled (or the model was unsure/unavailable): a sealed envelope on canvas.
  // One word at both ends: the AgentMail label matches the stamp on the object.
  await ctx.runMutation(internal.inbox.addLetter, {
    eventId: event._id,
    unfiled: true,
    because,
    label: "unfiled",
  });
  return { label: "unfiled", reply: `Left it on your canvas as a sealed envelope.${read}` };
}

