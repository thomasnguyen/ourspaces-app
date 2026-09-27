import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Minimum staleness before `spaces.lastActivityAt` is allowed to move. Coarse
 * on purpose — this is the write-amplification guard, not a nicety.
 *
 * The `spaces` row is the most expensive document in the app to invalidate.
 * `spaces.getSpaceWithWidgets` (held open by every client in a room) and
 * `spaces.listSpaces` (Home + the space rail — and it reads EVERY space) both
 * return the whole space doc. So one `patch` on it re-runs those subscriptions
 * for every connected client, including people who are not even in that space.
 *
 * A naive `ctx.db.patch(spaceId, { lastActivityAt: Date.now() })` dropped into
 * a hot mutation (a paint stroke, a drag commit, a chat send) would turn one
 * person's stroke into an app-wide fan-out of query re-runs, and would funnel
 * every concurrent writer in the room through OCC contention on a single
 * document.
 *
 * So the timestamp is quantized: at most one write per minute per space, no
 * matter how many people are doing how much in it. "Last activity" renders as
 * relative time ("2m ago"), so a value that can lag by under a minute is
 * indistinguishable from an exact one.
 */
const ACTIVITY_BUMP_MS = 60_000;

/**
 * Mark a space as having had real activity in it (see `ACTIVITY_BUMP_MS` for
 * why this is throttled rather than a plain patch).
 *
 * Takes `MutationCtx`, never `QueryCtx`: clock reads and writes belong in
 * mutations and actions (see the note on `getLiveCounts` in `convex/stats.ts`),
 * and typing it this way makes calling it from a query a compile error.
 *
 * Pass `now` when the caller already read the clock so a transaction only ever
 * reads it once and `createdAt`/`lastActivityAt` agree exactly.
 */
export async function touchSpace(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  now: number = Date.now(),
): Promise<void> {
  const space = await ctx.db.get(spaceId);
  // One point read, then usually nothing. Bailing out here is what keeps the
  // cost down: no patch, no subscription invalidation, and no write conflict
  // for everyone else editing this room in the same minute. The `<` also means
  // a clock that goes backwards can never drag the timestamp backwards.
  if (!space || now - space.lastActivityAt < ACTIVITY_BUMP_MS) return;
  await ctx.db.patch(spaceId, { lastActivityAt: now });
}
