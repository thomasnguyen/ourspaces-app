import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
// the family board's layout; not imported from src/data/family.ts, which the Convex seed bundles
import "./data/family.css";
import App from "./App.tsx";
import { getDataMode } from "./live/dataMode.ts";
import { AuthIdentityBridge } from "./live/useAuthIdentity.ts";
import { UpdateNudge } from "./components/UpdateNudge.tsx";
import { DemoBanner, MAKE_SPACE_EVENT } from "./components/DemoBanner.tsx";
import { api } from "../convex/_generated/api";
import { useQuery } from "convex/react";
import "./index.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
const mode = getDataMode();

const convexClient = url ? new ConvexReactClient(url) : null!;

function MissingConvexConfig() {
  return (
    <main className="convex-config-missing" data-data-mode="missing">
      <div>
        <span aria-hidden="true">✦</span>
        <strong>Convex isn’t connected</strong>
        <p>
          Copy <code>.env.local.example</code> to <code>.env.local</code>, then
          run <code>npm run dev:backend</code> and <code>npm run dev</code>.
        </p>
        <small>
          Need the visual-only prototype? Add <code>?mock=1</code>.
        </small>
      </div>
    </main>
  );
}

/* The dev lane is known from the URL before the query answers, so its first
   paint already says "make your own" (keep in step with convex/spaces.ts
   `OPEN_ROOM_DEPLOYMENTS`). Anywhere else the strip waits for the answer. */
const OPEN_LANE = /dusty-condor-648/.test(url ?? "");

/** Live: the banner asks the deployment whether rooms are open (by lane, convex/spaces.ts `roomsOpen`). */
function LiveDemoBanner() {
  const open = useQuery(api.spaces.roomsOpen, {}) ?? (OPEN_LANE || undefined);
  return (
    <DemoBanner
      onJoinWaitlist={(email) => convexClient.mutation(api.waitlist.join, { email })}
      onMakeSpace={open ? () => window.dispatchEvent(new Event(MAKE_SPACE_EVENT)) : undefined}
      pending={open === undefined}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {mode !== "live" || !url ? <DemoBanner /> : null}
    {mode === "live" && url ? (
      // Guests sign in silently from AuthIdentityBridge once this provider
      // settles; the canvas renders either way (§1).
      <ConvexAuthProvider client={convexClient}>
        <ConvexQueryCacheProvider expiration={600_000}>
          <AuthIdentityBridge />
          <LiveDemoBanner />
          <App />
          {/* Live path only. UpdateNudge subscribes to the static-hosting
              component's deployment row, and that hook needs a Convex client
              in context — the mock branch below renders a bare <App/> with no
              provider, so mounting it there would throw. */}
          <UpdateNudge />
        </ConvexQueryCacheProvider>
      </ConvexAuthProvider>
    ) : mode === "mock" ? (
      <App />
    ) : (
      <MissingConvexConfig />
    )}
  </StrictMode>,
);
