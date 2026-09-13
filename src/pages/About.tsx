import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { PollWidget } from "../widgets/core";
import { LetterWidget } from "../widgets/extras";
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
  { id: "convex", name: "Convex", job: "Keeps the whole room in sync.", color: "trip" },
  { id: "openai", name: "OpenAI", job: "Reads what comes in and finds its place.", color: "card" },
  { id: "agentmail", name: "AgentMail", job: "Gives each mail-enabled space its inbox.", color: "couple" },
  { id: "firecrawl", name: "Firecrawl", job: "Turns a link into something useful.", color: "crew" },
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

function AboutOverview() {
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
          {MAKERS.map((maker) => <a key={maker.name} href={`#/about/${maker.id}`} className="about-maker-link"><span style={{ color: `var(--color-${maker.color})` }}>{maker.name}</span><p>{maker.job}</p><small>see how it works <span>↗</span></small></a>)}
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

// These pages document this app's integrations. Examples are local and never
// invoke an outside service; source links point to the implementation.
type VendorId = "convex" | "openai" | "agentmail" | "firecrawl";
type VendorDetail = [title: string, description: string, source: string];
type VendorStory = {
  id: VendorId;
  name: string;
  color: string;
  role: string;
  headline: [string, string];
  intro: string;
  example: string;
  room: string;
  roomLabel: string;
  journeyTitle: string;
  journey: VendorDetail[];
  capabilities: VendorDetail[];
  technical: VendorDetail[];
};

const VENDORS: VendorStory[] = [
  {
    id: "convex", name: "Convex", color: "trip", role: "the shared foundation",
    headline: ["One room.", "Everyone’s there."],
    intro: "A vote, a moved note, a photo someone just put up. Convex keeps the room the same for everyone—and keeps it there when everyone leaves.",
    example: "An interactive example: two views of the same board.",
    room: "crew", roomLabel: "step into the crew",
    journeyTitle: "Follow one vote.",
    journey: [
      ["You pick the cake.", "The poll sends your choice to a Convex mutation.", "convex/votes.ts"],
      ["The vote is saved.", "The mutation checks the poll and updates your vote and its aggregate tally together.", "convex/votes.ts"],
      ["The room hears about it.", "The subscribed results query updates when its underlying records change.", "src/live/useLivePoll.ts"],
      ["Everyone sees the choice.", "The poll renders the new count, faces, and your selected option.", "src/widgets/core.tsx"],
    ],
    capabilities: [
      ["The board is shared state.", "Widgets, messages, votes, and claims live in Convex. React reads subscriptions to those records, so a saved change can reach every open room without a refresh.", "convex/widgets.ts"],
      ["You can feel who’s here.", "The presence component tracks room occupancy. A separate cursor and gesture path carries positions and movements across the canvas, making a shared room feel occupied.", "convex/roomPresence.ts"],
      ["The room keeps working.", "A durable workflow assembles the weekly email. A workpool limits concurrent recap jobs. Scheduled work refreshes old link cards in batches.", "convex/digest.ts"],
      ["Even this page lives here.", "Convex provides file storage and hosts the built frontend. A subscribed deployment record lets an open tab know a newer version is available.", "src/components/UpdateNudge.tsx"],
    ],
    technical: [
      ["Tallies and totals", "Two aggregate instances maintain poll tallies and member counts. A sharded counter supplies the site’s totals. The visible poll also reads individual vote rows because it needs to show the people behind each choice.", "convex/votes.ts"],
      ["Outside calls", "ActionCache reuses scraped links; ActionRetrier wraps transient external calls. RateLimiter controls expensive paths. These components sit around real mail, scraping, and recap operations.", "convex/firecrawl.ts"],
      ["Background work", "Workflow carries the weekly digest through its steps; Workpool bounds recap fan-out; BatchWorker drains the stale-link queue. Crons start the recurring work.", "convex/crons.ts"],
      ["AI and retrieval", "Agent stores the room’s follow-up thread. RAG retrieves relevant board context. PersistentTextStreaming is mounted for the streaming endpoint; the main recap UI uses its existing response path.", "convex/streaming.ts"],
      ["Mail, web, hosting, and identity", "The app mounts the Firecrawl component, a local AgentMail component, StaticHosting, and a local discovery-document component. Convex Auth handles guest and email-code identity as a library.", "convex/convex.config.ts"],
    ],
  },
  {
    id: "openai", name: "OpenAI", color: "league", role: "the room’s sense of context",
    headline: ["Good stuff in.", "Right place found."],
    intro: "The room reads what arrived alongside what’s already on the board. OpenAI models help turn that context into a useful decision—and a little explanation you can see.",
    example: "Illustrated decisions. Choose a message to see where it belongs.",
    room: "crew", roomLabel: "see the crew’s canvas",
    journeyTitle: "Follow one receipt.",
    journey: [
      ["Read what came in.", "The email’s subject, body, and parsed attachment text form the input.", "convex/inboxRouting.ts"],
      ["Look around the room.", "An inventory describes the existing expenses, itineraries, frames, and countdowns.", "convex/inboxRouting.ts"],
      ["Choose a destination.", "The model returns a JSON decision: update an expense or itinerary, create one, leave mail unfiled, or discard spam.", "convex/inboxRouting.ts"],
      ["Leave the reason with it.", "Convex saves the change and its because sentence. The arrival and the object show what happened.", "convex/inbox.ts"],
    ],
    capabilities: [
      ["It reads against your actual plans.", "A payment for a past trip belongs with that trip’s expenses. A future reservation belongs in an itinerary. The mail router includes the current board inventory so the decision has somewhere concrete to land.", "convex/inboxRouting.ts"],
      ["The explanation stays on the object.", "The same decision includes a short because sentence. It appears with the mail arrival and on the resulting letter, expense, or itinerary, so the group can understand the change.", "src/components/MailArrival.tsx"],
      ["The room can catch you up.", "The recap and weekly digest use board snapshots to compose short updates. Follow-up questions use a persistent agent thread and context retrieved from the room.", "convex/recap.ts"],
      ["Uncertainty has a place, too.", "When the router cannot make a useful decision, mail can remain as an unfiled envelope. The model chooses from a small set of actions; app functions own the actual writes.", "convex/inbox.ts"],
    ],
    technical: [
      ["One model-routing module", "convex/ai.ts chooses gpt-oss-120b through a configured Cloudflare proxy, or gpt-4o-mini through the OpenAI API when that proxy is not configured. This is a configuration choice, not automatic failover after an error.", "convex/ai.ts"],
      ["JSON decisions, with app-owned writes", "completeJson requests a JSON object on the direct OpenAI path and uses prompt-directed JSON on the proxy path. Callers interpret the fields; the expense and itinerary mutations check the target’s room and type before updating it.", "convex/inboxRouting.ts"],
      ["Embeddings and memory", "text-embedding-3-small runs through OpenAI’s API. The RAG component indexes widget summaries and recent messages in a namespace for each space, then retrieves context for a follow-up.", "convex/rag.ts"],
      ["A bounded job for the agent", "The follow-up agent is instructed to answer briefly from the supplied context and cite a real object when useful. It has no canvas-writing role. Mail filing follows the separate structured-decision path.", "convex/agent.ts"],
    ],
  },
  {
    id: "agentmail", name: "AgentMail", color: "couple", role: "the room’s connection to your inbox",
    headline: ["You send a note.", "The room gets it."],
    intro: "The crew, us two, and the build room each have an address. Forward the receipt, send the link, write the letter. AgentMail brings it into the space and carries the reply back.",
    example: "A sample letter, just like the ones that arrive in us two. Tap to open.",
    room: "couple", roomLabel: "visit us two",
    journeyTitle: "Follow one email.",
    journey: [
      ["Send it to the room.", "AgentMail receives the message in the inbox attached to that space.", "convex/agentmail.ts"],
      ["Let the app know.", "A Convex HTTP endpoint receives the webhook. The local component records the event and detects redeliveries.", "convex/http.ts"],
      ["Give it a place.", "The room’s router turns it into a letter, a dropped link, an expense, an itinerary entry, or unfiled mail.", "convex/inbox.ts"],
      ["Write back.", "The app labels the message and attempts a reply in the original thread, telling the sender what happened.", "convex/agentmail.ts"],
    ],
    capabilities: [
      ["An address with somewhere to land.", "A room’s inbox is connected to its canvas. A letter to us two becomes a sealed letter. Links sent to the build room join the pile. The crew’s mail is matched against its existing plans.", "convex/inbox.ts"],
      ["Attachments come along.", "AgentMail supplies download URLs for supported documents. Firecrawl turns those documents into text, so a receipt can still be understood when the entire email body is “see attached.”", "convex/agentmail.ts"],
      ["The room replies in the same thread.", "After filing, the app sends a short acknowledgement and applies the result as a label. The board’s committed change stays saved even if that reply cannot be delivered.", "convex/agentmail.ts"],
      ["The week can come to you.", "The weekly digest workflow gathers a room snapshot, composes an update, and sends it through the same mail integration to the room’s sender list.", "convex/digest.ts"],
      ["It delivers your sign-in code, too.", "AgentMail sends the six-digit email code. Convex Auth verifies it and links the email to the guest identity, so joining can keep the person and their existing activity together.", "convex/otp.ts"],
    ],
    technical: [
      ["A local Convex component", "convex/components/agentMail wraps the inbox, send, reply, and label API calls. Its own tables hold incoming messages and webhook event IDs, keeping the email integration together.", "convex/components/agentMail/lib.ts"],
      ["Verified arrival, deduplicated event", "With a signing secret configured, the HTTP action checks the webhook signature before ingestion. The local component recognizes event IDs it has already recorded so a redelivery does not start the same processing again.", "convex/http.ts"],
      ["Documents, not signature logos", "The attachment path skips inline parts, checks supported document types and size, and limits parsing work per email. If attachment metadata is absent, it fetches the message before deciding there is nothing to read.", "convex/agentmail.ts"],
      ["Email delivery is one part of auth", "The OTP provider generates the code and sends the OurSpaces email through AgentMail. The code lifetime is shared with the email copy; Convex Auth owns verification and sessions.", "convex/otp.ts"],
    ],
  },
  {
    id: "firecrawl", name: "Firecrawl", color: "crew", role: "the room’s way into the web",
    headline: ["A link comes in.", "A good idea stays."],
    intro: "A bare URL is easy to lose. Firecrawl gives the room the title, context, and content behind it—whether you bring one article, a topic to research, or a whole site.",
    example: "Illustrated results. Try a link, a topic, or a whole site.",
    room: "buildroom", roomLabel: "open the build room",
    journeyTitle: "Follow one link.",
    journey: [
      ["Drop it into the pile.", "A pending entry holds the URL and who brought it to the room.", "src/pages/LiveSpace.tsx"],
      ["Read the page.", "Firecrawl returns markdown, a summary, images, and structured page details.", "convex/firecrawl.ts"],
      ["Give the card its context.", "The title, description, cover, and source replace the pending content in the room.", "convex/widgets.ts"],
      ["Keep the useful part.", "The group can read, discuss, and keep a takeaway as a note on the board.", "src/components/ReadingRoom.tsx"],
    ],
    capabilities: [
      ["One link becomes a readable card.", "Scraping asks for the page’s content and structured metadata together. Hacker News story URLs are resolved to their linked article when possible, while retaining the discussion context.", "convex/firecrawl.ts"],
      ["A topic becomes a reading pile.", "Topic search returns a set of web results with titles, descriptions, and sources. The build room gives those results somewhere to be kept and discussed.", "convex/firecrawl.ts"],
      ["A whole site arrives a page at a time.", "A background crawl stores pages in the Firecrawl component. The crawl strip subscribes to the stored results, so people can watch pages arrive and keep the ones they want.", "src/components/CrawlStrip.tsx"],
      ["An attached document becomes readable.", "The mail pipeline passes supported attachment URLs to Firecrawl. Parsed text joins the email body before the mail router decides what to do with it.", "convex/agentmail.ts"],
      ["Older link cards get another look.", "A scheduled batch worker finds stale link cards and sends them through the scraper again. The refresh work is spread into batches rather than one large burst.", "convex/batch.ts"],
    ],
    technical: [
      ["Scrape with structured extraction", "The scraper requests markdown, summary, images, and JSON fields for title, description, image, site, author, and publication date. The app combines those results with page metadata to build the card.", "convex/firecrawl.ts"],
      ["Cache and retry around the call", "An hour-long ActionCache wraps the scraped result. ActionRetrier handles the network operation on a cache miss. A repeated save of the same URL can reuse the existing result.", "convex/firecrawl.ts"],
      ["A crawl is a subscription", "startCrawl begins background work. getCrawlStatus and listCrawlPages expose the component’s persisted results to the UI. The crawl strip uses cursor pagination rather than storing every page in one widget.", "src/components/CrawlStrip.tsx"],
      ["Documents use the scrape path", "AgentMail already provides an attachment URL, so parseDocument uses Firecrawl’s scrape operation with a PDF parser option. It does not call the separate multipart /parse endpoint.", "convex/firecrawl.ts"],
    ],
  },
];

const DECISION_EXAMPLES = [
  { kind: "a receipt", input: "I paid $84 for the Tahoe cabin.", where: "Tahoe expenses", value: "$84", detail: "Sam · cabin share", because: "sam covered his cabin share", label: "receipt" },
  { kind: "a booking", input: "Dinner is booked for November 8 at 7pm.", where: "Trip itinerary", value: "Nov 8", detail: "Dinner · 7pm", because: "nov 8 has a dinner now", label: "booking" },
  { kind: "something unclear", input: "Is this the one we were talking about?", where: "Unfiled letter", value: "Over to you.", detail: "Open it together", because: "not sure which plan this belongs to", label: "unfiled" },
];

function VendorExample({ vendor }: { vendor: VendorStory }) {
  const [choice, setChoice] = useState(0);
  const decision = DECISION_EXAMPLES[choice];
  return (
    <div className={`vendor-example vendor-example-${vendor.id}`}>
      <div className="vendor-example-top"><span>interactive example</span><span>{vendor.name} × ourspaces</span></div>
      {vendor.id === "convex" && <>
        <div className="vendor-twin-boards">
          {["your screen", "their screen"].map((label) => <div className="vendor-mini-board" key={label}>
            <span className="vendor-mini-label">{label}</span>
            <div className={`vendor-moving-note${choice % 2 ? " has-moved" : ""}`}><small>friday’s plan</small><strong>Pizza.<br />7pm.<br />Us.</strong><span>✳</span></div>
            <span className="vendor-board-corner">our very good plans</span>
          </div>)}
        </div>
        <div className="vendor-connection"><span /> one shared canvas <span /></div>
        <button className="vendor-example-button" onClick={() => setChoice(choice + 1)}>{choice % 2 ? "put it back" : "move the note"} <span>↗</span></button>
      </>}
      {vendor.id === "openai" && <>
        <div className="vendor-example-tabs">{DECISION_EXAMPLES.map((item, i) => <button key={item.kind} className={choice === i ? "is-selected" : ""} onClick={() => setChoice(i)}>{item.kind}</button>)}</div>
        <div className="vendor-message-input"><span>✉</span><p>{decision.input}</p></div>
        <span className="vendor-down-arrow">↓</span>
        <div className="vendor-decision" key={decision.kind}><span className="vendor-decision-label">{decision.label} ↗</span><p>{decision.where}</p><strong>{decision.value}</strong><span>{decision.detail}</span><small>{decision.because}</small></div>
      </>}
      {vendor.id === "agentmail" && <>
        <div className="vendor-mail-route"><span>your inbox</span><span>↘</span><span>us two</span></div>
        <div className="vendor-letter-preview">
          <LetterWidget widget={{ ...getSpace("couple").widgets.find((widget) => widget.id === "us-letter")!, rotate: 0, data: { from: "ren", subject: "a little hello", text: "hey you,\n\nI walked past our bakery today. Same window seat, same terrible music. Wish you were here.\n\nSaving you the next croissant.", sealed: true } }} style={{ width: "100%", height: "100%" }} />
        </div>
        <span className="vendor-mail-postscript">a message you can keep.</span>
      </>}
      {vendor.id === "firecrawl" && <>
        <div className="vendor-example-tabs">{["a link", "a topic", "a whole site"].map((label, i) => <button key={label} className={choice === i ? "is-selected" : ""} onClick={() => setChoice(i)}>{label}</button>)}</div>
        <div className="vendor-search-example"><span>{choice === 1 ? "⌕" : "↗"}</span><p>{["a good article someone shared", "small tools for creative people", "a site full of good ideas"][choice]}</p></div>
        <div className={`vendor-reading-pile vendor-reading-pile-${choice}`} key={choice}>
          {(choice === 0 ? ["A good idea, worth keeping."] : choice === 1 ? ["A tiny tool for a big idea", "Making things with friends", "A calmer corner of the web"] : ["The ideas", "The people behind them", "How they made it", "What they’re making next"]).map((title, i) => <div className="vendor-reading-slip" key={title} style={{ "--i": i } as CSSProperties}><span>{["↗", "✳", "↗", "✳"][i]}</span><div><strong>{title}</strong><small>{choice === 0 ? "title · summary · source · cover" : choice === 1 ? "a result to read, discuss, or keep" : "a page found during the crawl"}</small></div><span>↗</span></div>)}
        </div>
        <span className="vendor-pile-label">from out there, to in here.</span>
      </>}
      <p className="vendor-example-caption">{vendor.example}</p>
    </div>
  );
}

function VendorPage({ vendor }: { vendor: VendorStory }) {
  const nextVendor = VENDORS[(VENDORS.indexOf(vendor) + 1) % VENDORS.length];
  return (
    <main className={`about-page vendor-page vendor-${vendor.id}`} style={{ "--vendor-color": `var(--color-${vendor.color})` } as CSSProperties}>
      <nav className="about-bar about-wrap">
        <a className="about-brand" href="#/about"><img src="/assets/ourspace-mark.png" alt="" /><span>ourspaces</span><small>made with</small></a>
        <a className="about-back" href="#/about"><span>←</span> back to about</a>
      </nav>
      <nav className="vendor-nav about-wrap">{VENDORS.map((item) => <a key={item.id} href={`#/about/${item.id}`} className={item.id === vendor.id ? "is-selected" : ""} style={{ "--nav-color": `var(--color-${item.color})` } as CSSProperties}>{item.name}<span>↗</span></a>)}</nav>
      <header className="vendor-hero about-wrap">
        <div className="vendor-hero-copy"><p className="vendor-credit">{vendor.name} <span> / {vendor.role}</span></p><h1>{vendor.headline[0]}<br /><span>{vendor.headline[1]}</span></h1><p className="vendor-intro">{vendor.intro}</p><a className="about-button" href={normalSpaceHash(vendor.room)}>{vendor.roomLabel}<span>↗</span></a><span className="vendor-hero-footnote">See what it makes possible in a real space.</span></div>
        <VendorExample vendor={vendor} />
      </header>
      <section className="vendor-journey about-wrap">
        <div className="about-section-heading"><h2>{vendor.journeyTitle}</h2><p>The path from one small action<br />to something the whole room can use.</p></div>
        <ol>{vendor.journey.map(([title, body, source], i) => <li key={title}><span className="vendor-step-number">{i + 1}</span><h3>{title}</h3><p>{body}</p><a href={`${REPO_URL}/blob/main/${source}`} target="_blank" rel="noreferrer">follow it in the code ↗</a></li>)}</ol>
      </section>
      <section className="vendor-capabilities about-wrap">
        <div className="vendor-section-title"><span>{vendor.name} in OurSpaces</span><h2>Where it<br />shows up.</h2><p>Specific jobs in the app.<br />Each one has a place you can point to.</p></div>
        <div>{vendor.capabilities.map(([title, body, source]) => <article key={title}><h3>{title}</h3><p>{body}</p><a href={`${REPO_URL}/blob/main/${source}`} target="_blank" rel="noreferrer">see the implementation <span>↗</span></a></article>)}</div>
      </section>
      <section className="vendor-technical about-wrap"><div className="about-section-heading"><h2>A closer look.</h2><p>The choices behind the behavior.<br />Open whichever part you’re curious about.</p></div>{vendor.technical.map(([title, body, source]) => <details key={title} className="about-under-hood"><summary>{title}<span>+</span></summary><div className="about-tech"><p>{body}</p><a href={`${REPO_URL}/blob/main/${source}`} target="_blank" rel="noreferrer">{source} ↗</a></div></details>)}</section>
      <footer className="vendor-footer about-wrap"><div><span>One part of a shared place.</span><h2>Meet the rest.</h2></div><a className="vendor-next" href={`#/about/${nextVendor.id}`} style={{ "--next-color": `var(--color-${nextVendor.color})` } as CSSProperties}><span>up next</span><strong>{nextVendor.name}</strong><span>↗</span></a><div className="vendor-footer-links"><a href="#/about">← the OurSpaces story</a><a href={normalSpaceHash(lastSpaceSlug())}>back to your space ↗</a><a href={REPO_URL} target="_blank" rel="noreferrer">made in the open ↗</a></div></footer>
    </main>
  );
}

function vendorFromHash() {
  return window.location.hash.replace(/^#\/?about\/?/, "");
}

export function About() {
  const [vendorId, setVendorId] = useState(vendorFromHash);
  useEffect(() => {
    const onHash = () => setVendorId(vendorFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [vendorId]);
  const vendor = VENDORS.find((item) => item.id === vendorId);
  return vendor ? <VendorPage key={vendor.id} vendor={vendor} /> : <AboutOverview />;
}
