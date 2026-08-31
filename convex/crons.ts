import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("clean stale presence", { minutes: 1 }, internal.presence.cleanup);

// Friday 16:00 UTC — each space emails its week to everyone who wrote to it.
crons.cron("weekly digest", "0 16 * * 5", internal.digest.weekly, {});

// Daily 15:00 UTC — bounded via the recap workpool (maxParallelism 3).
crons.cron("catch me up", "0 15 * * *", internal.recap.generateAll, {});

// Friday 17:00 UTC — enqueue stale linkCards for the batch-worker to refresh.
crons.cron("refresh stale links", "0 17 * * 5", internal.batch.enqueueStaleLinkRefresh, {});

export default crons;
