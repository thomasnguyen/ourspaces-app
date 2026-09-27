/**
 * The promote/keep climax: a card leaves an overlay and physically travels to
 * where it landed on the canvas, instead of cross-fading. Measure the source
 * rect before the overlay closes, wait for the new widget to arrive over the
 * Convex subscription, then animate the delta with WAAPI.
 */

const SNAP = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";

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

/**
 * The mail arrival's filing flight (docs/mail-arrival.md): the envelope
 * leaves the mail slot and physically travels to the widget it filed into,
 * shrinking as it goes, and the widget takes a lime wash on impact. Same
 * move as the takeaway flight above, from the other direction. Resolves
 * true once it landed (false if the widget never showed up).
 */
export async function flyEnvelopeTo(envelope: HTMLElement, widgetId: string, scale = 1) {
  const target = await waitForWidget(widgetId, 4000);
  if (!target) return false;
  const wash = () => {
    // a hidden letter target shows itself under the landing (MailArrival)
    target.classList.remove("is-mail-incoming");
    target.classList.add("is-mail-washed");
    window.setTimeout(() => target.classList.remove("is-mail-washed"), 1400 * scale);
  };
  if (reduceMotion()) {
    wash();
    return true;
  }
  const from = envelope.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) {
    wash();
    return true;
  }
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const shrink = Math.min(0.6, Math.max(0.28, (to.width * 0.55) / from.width));
  const duration = 1000 * scale;

  /* Per-segment easing: the house curves are all ease-outs, so a throw is
     built from pieces — a lift, a carry that covers most of the distance,
     then the snap into the impact squash. One curve over the whole flight
     put 80% of the travel in the first 150ms and the eye lost it. */
  const flight = envelope.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 0, easing: GLIDE },
      {
        transform: `translate(${dx * 0.06}px, -34px) scale(0.97) rotate(-5deg)`,
        opacity: 1,
        offset: 0.2,
        easing: GLIDE,
      },
      {
        transform: `translate(${dx * 0.42}px, ${dy * 0.3 - 44}px) scale(0.8) rotate(-9deg)`,
        opacity: 1,
        offset: 0.5,
        easing: GLIDE,
      },
      /* impact — the squash sells the landing */
      {
        transform: `translate(${dx}px, ${dy}px) scale(${shrink * 1.1}, ${shrink * 0.9}) rotate(0deg)`,
        opacity: 1,
        offset: 0.84,
        easing: SNAP,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${shrink})`, opacity: 0, offset: 1 },
    ],
    { duration, easing: "linear", fill: "forwards" },
  );
  window.setTimeout(wash, duration * 0.84);
  try {
    await flight.finished;
  } catch {
    // cancelled (the envelope unmounted mid-flight) — nothing to land
  }
  return true;
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
