import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("clear stale cursors", { minutes: 1 }, internal.presence.clearStale, {});
export default crons;
