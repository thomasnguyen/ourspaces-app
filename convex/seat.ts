import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export type Seat = { userId: string; name: string; color: string };

/**
 * Who is calling, in this room (N1 audit, nebius/eval/n1-new-space.md §6).
 * Every browser is signed in (guests anonymously), so the caller is always
 * their own `members` row: a name or id the client sends is ignored, and a
 * call with no session, or from someone who hasn't entered the room, acts as
 * nobody.
 */
export async function seatOf(ctx: QueryCtx, spaceId: Id<"spaces">): Promise<Seat | null> {
  const authId = await getAuthUserId(ctx);
  if (!authId) return null;
  const row = await ctx.db
    .query("members")
    .withIndex("by_space_user", (q) => q.eq("spaceId", spaceId).eq("userId", authId))
    .first();
  return row ? { userId: row.userId, name: row.name, color: row.color } : null;
}
