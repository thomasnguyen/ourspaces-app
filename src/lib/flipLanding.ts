/**
 * The promote/keep climax: a card leaves an overlay and physically travels to
 * where it landed on the canvas, instead of cross-fading. Measure the source
 * rect before the overlay closes, wait for the new widget to arrive over the
 * Convex subscription, then animate the delta with WAAPI.
 */

const SNAP = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function waitForWidget(widgetId: string, timeoutMs = 2500) {
  return new Promise<HTMLElement | null>((resolve) => {
    const deadline = performance.now() + timeoutMs;
    const look = () => {
      const found = Array.from(
        document.querySelectorAll<HTMLElement>(".widget-group[data-widget-id]"),
      ).find((element) => element.dataset.widgetId === widgetId);
      if (found) return resolve(found);
      if (performance.now() > deadline) return resolve(null);
      window.requestAnimationFrame(look);
    };
    look();
  });
}

/** Fly a just-created widget in from `from`, landing with a squash on `snap`. */
export async function flyWidgetIn(widgetId: string, from: DOMRect | null) {
  if (!from || reduceMotion()) return;
  const element = await waitForWidget(widgetId);
  if (!element) return;
  const to = element.getBoundingClientRect();
  if (to.width === 0 || to.height === 0) return;

  const dx = from.x + from.width / 2 - (to.x + to.width / 2);
  const dy = from.y + from.height / 2 - (to.y + to.height / 2);
  const scale = Math.min(2.4, Math.max(0.3, from.width / to.width));

  element.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-4deg)`,
        opacity: 0.2,
        offset: 0,
      },
      { opacity: 1, offset: 0.35 },
      /* impact — the squash sells the landing */
      { transform: "translate(0, 0) scale(1.08, 0.92)", offset: 0.82 },
      { transform: "translate(0, 0) scale(1)", offset: 1 },
    ],
    { duration: 900, easing: SNAP, fill: "backwards" },
  );
}
