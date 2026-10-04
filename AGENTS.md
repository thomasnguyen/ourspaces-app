# Agent instructions — OurSpaces

Everyday app for friend groups: a group chat becomes a live shared canvas.
Built Aug–Sep 2026 for the Convex All Gas hackathon (won). **Current focus:
the Nebius × NVIDIA Global AI Hackathon on Devpost, due Fri Oct 30 2026,
10:00 PT.** Doc index: `docs/doc-map.md` (it points at the local-only index
for anything not tracked).

## Hackathon work

- **Start at `nebius/README.md`.** It has the dates, status, open decisions
  and an index of everything else for the entry. The folder is local-only
  (gitignored); skip it if a clone doesn't have it.
- **Update its Status section after each step**, same as `docs/todos.md`.
- **Models:** new AI work runs on NVIDIA Nemotron via Nebius Token Factory
  (OpenAI-compatible API), and the existing OpenAI calls in `convex/ai.ts`
  move over to it. Until then they still call OpenAI.

## Rules

- **Match response depth to the request.** Keep routine updates phone-friendly,
  but explain strategy, product decisions, and tradeoffs fully when asked.
  **Bold** anything needing input and tag it **(question)**.
- **No tests. Ever.** This is a hackathon — no unit tests or any automated
  tests; don't waste time or tokens on them. `npm run build` (typecheck) is the
  check. Visual/live work is verified in the browser.
- **Demo path over edge cases.** Happy path + empty state. No defensive code,
  refactors, a11y audits, i18n, or abstractions "for later."
- **Every visible change goes through `/eye-candy`.** UI, motion, the video's
  cards, the thumbnail: before any of it, or any `/impeccable` command, read
  `.claude/skills/eye-candy/SKILL.md` (local-only, like
  `PRODUCT.md` — both are gitignored; skip if a clone doesn't have them). It is
  the override layer on impeccable and carries the house motion system: the
  three easing curves, the duration scale, stagger, and which moments earn
  cinematic treatment.
- **Prototype quality is fine.** This is a hackathon build, not a system anyone
  inherits — don't over-optimize for "production". The one exception: keep
  TypeScript types decent, since they make vibe coding work.
- **This is 100% vibe-coded.** The human never edits code directly. Add or
  update docs (`AGENTS.md`, `docs/`, `nebius/README.md`) whenever it would
  help the next chat session pick up where you left off.
- **Don't ask permission.** For reversible changes, just do it and report after.
  Only stop for destructive/irreversible actions or genuine scope changes.
- **Run `npm run build` before ending a turn.** It's the only check.
- **Read `docs/doc-map.md` before opening other docs.** Open only the 1–2
  files it names for the task. Update it when you add, move, or retire a doc.
  Local-only paths stay gitignored — never commit them.
- **Read `docs/code-map.md` before searching the codebase.** Update it when you
  add, move, or split files or major `App.tsx` sections.
- **Update docs as you go, not just at the end.** After each working step
  that lands a feature, moves files, or changes a decision, update
  `docs/todos.md` (works now / broken / next up / decisions made in chat) and
  whichever doc the map points at — `docs/code-map.md` for structure,
  `docs/spaces-and-widgets.md` for a space or widget. Sessions get cut off
  mid-build; docs are the handoff. `hackathon.md` is the Convex hackathon's
  build log, finished at the win; leave it alone unless asked.
- **Splitting `App.tsx` / `index.css` is allowed and encouraged** when a section
  gets hairy — extract to `src/components` or `src/lib`, keep it hacky, update
  the code map.
- **Convex does the sync.** Widgets, votes, messages, presence are reactive
  queries. Never hand-roll state sync. Use components (presence, workflow,
  AgentMail, Firecrawl), crons, scheduled functions, HTTP actions and file
  storage where they fit.
  **Auth:** guest (silent) or join (email code; Google once its keys are
  set). Never a login wall. Spec in `docs/accounts.md`.
- **The space has a brain.** Mail or a URL comes in, it gets filed against the
  live canvas, and the reason shows on the object (letter flap, torn slip,
  recap strip). AgentMail = the space's inbox. Firecrawl = URL → furniture on
  the board (recipe → potluck slots, not just a pretty card). Decision model:
  `docs/jev.md`. Do not add a chatbot UI, a medical space, or more
  reading-circle questions.
- **Design is locked:** tokens in `src/index.css` `@theme`; use them, no hex.
  Near-black base, loud flat identity colors, black sticker pills, lime only as
  a tiny pop, the two type tokens only (`--font-display` Bricolage Grotesque,
  `--font-sans` IBM Plex Sans — `@theme` is the source of truth, not this
  line), punchy motion, reduced-motion respected.
- **LLM copy in-product is plain and direct.**
- **Commit and push to `main` per working step** with a normal conventional
  message. No branches or PRs.
- **Demo controls carry a `data-testid`.** Anything a demo take clicks or waits
  for gets `data-testid="kebab-name"`, so capture scripts survive restyles.
  Never target class names or "the third button".
- **Secrets only in `.env.local` / Convex env vars. Never commit keys** — that
  includes tool config that carries a key in a header (`.mcp.json` is
  gitignored for exactly this reason). The GitHub repo is **public**: before
  tracking any new file, ask whether it should be readable by strangers.
  Plans, pitch and submission notes stay local (`nebius/`, `docs/local/`).

## Commands

`npm run dev` (frontend) · `npm run build` (the check) · `npm run deploy`
(builds and ships the frontend to Netlify, serving `ourspaces.io` once DNS is switched).
`npm run deploy:convex` ships the backend and retained Convex-hosted frontend;
after backend + UI changes, run it before `npm run deploy`.

**One deployment, one database.** `prod:necessary-cobra-892` serves both
the public site and local `npm run dev` — `.env.local` points at it, so what
you see locally IS the demo data. There is no separate dev database any more.
Backend changes go out with `npm run deploy:convex`; **do not run `convex dev`** —
it pushes to the retired `dusty-condor-648`, which nothing reads, so your
changes would silently do nothing.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
