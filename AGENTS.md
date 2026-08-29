# Agent instructions — OurSpaces (Convex All Gas hackathon)

Everyday app for friend groups: a group chat becomes a live shared canvas.
Convex hackathon entry; deadline Sep 22 2026. Spec: `docs/ourspaces-prd-v0.6.md`.
Data model: `docs/data-model-plan.md`. Design: `DESIGN.md`, `docs/tokens.md`.
Plan and cut order: `.private/PLAN.md` (local only).

## Rules

- **No tests. Ever.** This is a hackathon — no unit tests or any automated
  tests; don't waste time or tokens on them. `npm run build` (typecheck) is the
  check. Visual/live work is verified in the browser.
- **Demo path over edge cases.** Happy path + empty state. No defensive code,
  refactors, a11y audits, i18n, or abstractions "for later."
- **Design work goes through `/eye-candy`.** Before any `/impeccable` command or
  freeform UI work, read `.claude/skills/eye-candy/SKILL.md`. It's the override
  layer on impeccable: no accessibility findings (ARIA, screen readers, keyboard
  nav, WCAG ratios, alt text, touch targets), effort goes to motion, identity
  color, liveness, and the promote climax instead. Same rule is restated in
  `PRODUCT.md` § Accessibility & Inclusion, which impeccable prints every run.
- **Hacked-together is fine.** No one will read this code — B/C-grade quality is
  good enough. Don't polish or over-optimize for "production". The one exception:
  keep TypeScript types decent, since they make vibe coding work.
- **This is 100% vibe-coded.** The human never edits code directly. Add or
  update docs (`AGENTS.md`, `docs/`, `hackathon.md`) whenever it would help the
  next chat session pick up where you left off.
- **Don't ask permission.** For reversible changes, just do it and report after.
  Only stop for destructive/irreversible actions or genuine scope changes.
- **Run `npm run build` before ending a turn.** It's the only check.
- **Read `docs/code-map.md` before searching the codebase.** Update it when you
  add, move, or split files or major `App.tsx` sections.
- **End of session: update `docs/todos.md`** (works now / broken / next up /
  decisions made in chat). `hackathon.md` stays the backward-looking log
  (`/hackathon` skill).
- **Splitting `App.tsx` / `index.css` is allowed and encouraged** when a section
  gets hairy — extract to `src/components` or `src/lib`, keep it hacky, update
  the code map.
- **Convex does the sync.** Widgets, votes, messages, presence are reactive
  queries. Never hand-roll state sync. Use components (presence, workflow,
  AgentMail, Firecrawl), crons, scheduled functions, HTTP actions, file storage,
  AI Gateway where they fit — and list each in README under "Convex depth".
- **Sponsors do core work:** OpenAI = structured extractor/decider (never a
  chatbot UI), AgentMail = the space's inbox (send, receive, replies mutate
  canvas), Firecrawl = link → structured widget.
- **Design is locked:** tokens in `src/index.css` `@theme`; use them, no hex.
  Near-black base, loud flat identity colors, black sticker pills, lime only as
  a tiny pop, Plus Jakarta Sans only, punchy motion, reduced-motion respected.
- **LLM copy in-product is plain and direct.**
- **Commit per working step** with a normal conventional message. Run
  `/hackathon` at the end of a session to update `hackathon.md`.
- **Replies to the human: ≤3 bullets, no paragraphs, no preamble.** Lead with
  the result. They're on a phone — only what matters; they'll dive in as
  needed. **Bold** anything needing their input, tagged **(question)**.
- Secrets only in `.env.local` / Convex env vars. Never commit keys.

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
