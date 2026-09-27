import { useEffect, useRef, useState } from "react";
import { useDeploymentUpdates } from "@convex-dev/static-hosting/react";
import "./update-nudge.css";

/**
 * "new version shipped · refresh" — the deploy-update nudge.
 *
 * `@convex-dev/static-hosting` keeps one `deploymentInfo` row and the publish
 * CLI patches it, so the subscription behind `useDeploymentUpdates()` fires
 * the instant a new build lands. No polling. The app-side query it resolves
 * lives at `convex/staticHosting.ts` (path-sensitive — the hook looks up
 * `staticHosting:getCurrentDeployment`).
 *
 * People park a canvas open for hours, and a stale tab is genuinely broken
 * after a redeploy: App.tsx lazy-loads five routes, and publishing deletes the
 * previous manifest's blobs, so those content-hashed chunks 404. This is the
 * ask-first version of a forced reload.
 *
 * Deliberately NOT the bundled `<UpdateBanner/>` — its inline styles are an
 * off-palette dark pill at z-index 9999.
 *
 * Only mount this under the live `ConvexProvider` tree: the hook calls
 * `useQuery_experimental`, which throws without a Convex client in context.
 * See `src/main.tsx` — mock mode renders a bare `<App/>`.
 */
export function UpdateNudge() {
  const { updateAvailable, reload, dismiss, deployment, setupError } =
    useDeploymentUpdates();

  // Scoped to a deployment id so a *newer* build re-opens the nudge on its own
  // — no effect needed to clear the flag, and no leaving frame on re-entry.
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const leaveTimer = useRef(0);
  const warned = useRef(false);

  useEffect(() => {
    if (!setupError || warned.current || !import.meta.env.DEV) return;
    warned.current = true;
    console.warn(setupError);
  }, [setupError]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  if (!updateAvailable || !deployment) return null;

  const leaving = leavingId === deployment.currentDeploymentId;

  const close = () => {
    if (leaving) return;
    setLeavingId(deployment.currentDeploymentId);
    // Let the pill peel off before the hook drops it from the tree.
    leaveTimer.current = window.setTimeout(dismiss, 180);
  };

  return (
    <div className="update-nudge-slot">
      <div
        className={`update-nudge${leaving ? " is-leaving" : ""}`}
        role="status"
      >
        <span className="update-nudge-dot" aria-hidden="true" />
        <span className="update-nudge-copy">new version shipped</span>
        <button type="button" className="update-nudge-go" onClick={reload}>
          refresh
        </button>
        <button
          type="button"
          className="update-nudge-x"
          onClick={close}
          aria-label="Dismiss update notice"
        >
          ×
        </button>
      </div>
    </div>
  );
}
