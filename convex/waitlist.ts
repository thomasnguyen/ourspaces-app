import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

export const join = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }

    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!existing) await ctx.db.insert("waitlist", { email });
    // Same response for new and existing entries; never expose the list.
    return null;
  },
});

// Owner-only maintenance through the dashboard/CLI, never the public app.
export const remove = internalMutation({
  args: { id: v.id("waitlist") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete("waitlist", id);
    return null;
  },
});
