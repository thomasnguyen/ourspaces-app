import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { completeJson } from "./ai";
import { ActionRetrier } from "@convex-dev/action-retrier";

// action-retrier: AgentMail send is a real REST call to a third-party API —
// retry transient failures with backoff instead of losing a week's digest
// to one blip.
const retrier = new ActionRetrier(components.actionRetrier, { maxFailures: 2 });

/**
 * The weekly digest: once a week each mail-enabled space writes back.
 * Recipients are everyone who has ever emailed that space's inbox — mailing
 * the space subscribes you to its week.
 */

const SITE = "https://necessary-cobra-892.convex.site";

function bareAddress(from: string): string {
  const angled = from.match(/<([^>]+)>/)?.[1];
  return (angled ?? from).trim().toLowerCase();
}

export const recipients = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.string()),
  handler: async (ctx, { spaceId }) => {
    const events = await ctx.db
      .query("emailEvents")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(200);
    const space = await ctx.db.get(spaceId);
    const own = (space?.inboxAddress ?? "").toLowerCase();
    const seen = new Set<string>();
    for (const event of events) {
      if (event.direction !== "in") continue;
      const address = bareAddress(event.from);
      if (!address.includes("@") || address === own) continue;
      seen.add(address);
    }
    return [...seen].slice(0, 20);
  },
});

async function digestFor(
  ctx: ActionCtx,
  slug: string,
  toOverride?: string[],
): Promise<string> {
  const space = await ctx.runQuery(internal.agentmail.getSpaceBySlug, { slug });
  if (!space) return `${slug}: no space`;
  if (!space.inboxId) return `${slug}: no inbox`;
  const to =
    toOverride && toOverride.length > 0
      ? toOverride
      : await ctx.runQuery(internal.digest.recipients, { spaceId: space._id });
  if (to.length === 0) return `${slug}: no recipients`;

  const snapshot: { space: string; widgets: { summary: string }[] } =
    await ctx.runQuery(internal.recap.snapshot, { spaceId: space._id });

  const generated = await completeJson({
    system: [
      `You write the once-a-week email from "${space.name}", a friend group's shared canvas, to its members.`,
      "Voice: warm, plain, lowercase, like a friend catching you up. No corporate tone, no emoji spam.",
      'Reply with ONLY JSON: {"subject":"<short, lowercase>","lines":["<3-6 short lines, each one thing that happened or is coming up>"]}',
      "Base every line on the board snapshot. Don't invent events.",
    ].join("\n"),
    user: `Board snapshot:\n${JSON.stringify(snapshot.widgets).slice(0, 3500)}`,
    temperature: 0.6,
  });

  const lines =
    Array.isArray(generated?.lines) && generated.lines.length > 0
      ? generated.lines.map((line) => String(line)).slice(0, 6)
      : snapshot.widgets.slice(0, 5).map((widget) => widget.summary);
  const subject = String(generated?.subject ?? `this week in ${space.name}`).slice(0, 80);

  const text = [
    `this week in ${space.name}:`,
    "",
    ...lines.map((line) => `· ${line}`),
    "",
    `open the space → ${SITE}/#/space/${slug}`,
    `reply to this email and it lands on the canvas.`,
  ].join("\n");

  const runId = await retrier.run(ctx, internal.agentmail.sendEmail, {
    spaceId: space._id,
    to,
    subject,
    text,
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await retrier.status(ctx, runId);
    if (status.type === "completed") {
      await retrier.cleanup(ctx, runId);
      if (status.result.type === "success") return `${slug}: sent to ${to.length}`;
      const reason = status.result.type === "failed" ? status.result.error : "canceled";
      return `${slug}: send failed — ${reason.slice(0, 120)}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return `${slug}: send timed out`;
}

/** Cron target: digest every mail-enabled showcase space. */
export const weekly = internalAction({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const results: string[] = [];
    for (const slug of ["crew", "couple", "buildroom"]) {
      try {
        results.push(await digestFor(ctx, slug));
      } catch (error) {
        results.push(`${slug}: ${String(error).slice(0, 120)}`);
      }
    }
    console.log("weekly digest:", results.join(" | "));
    return results;
  },
});

/** Demo trigger: `npx convex run digest:sendNow '{"slug":"crew","to":["you@x.com"]}'` */
export const sendNow = action({
  args: { slug: v.string(), to: v.optional(v.array(v.string())) },
  returns: v.string(),
  handler: async (ctx, { slug, to }): Promise<string> => digestFor(ctx, slug, to),
});
