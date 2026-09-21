import { useEffect, useMemo, useState, type CSSProperties } from "react";
import "./labs.css";
import { COZY_BOARDS, strokePrefix } from "../widgets/cozyColorBoards";

/**
 * Coloring lab — two people on the same postcard, an ocean apart, on one
 * screen. Hash route: /?mock=1#/color   (add &rec=1 to hide the bar)
 *
 * Both panes are the real app in mock mode, so nothing touches Convex: the
 * couple space with the coloring room already open. They talk over a
 * BroadcastChannel (CozyColorWidget, `?sync=`), so a tap on the phone fills
 * the laptop, and each side shows the other's cursor.
 * `?left=thomas&right=holly` picks who sits where.
 */

const LAPTOP = { w: 1280, h: 800 };
const PHONE = { w: 390, h: 844 };
const PHONE_STATUS_BAR = 54;
const COLORS: Record<string, string> = {
  thomas: "var(--color-crew)",
  holly: "var(--color-couple)",
};

/* `?door=1`: the laptop starts on the space with the door widget in view, so a
   take can show the click that opens the room; the phone is already inside. */
function frameUrl(as: string, atDoor = false) {
  const { origin, pathname } = window.location;
  const room = atDoor ? "" : "&room=us-color";
  return `${origin}${pathname}?mock=1&sync=color&as=${encodeURIComponent(as)}${room}#/space/couple`;
}

export function ColorLab() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const rec = params.get("rec") === "1";
  const door = params.get("door") === "1";
  const [left, setLeft] = useState(params.get("left") ?? "thomas");
  const [right, setRight] = useState(params.get("right") ?? "holly");
  const [generation, setGeneration] = useState(0);
  const [fit, setFit] = useState({ laptop: 0.8, phone: 0.9 });
  // both frames have fired load — the recorder waits on `.color-lab[data-ready]`
  const [loaded, setLoaded] = useState(0);
  const onFrameLoad = () => setLoaded((value) => value + 1);

  /* Both devices are rendered at their real CSS size and scaled to the
     window, so the app inside lays out exactly as it would on that device. */
  useEffect(() => {
    const measure = () => {
      const pad = 56;
      const gap = 64;
      const tag = 72;
      const h = window.innerHeight - pad * 2 - tag;
      const phone = Math.min(h / PHONE.h, 1.05);
      const laptop = Math.min(
        h / LAPTOP.h,
        (window.innerWidth - pad * 2 - gap - PHONE.w * phone - 22) / (LAPTOP.w + 16),
      );
      setFit({ laptop, phone });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const channel = useMemo(() => new BroadcastChannel("cozy-lab:color"), []);
  const reset = () => channel.postMessage({ kind: "clear", prefix: strokePrefix(COZY_BOARDS[0]) });
  const swap = () => {
    setLeft(right);
    setRight(left);
    setGeneration((value) => value + 1);
  };
  const reload = () => setGeneration((value) => value + 1);

  return (
    <main
      className="color-lab"
      data-ready={loaded >= 2 ? "" : undefined}
      style={{ "--laptop-s": fit.laptop, "--phone-s": fit.phone } as CSSProperties}
    >
      <section className="color-lab-device is-laptop" style={{ "--who": COLORS[left] } as CSSProperties}>
        <div className="color-lab-laptop">
          <div className="color-lab-laptop-bar">
            <i /><i /><i />
            <span>us two · ourspaces</span>
          </div>
          <div className="color-lab-screen">
            <iframe
              key={`${left}-${generation}`}
              src={frameUrl(left, door)}
              onLoad={onFrameLoad}
              title={left}
              width={LAPTOP.w}
              height={LAPTOP.h}
            />
          </div>
        </div>
        <footer className="color-lab-tag"><b /><span>{left}</span><em>laptop</em></footer>
      </section>

      <section className="color-lab-device is-phone" style={{ "--who": COLORS[right] } as CSSProperties}>
        <div className="color-lab-phone">
          <i className="color-lab-notch" />
          <div className="color-lab-screen">
            <iframe
              key={`${right}-${generation}`}
              src={frameUrl(right)}
              onLoad={onFrameLoad}
              title={right}
              width={PHONE.w}
              height={PHONE.h - PHONE_STATUS_BAR}
            />
          </div>
        </div>
        <footer className="color-lab-tag"><b /><span>{right}</span><em>phone</em></footer>
      </section>

      {rec ? null : (
        <div className="arrival-lab-bar color-lab-bar">
          <span className="arrival-lab-kicker">coloring lab</span>
          <button type="button" className="is-main" onClick={reset}>reset both</button>
          <button type="button" onClick={swap}>swap sides</button>
          <button type="button" onClick={reload}>reload</button>
          <i aria-hidden="true" />
          <a href="#/space/couple">← us two</a>
        </div>
      )}
    </main>
  );
}
