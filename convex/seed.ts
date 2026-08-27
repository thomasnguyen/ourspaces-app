import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { SPACES_BY_ID } from "../src/data/spaces";
import { getGlobalThread, getThreadsForSpace } from "../src/data/chat";

function seedUserId(slug: string, name: string) {
  return `seed:${slug}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function convexSafe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(convexSafe);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      /^[\x20-\x7E]+$/.test(key)
        ? key
        : `__unicode_${Array.from(key).map((char) => char.codePointAt(0)?.toString(16)).join("_")}`,
      convexSafe(child),
    ]),
  );
}

async function seedAll(ctx: MutationCtx) {
  const now = Date.now();
  const widgetIds = new Map<string, string>();
  const spaceIds = new Map<string, Id<"spaces">>();

  for (const meta of Object.values(SPACES_BY_ID)) {
    const slug = meta.id;
    const size = meta.canvasSize ?? (slug === "league"
      ? { width: 1060, height: 780 }
      : slug === "buildclub"
        ? { width: 1520, height: 920 }
        : { width: 1640, height: 1080 });
    const spaceId = await ctx.db.insert("spaces", {
      name: meta.name,
      type: meta.kind,
      icon: meta.icon,
      color: meta.color,
      slug,
      tagline: meta.tagline,
      canvasW: size.width,
      canvasH: size.height,
      createdAt: now,
      lastActivityAt: now,
    });
    spaceIds.set(slug, spaceId);

    for (const member of meta.members) {
      await ctx.db.insert("members", {
        spaceId,
        userId: seedUserId(slug, member.name),
        name: member.name,
        color: member.color,
        lastSeen: now,
      });
    }

    for (const widget of meta.widgets) {
      const id = await ctx.db.insert("widgets", {
        spaceId,
        type: widget.type,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        z: widget.z,
        rotate: widget.rotate,
        data: convexSafe(widget.data),
        createdBy: seedUserId(slug, meta.members[0]?.name ?? "guest"),
        createdAt: now,
      });
      widgetIds.set(`${slug}:${widget.id}`, id);

      if (widget.type === "poll") {
        for (const option of (widget.data.options as any[]) ?? []) {
          for (const voter of option.voters ?? []) {
            await ctx.db.insert("votes", {
              widgetId: id,
              userId: seedUserId(slug, voter),
              optionId: option.id,
            });
          }
        }
      }
    }
  }

  for (const meta of Object.values(SPACES_BY_ID)) {
    const spaceId = spaceIds.get(meta.id);
    if (!spaceId) continue;
    const global = getGlobalThread(meta.id);
    const threads = [global, ...Object.values(getThreadsForSpace(meta.id))];
    let offset = threads.reduce((total, thread) => total + thread.messages.length, 0);
    for (const thread of threads) {
      for (const [index, message] of thread.messages.entries()) {
        const widgetId = thread.widgetId === "global"
          ? "global"
          : widgetIds.get(`${meta.id}:${thread.widgetId}`);
        if (!widgetId) continue;
        const member = meta.members.find((candidate) => candidate.name === message.from);
        await ctx.db.insert("messages", {
          spaceId,
          widgetId: String(widgetId),
          userId: seedUserId(meta.id, message.from),
          text: message.text,
          createdAt: now - (offset - index) * 60_000,
          authorName: message.from,
          authorColor: member?.color ?? "#8b8b8b",
          promotable: message.promotable,
        });
      }
      offset -= thread.messages.length;
    }
  }

  return spaceIds.get("crew");
}

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", "crew")).unique();
    if (existing) return existing._id;
    return seedAll(ctx);
  },
});

export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["messages", "votes", "presence", "widgets", "members", "spaces"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    return seedAll(ctx);
  },
});
