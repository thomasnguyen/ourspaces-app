import { useEffect, useState, type CSSProperties } from "react";
import "./labs.css";
import "./mailReel.css";

/**
 * Mail reel — six seconds for the 2:20 beat of the demo video: two envelopes
 * come in through the crew's address, the reply goes back out to her thread.
 * Hash route: /?mock=1#/bothways   (add &rec=1 to hide the pill)
 *
 * No Convex, no timers: every move is a CSS keyframe on an absolute delay
 * (mailReel.css, the `--t-*` block), so the frame recorder pins it exactly.
 * Capture: node .context/web-video/record.mjs --url "http://localhost:5173/?mock=1&rec=1#/bothways"
 *          --frames 360 --w 1920 --h 1080 --dsf 2 --port 9377 --ready .reel-title
 */

const STAGE = { w: 1920, h: 1080 };

const at = (x: number, y: number) => ({ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties);

function Envelope({ rise, go, land, from, subject }: { rise: string; go: string; land: string; from: string; subject: string }) {
  return (
    <div className="reel-env" style={{ "--rise": rise, "--go": go, "--land": land } as CSSProperties}>
      <svg viewBox="0 0 430 262" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 L215 141 L430 0" />
      </svg>
      <i><img src="/assets/ourspace-mark.png" alt="" /></i>
      <small>{from}</small>
      <b>{subject}</b>
    </div>
  );
}

export function MailReel() {
  const rec = new URLSearchParams(window.location.search).get("rec") === "1";
  const [take, setTake] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <main className="reel">
      <div className="reel-stage" key={take} style={{ "--s": scale } as CSSProperties}>
        <div className="reel-logo">
          <i><img src="/assets/ourspace-mark.png" alt="" /></i>
          <b>ourspaces</b>
        </div>

        <div className="reel-kicker"><i />the crew<small>6 here</small></div>

        {/* the address, dead centre */}
        <div className="reel-at" style={at(960, 570)}>
          <div className="reel-sticker">
            <em>✉</em>ourspaces@agentmail.to
            <span className="reel-pill">AGENTMAIL</span>
          </div>
        </div>

        {/* the reply leaves from behind the sticker */}
        <div className="reel-at" style={at(960, 570)}>
          <div className="reel-reply"><span>↩</span>reply · $21 each</div>
        </div>

        {/* two letters, same doorstep, one after the other */}
        <div className="reel-at" style={at(370, 320)}>
          <Envelope rise="var(--t-env1)" go="var(--t-fly1)" land="var(--t-land1)" from="from holly · forwarded" subject="receipt · matcha cake · $126" />
        </div>
        <div className="reel-at" style={at(370, 320)}>
          <Envelope rise="var(--t-env2)" go="var(--t-fly2)" land="var(--t-land2)" from="from thomas · across the room" subject="a letter" />
        </div>

        {/* what it made of them */}
        <div className="reel-at" style={at(960, 710)}>
          <div className="reel-slip" style={{ "--in": "calc(var(--t-land1) + 150ms)", "--tilt": "-1.5deg" } as CSSProperties}>
            <span>because:</span>a receipt · split 6 ways
          </div>
        </div>
        <div className="reel-at" style={at(960, 795)}>
          <div className="reel-slip" style={{ "--in": "calc(var(--t-land2) + 150ms)", "--tilt": "1deg" } as CSSProperties}>
            <span>because:</span>a letter · on the board
          </div>
        </div>

        {/* lane labels: "in" on the empty doorstep once both letters have gone,
            "out" above her thread as the reply leaves */}
        <div className="reel-at" style={at(370, 320)}>
          <div className="reel-lane" style={{ "--in": "calc(var(--t-land2) - 370ms)" } as CSSProperties}>in →</div>
        </div>
        <div className="reel-at" style={at(1640, 622)}>
          <div className="reel-lane" style={{ "--in": "calc(var(--t-reply) + 420ms)" } as CSSProperties}>out →</div>
        </div>

        {/* her thread, where the reply lands */}
        <div className="reel-at" style={at(1580, 850)}>
          <div className="reel-card">
            <header><b>H</b>Holly<small>her thread</small></header>
            <p>wait, how much do I owe for the cake?</p>
            <div className="reel-slot" />
            <footer>✓ sent · same address</footer>
          </div>
        </div>

        <h1 className="reel-title">mail<span>,</span> both ways</h1>
      </div>

      {rec ? null : (
        <div className="arrival-lab-bar reel-lab-bar">
          <span className="arrival-lab-kicker">mail reel</span>
          <button type="button" className="is-main" onClick={() => setTake((n) => n + 1)}>replay</button>
          <i aria-hidden="true" />
          <a href="#/space/crew">← the crew</a>
        </div>
      )}
    </main>
  );
}
