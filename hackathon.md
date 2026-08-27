# OurSpaces hackathon build log

**Builder:** OpenAI Codex · **Backend:** Convex · **Live:** https://necessary-cobra-892.convex.site

## 2026-08-26 22:29 PDT — Convex canvas overnight

- `aa13bde` — Added the live canvas schema: spaces, members, widgets, messages, votes, and presence.
- `8b7d99d` — Added typed widget data for notes, polls, countdowns, potlucks, daily questions, and frames.
- `6e7b213` — Added reactive space, widget, and poll-result functions.
- `ce7f719` — Seeded the lived-in `the crew` space and Maya's birthday frame.
- `0febd47` / `0c22827` — Built the app shell and interactive, native-scroll canvas with widget renderers.
- Deployed the backend and static site to Convex production. Verified the public canvas loads with seeded widgets and no browser console errors.

## Next demo beat

Open the live URL in two windows and drag the birthday frame or any widget: its final position is stored in Convex and streams to every connected canvas.
