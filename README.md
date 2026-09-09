# OurSpaces

> Group chats forget. Spaces remember.

Turn your group chat into a place. Forward it an email, drop it a link, and it
remembers for everyone — live.

Built for the [Convex All Gas Hackathon](https://www.convex.dev/hackathons/all-gas)
by Thomas Nguyen (build) and Holly (design).

**Live:** [necessary-cobra-892.convex.site](https://necessary-cobra-892.convex.site) · **Build log:** `hackathon.md`

## Stack

Convex · Vite + React + TypeScript · Tailwind v4 · OpenAI (via a Cloudflare
Worker proxy, direct OpenAI as fallback) · AgentMail · Firecrawl

## Convex depth

- **Components (16):** `static-hosting`, `firecrawl` (single-URL scrape + web
  search + durable site crawl), `agentMail` (our own first-party component in
  `convex/components/agentMail/` — every space's inbox: create/send/reply/label
  over the AgentMail REST API, plus an inbound-message store + webhook dedup;
  the published `@agentmail/convex` 0.1.0 is unusable), `migrations`
  (widget-data backfills), `aggregate` (poll tallies + member counts — mounted
  as two *named instances*, so the call sites read `components.pollTallies`
  and `components.memberCounts` rather than `components.aggregate`;
  `convex/votes.ts` and `convex/spaces.ts`), `sharded-counter` (global live
  totals), `rate-limiter`
  (LLM/mail/paint quotas), `action-retrier` (Firecrawl + AgentMail retries),
  `action-cache` (scrape + question-gen caching), `workpool` (bounded recap
  fan-out), `workflow` (durable weekly digest), `batch-worker` (stale-link
  refresh queue), `agent` (ask-the-space threads), `rag` (semantic search
  grounding `recap.ask`), `persistent-text-streaming` (HTTP token
  streaming for ask answers), `presence` (space-list "N here" — separate
  from the hand-rolled canvas cursor/gesture system)
- **A note on two of the above:** `static-hosting` is only ever wired in
  `convex.config.ts` (it serves the site; there is no `components.` call site
  by design), and `prosemirror-sync` is installed but **not yet used** — the
  collaborative note editor it would back is unbuilt.
- **Schema & data:** tables + indexes for spaces, members, widgets, messages
  (+ full-text search index), votes, collaborative paint marks, recaps,
  presence, email events; `returns:` validators on every function
- **Realtime:** every live surface is a Convex subscription — no polling, no
  hand-rolled sync, no refetch-on-focus. Each one is a `useQuery` /
  `usePaginatedQuery` against an indexed query:
  - `spaces.getSpaceWithWidgets` → the canvas itself (`src/live/useSpaceData.ts`).
    A drag, resize, edit or delete by anyone lands for everyone.
  - `presence.listHereNow` → cursors and gesture locks (`src/live/usePresence.ts`).
    `claimGesture` / `updateGesture` / `finishGesture` double as the widget-commit
    and lock-arbitration mechanism, so "who is dragging this" and "who owns the
    write" are the same reactive row.
  - `votes.getResults` → poll bars move as votes land (`src/live/useLivePoll.ts`),
    counted through the `pollTallies` aggregate instead of `.collect()`.
  - `paint.listBySpace` → collaborative paint-by-number marks.
  - `messages.listBySpace` → the thread, real cursor pagination via
    `paginationOpts`, plus a `search_text` full-text search index.
  - `recap.latest` → the recap strip updates when the cron writes a new one.
  - `roomPresence.onlineCountForSpace` → "N here" on the space rail
    (`src/components/Rail.tsx`), via the `presence` component.
  - `stats.getLiveCounts` → global live totals on the landing block, backed by
    `sharded-counter`.
  - `firecrawl.getCrawlStatus` + `firecrawl.listCrawlPages` → crawled pages
    stream into the strip as they arrive (`src/components/CrawlStrip.tsx`).
- **Functions:** queries, mutations, internal mutations, actions, HTTP actions
  (svix-verified inbound-mail webhook, token-streaming ask endpoint), paginated
  message history
- **Scheduling:** crons (stale-presence sweep every minute, daily recap via
  workpool, Friday weekly digest via a durable workflow, Friday stale-link
  refresh) + scheduled functions
- **File storage:** photo-wall uploads become prints with notes on the back
- **Integrations:** AgentMail gives every space a real inbox — inbound mail is
  routed onto the canvas (sealed letter, link into the reading pile + Firecrawl
  enrich, or an AI-filed expense row / itinerary day), and the space **replies
  in-thread + labels** each message with what it did; Firecrawl turns pasted
  webpages into reactive rich-post widgets, and also powers **research a topic**
  (web search → cards) and **crawl a site** (durable crawl whose pages stream
  live into the reading room); OpenAI-class models via a Cloudflare AI proxy,
  with the OpenAI API as fallback (real OpenAI embeddings for rag, since the
  proxy has no embeddings route)

## Run

```bash
npm install
npx convex dev        # once, to provision; writes .env.local
npm run dev           # frontend
npm run dev:backend   # convex dev
```
