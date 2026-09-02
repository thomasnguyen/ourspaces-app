# Agent instructions — OurSpaces (Convex All Gas hackathon)

Everyday app for friend groups: a group chat becomes a live shared canvas.
Convex hackathon entry; deadline Sep 22 2026. Doc index: `docs/doc-map.md`
(it points at the local-only index for anything not tracked).

## Rules

- **No tests. Ever.** This is a hackathon — no unit tests or any automated
  tests; don't waste time or tokens on them. `npm run build` (typecheck) is the
  check. Visual/live work is verified in the browser.
- **Demo path over edge cases.** Happy path + empty state. No defensive code,
  refactors, a11y audits, i18n, or abstractions "for later."
- **Design work goes through `/eye-candy`.** Before any `/impeccable` command or
  freeform UI work, read `.claude/skills/eye-candy/SKILL.md` (local-only, like
  `PRODUCT.md` — both are gitignored; skip if a clone doesn't have them). It is
  the override layer on impeccable and carries the house motion system: the
  three easing curves, the duration scale, stagger, and which moments earn
  cinematic treatment.
- **Prototype quality is fine.** This is a 4-week build, not a system anyone
  inherits — don't over-optimize for "production". The one exception: keep
  TypeScript types decent, since they make vibe coding work.
- **This is 100% vibe-coded.** The human never edits code directly. Add or
  update docs (`AGENTS.md`, `docs/`, `hackathon.md`) whenever it would help the
  next chat session pick up where you left off.
- **Don't ask permission.** For reversible changes, just do it and report after.
  Only stop for destructive/irreversible actions or genuine scope changes.
- **Run `npm run build` before ending a turn.** It's the only check.
- **Read `docs/doc-map.md` before opening other docs.** Open only the 1–2
  files it names for the task. Update it when you add, move, or retire a doc.
  Local-only paths stay gitignored — never commit them.
- **Read `docs/code-map.md` before searching the codebase.** Update it when you
  add, move, or split files or major `App.tsx` sections.
- **Update `docs/` as you go, not just at the end.** After each working step
  that lands a feature, moves files, or changes a decision, update
  `docs/todos.md` (works now / broken / next up / decisions made in chat) and
  whichever doc the map points at — `docs/code-map.md` for structure,
  `docs/spaces-and-widgets.md` for a space or widget. Sessions get cut off
  mid-build; docs are the handoff. `hackathon.md` stays the backward-looking
  log (`/hackathon` skill).
- **Splitting `App.tsx` / `index.css` is allowed and encouraged** when a section
  gets hairy — extract to `src/components` or `src/lib`, keep it hacky, update
  the code map.
- **Convex does the sync.** Widgets, votes, messages, presence are reactive
  queries. Never hand-roll state sync. Use components (presence, workflow,
  AgentMail, Firecrawl), crons, scheduled functions, HTTP actions, file storage,
  AI Gateway where they fit — and list each in README under "Convex depth".
  **Auth:** guest (Anonymous, silent) or join (Passkey). Never a login wall.
  Spec in `docs/data-model-plan.md` §1. Don't wire it until brain-play B1 is
  green.
- **Sponsors do core work:** OpenAI = structured extractor/decider (never a
  chatbot UI). The space has a brain: mail or a URL in → it files against the
  live canvas and the reason is visible on the object (letter flap, torn slip,
  recap strip on the board). AgentMail = the space's inbox. Firecrawl = URL →
  furniture on the board (recipe → potluck slots, not just a pretty card).
  Next build: `docs/todos.md` § Next up (B1→B4→B2→B3). Do not add a chatbot,
  a medical space, or more reading-circle questions.
- **Design is locked:** tokens in `src/index.css` `@theme`; use them, no hex.
  Near-black base, loud flat identity colors, black sticker pills, lime only as
  a tiny pop, Plus Jakarta Sans only, punchy motion, reduced-motion respected.
- **LLM copy in-product is plain and direct.**
- **Commit per working step** with a normal conventional message. Run
  `/hackathon` at the end of a session to update `hackathon.md`.
- **Replies to the human: ≤3 bullets, no paragraphs, no preamble.** Lead with
  the result. They're on a phone — only what matters; they'll dive in as
  needed. **Bold** anything needing their input, tagged **(question)**.
- **Secrets only in `.env.local` / Convex env vars. Never commit keys** — that
  includes tool config that carries a key in a header (`.mcp.json` is
  gitignored for exactly this reason). The GitHub repo is **public**: before
  tracking any new file, ask whether it should be readable by strangers.

## Commands

`npm run dev` · `npm run dev:backend` (`convex dev`) · `npm run build` ·
`npx convex deploy`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
