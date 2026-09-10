import { exposeDeploymentQuery } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";

// The static-hosting component keeps a single `deploymentInfo` row, and the
// CLI patches it on every publish. Re-exporting the component's public
// `getCurrentDeployment` here gives the browser something to *subscribe* to:
// the patch invalidates the subscription, so an open tab learns about a new
// build the moment it lands. No polling, no version endpoint.
//
// Why we care: App.tsx code-splits five routes behind React.lazy(), and
// publishDeployment deletes the previous manifest's blobs — so after a
// redeploy a stale tab's lazy import() points at a chunk that 404s. Widget
// data is a typed union that has already needed migrations too. Hence
// src/components/UpdateNudge.tsx, which renders our own pill off
// useDeploymentUpdates() (never the bundled <UpdateBanner/>).
//
// The module MUST stay at convex/staticHosting.ts: the React hook resolves
// makeFunctionReference("staticHosting:getCurrentDeployment") by path.
export const { getCurrentDeployment } = exposeDeploymentQuery(
  components.staticHosting,
);
