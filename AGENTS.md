# Agent instructions — OurSpaces (Convex All Gas hackathon)

Everyday app for friend groups: a group chat becomes a live shared canvas.
Convex hackathon entry; deadline Sep 22 2026. Spec: `docs/ourspaces-prd-v0.6.md`.
Data model: `docs/data-model-plan.md`. Design: `DESIGN.md`, `docs/tokens.md`.
Plan and cut order: `docs/PLAN.md`.

## Rules

- **No tests. Ever.** `npm run build` (typecheck) is the check. Visual/live work
  is verified in the browser.
- **Demo path over edge cases.** Happy path + empty state. No defensive code,
  refactors, a11y audits, i18n, or abstractions "for later."
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
- **Replies to the human: ≤3 short bullets.** Lead with the result.
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
