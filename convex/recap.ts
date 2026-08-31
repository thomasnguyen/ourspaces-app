import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { completeJson } from "./ai";

/** Follow-up chat rides the existing messages table, hidden from global chat. */
const THREAD = "recap";

const recapLine = v.object({
  text: v.string(),
  widgetId: v.optional(v.string()),
  messageId: v.optional(v.string()),
});

const recapPayload = v.object({
  since: v.string(),
  kind: v.union(v.literal("daily"), v.literal("ask")),
  lines: v.array(recapLine),
});

const askPayload = v.object({
  reply: v.string(),
  widgetId: v.optional(v.string()),
  messageId: v.optional(v.string()),
});

type RecapLine = {
  text: string;
  widgetId?: string;
  messageId?: string;
};

type RecapPayload = {
  since: string;
  kind: "daily" | "ask";
  lines: RecapLine[];
};

type Snapshot = {
  space: string;
  widgets: { id: string; type: string; summary: string }[];
  chat: { id: string; from: string; text: string; promoted: boolean }[];
  thread: { from: string; text: string }[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function weekdaySince(now = Date.now()) {
  const day = new Date(now - 86_400_000).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/Los_Angeles",
  });
  return `since ${day.toLowerCase()}`;
}

function summarizeWidget(
  type: string,
  data: Record<string, unknown>,
  voteLine?: string,
): string | null {
  if (type === "poll") {
    return voteLine ?? String(data.question ?? "a poll");
  }
  if (type === "potluck") {
    const items = asList(data.items);
    const open = items.filter((item) => !item.claimed).map((item) => String(item.name ?? ""));
    const taken = items
      .filter((item) => item.claimed)
      .map((item) => `${item.name} (${item.by ?? "?"})`);
    return `${data.title ?? "potluck"} — taken: ${taken.join(", ") || "none"}; open: ${open.join(", ") || "none"}`;
  }
  if (type === "rsvp") {
    const rows = asList(data.responses);
    const yes = rows.filter((row) => row.status === "yes").map((row) => row.name);
    const no = rows.filter((row) => row.status === "no").map((row) => row.name);
    const waiting = (Array.isArray(data.waitingOn) ? data.waitingOn : []).map((row) =>
      typeof row === "string" ? row : String(asRecord(row).name ?? ""),
    );
    return `${data.title ?? "rsvp"} — in: ${yes.join(", ") || "nobody"}; out: ${no.join(", ") || "nobody"}; waiting: ${waiting.join(", ") || "nobody"}`;
  }
  if (type === "countdown") {
    return `${data.event ?? "countdown"} on ${data.targetDate ?? "?"}`;
  }
  if (type === "dailyQ") {
    const answers = asList(data.answers).map((row) => `${row.name}: ${row.text}`);
    return `daily q: ${data.question ?? ""} — ${answers.join("; ") || "no answers"}`;
  }
  if (type === "note" || type === "decision") {
    return `${data.title ?? type}: ${data.detail ?? data.text ?? data.body ?? ""}`.slice(0, 180);
  }
  if (type === "expenseSplit") {
    return `expenses: ${JSON.stringify(data.items ?? data.lines ?? data).slice(0, 160)}`;
  }
  if (type === "messageWall") {
    const notes = asList(data.messages).map((row) => `${row.from}: ${row.text}`);
    return `${data.title ?? "messages"} — ${notes.slice(-3).join("; ")}`;
  }
  if (type === "linkCard") {
    return `saved link: ${data.title ?? data.url ?? "untitled"}`;
  }
  if (type === "shipPost") {
    return `ship: ${data.title ?? "untitled"} by ${data.by ?? "?"}`;
  }
  if (type === "roundtable") {
    return `roundtable: ${data.title ?? data.category ?? "topic"}`;
  }
  if (type === "photoWall") {
    const photos = asList(data.photos);
    return `photo pile · ${photos.length} prints`;
  }
  return null;
}

function cannedPollLine(summary: string) {
  const options = [...summary.matchAll(/([^:;]+):\s*(\d+)/g)]
    .map((match) => ({ label: match[1].replace(/^.*—\s*/, "").trim(), votes: Number(match[2]) }))
    .filter((row) => row.label && Number.isFinite(row.votes))
    .sort((a, b) => b.votes - a.votes);
  if (options.length >= 2) {
    return `${options[0].label} pulled ahead of ${options[1].label}, ${options[0].votes} to ${options[1].votes}`;
  }
  return summary.toLowerCase();
}

function cannedPotluckLine(summary: string) {
  const open = summary.match(/open:\s*([^;]+)/i)?.[1]?.trim();
  const taken = summary.match(/taken:\s*([^;]+)/i)?.[1]?.trim();
  if (open && open !== "none") {
    const first = taken && taken !== "none" ? taken.split(",")[0]?.trim() : "";
    const who = first.match(/\(([^)]+)\)/)?.[1];
    const item = first.replace(/\s*\(.*$/, "");
    if (who && item) {
      const rest = open.includes(",") ? open.replace(/,([^,]+)$/, " and$1") : open;
      return `${who} claimed ${item}, so ${rest} ${open.includes(",") ? "are" : "is"} still open`;
    }
    return `${open} still open on the sign-up sheet`;
  }
  return summary.toLowerCase();
}

function cannedRecap(snapshot: Snapshot): RecapPayload {
  const lines: RecapLine[] = [];
  const poll = snapshot.widgets.find((widget) => widget.type === "poll");
  if (poll) lines.push({ text: cannedPollLine(poll.summary), widgetId: poll.id });

  const potluck = snapshot.widgets.find((widget) => widget.type === "potluck");
  if (potluck) lines.push({ text: cannedPotluckLine(potluck.summary), widgetId: potluck.id });

  const loose = snapshot.chat.find((message) => !message.promoted);
  if (loose) {
    lines.push({
      text: `${loose.from.toLowerCase()} said ${loose.text.toLowerCase()}, and it's still only in chat`,
      messageId: loose.id,
    });
  }

  if (lines.length === 0) {
    const rsvp = snapshot.widgets.find((widget) => widget.type === "rsvp");
    if (rsvp) lines.push({ text: rsvp.summary.toLowerCase(), widgetId: rsvp.id });
  }

  if (lines.length === 0) {
    lines.push({ text: "nothing moved — the board looks like you left it" });
  }

  return { since: weekdaySince(), kind: "daily", lines: lines.slice(0, 4) };
}

function cannedAsk(snapshot: Snapshot, question: string): { reply: string; widgetId?: string; messageId?: string } {
  const q = question.toLowerCase();
  const poll = snapshot.widgets.find((widget) => widget.type === "poll");
  const potluck = snapshot.widgets.find((widget) => widget.type === "potluck");
  const rsvp = snapshot.widgets.find((widget) => widget.type === "rsvp");
  const loose = snapshot.chat.find((message) => !message.promoted);

  if (/(cake|poll|vote|flavor|matcha|chocolate)/.test(q) && poll) {
    return { reply: cannedPollLine(poll.summary), widgetId: poll.id };
  }
  if (/(potluck|bring|claim|balloon|playlist)/.test(q) && potluck) {
    return { reply: cannedPotluckLine(potluck.summary), widgetId: potluck.id };
  }
  if (/(rsvp|coming|who.s in|who's in)/.test(q) && rsvp) {
    return { reply: rsvp.summary.toLowerCase(), widgetId: rsvp.id };
  }
  if (/(chat|said|6pm|time|when)/.test(q) && loose) {
    return {
      reply: `${loose.from.toLowerCase()} said "${loose.text.toLowerCase()}" — still only in chat.`,
      messageId: loose.id,
    };
  }
  const first = snapshot.widgets[0];
  return {
    reply: first
      ? `looking at the board: ${first.summary.toLowerCase()}.`
      : "quiet board — nothing to catch you up on yet.",
    widgetId: first?.id,
  };
}

async function askOpenAi(
  kind: "recap" | "ask",
  snapshot: Snapshot,
  extra?: string,
): Promise<RecapPayload | { reply: string; widgetId?: string; messageId?: string } | null> {
  const system =
    kind === "recap"
      ? "You recap a friend group's shared canvas. Return JSON " +
        '{"since":"since friday","lines":[{"text":"...","widgetId":"...","messageId":"..."}]} ' +
        "with 2-4 lines. Each line is under 18 words, lowercase, casual, specific " +
        "(names + what moved). Cite widgetId when it's about a widget, messageId when " +
        "it's still only in chat. Never invent ids — only use ones from the snapshot. " +
        "Never put ids in the text field. No emoji unless the board already used one. " +
        "You never write to the canvas."
      : "You answer one follow-up about this friend group's shared canvas. Return JSON " +
        '{"reply":"...","widgetId":"...","messageId":"..."}. Reply is 1-2 sentences, ' +
        "lowercase, casual, specific. Cite at most one widgetId or messageId from the " +
        "snapshot. If you can't tell, say so. You are not a general chatbot.";

  const user =
    kind === "recap"
      ? `Space: ${snapshot.space}\n\nBoard:\n${JSON.stringify(snapshot.widgets).slice(0, 3500)}\n\nChat:\n${JSON.stringify(snapshot.chat).slice(0, 1500)}`
      : `Space: ${snapshot.space}\nBoard: ${JSON.stringify(snapshot.widgets).slice(0, 2500)}\nChat: ${JSON.stringify(snapshot.chat).slice(0, 1000)}\nRecent recap chat: ${JSON.stringify(snapshot.thread).slice(0, 800)}\n\nQuestion: ${extra ?? ""}`;

  const parsed = await completeJson({ system, user }).catch(() => null);
  if (!parsed) return null;
  try {
    if (kind === "ask") {
      const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
      if (!reply) return null;
      return {
        reply,
        widgetId: typeof parsed.widgetId === "string" ? parsed.widgetId : undefined,
        messageId: typeof parsed.messageId === "string" ? parsed.messageId : undefined,
      };
    }
    const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
    const lines = rawLines
      .map((line): RecapLine | null => {
        if (!line || typeof line !== "object") return null;
        const row = line as Record<string, unknown>;
        if (typeof row.text !== "string" || !row.text.trim()) return null;
        const text = row.text
          .replace(/\s*\(([a-z0-9]{16,})\)/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!text) return null;
        return {
          text,
          widgetId: typeof row.widgetId === "string" ? row.widgetId : undefined,
          messageId: typeof row.messageId === "string" ? row.messageId : undefined,
        };
      })
      .filter((line): line is RecapLine => Boolean(line))
      .slice(0, 4);
    if (lines.length === 0) return null;
    return {
      since: typeof parsed.since === "string" && parsed.since.trim() ? parsed.since.trim() : weekdaySince(),
      kind: "daily",
      lines,
    };
  } catch {
    return null;
  }
}

export const snapshot = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.object({
    space: v.string(),
    widgets: v.array(v.object({ id: v.string(), type: v.string(), summary: v.string() })),
    chat: v.array(
      v.object({
        id: v.string(),
        from: v.string(),
        text: v.string(),
        promoted: v.boolean(),
      }),
    ),
    thread: v.array(v.object({ from: v.string(), text: v.string() })),
  }),
  handler: async (ctx, { spaceId }): Promise<Snapshot> => {
    const space = await ctx.db.get(spaceId);
    const [widgets, messages, members] = await Promise.all([
      ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).collect(),
      ctx.db.query("messages").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).collect(),
      ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).collect(),
    ]);
    const names = new Map(members.map((member) => [member.userId, member.name]));

    const summarized: Snapshot["widgets"] = [];
    for (const widget of widgets) {
      let voteLine: string | undefined;
      if (widget.type === "poll") {
        const votes = await ctx.db
          .query("votes")
          .withIndex("by_widget", (q) => q.eq("widgetId", widget._id))
          .collect();
        const options = asList(asRecord(widget.data).options);
        const tallies = options.map((option) => {
          const voters = votes
            .filter((vote) => vote.optionId === option.id)
            .map((vote) => names.get(vote.userId) ?? "someone");
          return `${option.label ?? option.id}: ${voters.length} (${voters.join(", ") || "nobody"})`;
        });
        voteLine = `${asRecord(widget.data).question ?? "poll"} — ${tallies.join("; ")}`;
      }
      const summary = summarizeWidget(widget.type, asRecord(widget.data), voteLine);
      if (summary) summarized.push({ id: widget._id, type: widget.type, summary });
    }

    const chat = messages
      .filter((message) => message.widgetId === "global")
      .slice(-20)
      .map((message) => ({
        id: message._id,
        from: message.authorName,
        text: message.text,
        promoted: Boolean(message.promotedWidgetId || message.promotable),
      }));

    const thread = messages
      .filter((message) => message.widgetId === THREAD)
      .slice(-12)
      .map((message) => ({ from: message.authorName, text: message.text }));

    return {
      space: space?.name ?? "this space",
      widgets: summarized,
      chat,
      thread,
    };
  },
});

export const latest = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    return await ctx.db
      .query("recaps")
      .withIndex("by_space_created", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .first();
  },
});

export const listSpaceIds = internalQuery({
  args: {},
  returns: v.array(v.id("spaces")),
  handler: async (ctx): Promise<Id<"spaces">[]> =>
    (await ctx.db.query("spaces").collect()).map((space) => space._id),
});

export const save = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    kind: v.union(v.literal("daily"), v.literal("ask")),
    since: v.string(),
    lines: v.array(recapLine),
  },
  returns: v.id("recaps"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("recaps", { ...args, createdAt: Date.now() });
  },
});

export const reply = internalMutation({
  args: { spaceId: v.id("spaces"), text: v.string() },
  returns: v.id("messages"),
  handler: async (ctx, { spaceId, text }) => {
    return await ctx.db.insert("messages", {
      spaceId,
      widgetId: THREAD,
      userId: "recap",
      text,
      createdAt: Date.now(),
      authorName: "catch me up",
      authorColor: "#C6F750",
      authorEmoji: "✦",
    });
  },
});

async function buildRecap(
  ctx: { runQuery: (ref: typeof internal.recap.snapshot, args: { spaceId: Id<"spaces"> }) => Promise<Snapshot> },
  spaceId: Id<"spaces">,
  kind: "daily" | "ask",
): Promise<RecapPayload> {
  const snap = await ctx.runQuery(internal.recap.snapshot, { spaceId });
  const generated = (await askOpenAi("recap", snap).catch(() => null)) as RecapPayload | null;
  const payload = generated ?? cannedRecap(snap);
  return { ...payload, kind };
}

export const generate = action({
  args: {
    spaceId: v.id("spaces"),
    kind: v.optional(v.union(v.literal("daily"), v.literal("ask"))),
  },
  returns: recapPayload,
  handler: async (ctx, { spaceId, kind }): Promise<RecapPayload> => {
    const payload = await buildRecap(ctx, spaceId, kind ?? "ask");
    await ctx.runMutation(internal.recap.save, { spaceId, ...payload });
    return payload;
  },
});

export const generateOne = internalAction({
  args: { spaceId: v.id("spaces"), kind: v.optional(v.union(v.literal("daily"), v.literal("ask"))) },
  returns: v.null(),
  handler: async (ctx, { spaceId, kind }) => {
    const payload = await buildRecap(ctx, spaceId, kind ?? "daily");
    await ctx.runMutation(internal.recap.save, { spaceId, ...payload });
    return null;
  },
});

export const generateAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const spaceIds = await ctx.runQuery(internal.recap.listSpaceIds, {});
    await Promise.all(
      spaceIds.map((spaceId: Id<"spaces">) =>
        ctx.runAction(internal.recap.generateOne, { spaceId, kind: "daily" }),
      ),
    );
    return null;
  },
});

export const ask = action({
  args: { spaceId: v.id("spaces"), question: v.string() },
  returns: askPayload,
  handler: async (ctx, { spaceId, question }): Promise<{
    reply: string;
    widgetId?: string;
    messageId?: string;
  }> => {
    const snap: Snapshot = await ctx.runQuery(internal.recap.snapshot, { spaceId });
    const generated = (await askOpenAi("ask", snap, question).catch(() => null)) as {
      reply: string;
      widgetId?: string;
      messageId?: string;
    } | null;
    const answer = generated ?? cannedAsk(snap, question);
    await ctx.runMutation(internal.recap.reply, { spaceId, text: answer.reply });
    return answer;
  },
});
