import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export type Seat = { userId: string; name: string; color: string; emoji?: string; avatarUrl?: string };

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
  return row ? { userId: row.userId, name: row.name, color: row.color, emoji: row.emoji, avatarUrl: row.avatarUrl } : null;
}

/**
 * The caller's seat, or the room's maker before they've walked in: a made
 * room's starter cards are written before its maker passes the gate
 * (src/live/useCreateSpace.ts). Card writes use this (S3 audit,
 * nebius/eval/s3-audit.md).
 */
export async function seatOrMaker(ctx: QueryCtx, spaceId: Id<"spaces">): Promise<Seat | null> {
  const seat = await seatOf(ctx, spaceId);
  if (seat) return seat;
  const authId = await getAuthUserId(ctx);
  if (!authId) return null;
  const space = await ctx.db.get(spaceId);
  if (!space?.ownerId || space.ownerId !== authId) return null;
  const user = await ctx.db.get(authId);
  return { userId: authId, name: user?.name ?? "", color: user?.color ?? "" };
}

/** Same, but a write with no seat is refused out loud (a stranger's script, never a member's screen). */
export async function requireSeat(ctx: QueryCtx, spaceId: Id<"spaces">): Promise<Seat> {
  const seat = await seatOrMaker(ctx, spaceId);
  if (!seat) throw new ConvexError("not in this room");
  return seat;
}

/**
 * May the caller see this room's content: anyone for the tour (rooms nobody
 * made are the demo), a seat or the maker for a made room. A made room's id
 * or slug alone is not enough to read its chat, mail or brief.
 */
export async function canRead(ctx: QueryCtx, spaceId: Id<"spaces">): Promise<boolean> {
  const space = await ctx.db.get(spaceId);
  if (!space) return false;
  if (!space.ownerId) return true;
  return (await seatOrMaker(ctx, spaceId)) !== null;
}
