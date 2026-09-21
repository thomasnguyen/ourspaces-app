import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every 5 minutes, not every minute: this sweep is pure housekeeping — the
// client filters cursors at a 30s TTL and getHereNow reads the fresh range, so
// nothing user-facing waits on it. At 1/min it was ~43k function calls a month
// PER deployment, dev and prod, running whether or not anyone had the app open.
crons.interval("clean stale presence", { minutes: 5 }, internal.presence.cleanup);

// Friday 16:00 UTC — each space emails its week to everyone who wrote to it.
crons.cron("weekly digest", "0 16 * * 5", internal.digest.weekly, {});

// Daily 15:00 UTC — bounded via the recap workpool (maxParallelism 3).
crons.cron("catch me up", "0 15 * * *", internal.recap.generateAll, {});

// 07:00 UTC = midnight Pacific — every room back to its baseline. Rooms are
// public and unlocked on purpose, so a day of visitors leaves scribble, spam
// and dragged-off widgets behind; morning starts on the board we meant to
// show. Rooms without a saved baseline are skipped, never wiped. Members, the
// AgentMail inbox and ownership are never touched (docs/local/admin-reset.md).
crons.cron("nightly room reset", "0 7 * * *", internal.admin.nightlyReset, {});

// Friday 17:00 UTC — enqueue stale linkCards for the batch-worker to refresh.
crons.cron("refresh stale links", "0 17 * * 5", internal.batch.enqueueStaleLinkRefresh, {});

export default crons;
