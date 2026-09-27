import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import "./labs.css";
import "./firecrawlReel.css";

/**
 * Firecrawl reel — ten seconds for the 2:37 beat of the demo video: the pile
 * in the build room went through Firecrawl; websites are all built different
 * and we didn't want to write a reader for each one; it rereads the old ones
 * so the cards don't rot.
 *
 * Four web pages, each drawn a different shape (a news site under a cookie
 * banner, a dark docs page, a comment thread, a repo), fly one by one into
 * the Firecrawl sticker and come out the other side as the same card, onto
 * the pile. Then the oldest card is dealt out of the pile and reread.
 *
 * Hash route: /?mock=1#/firecrawl   (add &rec=1 to hide the lab bar)
 * No Convex, no timers: every move is a CSS keyframe on an absolute delay
 * (firecrawlReel.css, the `--t-*` block), so the frame recorder pins it exactly.
 * Capture: node .context/web-video/record.mjs --url "http://localhost:5173/?mock=1&rec=1#/firecrawl"
 *          --frames 600 --w 1920 --h 1080 --dsf 2 --port 9379 --ready .fc-stage
 */

const STAGE = { w: 1920, h: 1080 };

const at = (x: number, y: number) => ({ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties);

/** A skeleton bar: `w` in px, optional tone. */
function Bar({ w, h = 10, tone }: { w: number; h?: number; tone?: string }) {
  return <i className={`fc-bar${tone ? ` is-${tone}` : ""}`} style={{ "--w": `${w * 1.2}px`, "--h": `${h * 1.2}px` } as CSSProperties} />;
}

/** One web page on its way in. `n` picks the shape; the timings are the page's own. */
function Page({ n, rise, go, land, children }: { n: number; rise: string; go: string; land: string; children: ReactNode }) {
  return (
    <div className={`fc-page is-${n}`} style={{ "--rise": rise, "--go": go, "--land": land } as CSSProperties}>
      {children}
    </div>
  );
}

type CardSpec = {
  cover: string;
  domain: string;
  kind: string;
  title: string;
  desc: string;
  read: string;
  go: string;
  land: string;
  sx: number;
  sy: number;
  tilt: string;
  oldest?: boolean;
};

/** What comes out the other side: the same card every time. */
function Card({ cover, domain, kind, title, desc, read, go, land, sx, sy, tilt, oldest }: CardSpec) {
  return (
    <article
      className={`fc-card${oldest ? " is-oldest" : ""}`}
      style={{ "--go": go, "--land": land, "--sx": `${sx}px`, "--sy": `${sy}px`, "--tilt": tilt } as CSSProperties}
    >
      <div className="fc-card-in">
        <figure><img src={cover} alt="" /></figure>
        <small>{domain}<span>{kind}</span></small>
        <b>{title}</b>
        <p>{desc}</p>
        <footer>
          <span className="fc-read">{read}</span>
          {oldest ? (
            <>
              <span className="fc-rereading"><img src="/assets/firecrawl-mark.svg" alt="" />rereading…</span>
              <span className="fc-fresh">fresh · just now</span>
            </>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

export function FirecrawlReel() {
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
    <main className="fc">
      <div className="fc-stage" key={take} style={{ "--s": scale } as CSSProperties}>
        <div className="fc-kicker"><i />the build room<small>this month’s pile</small></div>

        {/* the reader, dead centre-left: the pages go in here */}
        <div className="fc-at" style={at(900, 500)}>
          <div className="fc-sticker">
            <img src="/assets/firecrawl-wordmark.svg" alt="Firecrawl" />
          </div>
        </div>

        {/* lane labels */}
        <div className="fc-at" style={at(300, 236)}>
          <div className="fc-lane" style={{ "--in": "var(--t-lane-in)" } as CSSProperties}>in · any page</div>
        </div>
        <div className="fc-at" style={at(1500, 250)}>
          <div className="fc-lane" style={{ "--in": "var(--t-lane-out)" } as CSSProperties}>out · one card</div>
        </div>

        {/* four pages, four shapes, same doorstep */}
        <div className="fc-at" style={at(300, 430)}>
          <Page n={1} rise="var(--t-p1)" go="var(--t-f1)" land="var(--t-l1)">
            <header><i /><Bar w={38} h={8} tone="light" /><Bar w={22} h={8} tone="light" /><Bar w={30} h={8} tone="light" /></header>
            <div className="fc-news-body">
              <div>
                <Bar w={190} h={16} tone="ink" /><Bar w={140} h={16} tone="ink" />
                <Bar w={200} /><Bar w={180} /><Bar w={196} /><Bar w={120} />
              </div>
              <aside>AD</aside>
            </div>
            <div className="fc-cookie">We use cookies<span>Accept</span></div>
          </Page>
        </div>
        <div className="fc-at" style={at(300, 430)}>
          <Page n={2} rise="var(--t-p2)" go="var(--t-f2)" land="var(--t-l2)">
            <nav><Bar w={64} h={8} tone="light" /><Bar w={48} h={8} tone="dim" /><Bar w={70} h={8} tone="dim" /><Bar w={40} h={8} tone="dim" /><Bar w={56} h={8} tone="dim" /><Bar w={44} h={8} tone="dim" /></nav>
            <div>
              <Bar w={170} h={14} tone="light" />
              <Bar w={210} tone="dim" /><Bar w={180} tone="dim" />
              <pre><Bar w={90} h={8} tone="lime" /><Bar w={140} h={8} tone="dim" /><Bar w={60} h={8} tone="orange" /><Bar w={120} h={8} tone="dim" /></pre>
              <Bar w={200} tone="dim" />
            </div>
          </Page>
        </div>
        <div className="fc-at" style={at(300, 430)}>
          <Page n={3} rise="var(--t-p3)" go="var(--t-f3)" land="var(--t-l3)">
            <header><i /><Bar w={150} h={10} tone="ink" /><em>42 comments</em></header>
            <ul>
              <li><i /><Bar w={200} /></li>
              <li style={{ "--d": 1 } as CSSProperties}><i /><Bar w={150} /></li>
              <li style={{ "--d": 2 } as CSSProperties}><i /><Bar w={120} /></li>
              <li><i /><Bar w={180} /></li>
              <li style={{ "--d": 1 } as CSSProperties}><i /><Bar w={90} /></li>
            </ul>
          </Page>
        </div>
        <div className="fc-at" style={at(300, 430)}>
          <Page n={4} rise="var(--t-p4)" go="var(--t-f4)" land="var(--t-l4)">
            <header><Bar w={60} h={8} tone="ink" /><Bar w={44} h={8} /><Bar w={52} h={8} /></header>
            <ul>
              <li><i /><Bar w={70} h={8} /><Bar w={150} h={8} tone="faint" /></li>
              <li><i /><Bar w={54} h={8} /><Bar w={120} h={8} tone="faint" /></li>
              <li><i /><Bar w={82} h={8} /><Bar w={100} h={8} tone="faint" /></li>
              <li><i /><Bar w={46} h={8} /><Bar w={140} h={8} tone="faint" /></li>
            </ul>
            <em>README.md</em>
          </Page>
        </div>

        {/* the same card, four times, onto the pile */}
        <div className="fc-at" style={at(900, 500)}>
          <Card
            cover="/assets/link-card-collage-amber.png" domain="anthropic.com" kind="article"
            title="building effective agents" desc="Workflows vs agents, and why most problems want the simpler one."
            read="read · 8 days ago" go="var(--t-c1)" land="var(--t-k1)" sx={0} sy={0} tilt="-2deg" oldest
          />
        </div>
        <div className="fc-at" style={at(900, 500)}>
          <Card
            cover="/assets/link-card-riso.png" domain="react.dev" kind="docs"
            title="you might not need an effect" desc="Most effects are derived state wearing a costume."
            read="read · 6 days ago" go="var(--t-c2)" land="var(--t-k2)" sx={26} sy={-22} tilt="1.5deg"
          />
        </div>
        <div className="fc-at" style={at(900, 500)}>
          <Card
            cover="/assets/link-card-collage-teal.png" domain="aphyr.com" kind="article"
            title="strong consistency models" desc="Linearizable, sequential, causal, drawn as a lattice you can point at."
            read="read · 3 days ago" go="var(--t-c3)" land="var(--t-k3)" sx={52} sy={-44} tilt="-1deg"
          />
        </div>
        <div className="fc-at" style={at(900, 500)}>
          <Card
            cover="/assets/link-card-ceramic.png" domain="github.com" kind="repo"
            title="ripgrep" desc="Recursive search that respects gitignore and is genuinely fast."
            read="read · today" go="var(--t-c4)" land="var(--t-k4)" sx={78} sy={-66} tilt="2deg"
          />
        </div>

        {/* the receipt */}
        <div className="fc-at" style={at(900, 700)}>
          <div className="fc-stamp">readers we wrote<span>·</span>zero</div>
        </div>

        <h1 className="fc-title">read<span>,</span> then reread</h1>
      </div>

      {rec ? null : (
        <div className="arrival-lab-bar reel-lab-bar fc-lab-bar">
          <span className="arrival-lab-kicker">firecrawl reel</span>
          <button type="button" className="is-main" onClick={() => setTake((n) => n + 1)}>replay</button>
          <i aria-hidden="true" />
          <a href="#/space/buildroom">← the build room</a>
        </div>
      )}
    </main>
  );
}
