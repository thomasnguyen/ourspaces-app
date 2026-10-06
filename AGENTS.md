# Agent instructions — OurSpaces

Everyday app for friend groups: a group chat becomes a live shared canvas.
Built Aug–Sep 2026 for the Convex All Gas hackathon (won). **Current focus:
the Nebius × NVIDIA Global AI Hackathon on Devpost, due Fri Oct 30 2026,
10:00 PT.** Doc index: `docs/doc-map.md` (it points at the local-only index
for anything not tracked).

## Hackathon work

- **Find the doc before reading anything: `nebius/DIRECTORY.md`.** One line
  per doc, grouped by purpose, with the five to read first. Open only the
  one or two it names for your task; the folder has 40-odd files and most
  are evidence. The folder is local-only (gitignored); skip it if a clone
  doesn't have it.
- **The five that matter:** `nebius/overnight-log.md` (what got built,
  newest first, with screenshots and the misses), `nebius/path-to-win.md`
  (the plan; §9 holds Thomas's open decisions), `nebius/loop/gates.md`
  (decisions parked for Thomas, each with a default), `nebius/queue.md`
  (the tasks, in order; the top says who owns which files when two
  sessions are working), `nebius/eval/r3-proof.md` (the Right of Way
  evidence).
- **Working a task:** read `nebius/loop/standing.md` (the rules every worker
  gets) and the playbook that fits from the local hackathon skill next to
  `eye-candy` (gitignored; its `playbooks/` and `levers.md`). Reach any feature's state with `drive go <feature>:<state>` from
  the feature map in `.claude/skills/run-ourspaces/features/` instead of
  searching the code. Every finished task gets a write-up in
  `nebius/eval/<id>-<name>.md` and a log entry via that skill's `scripts/loop.mjs close`.
- **Update `nebius/README.md` Status after each step**, same as
  `docs/todos.md`, and add a row to `DIRECTORY.md` when you add a doc.
- **Models:** AI work runs on NVIDIA Nemotron via Nebius Token Factory
  (OpenAI-compatible API) through `convex/nebius.ts`; on the dev
  deployment every AI feature already uses it (`convex/ai.ts`). Prod is
  frozen on Oct 4's build and still calls OpenAI until the freeze lifts.
- **Prod is frozen** (`nebius/.prod-freeze`): ship to the dev lane only
  (`npm run deploy:dev` → https://dev--ourspaces-app.netlify.app).

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
it pushes to `dusty-condor-648`, which the public site never reads, so your
changes would silently do nothing there.

**The dev lane (since Oct 4).** `dusty-condor-648` is now the place to ship
unfinished work without touching `ourspaces.io`:

- `npm run deploy:dev` pushes `convex/` to the dev deployment, builds against
  it and publishes the Netlify preview `https://dev--ourspaces-app.netlify.app`.
- `npm run dev:lane` runs Vite against the dev deployment. Plain `npm run dev`
  still reads and writes prod data.
- `./scripts/dev-lane.sh backend` pushes the backend alone.

While a local `nebius/.prod-freeze` file exists, agents ship only through the
dev lane; `npm run deploy` and `npm run deploy:convex` wait for Thomas.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
