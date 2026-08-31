import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("clean stale presence", { minutes: 1 }, internal.presence.cleanup);

// Friday 16:00 UTC — each space emails its week to everyone who wrote to it.
crons.cron("weekly digest", "0 16 * * 5", internal.digest.weekly, {});

// Paused until closer to the hackathon deadline — re-enable generateAll then.
// crons.daily("catch me up", { hourUTC: 15, minuteUTC: 0 }, internal.recap.generateAll);

export default crons;
