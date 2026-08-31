/**
 * The build room's link pile. One source for both paths: mock mode reads this
 * array directly, `seed:demo` writes the same rows into the `links` table.
 *
 * Covers are deliberately absent — 47 hotlinked og:images would half-fail on
 * camera. Rows render a flat monogram tile off the domain instead, and the
 * reading circle falls back to the designed paper collage.
 */

export type LinkKind = "article" | "video" | "repo" | "discussion" | "tool" | "docs";

export type BuildRoomLink = {
  id: string;
  url: string;
  domain: string;
  title: string;
  description: string;
  imageUrl: string;
  kind: LinkKind;
  whyItMatters: string;
  questions: { id: string; text: string }[];
  status: "pending" | "ready" | "failed";
  batchKey: string;
  droppedBy: string;
  droppedByName: string;
  droppedAt: number;
  voters: string[];
  pinned?: boolean;
  keptAt?: number;
};

/** Who dropped each stretch of links, and when their newest one landed.
    Individual drops are staggered minutes apart below — links arrive one at
    a time here, never as a paste-bomb. */
const BATCHES: { by: string; minutesAgo: number }[] = [
  { by: "Maya", minutesAgo: 12 },
  { by: "Sam", minutesAgo: 60 * 30 },
  { by: "Alex", minutesAgo: 60 * 44 },
  { by: "Priya", minutesAgo: 60 * 72 },
  { by: "Jordan", minutesAgo: 60 * 121 },
  { by: "Marco", minutesAgo: 60 * 190 },
  // Singles woven through this morning so the feed reads as a live room.
  { by: "Riley", minutesAgo: 26 },
  { by: "Jordan", minutesAgo: 58 },
];

const EVERYONE = ["Maya", "Sam", "Alex", "Jordan", "Priya", "Marco", "Riley"];

type Raw = {
  url: string;
  title: string;
  desc: string;
  kind: LinkKind;
  batch: number;
  why: string;
  qs: [string, string];
  /** How many of the room upvoted it. */
  votes: number;
  pinned?: boolean;
  kept?: boolean;
};

const RAW: Raw[] = [
  // ── batch 0 · Maya, 12 min ago (9 links, the "+9 today") ──
  {
    url: "https://www.anthropic.com/engineering/building-effective-agents",
    title: "building effective agents",
    desc: "Workflows vs agents, and why most problems want the simpler one.",
    kind: "article", batch: 0, votes: 6, pinned: true,
    why: "Names the thing we keep arguing about: a chained workflow is not an agent, and reaching for the agent first is why our loops get flaky.",
    qs: ["which of our jobs is secretly just a workflow?", "where would you actually hand over control?"],
  },
  {
    url: "https://martinfowler.com/articles/patterns-of-distributed-systems/",
    title: "patterns of distributed systems",
    desc: "The catalogue — write-ahead log, leases, quorum, versioned values.",
    kind: "docs", batch: 0, votes: 4,
    why: "A shared vocabulary for the retry and ordering bugs we keep rediscovering by hand.",
    qs: ["which pattern have we reinvented badly?", "is a lease enough for our job runner?"],
  },
  {
    url: "https://stripe.com/blog/online-migrations",
    title: "online migrations at scale",
    desc: "Dual writes, backfill, and the four-phase migration that never takes downtime.",
    kind: "article", batch: 0, votes: 5, kept: true,
    why: "The four-phase shape (dual write → backfill → dual read → drop) is exactly what our schema change needs next sprint.",
    qs: ["can we dual-write without doubling the bill?", "who owns the backfill when it stalls?"],
  },
  {
    url: "https://react.dev/learn/you-might-not-need-an-effect",
    title: "you might not need an effect",
    desc: "Most effects are derived state wearing a costume.",
    kind: "docs", batch: 0, votes: 5,
    why: "Half our re-render bugs are an effect syncing state that could have been computed during render.",
    qs: ["which effect in our tree is the worst offender?", "hot take — is useEffect overused here?"],
  },
  {
    url: "https://danluu.com/postmortem-lessons/",
    title: "lessons learned from reading postmortems",
    desc: "The same handful of causes, over and over, across every company.",
    kind: "article", batch: 0, votes: 3,
    why: "Config changes and error handling cause more outages than clever distributed-systems failures do.",
    qs: ["what's our config change process, honestly?", "when did an error handler last take us down?"],
  },
  {
    url: "https://docs.convex.dev/database/indexes/",
    title: "indexes and query performance",
    desc: "How index ranges work, and why a full scan is fine until it isn't.",
    kind: "docs", batch: 0, votes: 2,
    why: "Direct answer to the read-limit warnings we hit last week.",
    qs: ["which query is scanning the most?", "do we need a compound index yet?"],
  },
  {
    url: "https://github.com/evilmartians/lefthook",
    title: "lefthook — fast git hooks",
    desc: "Parallel hook runner, one YAML file, no node dependency.",
    kind: "repo", batch: 6, votes: 4,
    why: "Runs our lint and typecheck hooks in parallel instead of serially — measurably faster than husky on this repo's size.",
    qs: ["is a pre-commit hook worth the friction?", "what would you actually run on commit?"],
  },
  {
    url: "https://www.postgresql.org/docs/current/indexes-types.html",
    title: "postgres index types",
    desc: "B-tree, hash, GiST, GIN, BRIN — and when each one earns its keep.",
    kind: "docs", batch: 0, votes: 2,
    why: "GIN vs BRIN is the actual decision on the events table, and we've been guessing.",
    qs: ["brin on the events table — yes or no?", "have we ever measured an index we added?"],
  },
  {
    url: "https://brendangregg.com/usemethod.html",
    title: "the USE method",
    desc: "Utilization, saturation, errors — a checklist for finding the bottleneck.",
    kind: "article", batch: 7, votes: 3,
    why: "A repeatable first ten minutes for 'the app feels slow' instead of six people guessing in a thread.",
    qs: ["what's our first move when it's slow?", "which resource do we never check?"],
  },

  // ── batch 1 · Sam, yesterday (6) ──
  {
    url: "https://github.com/BurntSushi/ripgrep",
    title: "ripgrep",
    desc: "Recursive search that respects gitignore and is genuinely fast.",
    kind: "repo", batch: 1, votes: 3,
    why: "The gitignore-aware default is why searching this repo stopped being painful.",
    qs: ["what's still in your grep muscle memory?", "worth aliasing over grep?"],
  },
  {
    url: "https://sqlite.org/whentouse.html",
    title: "appropriate uses for sqlite",
    desc: "The official answer to 'is sqlite a real database'.",
    kind: "docs", batch: 1, votes: 4, kept: true,
    why: "SQLite is the right default far more often than we assume — the network is usually the thing that made postgres necessary, not the data.",
    qs: ["could our smallest service be sqlite?", "when does it actually stop working?"],
  },
  {
    url: "https://aphyr.com/posts/313-strong-consistency-models",
    title: "strong consistency models",
    desc: "Linearizable, sequential, causal — drawn as a lattice you can point at.",
    kind: "article", batch: 1, votes: 5,
    why: "Settles the 'is it eventually consistent' argument by making people name which model they mean.",
    qs: ["which model do we actually need?", "where do we quietly assume linearizable?"],
  },
  {
    url: "https://jepsen.io/analyses",
    title: "jepsen analyses",
    desc: "Every database, tested until its consistency claims break.",
    kind: "article", batch: 1, votes: 3,
    why: "Before we trust a vendor's consistency claim, this is the second opinion.",
    qs: ["did any result here change your mind?", "do we test our own guarantees at all?"],
  },
  {
    url: "https://martinfowler.com/bliki/TwoHardThings.html",
    title: "two hard things",
    desc: "Cache invalidation, naming things, and off-by-one errors.",
    kind: "article", batch: 1, votes: 2,
    why: "Short enough to actually send when a naming argument passes twenty minutes.",
    qs: ["what's the worst name in our codebase?", "cache invalidation or naming — which bites us more?"],
  },
  {
    url: "https://use-the-index-luke.com/",
    title: "use the index, luke",
    desc: "SQL indexing and tuning, explained for developers rather than DBAs.",
    kind: "docs", batch: 1, votes: 4,
    why: "The chapter on the leading column of a compound index is the fix for our slowest endpoint.",
    qs: ["which endpoint would this fix first?", "should this be onboarding reading?"],
  },

  // ── batch 2 · Alex, two days ago (9) ──
  {
    url: "https://blog.cloudflare.com/introducing-workers-durable-objects/",
    title: "durable objects, introduced",
    desc: "Single-threaded stateful coordination at the edge.",
    kind: "article", batch: 2, votes: 4,
    why: "The per-object single-writer model is a cleaner answer to our locking problem than the queue we sketched.",
    qs: ["would this kill our lock table?", "what breaks at one object per room?"],
  },
  {
    url: "https://react.dev/blog/2024/04/25/react-19",
    title: "react 19",
    desc: "Actions, the compiler, ref as a prop, and what finally got removed.",
    kind: "article", batch: 2, votes: 6,
    why: "The compiler removes most of the memo work we hand-write, which is most of our review comments.",
    qs: ["are we upgrading or waiting?", "what would you delete first?"],
  },
  {
    url: "https://github.com/tokio-rs/tokio",
    title: "tokio",
    desc: "The async runtime most of the rust ecosystem is built on.",
    kind: "repo", batch: 2, votes: 2,
    why: "Worth reading the scheduler source even if we never ship rust — the work-stealing design is the reference.",
    qs: ["is there a rust-shaped problem here?", "what would you rewrite, honestly?"],
  },
  {
    url: "https://danluu.com/input-lag/",
    title: "computer latency: 1977–2017",
    desc: "Modern machines are slower to respond than an Apple IIe.",
    kind: "article", batch: 2, votes: 5, pinned: true,
    why: "Reframes performance as felt latency instead of p99 charts — which is the only number a demo viewer perceives.",
    qs: ["what in our app feels laggy?", "is p99 lying to us?"],
  },
  {
    url: "https://www.nngroup.com/articles/response-times-3-important-limits/",
    title: "the three response-time limits",
    desc: "100ms, 1s, 10s — the thresholds where attention breaks.",
    kind: "article", batch: 2, votes: 3,
    why: "Gives us actual budgets instead of 'make it faster': anything over 100ms needs a state, over 1s needs a progress signal.",
    qs: ["which interaction blows the 1s budget?", "do we show progress anywhere?"],
  },
  {
    url: "https://www.usenix.org/conference/srecon",
    title: "srecon talks",
    desc: "Operations conference archive — mostly failure stories.",
    kind: "video", batch: 2, votes: 2,
    why: "The failure talks are more useful than the architecture talks, and nobody watches them.",
    qs: ["any talk worth an hour?", "should we do a watch party?"],
  },
  {
    url: "https://github.com/sindresorhus/awesome",
    title: "awesome",
    desc: "The index of every awesome-list.",
    kind: "repo", batch: 2, votes: 1,
    why: "A starting point when scoping an unfamiliar ecosystem, and a graveyard otherwise.",
    qs: ["do these lists ever help you?", "what's the last tool you found this way?"],
  },
  {
    url: "https://grugbrain.dev/",
    title: "the grug brained developer",
    desc: "Complexity is the enemy. Grug says so repeatedly.",
    kind: "article", batch: 2, votes: 6,
    why: "The 'say no to complexity spirit demon' framing has ended more design arguments here than any diagram.",
    qs: ["what's our biggest complexity demon?", "which abstraction should we delete?"],
  },
  {
    url: "https://ferd.ca/the-review-is-the-action-item.html",
    title: "the review is the action item",
    desc: "Incident reviews produce understanding, not a to-do list.",
    kind: "article", batch: 2, votes: 3,
    why: "Our postmortems generate tickets nobody closes; the argument is that the shared understanding was the deliverable.",
    qs: ["do our action items ever ship?", "what did our last incident teach us?"],
  },

  // ── batch 3 · Priya, three days ago (7) ──
  {
    url: "https://queue.acm.org/detail.cfm?id=3454124",
    title: "the c++ of distributed systems",
    desc: "On accidental complexity in the modern infrastructure stack.",
    kind: "article", batch: 3, votes: 2,
    why: "Names the tax we pay for a stack assembled from a dozen defaults nobody chose.",
    qs: ["what's our accidental complexity?", "which dependency would you drop?"],
  },
  {
    url: "https://www.hillelwayne.com/post/what-we-know-we-dont-know/",
    title: "what we know we don't know",
    desc: "Almost no software engineering claim has real evidence behind it.",
    kind: "article", batch: 3, votes: 4,
    why: "Most of our 'best practices' are folklore with a citation chain that dead-ends — worth holding opinions loosely.",
    qs: ["which practice do we follow on faith?", "what would change your mind?"],
  },
  {
    url: "https://increment.com/testing/",
    title: "increment: testing",
    desc: "How real teams actually test, versus how they say they test.",
    kind: "article", batch: 3, votes: 3,
    why: "The gap between stated and actual testing strategy is the interesting part, and it matches ours.",
    qs: ["what's our real test strategy?", "which tests do we not trust?"],
  },
  {
    url: "https://blog.cloudflare.com/workers-ai/",
    title: "inference at the edge",
    desc: "Running models on the same network that serves the request.",
    kind: "article", batch: 3, votes: 2,
    why: "Cuts a round trip out of anything we'd want to enrich inline instead of in a background job.",
    qs: ["what would we run inline?", "is the latency worth the model tradeoff?"],
  },
  {
    url: "https://simonwillison.net/tags/llms/",
    title: "simon willison on llms",
    desc: "Ongoing running notes — prompt injection, tools, and what actually works.",
    kind: "article", batch: 3, votes: 5,
    why: "The prompt-injection posts are the reason we don't let a model call a mutation without a human gate.",
    qs: ["where are we exposed to injection?", "what's the last thing here that surprised you?"],
  },
  {
    url: "https://github.com/openai/openai-cookbook",
    title: "openai cookbook",
    desc: "Working examples for structured output, evals, and function calling.",
    kind: "repo", batch: 3, votes: 3,
    why: "The structured-output recipes are exactly the shape we use for the extractor — copy the retry loop, not the prose.",
    qs: ["are we handling schema failures?", "which recipe should we steal?"],
  },
  {
    url: "https://news.ycombinator.com/item?id=39698546",
    title: "ask hn: what's your deployment story?",
    desc: "Several hundred teams describing what they actually run.",
    kind: "discussion", batch: 3, votes: 4,
    why: "The comments are more honest than any vendor case study about how much of this is still a bash script.",
    qs: ["what's our real deploy story?", "what would you steal from this thread?"],
  },

  // ── batch 4 · Jordan, five days ago (9) ──
  {
    url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/",
    title: "designing data-intensive applications",
    desc: "The book everyone cites and half of us finished.",
    kind: "article", batch: 4, votes: 7, pinned: true, kept: true,
    why: "Chapter 5 on replication is the reference for the read-replica argument we keep restarting.",
    qs: ["did anyone get past chapter 5?", "which chapter changed how you build?"],
  },
  {
    url: "https://github.com/donnemartin/system-design-primer",
    title: "system design primer",
    desc: "The interview-prep repo that turned into a real reference.",
    kind: "repo", batch: 4, votes: 4,
    why: "Good diagrams to point at in a design doc, even though it's written for interviews.",
    qs: ["is this still interview-shaped?", "what's missing from it?"],
  },
  {
    url: "https://www.figma.com/blog/how-figmas-multiplayer-technology-works/",
    title: "how figma's multiplayer works",
    desc: "Why they picked their own CRDT-ish model over OT.",
    kind: "article", batch: 4, votes: 6, kept: true,
    why: "Last-writer-wins per property is enough for a canvas — full CRDT machinery buys correctness we don't need.",
    qs: ["is LWW enough for our canvas?", "what would break with two editors?"],
  },
  {
    url: "https://www.inkandswitch.com/local-first/",
    title: "local-first software",
    desc: "Seven ideals for software that keeps working offline.",
    kind: "article", batch: 4, votes: 5,
    why: "The seven ideals are a scoring rubric — we hit about four, and the missing three are the ones users feel.",
    qs: ["which ideal do we fail worst?", "does offline matter for us?"],
  },
  {
    url: "https://josephg.com/blog/crdts-are-the-future/",
    title: "crdts are the future",
    desc: "And then, later, a post about why they're harder than that.",
    kind: "article", batch: 4, votes: 3,
    why: "Read alongside the follow-up — the reversal is the useful part.",
    qs: ["crdt or server authority?", "what's the simplest thing that works?"],
  },
  {
    url: "https://www.youtube.com/watch?v=8aGhZQkoFbQ",
    title: "what the hell is the event loop anyway",
    desc: "The talk that made the call stack click for a generation.",
    kind: "video", batch: 4, votes: 4,
    why: "Still the fastest way to get someone from 'async is magic' to 'async is a queue'.",
    qs: ["who should watch this?", "what finally made it click for you?"],
  },
  {
    url: "https://overreacted.io/a-complete-guide-to-useeffect/",
    title: "a complete guide to useEffect",
    desc: "Mental model first, API second.",
    kind: "article", batch: 4, votes: 5,
    why: "The 'each render has its own props and state' frame is the thing that fixes stale-closure bugs permanently.",
    qs: ["last stale closure that got you?", "does the mental model hold in react 19?"],
  },
  {
    url: "https://kentcdodds.com/blog/stop-mocking-fetch",
    title: "stop mocking fetch",
    desc: "Mock the network, not the function that calls it.",
    kind: "article", batch: 4, votes: 2,
    why: "Our mocks assert that we called a function, not that the feature works — this is the fix.",
    qs: ["what do our tests actually prove?", "worth the migration?"],
  },
  {
    url: "https://www.gitpod.io/blog/openvscode-server-launch",
    title: "running vscode on a server",
    desc: "The architecture behind remote development environments.",
    kind: "article", batch: 4, votes: 1,
    why: "Relevant if we ever want reviewers to open a branch without installing anything.",
    qs: ["would remote envs help us?", "what's your local setup pain?"],
  },

  // ── batch 5 · Marco, eight days ago (7) ──
  {
    url: "https://www.kalzumeus.com/2011/10/28/dont-call-yourself-a-programmer/",
    title: "don't call yourself a programmer",
    desc: "Career advice that aged unusually well.",
    kind: "article", batch: 5, votes: 6,
    why: "The 'you solve business problems' reframe is what actually moves the level conversation.",
    qs: ["how do you describe your job?", "did this change how you interview?"],
  },
  {
    url: "https://staffeng.com/guides/staff-archetypes/",
    title: "staff engineer archetypes",
    desc: "Tech lead, architect, solver, right hand — four different jobs.",
    kind: "article", batch: 5, votes: 5,
    why: "Most staff-level confusion is two people picturing different archetypes; naming yours makes the promo case legible.",
    qs: ["which archetype are you closest to?", "which one does this team need?"],
  },
  {
    url: "https://lethain.com/forty-year-career/",
    title: "the forty-year career",
    desc: "Pacing, and why the sprint framing burns people out.",
    kind: "article", batch: 5, votes: 4,
    why: "Pace, not intensity, is the variable — relevant to how we've been running the last two months.",
    qs: ["are we pacing or sprinting?", "what would you change about your pace?"],
  },
  {
    url: "https://blog.pragmaticengineer.com/what-silicon-valley-gets-right-on-software-engineers/",
    title: "what silicon valley gets right about engineers",
    desc: "Autonomy, ownership, and paying for it.",
    kind: "article", batch: 5, votes: 3,
    why: "Useful ammunition for the autonomy conversation, with the tradeoffs stated honestly.",
    qs: ["how much autonomy do we actually have?", "what would you trade for more?"],
  },
  {
    url: "https://apenwarr.ca/log/20171213",
    title: "systems design explains the world",
    desc: "Why organizations produce the architectures they produce.",
    kind: "article", batch: 5, votes: 4,
    why: "Conway's law with teeth — our service boundaries match our standup groups almost exactly.",
    qs: ["where does conway's law show in our repo?", "would reorging fix it?"],
  },
  {
    url: "https://news.ycombinator.com/item?id=35079380",
    title: "ask hn: how did you break into tech?",
    desc: "Hundreds of non-linear paths, most of them not a CS degree.",
    kind: "discussion", batch: 5, votes: 5,
    why: "Worth having on hand when someone asks whether their path counts.",
    qs: ["what was your actual path?", "what advice do you disagree with?"],
  },
  {
    url: "https://cate.blog/2021/09/12/how-to-get-promoted/",
    title: "how to get promoted",
    desc: "The work, and the separate work of making the work legible.",
    kind: "article", batch: 5, votes: 4,
    why: "The visibility half is the half we're all bad at, and it's the half that's actually coachable.",
    qs: ["whose work here is invisible?", "what would you write in your own packet?"],
  },
];

const HOUR = 3_600_000;

function domainOf(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Stable pseudo-random voter picks so counts match the copy on every reload. */
function votersFor(seed: number, count: number) {
  const picked: string[] = [];
  for (let step = 0; picked.length < count && step < 40; step += 1) {
    const name = EVERYONE[(seed * 7 + step * 3) % EVERYONE.length];
    if (!picked.includes(name)) picked.push(name);
  }
  return picked;
}

const batchPositions = new Map<number, number>();

export const BUILD_ROOM_LINKS: BuildRoomLink[] = RAW.map((raw, index) => {
  const batch = BATCHES[raw.batch];
  const position = batchPositions.get(raw.batch) ?? 0;
  batchPositions.set(raw.batch, position + 1);
  /* Each drop trails the previous one by a jittered handful of minutes —
     people share links one at a time, not nine at once. */
  const droppedAt =
    Date.now() - (batch.minutesAgo + position * (7 + (index % 4))) * 60_000;
  return {
    id: `bl-${index + 1}`,
    url: raw.url,
    domain: domainOf(raw.url),
    title: raw.title,
    description: raw.desc,
    imageUrl: "",
    kind: raw.kind,
    whyItMatters: raw.why,
    questions: [
      { id: "q1", text: raw.qs[0] },
      { id: "q2", text: raw.qs[1] },
    ],
    status: "ready",
    batchKey: `batch-${raw.batch}`,
    droppedBy: `seed:buildroom:${batch.by.toLowerCase()}`,
    droppedByName: batch.by,
    droppedAt,
    voters: votersFor(index + 1, raw.votes),
    pinned: raw.pinned,
    keptAt: raw.kept ? droppedAt + HOUR : undefined,
  };
});
