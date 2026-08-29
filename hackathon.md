# Hackathon log

- **Project:** OurSpaces
- **Event:** Convex All Gas Hackathon
- **What it does:** Turns a friend group's chat into a live shared canvas of widgets (countdown, polls, potluck, notes) that stays in sync for everyone.
- **Live app:** https://necessary-cobra-892.convex.site
- **Repo:** https://github.com/thomasnguyen/ourspaces-app
- **Frontend:** Convex static hosting
- **Convex deployment:** https://necessary-cobra-892.convex.cloud
- **Components:** @convex-dev/static-hosting, @agentmail/convex, @firecrawl/firecrawl-convex
- **Convex features:** schema, tables, indexes, queries, mutations, actions, HTTP actions, realtime queries, crons, scheduled functions, internal mutations, presence
- **Auth:** none
- **AI models:** gpt-4o-mini (OpenAI API)
- **Started:** 2026-08-27T05:09:13Z
- **Last updated:** 2026-08-29T05:52:01Z

## Log

### 2026-08-27 - 074a936
Scaffolded the Vite + React + TypeScript app with Tailwind v4 design tokens and the Convex client provider, and checked in the product spec, data model plan, design system, and agent instructions (`src/main.tsx`, `src/index.css`, `docs/`, `AGENTS.md`). Built with OpenAI Codex.

### 2026-08-27 - aa13bde
Added the reactive data model: spaces, members, widgets, messages, votes, and presence tables with indexes by space, space+user, and widget. Convex features: schema, tables, indexes (`convex/schema.ts`).

### 2026-08-27 - 8b7d99d
Added typed widget data shapes for notes, polls, countdowns, potlucks, daily questions, and frames (`src/lib/widgets.ts`).

### 2026-08-27 - 6e7b213
Added space and widget functions: list and create spaces; list, create, move, resize, bring-to-front, and update widgets; poll results. Convex features: queries, mutations (`convex/spaces.ts`, `convex/widgets.ts`, `convex/votes.ts`).

### 2026-08-27 - ce7f719
Seeded the lived-in "the crew" space with six members, evergreen widgets, and a "Maya's bday" frame holding a countdown, cake poll, and potluck. Convex features: internal mutation (`convex/seed.ts`).

### 2026-08-27 - 0c22827
Built the app shell and the top-left-anchored canvas that renders widgets by type from a live query. Convex features: realtime queries via `useQuery` (`src/App.tsx`, `src/components/Canvas.tsx`, `src/widgets/`).

### 2026-08-27 - fa9688e
Added pointer-based drag and resize that commits positions to Convex mutations, with frames moving their contained widgets; registered the static hosting component and deployed the site and backend to production (`src/components/Canvas.tsx`, `convex/convex.config.ts`). Registered component: @convex-dev/static-hosting.

### 2026-08-27 - 93559a2
Added a local identity gate, member upserts, throttled presence cursors, live poll votes and potluck claims, a chat widget, and promote-to-canvas (`convex/members.ts`, `convex/presence.ts`, `convex/votes.ts`, `convex/messages.ts`).

### 2026-08-27 - 406367e
Replaced the backend with the full model: messages with per-widget threads, presence with drag gestures and a cron that clears stale rows, space stats, and a data-driven seed for every starter space. Convex features: crons, scheduled functions, internal mutations, indexes (`convex/crons.ts`, `convex/presence.ts`, `convex/seed.ts`, `convex/stats.ts`).

### 2026-08-27 - 2b51882
Added the live data layer: typed widget data, `useLiveSpace`/`usePresence`/`useLivePoll` hooks over realtime queries, cursor registry and styles (`src/live/`, `src/cursors/`, `src/data/types.ts`).

### 2026-08-27 - c9e04d4
Added every widget type: sticker, frame, countdown, poll, potluck, chat, note, media, daily question, RSVP, decision, availability, photo wall, link shelf, playlist, joke registry, expense split, itinerary, message wall, quote, weather, sports (`src/widgets/`).

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

### 2026-08-29 - working tree
Added a live shared room radio backed by SomaFM station state so one person can
pick the station and others can join while audio playback remains local
(`convex/widgets.ts`, `src/widgets/extras.tsx`, `src/lib/radio.ts`).
