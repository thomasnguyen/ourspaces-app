import { useEffect, useState, type CSSProperties } from "react";
import "./labs.css";
import "./outro.css";
import { SPACES } from "../data/spaces";

/**
 * Outro — the sign-off end card for the demo video (2:44–2:59, 15s).
 * Hash route: /?mock=1#/outro   (add &rec=1 to hide the pill)
 *
 * Every beat is a CSS keyframe on an absolute delay (outro.css, `--t-*`),
 * timed to the three lines: "I'm Thomas. I built this with my wife, Holly.
 * She designed the whole thing." / "It's our entry for the Convex hackathon,
 * and we're really happy with it. It's live, there's no signup, so go put
 * something on the space." / "Bring cake."
 * Capture from a static build, not the dev server (another session saving a file
 * hot-reloads the capture page and restarts every animation mid-take):
 *   npm run build && npx vite preview --port 4179 --strictPort &
 *   node .context/web-video/record.mjs --url "http://localhost:4179/?mock=1&rec=1#/outro"
 *        --frames 900 --w 1920 --h 1080 --dsf 2 --port 9379 --ready .outro-url
 */

const STAGE = { w: 1920, h: 1080 };

/* the five spaces, wall colour by theme token (the data `color` is the accent) */
const WALLS: Record<string, string> = {
  "the crew": "var(--color-crew)",
  "us two": "var(--color-couple)",
  "the build room": "var(--color-buildroom)",
  "the house": "var(--color-trip)",
  "game day": "var(--color-league)",
};
const TILTS = ["-3deg", "2deg", "-2deg", "3deg", "-1deg"];

export function Outro() {
  const rec = new URLSearchParams(window.location.search).get("rec") === "1";
  const [take, setTake] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const spaces = SPACES.filter((space) => space.name in WALLS);

  return (
    <main className="outro">
      <div className="outro-stage" key={take} style={{ "--s": scale } as CSSProperties}>
        <div className="outro-logo">
          <i><img src="/assets/ourspace-mark.png" alt="" /></i>
          <b>ourspaces</b>
        </div>

        <div className="outro-pill is-thomas">built by Thomas</div>
        <div className="outro-pill is-holly">designed by Holly</div>
        <div className="outro-hack">our entry · Convex All Gas hackathon</div>
        <h1 className="outro-url">ourspaces<span>.io</span></h1>
        <div className="outro-pill is-live">live now<small>no signup</small></div>

        {spaces.map((space, i) => (
          <div
            key={space.id}
            className="outro-card"
            style={{ "--i": i, "--c": WALLS[space.name], "--tilt": TILTS[i] } as CSSProperties}
          >
            <b>{space.name}</b>
            <i>{space.icon}</i>
          </div>
        ))}

        <div className="outro-cake">bring cake.</div>

        <div className="outro-cursor" style={{ "--c": "var(--color-crew)", "--path": "outro-cursor-a" } as CSSProperties}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2 L20 12 L12 13 L9 21 Z" /></svg>
          <span>thomas</span>
        </div>
        <div className="outro-cursor" style={{ "--c": "var(--color-couple)", "--path": "outro-cursor-b" } as CSSProperties}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2 L20 12 L12 13 L9 21 Z" /></svg>
          <span>holly</span>
        </div>
      </div>

      {rec ? null : (
        <div className="arrival-lab-bar outro-lab-bar">
          <span className="arrival-lab-kicker">outro</span>
          <button type="button" className="is-main" onClick={() => setTake((n) => n + 1)}>replay</button>
          <i aria-hidden="true" />
          <a href="#/space/crew">← the crew</a>
        </div>
      )}
    </main>
  );
}
