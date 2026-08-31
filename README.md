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

- **Components (15):** `static-hosting`, `firecrawl` (AgentMail is called over
  plain REST from `convex/agentmail.ts` — its component's actions don't
  resolve through `ctx.runAction`), `migrations` (widget-data backfills),
  `aggregate` (poll tallies + member counts, two named instances),
  `sharded-counter` (global live totals), `rate-limiter` (LLM/mail/paint
  quotas), `action-retrier` (Firecrawl + AgentMail retries),
  `action-cache` (scrape + question-gen caching), `workpool` (bounded recap
  fan-out), `workflow` (durable weekly digest), `batch-worker` (stale-link
  refresh queue), `agent` (ask-the-space threads), `rag` (semantic search
  grounding `recap.ask`), `persistent-text-streaming` (HTTP token
  streaming for ask answers), `presence` (space-list "N here" — separate
  from the hand-rolled canvas cursor/gesture system)
- **Schema & data:** tables + indexes for spaces, members, widgets, messages
  (+ full-text search index), votes, collaborative paint marks, recaps,
  presence, email events; `returns:` validators on every function
- **Realtime:** live queries drive the canvas, presence cursors/gestures, and
  poll + cozy-color results — no hand-rolled sync
- **Functions:** queries, mutations, internal mutations, actions, HTTP actions
  (svix-verified inbound-mail webhook, token-streaming ask endpoint), paginated
  message history
- **Scheduling:** crons (stale-presence sweep every minute, daily recap via
  workpool, Friday weekly digest via a durable workflow, Friday stale-link
  refresh) + scheduled functions
- **File storage:** photo-wall uploads become prints with notes on the back
- **Integrations:** AgentMail gives every space a real inbox — inbound mail is
  routed onto the canvas (sealed letter, link into the reading pile + Firecrawl
  enrich, or an AI-filed expense row / itinerary day); Firecrawl turns pasted
  webpages into reactive rich-post widgets; OpenAI-class models via a
  Cloudflare AI proxy, with the OpenAI API as fallback (real OpenAI embeddings
  for rag, since the proxy has no embeddings route)

## Run

```bash
npm install
npx convex dev        # once, to provision; writes .env.local
npm run dev           # frontend
npm run dev:backend   # convex dev
```
