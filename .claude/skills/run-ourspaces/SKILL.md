---
name: run-ourspaces
description: Run, drive, and screenshot the OurSpaces app. Use when asked to start the app, verify a UI change in the browser, screenshot a space or widget, or open the web post reading-circle thread dock.
---

OurSpaces is a Vite + React + Convex canvas app. Drive it headless with
`.claude/skills/run-ourspaces/driver.mjs` (playwright-core against the
machine's cached Playwright Chromium — no chromium-cli, no browser download).
The mock data mode (`?mock=1`) renders every space from fixtures, so no
Convex backend is needed for UI verification.

All paths are relative to the repo root. Verified on macOS (darwin arm64).

## Setup (once per clone)

```bash
npm i --prefix .claude/skills/run-ourspaces playwright-core
```

Needs a cached Chromium under `~/Library/Caches/ms-playwright/chromium-*`
(the driver picks the newest). If missing: `npx playwright install chromium`.

## Run (agent path)

Start the dev server, then run the driver:

```bash
npm run dev > /tmp/vite-dev.log 2>&1 &
for i in $(seq 1 30); do grep -q "localhost:" /tmp/vite-dev.log && break; sleep 1; done
grep -o "localhost:[0-9]*" /tmp/vite-dev.log | head -1   # note the port

node .claude/skills/run-ourspaces/driver.mjs dock /tmp/dock.png 2
node .claude/skills/run-ourspaces/driver.mjs shot "#/space/trip" /tmp/trip.png
```

| command | what it does |
|---|---|
| `shot <route> <out.png>` | open a hash route in mock mode, wait for the canvas + entrance animation, screenshot |
| `dock <out.png> [qN]` | trip space: open the web post's reading-circle thread dock via its comment chip; optional `2` switches to starter q2 |
| `eval <file.mjs>` | escape hatch — the file default-exports `async ({page, ctx, base, mockUrl})` for arbitrary Playwright driving |

Env: `PORT=5174` pins the vite port (the driver otherwise probes 5173-5176
and picks the server whose HTML title says OurSpaces), `HEADLESS=0` opens a
visible window, `LIVE=1` drops `?mock=1` to hit the connected Convex dev
deployment (needs `VITE_CONVEX_URL` in `.env.local`; mock is the default and
right for UI checks).

Routes: `#/` (crew) · `#/space/trip` · `#/space/league` · `#/widgets`
(widget lab). **Look at the screenshot** — a crew-space screenshot when you
asked for trip means the mock flag ended up in the wrong place (see Gotchas).

Stop the server:

```bash
lsof -ti:5174 -sTCP:LISTEN | xargs -r kill   # use the port you noted
```

## Run (human path)

```bash
npm run dev   # → prints the localhost URL, open in a browser. Ctrl-C to stop.
```

## Test

No tests, ever (hackathon rule — see AGENTS.md). The check is:

```bash
npm run build   # tsc -b && vite build; convex/ has its own: npx tsc -p convex --noEmit
```

## Gotchas

- **`?mock=1` must be in the search string, before the hash** —
  `/?mock=1#/space/trip`. Inside the hash (`#/space/trip?mock=1`) the mock
  flag still registers but the space-slug parser breaks and you silently land
  on the crew space.
- **Vite drifts to port 5174+** when 5173 is held by another Conductor
  workspace's dev server. Never assume 5173; the driver probes for the
  `OurSpaces` title so it won't screenshot a sibling workspace's app.
- **Opening a widget's thread dock = click its comment chip** (the black
  bubble, `.widget-comment-chip`), which lives as a *sibling* of the widget
  shell inside `.widget-group`. Don't XPath on `contains(@class,'widget-group')`
  — it also matches `widget-group-body` (no chip inside) and finds nothing.
  For a filled web post, clicking the cover art also zooms (but the paper
  clipping / read pill is an `<a>` that opens the article in a new tab —
  count `ctx.pages()` to detect that).
- **Don't wait for network idle** — the app long-polls/websockets, it never
  settles. Wait for selectors (`.space-canvas`, `.widget-link-card.is-ready`,
  `.thread-question-strip`) plus ~1.5s for the entrance animation.
- **macOS zsh has no `timeout`** — poll with a `for i in $(seq 1 30)` loop.
- **playwright-core, not playwright** — the full package tries to download
  browsers; `playwright-core` + `executablePath` into the ms-playwright cache
  launches instantly.

## Troubleshooting

- **`waiting for locator('.widget-link-card')` timeout on `#/space/trip`**:
  the mock flag was inside the hash, so you're on the crew space (no web
  post). Use the driver — it builds the URL correctly.
- **Driver clicks the card but no dock appears, `ctx.pages()` grew to 2**:
  you clicked the article anchor, which opened a new tab. Click the comment
  chip or the cover art instead.
- **`No OurSpaces vite server found`**: dev server not up or on a port
  outside 5173-5176 — start it, or pass `PORT=<n>`.
