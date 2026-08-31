/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agentmail from "../agentmail.js";
import type * as ai from "../ai.js";
import type * as batch from "../batch.js";
import type * as crons from "../crons.js";
import type * as digest from "../digest.js";
import type * as firecrawl from "../firecrawl.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as paint from "../paint.js";
import type * as photos from "../photos.js";
import type * as presence from "../presence.js";
import type * as questions from "../questions.js";
import type * as rag from "../rag.js";
import type * as rateLimits from "../rateLimits.js";
import type * as recap from "../recap.js";
import type * as roomPresence from "../roomPresence.js";
import type * as seed from "../seed.js";
import type * as spaces from "../spaces.js";
import type * as stats from "../stats.js";
import type * as streaming from "../streaming.js";
import type * as votes from "../votes.js";
import type * as widgetData from "../widgetData.js";
import type * as widgets from "../widgets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agentmail: typeof agentmail;
  ai: typeof ai;
  batch: typeof batch;
  crons: typeof crons;
  digest: typeof digest;
  firecrawl: typeof firecrawl;
  http: typeof http;
  inbox: typeof inbox;
  messages: typeof messages;
  migrations: typeof migrations;
  paint: typeof paint;
  photos: typeof photos;
  presence: typeof presence;
  questions: typeof questions;
  rag: typeof rag;
  rateLimits: typeof rateLimits;
  recap: typeof recap;
  roomPresence: typeof roomPresence;
  seed: typeof seed;
  spaces: typeof spaces;
  stats: typeof stats;
  streaming: typeof streaming;
  votes: typeof votes;
  widgetData: typeof widgetData;
  widgets: typeof widgets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  pollTallies: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"pollTallies">;
  memberCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"memberCounts">;
  shardedCounter: import("@convex-dev/sharded-counter/_generated/component.js").ComponentApi<"shardedCounter">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  batchWorker: import("@convex-dev/batch-worker/_generated/component.js").ComponentApi<"batchWorker">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  persistentTextStreaming: import("@convex-dev/persistent-text-streaming/_generated/component.js").ComponentApi<"persistentTextStreaming">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  prosemirrorSync: import("@convex-dev/prosemirror-sync/_generated/component.js").ComponentApi<"prosemirrorSync">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
