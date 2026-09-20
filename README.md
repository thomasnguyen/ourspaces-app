# OurSpaces

> Group chats forget. Spaces remember.

Turn your group chat into a place. Forward it an email, drop it a link, and it
remembers for everyone — live.

Built for the [Convex All Gas Hackathon](https://www.convex.dev/hackathons/all-gas)
by Thomas Nguyen (build) and Holly (design).

**Build log:** `hackathon.md` · **Demo video:** https://www.youtube.com/watch?v=0VVFWbfX1QQ

## Stack

Convex (including the **Convex AI Gateway** for every model call) · Vite +
React + TypeScript · Tailwind v4 · AgentMail · Firecrawl

## Convex depth

- **Components (17 used in code):** `static-hosting` (serves this site —
  `convex/staticHosting.ts`), `firecrawl` (scrape, web search, durable crawl),
  `agentMail` (our own first-party component in `convex/components/agentMail/` —
  every space's inbox: create/send/reply/label over the AgentMail REST API, plus
  an inbound-message store + webhook dedup), `migrations` (widget-data
  backfills), `aggregate` (poll tallies + member counts, mounted as two *named
  instances* — `convex/votes.ts`, `convex/spaces.ts`), `sharded-counter` (global
  live totals), `rate-limiter` (LLM/mail/paint quotas), `action-retrier`
  (Firecrawl + AgentMail retries), `action-cache` (scrape + question-gen
  caching), `workpool` (bounded recap fan-out), `workflow` (durable weekly
  digest), `batch-worker` (stale-link refresh queue), `agent` (ask-the-space
  threads), `rag` (semantic search grounding `recap.ask`),
  `persistent-text-streaming` (the ask answer types itself into the dock over
  `/api/ask-stream`, persisted so a reload or a second window reads the same
  one), `presence` (space-list "N here" — separate
  from the hand-rolled canvas cursor/gesture system)
- **Plus Convex Auth (`@convex-dev/auth`)** — silent anonymous guest sessions,
  so every visitor has a real Convex identity without ever seeing a login form,
  and an optional join with a six-digit code emailed through AgentMail
  (`convex/auth.ts`, `convex/otp.ts`). The canvas is never behind a wall.
- **A note on the count:** the 17 are the names code calls — `aggregate` appears
  as its two instance names. Three installed packages are never called as
  `components.<name>`: `aggregate` itself, `auth` (a library, not an `app.use`d
  component), `authWellKnown` (ours, mounted for its OIDC routes). A fourth,
  `@convex-dev/ai-sdk-provider`, is an AI SDK provider rather than a component —
  no `convex.config` to mount; `convex/ai.ts` imports `convexGateway` from it.
- **Schema & data:** 13 tables, 30 indexes, 1 full-text search index, 1 vector
  index — spaces, members, widgets, messages, votes, collaborative paint marks,
  recaps, presence, ask streams, email events, saved room baselines. The vector index
  `widgets.by_embedding` powers "already on the board" (`convex/similar.ts`):
  arriving mail is embedded and `ctx.vectorSearch` asks if the room has it.
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
  // server applies unconditionally. The gesture path keeps a hand-rolled one:
  // `finishGesture` can *refuse* a commit (stale lock, competing peer, TTL) and
  // an optimistic update can neither read that verdict nor roll back on it.
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
    write" are the same reactive row the live strip reads ("sam is moving the
    friday poll").
  - `votes.getResults` → poll bars move as votes land (`src/live/useLivePoll.ts`).
    The rows carry voter names, so every bar says who is behind it and who still
    owes a vote; the `pollTallies` aggregate serves the counts-only call sites
    (`convex/recap.ts`).
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
    inside a query would freeze at whatever the first caller saw, so it takes a
    `now` bucket argument the client re-keys every 15s.
  - `firecrawl.getCrawlStatus` + `firecrawl.listCrawlPages` → crawled pages
    stream into the strip as they arrive (`src/components/CrawlStrip.tsx`).
  - `staticHosting.getCurrentDeployment` → publishing a build patches the
    component's deployment row, which invalidates this subscription, and every
    open tab is offered a refresh before its lazy chunks 404.
- **Functions:** 45 queries + 72 mutations + 34 actions = 151, every one carrying
  a `returns:` validator. The other 6 are HTTP actions (svix-verified inbound
  mail, `/api/ask-stream`): `httpAction` takes a bare handler returning a
  `Response`, so there is no `returns:` slot to fill.
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
  live into the reading room); every model call goes through the **Convex AI
  Gateway** on a short-lived deployment credential rather than an API key we
  carry: `openai/gpt-4o-mini` for chat and structured decisions,
  `openai/text-embedding-3-small` (1536 dims) for rag and the echo index. Setting
  `AI_GATEWAY_DISABLED` picks the pre-gateway targets instead — a Cloudflare
  Workers AI proxy (`@cf/openai/gpt-oss-120b`), else OpenAI directly — a
  config-time choice, not a runtime failover

## Run

```bash
npm install
npx convex dev        # once, to provision; writes .env.local
npm run dev           # frontend
npm run dev:backend   # convex dev
```
