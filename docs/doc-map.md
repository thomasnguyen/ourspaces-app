# Docs map

For agents and humans. Read this first, then open **at most 1–2 files**
that match the task. Do not ingest `docs/` or the repo-root markdown as a
set. Update this map when you add, move, or retire a doc.

Local-only paths are listed so a machine that has them can use them. If a
path is missing (public clone), skip it — do not create a stub, do not
commit it.

## Start here

| Need | Open |
|---|---|
| Agent rules, reply style, hackathon constraints | `AGENTS.md` |
| Convex pointer (read `AGENTS.md` first) | `CLAUDE.md` |
| Which file to read next | this map |
| Where code lives | `docs/code-map.md` |
| Session handoff (works / broken / next) | `docs/todos.md` |
| What shipped (backward-looking log) | `hackathon.md` |

## Product & pitch

| Need | Open |
|---|---|
| Public one-pager | `README.md` |
| What each space is and what it still needs | `docs/spaces-and-widgets.md` |

Product spec, positioning and submission copy are **local-only** — see the
bottom table.

## Design

| Need | Open |
|---|---|
| Visual system, materials, type, motion | `DESIGN.md` |
| Taste / "not a dashboard" | `docs/the-feel.md` |
| Token names (keep in sync with `src/index.css` `@theme`) | `docs/tokens.md` |
| UI work + house motion system (local-only) | `.claude/skills/eye-candy/SKILL.md` |

## Spaces, widgets, backend

| Need | Open |
|---|---|
| Demo rooms, widget catalog, what each space still needs | `docs/spaces-and-widgets.md` |
| The build room / reading room (widgets, funnel, where link state lives) | `docs/spaces-and-widgets.md` §0 |
| Schema, auth, Convex-as-state | `docs/data-model-plan.md` |
| Email → canvas: the 3 mail cases, router, digest, status, open goals | `docs/mail.md` |
| Firecrawl + AgentMail keys and webhooks | `docs/firecrawl-agentmail-setup.md` |
| Running / screenshotting the app | `.claude/skills/run-ourspaces/SKILL.md` |

## Local only — never commit

These are gitignored or excluded. Skip if the file is not on disk.

| Need | Open |
|---|---|
| Cut order / private plan | `.private/PLAN.md` |
| Product spec, scope, demo priorities | `docs/ourspaces-prd-v0.6.md` |
| Positioning for design commands (impeccable prints it) | `PRODUCT.md` |
| Design override layer + house motion system | `.claude/skills/eye-candy/SKILL.md` |
| Impeccable's config + critique output | `.impeccable/` |
| Submission listing copy | `docs/vibeapps-listing.md` |
| Marketing playbook (calendar, objectives) | `.context/ourspaces-marketing-playbook-v2.md` |
| X / Threads post drafts | `docs/post-skeletons.md` |
| More local drafts (drop here) | `docs/local/` |
| Conductor scratch (shots, eval scripts) | `.context/` |

**The GitHub repo is public.** Tracked docs describe the product and how it's
built. Anything about how we plan to *present* it — audience strategy, demo
choreography, outreach lists, submission copy, competitive framing — stays
local (`.context/`, `docs/local/`, or a gitignored path). Same for tool config
carrying an API key (`.mcp.json`). When in doubt, write it local; promoting a
file to tracked later is easy, un-publishing it is not.

## When you add a doc

1. Decide public vs local-only **before** writing.
2. Public → add a row here. Local → put it in `.context/` or `docs/local/`
   (or add the path to `.gitignore`) and add a row under **Local only**.
3. Do not also summarize the new doc in `AGENTS.md` — the map is the index.
