import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { getDataMode } from "../live/dataMode";
import { lastSpaceSlug, normalSpaceHash } from "../lib/routes";
import { CanvasRoom } from "./CanvasRoom";

const REPO_URL = "https://github.com/thomasnguyen/ourspaces-app";

/** `#/about` — an address, so it can be linked from a listing, a video
 *  description or a text message, and a card, so the room it opens over keeps
 *  running underneath. Cold-loading the link lands you on a live canvas with
 *  the card on top: the claim and the proof in one frame. */
function aboutRequested() {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0] === "about";
}

/** Real rows, counted by the sharded counter and subscribed to like
 *  everything else on the board — the honest version of a stat block. Live
 *  path only: the mock branch has no Convex client in context. */
function LiveTotals() {
  const totals = useQuery(api.stats.getLiveTotals, {});
  if (!totals) return null;

  const rows = [
    { label: "spaces", value: totals.spaces },
    { label: "widgets", value: totals.widgets },
    { label: "messages", value: totals.messages },
  ];

  return (
    <dl className="about-totals">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AboutRoom() {
  const [open, setOpen] = useState(aboutRequested);

  useEffect(() => {
    const onHash = () => setOpen(aboutRequested());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!open) return null;

  return (
    <CanvasRoom
      className="about-room"
      label="back to the space"
      onClose={() => {
        window.location.hash = normalSpaceHash(lastSpaceSlug());
      }}
    >
      <div className="about-sheet">
        <header className="about-head">
          <img className="about-mark" src="/assets/ourspace-mark.png" alt="" />
          <div>
            <p className="about-kicker">what is this</p>
            <h1>ourspaces</h1>
          </div>
        </header>

        <p className="about-lede">
          a space is one board a group shares. everything on it is live — move a
          thing and it moves on everyone else&rsquo;s screen too. no feed, no
          scrollback, nothing to catch up on.
        </p>

        <section className="about-try">
          <h2>three things to try</h2>
          <ol>
            <li>
              <strong>drop a link.</strong> it gets read, tagged, and filed onto
              the board while you watch.
            </li>
            <li>
              <strong>email the room.</strong> the address sits under its name.
              send it a receipt, an invite, a plan — it comes back as something
              on the board.
            </li>
            <li>
              <strong>put something down.</strong> pick a thing out of the tray
              and click where you want it.
            </li>
          </ol>
        </section>

        <div className="about-cols">
          <section>
            <h2>who made it</h2>
            <p>
              thomas nguyen built it, holly designed it. four weeks, for the
              convex all gas hackathon.
            </p>
          </section>

          <section>
            <h2>what it runs on</h2>
            <p>
              convex is the whole backend — database, live subscriptions,
              scheduling, file storage, auth, and the hosting this page is
              served from. openai reads the mail, agentmail gives every room an
              inbox, firecrawl reads the links.
            </p>
          </section>
        </div>

        {getDataMode() === "live" && <LiveTotals />}

        <nav className="about-links">
          <a href="#/home">see the whole block</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            the code on github
          </a>
        </nav>
      </div>
    </CanvasRoom>
  );
}
