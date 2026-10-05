import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * The one door. Every change the AI makes to the board passes through
 * `rightOfWay` before it is committed: a voice edit and its undo
 * (edits.ts), a link filling its target (links.ts `writeLinked`), a card the
 * voice build writes (voiceBuild.ts `commit`). It gets the write (who asked,
 * which card, which fields, old and new values) and answers:
 *
 *   go    commit it
 *   wait  someone is holding the card (a drag, typing, an unsent vote): the
 *         change waits as a ghost and lands when they let go        (R1)
 *   ask   it would override a choice a person made: it becomes a vote (R2)
 *
 * R0 (today): no leases or choices are read yet, so it always says go. It
 * logs every write as an `aiWrites` row (the ledger R3 counts from). The
 * edits that would destroy people's choices are refused before they get
 * here (lib/deck/edits.ts `applyEdit`), and logged as "refused".
 */

export type AiWrite = {
  kind: "edit" | "undo" | "link" | "build";
  spaceId: Id<"spaces">;
  widgetId?: Id<"widgets">;
  /** Who asked: a person's name, or "link" for a link resolving. */
  by: { name: string; userId?: string };
  fields: { field: string; old: unknown; new: unknown }[];
  /** The slip line ("added ramen") and the inverse op for undo, for edits. */
  text?: string;
  undo?: unknown;
};
export type Verdict = "go" | "wait" | "ask";

const cut = (x: unknown) => {
  const s = JSON.stringify(x ?? null);
  return s.length > 240 ? `${s.slice(0, 237)}…` : s;
};

export async function rightOfWay(ctx: MutationCtx, write: AiWrite): Promise<{ verdict: Verdict; reason: string; writeId: Id<"aiWrites"> }> {
  const verdict: Verdict = "go";
  const reason = "R0: leases and choices are not read yet";
  const writeId = await log(ctx, write, verdict, reason);
  console.log(`rightOfWay ${write.kind} ${write.widgetId ?? "new"} by ${write.by.name}: ${write.fields.map((f) => f.field).join(",")} → ${verdict}`);
  return { verdict, reason, writeId };
}

/** One ledger row (also used for a refusal that never reached the door). */
export async function log(ctx: MutationCtx, write: AiWrite, verdict: string, reason?: string) {
  return await ctx.db.insert("aiWrites", {
    spaceId: write.spaceId,
    ...(write.widgetId ? { widgetId: write.widgetId } : {}),
    kind: write.kind,
    by: write.by.name,
    ...(write.by.userId ? { byUserId: write.by.userId } : {}),
    fields: JSON.stringify(write.fields.map((f) => ({ field: f.field, old: cut(f.old), new: cut(f.new) }))),
    verdict,
    ...(reason ? { reason } : {}),
    ...(write.text ? { text: write.text } : {}),
    ...(write.undo ? { undo: JSON.stringify(write.undo) } : {}),
    at: Date.now(),
  });
}
