import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import App from "./App.tsx";
import { getDataMode } from "./live/dataMode.ts";
import { authClient, ensureGuestSession } from "./lib/authClient.ts";
import { AuthIdentityBridge } from "./live/useAuthIdentity.ts";
import "./index.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
const mode = getDataMode();

// Guests sign in silently before first paint kicks off; the promise is
// fire-and-forget because the canvas must render either way (§1).
if (mode === "live" && url) void ensureGuestSession();

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
    {mode === "live" && url ? (
      <ConvexBetterAuthProvider
        client={convexClient}
        // Better Auth infers a narrower plugin tuple than the provider's
        // AuthClient union; the runtime shape is identical.
        authClient={authClient as unknown as AuthClient}
      >
        <ConvexQueryCacheProvider expiration={600_000}>
          <AuthIdentityBridge />
          <App />
        </ConvexQueryCacheProvider>
      </ConvexBetterAuthProvider>
    ) : mode === "mock" ? (
      <App />
    ) : (
      <MissingConvexConfig />
    )}
  </StrictMode>,
);
