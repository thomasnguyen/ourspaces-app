# Hackathon log

- **Project:** OurSpaces
- **Event:** Convex All Gas Hackathon
- **What it does:** Group chats forget; OurSpaces gives a friend group a persistent shared canvas with 32 widget types — countdowns, polls, potluck sheets, expenses, reading circles, letters, photos and collaborative art — that every member sees update live.
- **Live app:** https://necessary-cobra-892.convex.site
- **Repo:** https://github.com/thomasnguyen/ourspaces-app
- **Frontend:** Convex static hosting
- **Convex deployment:** https://necessary-cobra-892.convex.cloud
- **Components:** static-hosting, agentMail, firecrawl, migrations, aggregate, sharded-counter, rate-limiter, action-retrier, action-cache, workpool, workflow, batch-worker, agent, rag, persistent-text-streaming, presence, authWellKnown
  - 17 components across 18 mounts; `aggregate` is mounted separately for poll tallies and member counts. Each component's product job is mapped below.
- **Convex features:** 12 tables, 29 indexes, full-text and vector search, 145 validated queries/mutations/actions, 6 HTTP actions, reactive subscriptions, pagination, auth, file storage, scheduled functions, 4 crons, streaming, agent threads and semantic retrieval.
- **Auth:** Convex Auth (`@convex-dev/auth`) — anonymous guest sessions, plus join with an emailed six-digit code
- **AI models:** `openai/gpt-4o-mini` for structured decisions and conversation; `openai/text-embedding-3-small` (1536 dimensions) for RAG and related-widget search, both through the Convex AI Gateway
- **Started:** 2026-08-27T05:09:13Z
- **Last updated:** 2026-09-18T15:33:12Z

## Live demo path

The live URL opens the fully functional production application directly, not a
landing page, mockup or demo shell. A production check after the current
deployment loaded both the crew and build-room canvases with real shared data,
active room counts and the WebSocket-backed `connected for everyone` receipt.
It works without an account.

1. Open **the crew** in two tabs, then vote, claim an item, post a message or
   upload a photo. Each Convex mutation becomes shared state in both views; the
   live-sync pill reflects the client's WebSocket state.
2. Drag a card to see the peer cursor and moving card. Open the memory wall,
   then switch to **us two** and fill a paint-by-number region together.

## Implementation evidence

- Convex is the end-to-end system of record and execution layer: database,
  backend functions, realtime sync, auth, files, scheduled work, components,
  HTTP routes, AI Gateway and frontend hosting all run through the deployed
  Convex application.
- The strongly validated, document-relational schema has 12 application tables
  with typed ownership links: widgets, members and messages belong to spaces;
  votes belong to widgets; presence belongs to a space and user. Its 29 single-
  and compound access-pattern indexes cover space, widget, user, status and
  time. High-churn presence is isolated from stable member rows; deliberate
  hot-path denormalization keeps author identity on messages; a commit-order
  cursor backs the batch queue. One space-filtered full-text index, one
  space-filtered 1536-dimensional vector index and a 33-arm `widgets.data`
  discriminated union cover search, semantic retrieval and 32 specifically
  validated widget types (`convex/schema.ts`, `convex/widgetData.ts`).
- The backend keeps strict query, mutation and action boundaries across 43
  queries, 69 mutations and 33 actions; all 145 declare argument and return
  validators. Named indexes and cursor pagination serve reactive reads such as
  `spaces.getSpaceWithWidgets` and `messages.listBySpace`;
  transactional writes enforce space scope; vote mutations update their source
  rows and aggregate mirror atomically; actions such as
  `firecrawl.scrapeLink` isolate external I/O. Internal functions and the
  scheduler continue durable work, while six HTTP actions handle signed inbound
  mail and the persisted, streamed ask path.
- Product-wide reactive subscriptions provide cross-view consistency without
  manual refetching: `spaces.getSpaceWithWidgets` drives the canvas,
  `presence.listHereNow` drives cursors and gesture locks, `votes.getResults`
  drives poll bars, `paint.listBySpace` drives collaborative art, and
  `roomPresence.onlineCountForSpace` drives occupancy. The production crew
  board rendered live vote and claim state; conflict-aware, TTL-arbitrated
  gesture locks coordinate concurrent drags; the build room rendered its link
  pile, vote totals and replies.
- The 17 component mounts referenced in Convex code perform distinct product
  work: migrations backfill data; aggregate mirrors and sharded counters
  maintain tallies; rate limits, retries and caches protect external work;
  workpool, workflow and batch-worker run bounded fan-out, durable flows and
  queued refreshes; agent threads, RAG and persistent streaming produce
  grounded, reload-safe answers; presence tracks room occupancy.
- OpenAI produces structured filing decisions, summaries, conversation prompts
  and grounded answers. Firecrawl turns pasted or emailed URLs into structured
  reading furniture. AgentMail gives each showcase space an inbox: receipts
  update expenses, links enter the reading flow, personal notes become letters,
  and weekly digests are sent back out.
- The product includes 32 widget types on one multiplayer canvas plus three
  collaborative paint boards. Its visual system uses paper, glass and sticker
  materials consistently across the rooms.
- The repository contains 282 commits, all inside the event window, and the
  dated log below ties shipped behavior to commit hashes and source files.

## Convex + sponsor usage map

| Feature | Where it lives | Commit |
| --- | --- | --- |
| Schema, tables, indexes | `convex/schema.ts` | `aa13bde` |
| Realtime queries (`useLiveSpace`, `usePresence`, `useLivePoll`) | `src/live/` | `2b51882` |
| Mutations (drag, resize, votes, claims) | `convex/widgets.ts`, `convex/votes.ts` | `6e7b213` |
| Presence + live cursors | `convex/presence.ts`, `src/cursors/` | `93559a2`, `15a8e39` |
| Crons (stale-presence sweep) | `convex/crons.ts` | `406367e` |
| Actions + HTTP actions | `convex/firecrawl.ts`, `convex/http.ts` | `16fa04a` |
| File storage (photo wall uploads) | `convex/photos.ts` | `f668e0b` |
| Internal mutations + seeding | `convex/seed.ts` | `ce7f719`, `406367e` |
| Static hosting component | `convex/convex.config.ts` | `fa9688e` |
| AgentMail (per-space inboxes, inbound webhook) | `convex/agentmail.ts` | `16fa04a` |
| Firecrawl (URL → structured reading card) | `convex/firecrawl.ts` | `ec07426`, `9a63ab7` |
| `gpt-4o-mini` via the AI Gateway (reading-circle starters) | `convex/questions.ts` | `8c20025` |
| Inbound-mail router (email → widget mutations) | `convex/inbox.ts` | `653453b` |
| Weekly digest cron (space → its senders) | `convex/digest.ts`, `convex/crons.ts` | `c2e2c43` |
| Live inboxes, real end-to-end mail | `convex/agentmail.ts` | `8c42502` |
| Typed `widgets.data` union, real pagination, full-text search index | `convex/widgetData.ts`, `convex/schema.ts`, `convex/messages.ts` | `602fff6` |
| `returns:` validators on every function | every `convex/*.ts` | `495584a` |
| migrations (legacy letter backfill) | `convex/migrations.ts` | `45ff2a3` |
| aggregate — poll tallies + member counts | `convex/votes.ts`, `convex/spaces.ts` | `45ff2a3` |
| sharded-counter — landing page live totals | `convex/stats.ts` | `0e5ca3c` |
| rate-limiter — LLM, mail, paint quotas | `convex/rateLimits.ts` | `4237f63` |
| action-retrier + action-cache — Firecrawl/AgentMail retries + caching | `convex/firecrawl.ts`, `convex/digest.ts`, `convex/questions.ts` | `6a44811` |
| workpool — bounded daily recap fan-out | `convex/recap.ts` | `67d5452` |
| workflow — durable weekly digest | `convex/digest.ts` | `67d5452` |
| batch-worker — stale-linkCard refresh queue | `convex/batch.ts` | `67d5452` |
| agent — "ask the space" conversational threads | `convex/agent.ts`, `convex/recap.ts` | `b1173c7` |
| rag — vector search grounding `recap.ask` | `convex/rag.ts` | `a7db717` |
| persistent-text-streaming — `/api/ask-stream`, streamed + persisted | `convex/streaming.ts` | `d017eb7` |
| messages full-text search | `convex/messages.ts` | `d017eb7` |
| presence — space-list room occupancy | `convex/roomPresence.ts`, `src/components/Rail.tsx` | `fc2418b` |

## Log

All dates below are UTC (git author dates are US Pacific, so day-boundary
entries can differ by one calendar day).

### 2026-08-27 - 074a936
Scaffolded the Vite + React + TypeScript app with Tailwind v4 design tokens and the Convex client provider, and checked in the product spec, data model plan, design system, and agent instructions (`src/main.tsx`, `src/index.css`, `docs/`, `AGENTS.md`). Built with OpenAI Codex.

### 2026-08-27 - aa13bde
Added the reactive data model: spaces, members, widgets, messages, votes, and presence tables with indexes by space, space+user, and widget. Convex features: schema, tables, indexes (`convex/schema.ts`).

### 2026-08-27 - 8b7d99d
Added typed widget data shapes for notes, polls, countdowns, potlucks, daily questions, and frames (`src/lib/widgets.ts`).

### 2026-08-27 - 6e7b213
Added space and widget functions: list and create spaces; list, create, move, resize, bring-to-front, and update widgets; poll results. Convex features: queries, mutations (`convex/spaces.ts`, `convex/widgets.ts`, `convex/votes.ts`).

### 2026-08-27 - ce7f719
Seeded the lived-in "the crew" space so the demo opens on a world, not a blank canvas: six members, evergreen widgets, and a "Maya's bday" frame holding a countdown, cake poll, and potluck. Convex features: internal mutation (`convex/seed.ts`).

### 2026-08-27 - 0c22827
Built the app shell and the top-left-anchored canvas that renders widgets by type from a live query. Convex features: realtime queries via `useQuery` (`src/App.tsx`, `src/components/Canvas.tsx`, `src/widgets/`).

### 2026-08-27 - fa9688e
Added pointer-based drag and resize that commits positions to Convex mutations, with frames moving their contained widgets; registered the static hosting component and deployed the site and backend to production (`src/components/Canvas.tsx`, `convex/convex.config.ts`). Registered component: @convex-dev/static-hosting.

### 2026-08-27 - 93559a2
Added a local identity gate, member upserts, throttled presence cursors, live poll votes and potluck claims, a chat widget, and promote-to-canvas (`convex/members.ts`, `convex/presence.ts`, `convex/votes.ts`, `convex/messages.ts`).

### 2026-08-27 - 406367e
Built out the full backend model: messages with per-widget threads, presence with drag gestures and a cron that clears stale rows, space stats, and a data-driven seed for every starter space. Convex features: crons, scheduled functions, internal mutations, indexes (`convex/crons.ts`, `convex/presence.ts`, `convex/seed.ts`, `convex/stats.ts`).

### 2026-08-27 - 2b51882
Added the live data layer: typed widget data, `useLiveSpace`/`usePresence`/`useLivePoll` hooks over realtime queries, cursor registry and styles (`src/live/`, `src/cursors/`, `src/data/types.ts`).

### 2026-08-27 - c9e04d4
Shipped all 22 widget types in one pass: sticker, frame, countdown, poll, potluck, chat, note, media, daily question, RSVP, decision, availability, photo wall, link shelf, playlist, joke registry, expense split, itinerary, message wall, quote, weather, sports (`src/widgets/`).

### 2026-08-27 - ed4cc9f
Added the shell chrome: floating rail, action dock, widget picker, widget and space editor panels, canvas navigator and edge pan, widget threads, photo wall gallery, onboarding pills (`src/components/`).

### 2026-08-27 - 9992f27
Added the landing page, Home grid, live space page, hash routes with invite links, sounds, avatars, and photo assets (`src/pages/`, `src/lib/routes.ts`, `public/`).

### 2026-08-27 - a8dde65
Kept `promotedWidgetId` on messages so existing rows validate; redeployed the backend and static site to production and reseeded every space.

### 2026-08-27 - 16fa04a
Registered AgentMail and Firecrawl components; added per-space inbox provisioning, inbound webhook handling, and an `emailEvents` table; added a Firecrawl `scrapeLink` action for structured link previews. Registered components: @agentmail/convex, @firecrawl/firecrawl-convex. Convex features: actions, HTTP actions, indexes (`convex/convex.config.ts`, `convex/agentmail.ts`, `convex/firecrawl.ts`, `convex/http.ts`, `convex/schema.ts`).

### 2026-08-28 - e119e7e
Refreshed hackathon-mode agent rules, code map, session handoff, marketing positioning, PRD demo script, and spaces inventory (`AGENTS.md`, `CLAUDE.md`, `docs/code-map.md`, `docs/todos.md`, `PRODUCT.md`, `docs/ourspaces-prd-v0.6.md`, `docs/spaces-and-widgets.md`, `docs/the-feel.md`).

### 2026-08-29 - edab54e
Reworked notes as restrained paper scraps with a real fiber texture, one torn bottom edge, a protected footer safe zone, and rectangle-free drag states. Added a related Hall of Fame index-card variation with a slight rotation, ranked rows, and a small colored paper peek. Stickers now always stack above regular widgets (`src/widgets/core.tsx`, `src/components/WidgetCard.tsx`, `src/index.css`, `public/assets/textures/`).

### 2026-08-29 - d1e7674
Gave the Inside Joke Hall of Fame the same realistic bottom-torn paper edge as notes. Simplified its backing to one restrained pink torn-paper sliver shifted left and tucked fully inside the card footprint, clear of rankings and the thread control (`src/index.css`, `public/assets/textures/note-torn-paper.png`).

### 2026-08-29 - ec07426
Added a web-post canvas widget: paste a webpage, let Firecrawl extract a stable
title, summary, source, author, date, and cover payload, then persist the result
through the existing reactive widget mutation. Added a generated paper-collage
fallback for pages without imagery and seeded the buildclub reading table
(`convex/firecrawl.ts`, `src/widgets/extras.tsx`, `public/assets/link-card-fallback.jpg`).

### 2026-08-29 - 19d5ffb
Seeded Tahoe with “How Convex Works” as a full web-post card, including source,
author, summary, fallback art, and saved-by metadata, so future resets retain
the link on the trip canvas (`src/data/spaces.ts`).

### 2026-08-29 - a22a7b5
Turned the web-post reading sheet into translucent frosted paper: full-bleed
artwork now continues behind a 22px backdrop blur while the article copy stays
dark and readable (`src/index.css`).

### 2026-08-29 - 604b328
Pushed the web-post treatment into unmistakable frosted glass: reduced the
white layer from 68% to 44%, increased blur from 22px to 34px, added crisp inner
edge highlights, and frosted the date tab too (`src/index.css`).

### 2026-08-29 - 6bc3c6c
Compacted the Tahoe web post from 420×340 to 380×310 and lowered its glass sheet
to 32% opacity. Added a dedicated 38px-blurred copy of the artwork directly
beneath the copy for a denser frost with more color showing through
(`src/data/spaces.ts`, `src/index.css`).

### 2026-08-29 - e53c376
Reduced the Tahoe web-post card again from 380×310 to 340×280 so it reads as a
compact saved link instead of dominating the trip canvas (`src/data/spaces.ts`).

### 2026-08-29 - 9a63ab7
Resolved Hacker News item links through the official Firebase API so each saved
post can show the linked article plus live points/comment context and an HN
discussion tab (`convex/firecrawl.ts`, `src/widgets/extras.tsx`).

### 2026-08-29 - 8c20025
Added a reading circle to web posts: OpenAI `gpt-4o-mini` produces two short,
structured conversation starters, each backed by the existing reactive message
threads; seeded cards and existing rooms receive the starter data without a
reset. Convex features: action, internal mutation, realtime queries
(`convex/questions.ts`, `convex/seed.ts`, `src/components/LinkQuestionStrip.tsx`).

### 2026-08-29 - 22bb732
Finished the web-post interaction model: cards drag from any surface, clicking
the cover zooms into its reading circle, and only the paper clipping opens the
article (`src/components/WidgetCard.tsx`, `src/widgets/extras.tsx`).

### 2026-08-29 - 1e8dc37
Added a couple-space `cozyColor` widget with generated airport-lounge line art,
palette/brush tools, artist faces, and reactive collaborative strokes. Convex
features: table, indexes, query, mutations, realtime queries (`convex/paint.ts`,
`src/widgets/CozyColorWidget.tsx`, `public/assets/cozy-color-same-moon.png`).

### 2026-08-29 - a0a428b
Turned the coloring postcard into a full-screen paint-by-number room with 28
tappable regions and a generated flat-color target. Each completed number is a
reactive Convex region row shared live between collaborators. Convex features:
schema, mutation, realtime query (`convex/paint.ts`, `convex/schema.ts`,
`src/widgets/CozyColorWidget.tsx`, `public/assets/cozy-color-same-moon-colored.png`).

### 2026-08-29 - f1bbfb3
Made the coloring room play like a focused number game: one selected color
reveals its matching numbers, 45 regions fill on tap, and the bottom paint dock
tracks what remains. Added two shared palette presets that recolor completed
regions live for both collaborators. Convex features: schema, mutation,
realtime query (`convex/paint.ts`, `src/widgets/CozyColorWidget.tsx`).

### 2026-08-29 - 3a6a05a
Created three closed-region SVG candidates for the collaborative coloring game:
a public-domain-derived night lotus, a simplified same-moon lounge, and a cozy
window garden. Added a side-by-side comparison for choosing the final art before
replacing the current raster flood-fill canvas (`public/assets/coloring-concepts/`).

### 2026-08-29 - 15a8e39
Replaced the raster coloring concept with a generated 50-region vector board,
then added traced Starry Night and Great Wave postcards plus board-scoped live
cursors. Fills, palettes, and collaborator positions stay reactive. Convex
features: schema, mutations, realtime queries, presence (`convex/paint.ts`,
`convex/presence.ts`, `src/widgets/CozyColorWidget.tsx`, `scripts/`).

### 2026-08-29 - f76b70d
Added a live shared room radio backed by SomaFM station state so one person can
pick the station and others can join while audio playback remains local
(`convex/widgets.ts`, `src/widgets/extras.tsx`, `src/lib/radio.ts`).

### 2026-08-29 - f668e0b
Turned the memory wall into a pile of physical prints that spreads into a
full-screen room. People can pin uploaded photos through Convex file storage and
write reactive notes on each print's back through the existing message threads.
Convex features: file storage, mutation, realtime queries (`convex/photos.ts`,
`src/components/PhotoWallGallery.tsx`, `src/pages/LiveSpace.tsx`).

### 2026-08-29 - aff8461
Reworked the birthday demo widgets as distinct physical objects: a tear-off
calendar, ballot poll, sign-up sheet, postal RSVP, receipt, highlighted scrap,
window weather card, and shelf ledges. Added a generated low-contrast paper
surface to the crew poll as a one-widget paper-surface trial (`src/widgets/`,
`src/index.css`, `public/assets/textures/widget-paper-v1.jpg`).

### 2026-08-30 - 393467a
Refined the crew poll into a torn ballot sheet using the same restrained paper
surface as the Hall of Fame: straight-cut sides and a shallow deckled bottom.
Cropped the source's transparent top margin so the title stays whole, removed
the content mask, and dropped the hard offset shadow so the paper lies flat
behind its overhanging daisy pin. A small neutral lightness lift keeps the
fibers visible while making the stock read cleaner and whiter (`src/index.css`,
`public/assets/textures/note-torn-paper.png`).

### 2026-08-30 - 03f2b7b
Replaced the flat badge-style sticker pack with six illustrated die-cut
characters, gave the picker a physical paper tray and silhouette lift, and wired
sticker creation in live Convex spaces. Existing sticker rows adopt the new art
dimensions without a reseed (`src/data/stickers.ts`,
`src/components/WidgetPicker.tsx`, `src/live/adapt.ts`,
`src/pages/LiveSpace.tsx`, `src/index.css`, `public/assets/stickers/`).

### 2026-08-30 - 5075fcc
Gave the daily question and saved-links widgets distinct organic materials: a
light cotton-rag worksheet stack and a brighter speckled ledger scrap, each with
its own irregular edge treatment (`src/index.css`,
`public/assets/textures/`).

### 2026-08-30 - 126b58e
Expanded the sticker tray to twelve crew-specific die-cuts, mixing illustrated
characters, restrained holographic foil, simple chat art, and photoreal Rio and
matcha-cake keepsakes. Reflowed the picker as a compact 4×3 sheet and verified
the add-to-canvas flow (`src/data/stickers.ts`, `src/index.css`,
`public/assets/stickers/`).

### 2026-08-30 - 6e59878
Tightened sticker silhouette shadows across resting, hover, pressed, and
selected states so the white vinyl cutline stays dominant. Also gave the couple
room's quote scrap a dimensional purple thumbtack (`src/index.css`,
`docs/todos.md`).

### 2026-08-30 - working tree
Changed the daily-question history stack from gray tints to cream paper sheets
separated by hard offset edges (`src/index.css`).

### 2026-08-30 - df95c97
Added three deliberately unpolished camera-roll memories for the crew: Friday
at Maya's, roof dusk, and paint night. The matching full-size and preview assets
now fill the seven-photo memory pile and the main media print
(`src/data/spaces.ts`, `public/photos/crew/`, `public/photos/thumbs/crew/`).

### 2026-08-30 - 61281e8
Made roof dusk and paint night feel more accidental: fewer people in frame,
turned-away and cropped faces, foreground occlusion, underexposure, and table
clutter replace the posed group-photo look (`public/photos/crew/`,
`public/photos/thumbs/crew/`).

### 2026-08-30 - 67d3fec
Replaced the generic rail glyphs for us two, the house, and game day with
distinct flash-photo covers: a shared hand-heart, a chaotic roommate key pile,
and a scuffed post-game still life (`src/components/Rail.tsx`,
`public/assets/space-covers/`).

### 2026-08-30 - 36180dc
Replaced two stale file-storage test uploads in the live crew memory wall with
the final Roof Dusk and Paint Night JPGs while preserving photo ids and note
threads. Added an idempotent internal backfill and verified it on the personal
dev deployment (`convex/photos.ts`).

### 2026-08-30 - c35f26f
Compacted Firecrawl web-post clippings from 420×360 to 340×280 while preserving
their typography, so the cover reads as a short backing strip instead of an
oversized card. Existing live cards at the legacy dimensions adopt the compact
presentation on reload (`src/lib/widgetDefaults.ts`, `src/live/adapt.ts`).

### 2026-08-30 - 15d3909
Tightened the web-post clipping again to 300×250 without changing its type
scale. Cards created at either previous default now adopt the smaller footprint
on reload (`src/lib/widgetDefaults.ts`, `src/live/adapt.ts`).

### 2026-08-30 - e089d52
Generated three tactile cut-paper cover alternatives for the Firecrawl web-post
card: amber/cobalt, teal/magenta, and violet/orange. Staged them beside the
original on duplicate cards in the personal dev house canvas for a direct visual
pick (`public/assets/link-card-collage-*.png`).

### 2026-08-30 - e64be0b
Added three deliberately different material directions for the Firecrawl
web-post cover: fluorescent risograph ink, chunky woven textile, and handmade
ceramic mosaic. Extended the personal dev house canvas and staged all seven
compact cards together for a two-row comparison (`public/assets/link-card-*.png`,
`convex/spaces.ts`).

### 2026-08-30 - cc0621c
Fixed grabbed cards slipping under widgets that had already been moved: grab
used `z-index: 55` while stored `z` starts at 1000. Layers are now reserved —
stickers 100000, the grabbed card 99999, everything else its own `widget.z`
(`src/components/WidgetCard.tsx`).

### 2026-08-30 - 6669fe1
Sewed the frame border: an SVG stitch-dash path replaces `border: dashed`, so a
frame reads as a hand-stitched edge instead of a CSS outline
(`src/index.css`, `src/widgets/core.tsx`).

### 2026-08-30 - bb70d54
Gave frames a floor — an ink-deepened fill inside the stitch border, so a frame
groups its widgets by material instead of by outline alone (`src/index.css`).

### 2026-08-30 - a140aae
Replaced that fill with a real kraft paper mat (`--color-mat`), and deleted the
88 lines of gradient scaffolding it made redundant. Frames now look like
mounted board (`src/index.css`, `src/widgets/core.tsx`).

### 2026-08-30 - 520ff0e
Darkened the mat to true kraft (`#ddc8ac`) so white cards sitting on it keep
their edge on camera (`src/index.css`).

### 2026-08-30 - 0feca35
Drafted the vibeapps listing description — problem-first, "three rooms, three
real problems" leading, with submit-day numbers left as bracketed placeholders
(`docs/vibeapps-listing.md`).

### 2026-08-30 - 653453b
Email became a real input to the canvas. Dropped the `@agentmail/convex`
component (its actions never resolve through `ctx.runAction`):
`convex/agentmail.ts` now calls the REST API directly for inbox create + send,
and `convex/http.ts` hand-verifies the svix webhook. *(Superseded 2026-08-31:
the REST calls moved behind our own first-party `components.agentMail`
component, which also adds reply-in-thread + labels — see the components list
up top.)* Inbound mail routes per
space — us two → sealed letter widget, the build room → URLs into the link pile
plus sequential Firecrawl enrich, everywhere else → the model reads a live
widget inventory and files the email (expense row / itinerary day / new tracker
/ unfiled envelope / discard) (`convex/inbox.ts`, 417 lines).

### 2026-08-30 - 9f2c273
The mail surface: a kraft `letter` widget (sealed envelope with flap, seal and
stamp; click unfolds it — built from buttons so WidgetCard's drag capture can't
eat the click), a black address chip under every mail-enabled space title
(click copies), a japan trip frame in the crew so the router has a future-dated
booking target, a seeded letter in us two, and an idempotent
`seed:backfillMailDemo`. Same tree carries the full-screen `CanvasRoom` shell
and the build room's reading room — including the pile's tag row, where kinds
rank ahead of hosts and the picked tag becomes the outer cut
(`src/components/ReadingRoom.tsx`, `src/lib/linkRanking.ts`).

### 2026-08-30 - c2e2c43
Each mail-enabled space now writes back: a Friday 16:00 UTC cron composes the
week from the recap snapshot and emails it to everyone who ever wrote to that
inbox (recipients mined from `emailEvents`), with `digest:sendNow` for demos
(`convex/digest.ts`, `convex/crons.ts`).

### 2026-08-30 - 8c42502
Live inboxes with an unrestricted key: crew rides the account default
`[redacted inbox]` (`thecrew` is taken org-wide, and the 3-inbox free
tier is shared between dev and prod), plus `ustwo@` and `buildroom@`, on a
fresh webhook created through the API. Verified with real mail — buildroom's
inbox → `ustwo@` → a letter appeared in us two, and the digest landed in a real
Gmail (`convex/agentmail.ts`, `docs/firecrawl-agentmail-setup.md`).

### 2026-08-30 - f701b82
Wrote `docs/mail.md`: the three demo cases, the architecture as shipped, a
status checklist, and the open goals in priority order (arrival choreography
first, prod cutover second).

### 2026-08-31 - 470c840
Installed and wired all 15 planned components in `convex.config.ts` in one
pass (migrations, aggregate, sharded-counter, rate-limiter, action-retrier,
action-cache, workpool, workflow, batch-worker, agent, rag,
persistent-text-streaming, presence, prosemirror-sync, better-auth) —
foundations for giving each one a genuine job, one at a time, instead of the
single component (`firecrawl`) the app used until now.

### 2026-08-31 - 602fff6
`widgets.data` went from a bare `v.any()` to a discriminated union of the 12
core widget shapes (poll, note, decision, countdown, linkCard, letter,
photoWall, expenseSplit, itinerary, potluck, rsvp, dailyQ) plus a permissive
record fallback for the rest — shapes reverse-engineered from every real
producer, not guessed, and verified clean against the live dev deployment.
`messages.listMessages`/`listBySpace` moved from an unbounded `.collect()` to
real cursor pagination; `messages` got a full-text search index
(`convex/widgetData.ts`, `convex/schema.ts`, `convex/messages.ts`).

### 2026-08-31 - 495584a
Mechanical sweep: `returns:` validators on all 78 Convex functions (was 18),
verified with a clean `tsc` build and a real `convex dev` deploy that
validated every declared shape against actual handler behavior.

### 2026-08-31 - 45ff2a3
migrations (`convex/migrations.ts`) backfills the `unfiled` field on letters
seeded before the mail router set it explicitly. aggregate, two named
instances, replaces `.collect()`-based counting: pollTallies gives O(log n)
per-option vote counts (`votes.ts`, `recap.ts`'s poll summary), memberCounts
gives O(log n) live member counts per space (`spaces.ts listSpaces`) — both
wired into every insert/delete site for their tables and backfilled against
the live dev database (11 votes, 116 members).

### 2026-08-31 - 0e5ca3c
sharded-counter (`convex/stats.ts`) replaces the "live backend" widget's
full-table `.collect()` reads with global spaces/widgets/messages counters,
wired into all 10 widget, 5 message, and 3 space insert/delete sites so the
counts never drift. Verified with a live create-then-delete round trip
against the dev database (69 → 70 → 69).

### 2026-08-31 - 4237f63
rate-limiter (`convex/rateLimits.ts`) puts token-bucket quotas on the LLM
proxy (spark questions, recap generate/ask), AgentMail sends, and paint
strokes — space-scoped since there's no authenticated identity yet. Paint
strokes fail soft (drop silently) instead of throwing, since it's a live
drawing hot path, not a one-off action.

### 2026-08-31 - 6a44811
action-retrier wraps Firecrawl scrapes and AgentMail sends with
retry-with-backoff, keeping both callers' existing sync-looking contracts
unchanged. action-cache caches scrape-by-URL (1h TTL) and
questions-by-(title,description) (no TTL). Verified live: a real scrape
(6.4s) then an identical one (1.1s, cache hit); a real question-gen call
(8.4s) then an identical one returning the same cached questions (1.0s).

### 2026-08-31 - 67d5452
workpool bounds the daily recap fan-out to 3 concurrent LLM calls and
re-enables the paused daily cron (`recap.ts`). workflow rebuilds the weekly
digest's cron path as a durable multi-step flow — recipients → snapshot →
LLM compose → send, each independently retried (`digest.ts`); the manual
`sendNow` demo trigger keeps the simpler action-retrier path. batch-worker
(new `linkRefreshQueue` table, `convex/batch.ts`) drains stale linkCards
through the cached/retried scraper a few at a time. Verified live end to end,
including a real enqueue → drain → re-scrape → patch round trip.

### 2026-08-31 - b1173c7
agent (`convex/agent.ts`) gives `recap.ask` a real per-space thread with
conversational memory, replacing a stateless `completeJson` call —
backed by an AI SDK provider pointed at the same Cloudflare proxy `ai.ts`
already used. Verified live: two sequential asks against the crew space
share one persisted thread id.

### 2026-08-31 - a7db717
rag (`convex/rag.ts`) indexes each space's widgets + recent chat and
semantic-searches for the chunks most relevant to the asked question,
grounding the agent prompt instead of dumping the whole board every time.
Needed a real embedding model — the shared chat proxy has no
`/v1/embeddings` route — so this is the one place the app calls OpenAI's
`text-embedding-3-small` directly (`OPENAI_API_KEY` set as a Convex env var,
never committed). Verified live: indexed 14 items, a semantic search for
"what poll is happening?" correctly surfaced the cake-poll chat message.

### 2026-08-31 - d017eb7
persistent-text-streaming (`convex/streaming.ts`) streams "ask the space"
answers token-by-token over a real HTTP endpoint (`POST /ask-stream`),
verified live with curl watching real incremental tokens arrive and persist
— deliberately not wired into `ActionDock`'s UI, which already has a
delicate working fake-reveal animation not worth the regression risk for a
cosmetic change. `messages.search` adds real full-text search over a
space's chat using the Phase-0 search index.

### 2026-08-31 - fc2418b
presence (`convex/roomPresence.ts`) tracks "who has this space open right
now" for a "· N here" tooltip on the space rail — deliberately separate from
the hand-rolled canvas cursor/gesture system in `convex/presence.ts`, whose
~90ms writes drive live widget dragging and double as the actual
gesture-lock arbitration mechanism (confirmed too tangled to safely swap
before writing any code). `src/live/usePresence.ts` and the gesture system
are untouched.

### 2026-08-31 - 87aa0d3
Fixed a self-contradicting `README.md`: the Stack line claimed "OpenAI (via
Convex AI Gateway)" while the Convex-depth section further down correctly
said Cloudflare proxy + OpenAI fallback — the app never used Convex's AI
Gateway. Brought the Components/Schema/Scheduling bullets up to date with
all 15 components now in real use.


### 2026-09-12 - 07ddee3
Brought the build room closer to the approved pinboard reference: centered the
five zones, enlarged the taped link pile, added illustrated project previews,
and quieted the header while retaining the mail entry point and existing actions.
Shared legacy layout adapter serves the mock and reactive live-data paths;
phone widgets now stack at viewport width. Softened the overpowering orange
wall to a deeper burnt-orange theme after user feedback. Verified in the local browser on
desktop and phone, including reading/ship rooms and frame focus/return.
`npm run build` passes; no backend deployment in this session.

### 2026-09-12 - working tree
Made body copy across widgets, messages, reading rooms, letters, recaps and
forms use regular IBM Plex Sans with larger sizes and line spacing. Keeper
papers grow around the text, with the decorative tear below the author line;
reading-list descriptions wrap below their titles. Phone reading rooms now
offer full-width links and reading-circle views. Verified local desktop and
phone views; `npm run build` passes. No backend changes or deployment.

### 2026-09-12 - 706ff27
The build room's wall left orange. Three passes (bright, deeper, richer
tonal system) never fixed the real problem: a saturated field out-shouts the
black slabs and white paper that make the sticker-wall look work, and the
user finally said they didn't want the orange background at all. Shot five
candidate walls side by side at demo distance (soft denim, mid denim, ink
navy, cork, chalk slate) via a local `.context` script that injects token
overrides; the dark walls flattened the black objects, cork read beige. Landed
a dusty denim felt (`--color-buildroom: oklch(0.74 0.06 245)`) and demoted
orange to the room's accent — pile tape, ship tape, hue-rotated pushpins,
kept count, vote arrows, rail tile — so the loud color is rare again. Tonal
panels, wall-shade shadows and the pegboard carried over untouched because
they derive from the token. Docs and tokens mirror the change; `npm run
build` passes; no deployment.

### 2026-09-12 - 0a0cf8e
Round two on the build room wall. The denim felt was calmer than the
orange but the user asked for something different, so four non-blue
directions were shot side by side as complete theme overrides (blueprint,
plaster, mustard, bottle green) and presented on one contact sheet. Landed
blueprint: a deep cobalt wall (`--color-buildroom: oklch(0.40 0.12 262)`)
ruled with a fine white drafting grid, white header ink, zone panels one step
lighter than the wall, shadows in the wall's own deep shade, and orange kept
as the accent where it is now the wall's complement. Made the compact header
read `--space-heading-color` instead of hardcoded ink so the preset carries
the ink. Plaster and bottle green stay one token swap away in the local
script. `npm run build` passes; no deployment.

### 2026-09-12 - e52192c
The user picked bottle green off the wall sheet. Landed it on the same tonal
system as the blueprint: `--color-buildroom: oklch(0.42 0.09 160)`, white
header ink, pegboard holes instead of the ruled grid, zone panels one step
lighter (12% toward card so they read on the darker green), shadows in the
wall's own deep shade, orange kept as the accent. Verified at 1x, 2x and phone
width; `npm run build` passes; no deployment.

### 2026-09-13 - working tree
Reviewed the sign-in email and generated two local design concepts with the
built-in image generation tool: a small envelope header and a violet room-key
ticket. Proposed clearer code hierarchy, shorter copy and sans-serif type;
recorded the handoff in `docs/todos.md`. These are visual proposals only:
no template, sender setting or backend changes. `npm run build` passes.

### 2026-09-13 - working tree
Built the approved envelope email: generated violet masthead, selectable code,
short instructions and sans-serif fallbacks (`convex/emails/signIn.ts`). Changed
the real code expiry and both email formats to a shared 20-minute setting;
updated the AgentMail sender name to OurSpaces. Browser-verified at desktop,
390px and 320px, plus images hidden. Build and Convex push pass; published to
the connected dev deployment and verified the hosted image. No email sent
during verification.

### 2026-09-13 - working tree
Redesigned About as a shared wall: custom sticker/photo collage, interactive
sample cake poll, direct links into five rooms, origin story, and expandable
technical credits (`src/pages/About.tsx`, `src/index.css`). The logo and a
small corner link now open About and preserve the return room; a grid icon
keeps the block reachable (`src/components/Rail.tsx`). Live totals retain the
existing Convex subscription; the preview vote stays local. Verified in the
browser at desktop, tablet, and phone widths, including navigation and reduced
motion; reviewed a motion capture. `npm run build` passes. Not deployed.

### 2026-09-13 - working tree
Added dedicated Convex, OpenAI, AgentMail, and Firecrawl pages from About,
with interactive examples, implementation-backed workflows, source links,
and expandable technical notes. Examples stay local; room data is untouched.
Fixed a React effect cleanup crash that blanked About during navigation.
Verified on port 5174 at desktop and phone widths, including history, return
room, disclosures, reduced motion, and a motion capture; no console errors.
`npm run build` passes. Not deployed.

### 2026-09-13 - working tree
Moved vendor links directly below the About hero and replaced styled names
with original Convex, OpenAI, AgentMail, and Firecrawl logo artwork. The same
logos now identify each vendor page; source URLs stay beside the embedded
SVGs in `About.tsx`. Verified live at desktop, 390px, and 320px, including
logo loading and navigation. `npm run build` passes. Not deployed.

### 2026-09-13 - working tree
Retired the block/home page and its sidebar grid button. Old home links now
open the crew; the root opens the explicit `#/space/buildroom` address.
About’s entry buttons go to the crew, and its back link remembers the room.
Removed the block route and transition wiring from `App.tsx`; room URLs all
carry their slug. Browser-verified redirects, sidebar switches, About links,
history, and desktop/phone layouts. `npm run build` passes. Not deployed.

### 2026-09-13 - working tree
Changed the default room to the crew. The bare URL, `#/`, and legacy home
address now open `#/space/crew`; the build room keeps its explicit URL.
Welcome entry and cold About return follow the same default. Verified all
four addresses in the local live browser; no console errors. Build passes.

### 2026-09-14 - working tree
Finished the local 2006 social-profile capture with realistic fictional photos
for every profile, Top 8/Top 16 friend, and comment avatar. Generated 13 new
ordinary high-school snapshots with period camera flaws, reused the three owner
photos, and compressed the set to matching 720px JPEGs. Browser-verified the
classic Top 8 and full 16-person banner grid: every image loads, no monograms
remain, and there are no console or network errors. No app or backend changes.

### 2026-09-16 - working tree
Redesigned the add panel around eight quick-pick widgets, a compact frame
action, and a single horizontal sticker strip at the bottom. The full catalog
now has search, four purpose-based filters, short descriptions, and drawn
miniature previews (`src/components/WidgetPicker.tsx`, `src/index.css`).
Browser-verified at desktop and phone widths, including filtering, empty
results, sticker scrolling, and the existing cursor placement handoff;
reviewed a recorded interaction frame. `npm run build` passes. No backend
changes or deployment.

### 2026-09-16 - working tree
Expanded browse-all into a grouped widget gallery with larger illustrated
samples, counted category filters, and an add affordance on each tile.
The gallery uses four desktop columns and two phone columns, with a smaller
sticker strip to leave more room for browsing. Quick picks retain their compact
layout (`WidgetPicker.tsx`, `index.css`). Verified desktop and phone layouts,
search, empty results, filters, and photo-wall placement in the browser; reviewed
a recorded interaction frame. Build passes. Not deployed.

### 2026-09-16 - working tree
Simplified new-space creation to a starting-point picker, compact editable
board preview and one create action. Color, symbol and widgets unfold under
Customize. The native dialog stays above raised canvas items; empty starts
keep the same email handoff. Browser-reviewed desktop and 390px/320px layouts,
template switching, customization and back navigation (SpaceMaker.tsx, index.css).
Build passes. No verification email sent, space created, or deployment performed.

### 2026-09-16 - working tree
Prepared local presentation drafts using existing app captures and a supplied
video still. Revised the thumbnail and filled all five gallery slots from
visually reviewed saved app captures, preserving source pixels and recording
provenance locally. Creative files remain gitignored. App source unchanged.
Build passes; browser review unavailable.
No deployment or submission.
Follow-up: checked the presentation preview against the upstream public source
and corrected its field mapping and media layout; no product code changed.
Revised local project copy into two short paragraphs with context and concrete
examples.

### 2026-09-16 - working tree
Created and visually reviewed two alternative logo and brand concept boards
using built-in image generation. Saved the boards and full prompts locally;
the user then selected the first direction. Developed a refined brand system
and landing-page visual concept, with prompts and an implementation handoff
saved locally. No identity applied to the app. Build passes. No deployment.
Follow-up: refined the logo itself and saved a reviewed presentation with
monochrome and app-icon examples locally; the app still uses its existing mark.
Git operations are blocked by the pending Xcode license agreement.

### 2026-09-17 - working tree
Made the self-reported numbers match a repo scan. Counted the function surface
with a TypeScript AST pass, not grep: 41 queries + 68 mutations + 33 actions =
142, and all 142 carry a `returns:` validator — zero misses, and none of the
142 `returns:` keys is a false positive from a nested object. The 6 HTTP actions
are the only functions without one, because `httpAction` takes a bare handler
returning a `Response` (`HttpActionBuilder` has no options object), so the
coverage is 100% of what can be validated. That arithmetic is now stated in
`README.md`, the `hackathon.md` header and `public/hackathon.json` instead of
being left implied. Corrected in the same pass: the header claimed 130
functions and 5 HTTP actions, the highlights claimed 78 functions and 16
components, and the commit count said 148 in 7 days (it is 262). The header also
claimed "no hand-rolled `.vectorIndex()` in our schema" — `convex/schema.ts`
declares `widgets.by_embedding`, which is exactly the vector index the facts
block counts, so that read as a denial of our own feature. Components are now
listed as what they are: 17 components over 18 mounts, including `authWellKnown`
(ours, OIDC discovery) and `aggregate` mounted twice as `pollTallies` and
`memberCounts`. No code changed.

### 2026-09-17 - working tree
Adopted the **Convex AI Gateway** as the app's model provider. `convex/ai.ts`
had routed every LLM call to one of two third parties — RoomDone's shared
Cloudflare Worker (`AI_PROXY_URL` + `AI_PROXY_TOKEN`) or direct OpenAI with our
own `OPENAI_API_KEY` — and its header comment said why: the gateway "isn't
enabled on our team's plan (checked 2026-09-09)". Re-checked on 2026-09-17 and
it is enabled, so the hand-rolled provider routing that existed only to stand
in for the platform feature now stands behind it.

Verified before rewiring anything, with a throwaway `internalAction` against
prod: `getServiceToken("ai-gateway")` mints a 752-char deployment JWT,
`GET /v1/models` returns 445 models, a real `generateText` through
`convexGateway("openai/gpt-4o-mini")` came back with usage accounting, and a
real embedding through `/v1/embeddings` came back at **1536 dims** — the number
`convex/schema.ts` pins `widgets.by_embedding` and the `rag` component to. The
load-bearing check was whether the gateway's `openai/text-embedding-3-small` is
*the same* model as the vectors already in the index: embedding one string both
ways scored **cosine 1.0000000000000002**, with an
`openai/text-embedding-3-large` control coming back at 3072 dims to prove the
gateway honours the model id at all. Nothing stored needed re-indexing.

So chat *and* embeddings moved: `chatTarget()` gained a `gateway` arm (all
three targets speak OpenAI's `/v1/chat/completions`, so only the URL, the model
id and how the request is authorized differ), `languageModel()` hands
`agent.ts` a `convexGateway` model, and `embeddingModel()` hands `rag.ts` and
`similar.ts` the gateway's embedding model, capped at the gateway's documented
512-input batch limit. `@convex-dev/ai-sdk-provider@0.1.0` ships only a chat
model — `convexGateway.embeddingModel` lands in 0.2.x — so the embedding side is
assembled from the same two pieces that package uses. The credential is minted
per call, inside the running action, and never stored; `response_format:
json_object` is now on by default instead of only on the OpenAI path.

The Cloudflare proxy and direct-OpenAI paths stay, unchanged, as the
config-time fallbacks they always were, reachable by setting the new
`AI_GATEWAY_DISABLED` env var — a switch that routes around a gateway incident
without a deploy, which matters for a service this new sitting under a live
demo. Order is still a preference, not a failover.

Confirmed end to end against prod after the cutover, not just deployed:
`chatTarget()` resolves to `{kind: "gateway", url:
https://ai-gateway.convex.dev/v1/chat/completions}`, `languageModel()` reports
provider `convexGateway.chat` and `embeddingModel()` reports
`convexGateway.embedding` / `openai/text-embedding-3-small`;
`digest.composeDigestText` wrote a real weekly digest (not its canned
`summaries` fallback) through `completeJson`; `similar.echoCheck` matched a
fresh gateway query vector against an OpenAI-era stored vector for the crew
board's cake poll at **0.711** — inside the 0.62–0.79 band the 0.55 threshold
was measured with — while an unrelated control still returned `null`; and
`rag.groundQuestion` retrieved real grounding text. The probe file was deleted.

### 2026-09-18 - 11c50dd
Made the live room prove its connection before anyone touches it. The room intro
now names the working actions, and the canvas pulse reports `live sync ·
connected for everyone` only after the reactive board query resolves; activity
times disappear after 30 minutes instead of making an idle-but-connected room
look dead. The public manifest now gives concrete first-board checks for votes,
claims, messages, uploads and shared dragging (`src/components/Canvas.tsx`,
`src/components/SpaceLiveStrip.tsx`, `public/hackathon.json`).

### 2026-09-18 - e13716a
Grounded the live-room receipt in the connection itself. `LiveSpace` now reads
Convex's WebSocket state with `useConvexConnectionState`, and the canvas pill
switches between `connected for everyone` and `reconnecting` instead of treating
a resolved query as a permanent connection claim. The public manifest's demo
path describes the same two-tab actions in ordinary product language, and the
room keeps its visible vote tally as real proof that a write landed
(`src/pages/LiveSpace.tsx`, `src/components/SpaceLiveStrip.tsx`,
`src/index.css`, `public/hackathon.json`).

### 2026-09-18 - 9c5dccd
Made the public evidence easier to verify at a glance. The manifest now
identifies the URL as the complete production app and maps schema quality,
function design, realtime behavior and overall Convex depth directly to the
repository facts that support them. Repeated highlight copy was removed so the
stronger evidence still fits in the published manifest (`public/hackathon.json`).

### 2026-09-18 - 2b52b2f
Reworked the optional manifest to prioritize repository and live-site evidence,
then removed facts already supplied by the repository scan. This intermediate
wording was superseded before publication (`public/hackathon.json`).

### 2026-09-18 - b82edd5
Removed non-product guidance before it reached the live site. The manifest
again stopped at checkable product and implementation evidence: the two-tab
demo path, real connection/write receipts, repository counts and implementation
summary (`public/hackathon.json`).

### 2026-09-18 - fb45ba5
Retired the optional `hackathon.json` manifest and moved its useful facts into
the documented public build log: live demo steps, implementation counts,
realtime behavior, component jobs and sponsor integrations (`hackathon.md`,
`public/hackathon.json`).

### 2026-09-18 - working tree
Rechecked the deployed crew and build-room canvases in a browser after the
manifest removal, then recorded only what was visible and code-backed: live
connection state, shared room data, schema relationships and access paths, and
the named query/mutation/action boundaries and reactive data flows
(`hackathon.md`). Tightened the same evidence with code-backed descriptions of
high-churn table isolation, atomic aggregate maintenance, gesture arbitration
and component orchestration.

### 2026-09-20 - working tree
Prepared three generated promotional thumbnails for the local social-post mockup,
with an attachment selector and image downloads. Preserved all 14 existing
comment images; checked the mockup in the browser and ran `npm run build`
successfully. Artwork, prompts and mockup remain local-only; nothing published.
