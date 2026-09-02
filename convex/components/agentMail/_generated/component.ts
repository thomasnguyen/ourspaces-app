/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      addLabels: FunctionReference<
        "action",
        "internal",
        {
          addLabels: Array<string>;
          apiKey: string;
          baseUrl: string;
          inboxId: string;
          messageId: string;
          removeLabels?: Array<string>;
        },
        null,
        Name
      >;
      createInbox: FunctionReference<
        "action",
        "internal",
        {
          apiKey: string;
          baseUrl: string;
          clientId?: string;
          displayName?: string;
          username: string;
        },
        { address: string; inboxId: string },
        Name
      >;
      ingestWebhook: FunctionReference<
        "mutation",
        "internal",
        {
          eventId: string;
          from: string;
          inboxId: string;
          labels?: Array<string>;
          messageId: string;
          subject: string;
          text: string;
          threadId?: string;
          to: string;
        },
        { isNew: boolean },
        Name
      >;
      listInbound: FunctionReference<
        "query",
        "internal",
        { inboxId: string; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          from: string;
          inboxId: string;
          labels: Array<string>;
          messageId: string;
          receivedAt: number;
          subject: string;
          text: string;
          threadId?: string;
          to: string;
        }>,
        Name
      >;
      replyToMessage: FunctionReference<
        "action",
        "internal",
        {
          apiKey: string;
          baseUrl: string;
          html?: string;
          inboxId: string;
          labels?: Array<string>;
          messageId: string;
          replyAll?: boolean;
          text: string;
        },
        { messageId: string },
        Name
      >;
      sendMessage: FunctionReference<
        "action",
        "internal",
        {
          apiKey: string;
          baseUrl: string;
          html?: string;
          inboxId: string;
          labels?: Array<string>;
          subject: string;
          text: string;
          to: Array<string>;
        },
        { messageId: string },
        Name
      >;
    };
  };
