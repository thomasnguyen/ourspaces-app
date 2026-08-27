# Hackathon log

- **Project:** OurSpaces
- **Event:** Convex All Gas Hackathon
- **What it does:** Turns a friend group's chat into a live shared canvas of widgets (countdown, polls, potluck, notes) that stays in sync for everyone.
- **Live app:** https://necessary-cobra-892.convex.site
- **Repo:** https://github.com/thomasnguyen/ourspaces-app
- **Frontend:** Convex static hosting
- **Convex deployment:** https://necessary-cobra-892.convex.cloud
- **Components:** @convex-dev/static-hosting
- **Convex features:** schema, tables, indexes, queries, mutations, realtime queries
- **Auth:** none
- **AI models:** none
- **Started:** 2026-08-27T05:09:13Z
- **Last updated:** 2026-08-27T05:30:15Z

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
