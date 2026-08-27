import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import App from "./App.tsx";
import { getDataMode } from "./live/dataMode.ts";
import "./index.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
const mode = getDataMode();

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
      <ConvexProvider client={new ConvexReactClient(url)}>
        <ConvexQueryCacheProvider expiration={600_000}>
          <App />
        </ConvexQueryCacheProvider>
      </ConvexProvider>
    ) : mode === "mock" ? (
      <App />
    ) : (
      <MissingConvexConfig />
    )}
  </StrictMode>,
);
