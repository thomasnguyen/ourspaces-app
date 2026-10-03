---
name: ourspaces-docs
description: Route to the right OurSpaces doc instead of reading the whole pile. Use when starting a session, when unsure which markdown file to open, or when the task is product spec, design, spaces/widgets, data model, marketing, hackathon log, the Nebius × NVIDIA entry, or "look at the docs." Also use when adding, moving, or gitignoring a doc so the map stays current.
---

# OurSpaces docs

There are many markdown files. Do not open them as a set.

## Workflow

1. Read `docs/doc-map.md`. That is the index. For Nebius hackathon
   work, start at `nebius/README.md` instead (local-only).
2. Open **at most 1–2** files the map names for this task.
3. If a path is marked local-only and missing, skip it. Public clones will
   not have those files.
4. Never `git add` a gitignored doc (`.gitignore` lists them; also
   `.context/`, `.private/`, `docs/local/`, `nebius/`, `docs/post-skeletons.md`).
5. After adding, moving, or retiring a doc, update `docs/doc-map.md` in
   the same change.
6. A new local HTML page also goes in the shared page menu: add it to
   `nebius/nav/nav.js`, then run `node nebius/nav/inject.mjs` (local-only;
   skip if missing).

## Do not

- Glob-read `docs/*.md` or dump root `*.md` into context
- Copy private strategy (playbook, outreach, positioning notes) into a tracked file
- Recite this skill or the map back to the human — just use them
