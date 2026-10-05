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
import { DemoBanner } from "./components/DemoBanner.tsx";
import { api } from "../convex/_generated/api";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoBanner onJoinWaitlist={mode === "live" && url
      ? (email) => convexClient.mutation(api.waitlist.join, { email })
      : undefined} />
    {mode === "live" && url ? (
      // Guests sign in silently from AuthIdentityBridge once this provider
      // settles; the canvas renders either way (§1).
      <ConvexAuthProvider client={convexClient}>
        <ConvexQueryCacheProvider expiration={600_000}>
          <AuthIdentityBridge />
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
