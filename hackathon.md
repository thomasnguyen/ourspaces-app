# Hackathon log

- **Project:** OurSpaces
- **Event:** Convex All Gas Hackathon
- **What it does:** Group plans die in the group chat. OurSpaces gives a friend group a persistent shared canvas — countdowns, polls, potluck sheets, photo piles — that every member sees update live, cursor to cursor.
- **Live app:** https://necessary-cobra-892.convex.site
- **Repo:** https://github.com/thomasnguyen/ourspaces-app
- **Frontend:** Convex static hosting
- **Convex deployment:** https://necessary-cobra-892.convex.cloud
- **Components:** @convex-dev/static-hosting, @agentmail/convex, @firecrawl/firecrawl-convex
- **Convex features:** schema, tables, indexes, queries, mutations, actions, HTTP actions, realtime queries, crons, scheduled functions, internal mutations, presence
- **Auth:** none
- **AI models:** gpt-4o-mini (OpenAI API)
- **Started:** 2026-08-27T05:09:13Z
- **Last updated:** 2026-08-30T07:15:48Z

## Highlights

- **107 commits in 4 days**, all inside the hackathon window; every log entry
  below is pinned to a commit hash so the story is checkable against history.
- **22 widget types on one live multiplayer canvas** — countdowns, ballot
  polls, potluck sign-up sheets, expense splits, itineraries, photo walls,
  daily questions, and more — all driven by Convex realtime queries.
- **Deep Convex surface, not a demo veneer:** presence with live cursors and a
  cron that sweeps stale rows, file-storage-backed photo prints with notes on
  the back, scheduled and internal mutations, HTTP actions for inbound email.
- **All three sponsors doing real work:** Convex hosts the backend *and* the
  static frontend, Firecrawl turns any pasted URL into a structured reading
  card, and AgentMail provisions a real inbox per space with a live webhook.
- **AI reading circles:** `gpt-4o-mini` reads a saved article and seeds two
  conversation starters, each wired into the existing reactive message threads.
- **Collaborative paint-by-number:** 50-region vector boards (traced Starry
  Night and Great Wave postcards) where fills, palettes, and board-scoped
  cursors sync live between two people coloring together.
- **A handmade material language:** torn-paper notes with real fiber texture,
  frosted-glass reading sheets, die-cut vinyl stickers — built as a design
  system, not one-off CSS.

## Try it in 60 seconds

1. Open the [live app](https://necessary-cobra-892.convex.site) and claim a
   name at the identity gate — no signup.
2. You land in **the crew**: drag the birthday countdown, vote in the cake
   poll, claim a potluck slot. Open the same space in a second tab and watch
   cursors and votes move in realtime.
3. Click the photo pile to enter the **memory wall** — a full-screen room of
   physical prints; flip one over and leave a note on its back.
4. Switch to **us two** in the rail and open the coloring postcard: a shared
   paint-by-number room where both tabs fill regions live.

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
| OpenAI `gpt-4o-mini` (reading-circle starters) | `convex/questions.ts` | `8c20025` |

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
