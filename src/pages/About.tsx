import { useState, type CSSProperties } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { PollWidget } from "../widgets/core";
import { getSpace } from "../data/spaces";
import { getDataMode } from "../live/dataMode";
import { lastSpaceSlug, normalSpaceHash } from "../lib/routes";

const REPO_URL = "https://github.com/thomasnguyen/ourspaces-app";
const CAKE_POLL = getSpace("crew").widgets.find((widget) => widget.id === "poll-cake")!;

const ROOMS = [
  { slug: "crew", label: "the friends", detail: "birthdays, big plans, inside jokes", color: "league", image: "/assets/the-crew-snapshot-thumb.jpg" },
  { slug: "couple", label: "the two of you", detail: "a little closer, even from far away", color: "couple", image: "/assets/space-covers/us-two.png" },
  { slug: "house", label: "the housemates", detail: "shared chores. shared chaos.", color: "trip", image: "/assets/space-covers/the-house.png" },
  { slug: "buildroom", label: "the builders", detail: "good links and things you made", color: "crew", symbol: "</>" },
  { slug: "league", label: "the team", detail: "game days and the post-game plans", color: "fam", image: "/assets/space-covers/game-day.png" },
];

const MAKERS = [
  { name: "Convex", job: "Keeps the whole room in sync.", color: "trip" },
  { name: "OpenAI", job: "Reads what comes in and finds its place.", color: "card" },
  { name: "AgentMail", job: "Gives every space its own inbox.", color: "couple" },
  { name: "Firecrawl", job: "Turns a link into something useful.", color: "crew" },
];

const CONVEX_WORK = [
  ["static-hosting", "The app lives here, too. Open tabs know when a new version lands."],
  ["presence + aggregate", "Who’s here, poll tallies, and member counts."],
  ["workflow + workpool", "The weekly digest and the work behind room recaps."],
  ["agent + rag", "Answers grounded in what’s on the board."],
  ["action-retrier + action-cache", "Retries and caching for the room’s outside calls."],
  ["rate-limiter + sharded-counter", "Usage limits and the live totals on this page."],
];

function LiveTotals() {
  const totals = useQuery(api.stats.getLiveTotals, {});
  if (!totals) return null;
  return (
    <div className="about-live">
      <span className="about-live-label"><i /> across ourspaces, right now</span>
      <dl>
        {[
          ["spaces", totals.spaces],
          ["things on boards", totals.widgets],
          ["messages", totals.messages],
        ].map(([label, value]) => (
          <div key={label}><dd>{value.toLocaleString()}</dd><dt>{label}</dt></div>
        ))}
      </dl>
    </div>
  );
}

function BoardPreview() {
  const [vote, setVote] = useState<string>();
  return (
    <div className="about-preview">
      <div className="about-board-frame">
        <div className="about-board">
          <span className="about-board-label">Maya’s birthday club <span>✳</span></span>
          <figure className="about-photo">
            <img src="/assets/the-crew-snapshot.jpg" alt="" />
            <figcaption>same people, next friday.</figcaption>
          </figure>
          <img className="about-ours" src="/assets/stickers/ours.png" alt="" />
          <div className="about-preview-poll">
            <PollWidget
              widget={{ ...CAKE_POLL, rotate: 0, data: { ...CAKE_POLL.data, waitingOn: [] } }}
              style={{ width: "100%", height: "100%" }}
              selectedOptionId={vote}
              onVote={(option) => setVote(option)}
            />
          </div>
          <div className="about-note">
            <span>the very important plan</span>
            <p>show up.<br />bring something.<br /><strong>stay a little longer.</strong></p>
            <small>— all of us</small>
          </div>
          <img className="about-cake" src="/assets/stickers/matcha-cake.png" alt="" />
          <span className="about-board-tag">a plan worth keeping.</span>
        </div>
      </div>
      <p className={`about-preview-caption${vote ? " has-vote" : ""}`}>
        <span>{vote ? "✓" : "↖"}</span>
        {vote ? "your vote is in. that’s how easy it is." : "a little preview. go on, pick a cake."}
      </p>
    </div>
  );
}

export function About() {
  const backHash = normalSpaceHash(lastSpaceSlug());
  const showRooms = () => document.getElementById("about-rooms")?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });

  return (
    <main className="about-page">
      <nav className="about-bar about-wrap">
        <a className="about-brand" href="#/about">
          <img src="/assets/ourspace-mark.png" alt="" />
          <span>ourspaces</span>
          <small>about</small>
        </a>
        <a className="about-back" href={backHash}><span>←</span> back to the space</a>
      </nav>

      <header className="about-hero about-wrap">
        <div className="about-hero-copy">
          <p className="about-intro">a little corner of the internet, together.</p>
          <h1>Your people.<br />Your plans.<br /><span>Your space.</span></h1>
          <p className="about-lede">
            The photos. The Friday plan. That link someone swears they sent.
            A shared canvas for everything that makes your group <em>your group.</em>
          </p>
          <div className="about-hero-actions">
            <a className="about-button" href="#/home">find your space <span>↗</span></a>
            <button className="about-text-button" onClick={showRooms}>take a look around <span>↓</span></button>
          </div>
          <p className="about-invitation">Walk in. Pick a room. Make yourself at home.</p>
        </div>
        <BoardPreview />
      </header>

      {getDataMode() === "live" && <div className="about-wrap"><LiveTotals /></div>}

      <section className="about-how about-wrap">
        <div className="about-how-heading">
          <h2>Good things<br />get lost in<br /><span>the group chat.</span></h2>
          <p>Give them somewhere to stay. A space is one board your whole group can add to, move around, and come back to.</p>
          <img src="/assets/stickers/glad-ur-here.png" alt="" loading="lazy" />
        </div>
        <div className="about-ways">
          <article>
            <span className="about-way-mark" style={{ "--way-color": "var(--color-couple)" } as CSSProperties}>↗</span>
            <div><h3>Turn “we should” into a plan.</h3><p>Pick a date. Vote on the cake. Claim what you’re bringing. Everyone sees the same board, as it happens.</p><span className="about-way-note">the poll, the potluck, the countdown</span></div>
          </article>
          <article>
            <span className="about-way-mark" style={{ "--way-color": "var(--color-trip)" } as CSSProperties}>↙</span>
            <div><h3>Send it over. It finds a home.</h3><p>Drop a link or email the space. A receipt joins the expenses. A good read lands in the pile. A little note tells you why.</p><span className="about-way-note">your space has an inbox, too</span></div>
          </article>
          <article>
            <span className="about-way-mark" style={{ "--way-color": "var(--color-crew)" } as CSSProperties}>✳</span>
            <div><h3>Leave a little bit of yourselves.</h3><p>The photo nobody should forget. Your very specific playlist. An inside joke with too much history. Put it all up.</p><span className="about-way-note">move it, stick it, make it yours</span></div>
          </article>
        </div>
      </section>

      <section className="about-rooms about-wrap" id="about-rooms">
        <div className="about-section-heading">
          <h2>Every kind of <span>us.</span></h2>
          <p>Five spaces to wander into.<br />A different kind of together in each one.</p>
        </div>
        <div className="about-room-list">
          {ROOMS.map((room, i) => (
            <a key={room.slug} className="about-room" href={normalSpaceHash(room.slug)} style={{ "--room-color": `var(--color-${room.color})`, "--i": i } as CSSProperties}>
              <span className="about-room-picture">{room.image ? <img src={room.image} alt="" loading="lazy" /> : <span>{room.symbol}</span>}</span>
              <span className="about-room-name">{room.label}</span>
              <span className="about-room-detail">{room.detail}</span>
              <span className="about-room-arrow">↗</span>
            </a>
          ))}
        </div>
        <a className="about-wall-link" href="#/wall">And a whole wall of things to put in them. <span>see the widgets ↗</span></a>
      </section>

      <section className="about-story">
        <div className="about-wrap about-story-inner">
          <div className="about-story-title"><span className="about-sticker">a small origin story</span><h2>“Wait, where<br />did we put that?”</h2></div>
          <div className="about-story-copy">
            <p>That was the start. Our group chat kept losing the plan, the photo, the link. We wanted a place that felt like ours, where the good stuff could stick around.</p>
            <p>So Thomas built it, and Holly designed it. Made together for the Convex All Gas hackathon.</p>
            <span className="about-signature">Thomas + Holly <span>↗</span></span>
          </div>
        </div>
      </section>

      <section className="about-made about-wrap">
        <div className="about-section-heading"><h2>A little help<br />behind the scenes.</h2><p>The room does the remembering.<br />These are the things that make it work.</p></div>
        <div className="about-makers">
          {MAKERS.map((maker) => <div key={maker.name}><span style={{ color: `var(--color-${maker.color})` }}>{maker.name}</span><p>{maker.job}</p></div>)}
        </div>
        <details className="about-under-hood">
          <summary>For the curious: under the hood <span>+</span></summary>
          <div className="about-tech">
            <p>Convex runs the database, live subscriptions, scheduling, file storage, authentication, and hosting. React, Vite, and Tailwind build what you see.</p>
            <dl>{CONVEX_WORK.map(([name, job]) => <div key={name}><dt>{name}</dt><dd>{job}</dd></div>)}</dl>
            <a href={REPO_URL} target="_blank" rel="noreferrer">explore the code on GitHub ↗</a>
          </div>
        </details>
      </section>

      <footer className="about-footer about-wrap">
        <div className="about-footer-invite"><h2>There’s room for you.</h2><a className="about-button" href="#/home">come on in <span>↗</span></a></div>
        <div className="about-footer-meta"><a className="about-brand" href="#/about"><img src="/assets/ourspace-mark.png" alt="" /><span>ourspaces</span></a><span>group chats forget. spaces remember.</span><a href={REPO_URL} target="_blank" rel="noreferrer">made in the open ↗</a></div>
      </footer>
    </main>
  );
}

export default About;
