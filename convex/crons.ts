import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("clean stale presence", { minutes: 1 }, internal.presence.cleanup);

export default crons;
