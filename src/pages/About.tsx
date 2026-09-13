import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { WidgetCard } from "../components/WidgetCard";
import { getSpace } from "../data/spaces";
import { getDataMode } from "../live/dataMode";
import { lastSpaceSlug, normalSpaceHash } from "../lib/routes";
import type { Widget } from "../data/types";

const REPO_URL = "https://github.com/thomasnguyen/ourspaces-app";

/** Widest a strip tile gets before it is scaled down to fit. */
const STRIP_W = 260;

/* Real widgets out of the seeded spaces, not drawings of widgets — the same
   fixtures the wall at #/wall deals from. Six is what fits before the strip
   stops being a taste and starts being a catalogue. */
const STRIP: { space: string; id: string }[] = [
  { space: "crew", id: "poll-cake" },
  { space: "crew", id: "countdown" },
  { space: "house", id: "house-wheel" },
  { space: "crew", id: "expense-split" },
  { space: "couple", id: "us-letter" },
  { space: "crew", id: "playlist" },
];

const THINGS = [
  {
    n: "01",
    title: "drop a link",
    body:
      "paste it into the pile and watch it get read, tagged and filed onto " +
      "the board. the room shows its working — what it fetched, what it " +
      "decided, where it put it.",
  },
  {
    n: "02",
    title: "email the room",
    body:
      "every space has its own address, printed under its name. send it a " +
      "receipt, an invite, a plan. it comes back as something on the board, " +
      "with a slip saying why it landed there.",
  },
  {
    n: "03",
    title: "put something down",
    body:
      "pick a thing out of the tray — a poll, a countdown, a chore wheel, a " +
      "letter — and click where you want it. it lands there for everyone, at " +
      "the same moment.",
  },
];

/* Named because they each do a real job — the list is the same one the README
   keeps, and it is checkable against convex/convex.config.ts. */
const CONVEX_WORK = [
  ["static-hosting", "serves this page, and tells an open tab a new build landed"],
  ["presence + aggregate", "who is here now, and every poll tally and member count"],
  ["workflow + workpool", "the durable weekly digest, and the bounded recap fan-out"],
  ["agent + rag", "ask the space a question and get an answer grounded in its own board"],
  ["action-retrier + action-cache", "every firecrawl and agentmail call, retried and cached"],
  ["rate-limiter + sharded-counter", "quotas on the expensive paths, and the live totals below"],
];

function widgetFor(pick: { space: string; id: string }): Widget | undefined {
  return getSpace(pick.space).widgets.find((item) => item.id === pick.id);
}

/** Live rows off the sharded counter. The only numbers on this page, and the
 *  only ones that are never typed in. Live path only — the mock branch has no
 *  Convex client in context. */
function LiveTotals() {
  const totals = useQuery(api.stats.getLiveTotals, {});
  if (!totals) return null;

  const rows = [
    { label: "spaces", value: totals.spaces },
    { label: "widgets on boards", value: totals.widgets },
    { label: "messages", value: totals.messages },
  ];

  return (
    <dl className="about-totals">
      {rows.map((row) => (
        <div key={row.label}>
          <dd>{row.value.toLocaleString()}</dd>
          <dt>{row.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function About() {
  const backHash = normalSpaceHash(lastSpaceSlug());

  return (
    <main className="about-page paper-bg">
      <nav className="about-bar">
        <a className="about-back" href={backHash}>
          <span aria-hidden="true">←</span> back to the space
        </a>
        <img className="about-mark" src="/assets/ourspace-mark.png" alt="" />
      </nav>

      <header className="about-hero">
        <p className="about-kicker">what is this</p>
        <h1>
          a space is one board
          <br />
          your group shares.
        </h1>
        <p className="about-lede">
          everything on it is live — move a thing and it moves on everyone
          else&rsquo;s screen too. no feed, no scrollback, nothing to catch up
          on. you walk in and the room is already the way you left it, plus
          whatever happened since.
        </p>
        {getDataMode() === "live" && <LiveTotals />}
      </header>

      <section className="about-section about-things">
        <h2>what you do here</h2>
        <div className="about-things-grid">
          {THINGS.map((thing) => (
            <article key={thing.n}>
              <span className="about-numeral">{thing.n}</span>
              <h3>{thing.title}</h3>
              <p>{thing.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section about-strip-section">
        <h2>the things you put down</h2>
        <p className="about-section-lede">
          thirty-two of them, all live, all editable by anyone in the room.
          these six are real — pulled straight out of the seeded spaces.
        </p>
        <div className="about-strip" aria-label="A few of the widgets">
          {STRIP.map((pick) => {
            const widget = widgetFor(pick);
            if (!widget) return null;
            return (
              <div
                key={`${pick.space}-${pick.id}`}
                className="about-strip-tile"
                /* A WidgetCard positions itself off its canvas x/y, so the
                   tile has to give it a box to sit in — same deal the wall
                   makes at #/wall. */
                style={{
                  zoom: Math.min(1, STRIP_W / widget.w),
                  width: widget.w,
                  height: widget.h,
                }}
              >
                <WidgetCard widget={widget} spaceId={pick.space} canvasScale={1} />
              </div>
            );
          })}
        </div>
        <a className="about-inline-link" href="#/wall">
          see the whole wall
        </a>
      </section>

      <section className="about-section about-runs">
        <h2>what it runs on</h2>
        <p className="about-section-lede">
          convex is the entire backend — database, live subscriptions,
          scheduling, file storage, auth, and the hosting this page is served
          from. eighteen of its components are doing real work in the code:
        </p>
        <dl className="about-work">
          {CONVEX_WORK.map(([name, job]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{job}</dd>
            </div>
          ))}
        </dl>
        <p className="about-section-lede">
          openai reads the mail and decides where it goes. agentmail gives
          every room its inbox. firecrawl reads the links. react, vite and
          tailwind on the front.
        </p>
      </section>

      <section className="about-section about-who">
        <h2>who made it</h2>
        <p>
          thomas nguyen built it and holly designed it, over four weeks, for
          the convex all gas hackathon. it started because our group chat kept
          losing things — the plan, the photo, the link someone swore they
          sent — and a chat is a bad place to keep anything you want to come
          back to.
        </p>
      </section>

      <nav className="about-links">
        <a href="#/home">see the whole block</a>
        <a href={backHash}>go back to a room</a>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          the code on github
        </a>
      </nav>
    </main>
  );
}

export default About;
