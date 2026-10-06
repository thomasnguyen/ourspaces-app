/* The installed app: "Add to Home Screen" on the kitchen iPad (features/ipad.md).
   A room left open all day has to stay live and stay awake:

   - the screen: a wake lock while the room is on screen (Safari 16.4+, home
     screen apps since iPadOS 18.4); `?wake=0` turns it off. Auto-Lock on the
     iPad still wins if the lock is refused.
   - the line: Convex reconnects by itself, but a socket that died while the
     iPad slept can read "connected" for up to 60 s (its inactivity timer)
     and a backoff can add 16 s more. On wake we hand Convex its own "online"
     signal (reconnect now, no backoff); after a long sleep, or if the line is
     still down a few seconds later, the page reloads in place. The URL keeps
     `?enter=1` (the manifest's start_url), so a reload lands back in the room,
     never on the door.

   Browser tabs run none of this. `?standalone=1` runs it in a tab (headless
   checks). */
import type { ConvexReactClient } from "convex/react";

const LONG_SLEEP_MS = 5 * 60_000;
const SETTLE_MS = 8_000;
const DOWN_RELOAD_MS = 2 * 60_000;
const RELOAD_GAP_MS = 2 * 60_000;
const RELOADED_AT = "ourspaces-standalone-reloaded-at";

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

type WakeLockSentinelish = { released: boolean; release(): Promise<void> };
type WakeLockish = { request(type: "screen"): Promise<WakeLockSentinelish> };

export function watchStandalone(client: ConvexReactClient) {
  const params = new URLSearchParams(window.location.search);
  if (!isStandalone() && params.get("standalone") !== "1") return;
  document.documentElement.dataset.standalone = "1";

  /* ---- the screen stays on ---- */
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockish }).wakeLock;
  let lock: WakeLockSentinelish | null = null;
  const keepAwake = () => {
    if (!wakeLock || params.get("wake") === "0") return;
    if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
    wakeLock.request("screen").then(
      (sentinel) => (lock = sentinel),
      () => {
        /* refused until a tap; the pointerdown below asks again */
      },
    );
  };
  keepAwake();
  window.addEventListener("pointerdown", keepAwake, { capture: true, passive: true });

  /* ---- the line stays live ---- */
  const reload = () => {
    if (!navigator.onLine) return; // offline, a reload is a dead "can't open the page" screen
    const last = Number(window.sessionStorage.getItem(RELOADED_AT) ?? 0);
    if (Date.now() - last < RELOAD_GAP_MS) return;
    window.sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    window.location.reload();
  };
  const connected = () => client.connectionState().isWebSocketConnected;

  let hiddenAt = 0;
  const wake = () => {
    keepAwake();
    const slept = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (slept > LONG_SLEEP_MS) return reload();
    window.dispatchEvent(new Event("online")); // Convex: reconnect now, skip the backoff
    window.setTimeout(() => {
      if (document.visibilityState === "visible" && !connected()) reload();
    }, SETTLE_MS);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else wake();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) wake();
  });

  /* Awake but the line has been down for two minutes (the Wi-Fi blinked, the
     router restarted): one reload. */
  let downSince = 0;
  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (connected()) downSince = 0;
    else if (!downSince) downSince = Date.now();
    else if (Date.now() - downSince > DOWN_RELOAD_MS) reload();
  }, 15_000);
}
