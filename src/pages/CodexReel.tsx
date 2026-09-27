import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import "./labs.css";
import "./codexReel.css";

/**
 * Codex reel — ten seconds for the 2:27 beat of the demo video: "Codex wrote
 * every line. But it wasn't one prompt and done. It was twenty-six days of the
 * two of us going 'softer,' 'slower,' 'the envelope should land, not drop,'
 * until it all felt right."
 *
 * A board of agent threads, drawn like widgets on a space. Two of them carry
 * the scripted back-and-forth (the camera pushes onto each in post,
 * .context/web-video/codex-wrap.sh); the small ones around them are real
 * prompts from this repo's Codex sessions, verbatim.
 *
 * Hash route: /?mock=1#/codex   (add &rec=1 to hide the lab bar)
 * The two big threads are anchored at their top edge, so they grow downward
 * as the nags land; the camera tilts down with them (codex-wrap.sh).
 * No Convex, no timers: every move is a CSS keyframe on an absolute delay
 * (codexReel.css, the `--t-*` block), so the frame recorder pins it exactly.
 * Capture: node .context/web-video/record.mjs --url "http://localhost:5173/?mock=1&rec=1#/codex"
 *          --frames 660 --w 1920 --h 1080 --dsf 2 --port 9378 --ready .cx-stage
 */

const STAGE = { w: 1920, h: 1080 };

const at = (x: number, y: number) => ({ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties);

function Diff({ lines }: { lines: string[] }) {
  return (
    <pre className="cx-diff">
      {lines.map((l, i) => (
        <span key={i} className={l.startsWith("+") ? "is-add" : l.startsWith("−") ? "is-del" : ""}>
          {l}
        </span>
      ))}
    </pre>
  );
}

/** One turn in a thread. `grow` = appears later: the row grows open at `--in`. */
function Turn({ who, at: when, grow, children }: { who: "thomas" | "codex"; at?: string; grow?: boolean; children: ReactNode }) {
  const style = when ? ({ "--in": when } as CSSProperties) : undefined;
  const body = (
    <div className={`cx-turn is-${who}`} style={grow ? undefined : style}>
      <i>{who === "thomas" ? "T" : "◆"}</i>
      <div>{children}</div>
    </div>
  );
  return grow ? (
    <div className="cx-grow" style={style}>
      <div>{body}</div>
    </div>
  ) : body;
}

function Thread({ title, time, rise, tilt, wide, children }: { title: string; time: string; rise: string; tilt: string; wide?: boolean; children: ReactNode }) {
  return (
    <article className={`cx-thread${wide ? " is-wide" : ""}`} style={{ "--rise": rise, "--tilt": tilt } as CSSProperties}>
      <header>
        <b>{title}</b>
        <small>{time}</small>
      </header>
      {children}
    </article>
  );
}

/** A real prompt from the sessions, with the one-word receipt Codex left. */
function Nag({ text, reply, rise, tilt }: { text: string; reply: string; rise: string; tilt: string }) {
  return (
    <div className="cx-nag" style={{ "--rise": rise, "--tilt": tilt } as CSSProperties}>
      <p>
        <i>T</i>
        {text}
      </p>
      <small>
        <i>◆</i>
        {reply}
      </small>
    </div>
  );
}

export function CodexReel() {
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
    <main className="cx">
      <div className="cx-stage" key={take} style={{ "--s": scale } as CSSProperties}>
        <div className="cx-kicker">
          <i />
          codex · the repo
          <small>ourspaces-app</small>
        </div>

        <div className="cx-pill">OPENAI · CODEX</div>

        {/* thread A — the one the line is about: softer, slower */}
        <div className="cx-at is-top" style={at(600, 236)}>
          <Thread title="the envelope" time="11:42 pm" rise="var(--t-a)" tilt="-1.2deg" wide>
            <Turn who="thomas">
              <p>make the envelope land on the sticker</p>
            </Turn>
            <Turn who="codex" at="var(--t-a-reply1)">
              <Diff lines={["+ src/components/MailArrival.tsx   +41", "+ convex/inbox.ts                 +12"]} />
              <p>It lands on the sticker now, with a small squash.</p>
            </Turn>
            <Turn who="thomas" at="var(--t-a-nag1)" grow>
              <p>softer</p>
            </Turn>
            <Turn who="codex" at="var(--t-a-reply2)" grow>
              <Diff lines={["− scale: 1.08 0.92", "+ scale: 1.03 0.97"]} />
            </Turn>
            <Turn who="thomas" at="var(--t-a-nag2)" grow>
              <p>slower</p>
            </Turn>
            <Turn who="codex" at="var(--t-a-reply3)" grow>
              <Diff lines={["− --fly: 520ms", "+ --fly: 820ms"]} />
            </Turn>
          </Thread>
        </div>

        {/* thread B — land, not drop; then "yes. that." */}
        <div className="cx-at is-top" style={at(1390, 280)}>
          <Thread title="the letter" time="12:07 am" rise="var(--t-b)" tilt="1.4deg" wide>
            <Turn who="thomas">
              <p>the letter should come in from the top left, like mail</p>
            </Turn>
            <Turn who="codex" at="var(--t-b-reply1)">
              <Diff lines={["+ @keyframes reel-env-fly         +14"]} />
              <p>It lifts, carries, then snaps in.</p>
            </Turn>
            <Turn who="thomas" at="var(--t-b-nag1)" grow>
              <p>the envelope should land, not drop</p>
            </Turn>
            <Turn who="codex" at="var(--t-b-reply2)" grow>
              <Diff lines={["− translate: 0 250px", "+ rotate: −9deg → 0  ·  squash on touch"]} />
              <p>A tilt on the way in, a squash when it touches.</p>
            </Turn>
            <Turn who="thomas" at="var(--t-b-nag2)" grow>
              <p>yes. that.</p>
            </Turn>
            <Turn who="codex" at="var(--t-b-reply3)" grow>
              <p className="cx-kept">✓ kept · 2 files</p>
            </Turn>
          </Thread>
        </div>

        {/* real prompts from the sessions, verbatim */}
        <div className="cx-at" style={at(1010, 138)}>
          <Nag text="i also dont like the orange" reply="bottle green · 4 files" rise="var(--t-n1)" tilt="-2deg" />
        </div>
        <div className="cx-at" style={at(1560, 212)}>
          <Nag text="even smaller plz" reply="done · 1 file" rise="var(--t-n2)" tilt="2.2deg" />
        </div>
        <div className="cx-at" style={at(300, 985)}>
          <Nag text="feels too busy, make it less busy plz" reply="took 3 things out" rise="var(--t-n3)" tilt="1.6deg" />
        </div>
        <div className="cx-at" style={at(960, 990)}>
          <Nag text="also make the shadows smaller plz" reply="12px → 7px · 6 files" rise="var(--t-n4)" tilt="-1.4deg" />
        </div>

        {/* the receipt at the end */}
        <div className="cx-at" style={at(1620, 962)}>
          <div className="cx-stamp">
            26 days<span>·</span>289 commits
          </div>
        </div>
      </div>

      {rec ? null : (
        <div className="arrival-lab-bar reel-lab-bar cx-lab-bar">
          <span className="arrival-lab-kicker">codex reel</span>
          <button type="button" className="is-main" onClick={() => setTake((n) => n + 1)}>replay</button>
          <i aria-hidden="true" />
          <a href="#/space/crew">← the crew</a>
        </div>
      )}
    </main>
  );
}
