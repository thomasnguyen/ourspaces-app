# OurSpaces

> Group chats forget. Spaces remember.

Turn your group chat into a place. Forward it an email, drop it a link, and it
remembers for everyone — live.

Built for the [Convex All Gas Hackathon](https://www.convex.dev/hackathons/all-gas)
by Thomas Nguyen (build) and Holly (design).

**Build log:** `hackathon.md`

## Stack

Convex · Vite + React + TypeScript · Tailwind v4 · OpenAI-class models (a
Cloudflare Worker proxy when its env vars are set, the OpenAI API otherwise —
a config-time choice, not a runtime failover) · AgentMail · Firecrawl

## Convex depth

- **Components (17 used in code):** `static-hosting` (serves this site, and
  `getCurrentDeployment` is subscribed to so an open tab is offered a refresh
  the moment a new build lands — `convex/staticHosting.ts`), `firecrawl` (single-URL scrape + web
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
- **Plus Convex Auth (`@convex-dev/auth`)** — silent anonymous guest sessions,
  so every visitor has a real Convex identity without ever seeing a login form,
  and an optional join with a six-digit code emailed through AgentMail
  (`convex/auth.ts`, `convex/otp.ts`). The canvas is never behind a wall.
- **A note on the count:** a scan for `components.<name>` finds 17, because
  `aggregate` is mounted as the two *named* instances above — the call sites
  are `components.pollTallies` and `components.memberCounts`, never a bare
  `components.aggregate`.
- **Schema & data:** tables + indexes for spaces, members, widgets, messages
  (+ full-text search index), votes, collaborative paint marks, recaps,
  presence, email events; `returns:` validators on all 130 functions that can
  carry one (the 5 HTTP actions return a `Response`)
- **Realtime:** every in-space surface is a Convex subscription — no refetch,
  no invalidate-on-write, no hand-rolled sync between clients. Each one is a
  `useQuery` / `usePaginatedQuery` against an indexed query:

  ```ts
  // src/live/useSpaceData.ts — the whole board in one subscription
  const result = useQuery(api.spaces.getSpaceWithWidgets, mode === "live" ? { slug } : "skip");
  ```

  ```ts
  // src/live/usePresence.ts — cursors, and the gesture lock that arbitrates writes
  const rows = useQuery(api.presence.listHereNow, spaceId ? { spaceId } : "skip");
  const claimMutation  = useMutation(api.presence.claimGesture);
  const finishMutation = useMutation(api.presence.finishGesture);
  ```

  ```ts
  // src/live/useLiveHandlers.ts — Convex's optimistic layer on the writes the
  // server applies unconditionally. The gesture path deliberately keeps a
  // hand-rolled one: `finishGesture` can *refuse* a commit (stale lock,
  // competing peer, TTL) and an optimistic update can neither read a
  // mutation's verdict nor roll back conditionally.
  const move = useMemo(
    () => moveWidget.withOptimisticUpdate((store, { spaceId, id, x, y, z }) =>
      patchWidgetBox(store, spaceId, id, z === undefined ? { x, y } : { x, y, z }),
    ),
    [moveWidget],
  );
  ```

  The full map, each surface tied to its query and its file:

  - `spaces.getSpaceWithWidgets` → the canvas itself (`src/live/useSpaceData.ts`).
    A drag, resize, edit or delete by anyone lands for everyone.
  - `presence.listHereNow` → cursors and gesture locks (`src/live/usePresence.ts`).
    `claimGesture` / `updateGesture` / `finishGesture` double as the widget-commit
    and lock-arbitration mechanism, so "who is dragging this" and "who owns the
    write" are the same reactive row — and the canvas's live strip names them
    ("sam is moving the friday poll") straight off it.
  - `votes.getResults` → poll bars move as votes land (`src/live/useLivePoll.ts`).
    The rows carry voter names because every bar names who is behind it and who
    still owes a vote; the `pollTallies` aggregate serves the counts where only
    the number is wanted (`convex/recap.ts`).
  - `paint.listBySpace` → collaborative paint-by-number marks.
  - `messages.listBySpace` → the thread. A real cursor-paginated subscription
    (`paginationOpts` + `usePaginatedQuery`); the space-wide thread currently
    pulls all of its pages on mount, so pagination is doing the transport, not
    yet the windowing. Plus a `search_text` full-text search index.
  - `recap.latest` → the recap strip updates when the cron writes a new one.
  - `roomPresence.onlineCountForSpace` → "N here", via the `presence` component.
    The space header, the canvas live strip and the space rail all read this
    one query, so the three numbers on screen cannot disagree.
  - `stats.getLiveCounts` → global totals on the landing block, backed by
    `sharded-counter`. The one surface that is not push-only: a clock read
    inside a query would freeze at whatever the first caller saw, so the query
    takes a `now` bucket as an argument and the client re-keys it every 15s.
  - `firecrawl.getCrawlStatus` + `firecrawl.listCrawlPages` → crawled pages
    stream into the strip as they arrive (`src/components/CrawlStrip.tsx`).
  - `staticHosting.getCurrentDeployment` → publishing a build patches the
    component's deployment row, which invalidates this subscription, and every
    open tab is offered a refresh before its lazy chunks 404.
- **Functions:** queries, mutations, internal mutations, actions, HTTP actions
  (svix-verified inbound-mail webhook, token-streaming ask endpoint), paginated
  message history
- **Scheduling:** crons (stale-presence sweep every 5 minutes, daily recap via
  workpool, Friday weekly digest via a durable workflow, Friday stale-link
  refresh) + scheduled functions
- **File storage:** photo-wall uploads become prints with notes on the back
- **Integrations:** AgentMail gives every space a real inbox — inbound mail is
  routed onto the canvas (sealed letter, link into the reading pile + Firecrawl
  enrich, or an AI-filed expense row / itinerary day), and the space **replies
  in-thread + labels** each message with what it did; Firecrawl turns pasted
  webpages into reactive rich-post widgets, and also powers **research a topic**
  (web search → cards) and **crawl a site** (durable crawl whose pages stream
  live into the reading room); OpenAI-class models through a Cloudflare AI
  proxy when it is configured, the OpenAI API otherwise (real OpenAI embeddings
  for rag either way — the proxy has no embeddings route)

## Run

```bash
npm install
npx convex dev        # once, to provision; writes .env.local
npm run dev           # frontend
npm run dev:backend   # convex dev
```
