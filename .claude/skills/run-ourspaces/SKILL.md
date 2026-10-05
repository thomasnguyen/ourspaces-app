---
name: run-ourspaces
description: Run, drive, and screenshot the OurSpaces app. Use when asked to start the app, verify a UI change in the browser, screenshot a space, widget or feature state (voice orb, wheel, recap, …), shoot a sheet of states, or open the web post reading-circle thread dock. `drive go <feature>:<state>` plus the ~1 KB files in features/ replace reading docs/code-map.md.
---

OurSpaces is a Vite + React + Convex canvas app. The default way to see it is
**`drive`** (`.claude/skills/run-ourspaces/drive.mjs`): one warm Vite + one warm
headless Chromium kept alive by a small daemon, driven by one-line commands.
Mock mode (`?mock=1`) renders every space from fixtures, no backend.

All paths are relative to the repo root. Verified on macOS (darwin arm64).

## Setup (once per clone)

```bash
npm i --prefix .claude/skills/run-ourspaces playwright-core
```

Needs a cached Chromium under `~/Library/Caches/ms-playwright/chromium-*`
(newest is picked). If missing: `npx playwright install chromium`.

## Drive (default path)

```bash
alias drive="node .claude/skills/run-ourspaces/drive.mjs"
drive go voice-orb:listening --shot    # load a state, wait for it, shoot (~1 s warm)
drive sheet voice-orb:listening wheel:spinning recap:landed --w 1440,390
drive down                             # when you're done
```

Start from **`features/README.md`** (the index) and the one feature file you
need (~1 KB each), not `docs/code-map.md`. Each file names the room, the
states (`<feature>:<state>`), the test ids, how to drive it and where the
code lives.

| command | what it does |
|---|---|
| `up [--lane\|--mock]` | start the daemon (Vite on :5291 strict, control on :5292, pids in `.context/drive/state.json`); any other command auto-ups. Cold ~1.5–3 s. `--lane`/`--mock` on a running daemon just switches mode |
| `go <f>[:<s>] [--w 1440\|390] [--shot]` | full load of that state's URL, wait for its ready test id, let the entrance settle, run its steps; prints ms. First state is the default |
| `click <id>` · `type <id> <text>` · `wait <id>` | act on the current page (`<id>` = data-testid, or `css:<selector>`) |
| `shot [name]` | `.context/drive/shots/<name>.png` (full size) + `.jpg` (≤1000 px). **Look at the JPEG**; open the PNG only for one detail |
| `sheet <f:s> … [--w 1440,390]` | shoot each × width, tile into ONE labelled JPEG — several states, one image read |
| `two <f:s> [--w N]` | two separate browser contexts (two people) on one state, side by side. For `--lane`; mock tabs don't sync |
| `eval <file.mjs>` | escape hatch: file default-exports `async ({page, ctx, base, mockUrl, go, shot})`; its `console.log` lines are printed |
| `check` | fails if a test id named in `features/` isn't a `data-testid` in `src/`; lists css stand-ins and unmapped src test ids |
| `down` | stops exactly what `up` started (recorded pids/process groups), never by name |

Modes: Vite **always** runs with the dev-lane env from `scripts/dev-lane.sh`
(the `dusty-condor-648` dev deployment), so nothing can reach prod. Mock vs
lane is only whether `?mock=1` goes in the URL. In lane every room opens
behind the entry gate ("enter the room"), which has no test id yet.

Driving notes: the drive browser is a returning visitor (the "You're in the
demo" modal is pre-dismissed; add `?notice=1` to a state to see it). After a
click the pointer parks at (4,4) so hover toolbars don't photobomb. `go` adds
`_d=<n>` to force a full load. CSS animations run 6× during the entrance
settle, then 1×. After editing `drive.mjs`, `drive down` (the daemon keeps
the old code). Log: `.context/drive/daemon.log`.

Add a feature: copy a file in `features/`, fill the header (format in
`features/README.md`), add a line to the index, run `drive check`.

## Fallback: the one-shot driver

`driver.mjs` launches a browser per call and needs a Vite you start yourself
(never plain `npm run dev`, it talks to prod — use `npm run dev:lane`).
Use it only if the daemon won't come up.

```bash
npm run dev:lane > /tmp/vite-lane.log 2>&1 &   # note the port it prints
PORT=<port> node .claude/skills/run-ourspaces/driver.mjs shot "#/space/trip" /tmp/trip.png
PORT=<port> node .claude/skills/run-ourspaces/driver.mjs dock /tmp/dock.png 2
```

| command | what it does |
|---|---|
| `shot <route> <out.png>` | open a hash route in mock mode, wait for the canvas + entrance animation, screenshot |
| `dock <out.png> [qN]` | trip space: open the web post's reading-circle thread dock via its comment chip; optional `2` switches to starter q2 |
| `eval <file.mjs>` | escape hatch — the file default-exports `async ({page, ctx, base, mockUrl})` |

Env: `PORT` pins the Vite port (otherwise it probes 5173-5176 for the
`OurSpaces` title), `HEADLESS=0` opens a window, `LIVE=1` drops `?mock=1`.
Stop your Vite by the pid you started, never by port or name.

## Run (human path)

```bash
npm run dev:lane   # dev database; plain `npm run dev` reads and writes prod (standing order 1)
```

## Test

No tests, ever (hackathon rule — see AGENTS.md). The check is:

```bash
npm run build   # tsc -b && vite build; convex/ has its own: npx tsc -p convex --noEmit
```

## Read-only live sessions

Some UI only exists in live mode — the entry gate (`ClaimCard` gate variant,
`GateCursor`) is never mounted by the mock page. To drive live without
writing anything into prod, wire `readonly.mjs` into your `eval` script:

```js
import { makeReadOnly } from "../../.claude/skills/run-ourspaces/readonly.mjs";
export default async ({ page, ctx, mockUrl }) => {
  const dropped = await makeReadOnly(ctx);      // before the first goto
  await page.goto(mockUrl("#/space/crew"));     // LIVE=1 makes this the real room
  // ... drive ...
  console.log([...new Set(dropped)]);           // e.g. Mutation:spaces:joinDemoSpace
};
```

It routes the Convex sync WebSocket, forwards every server→client frame and
every read, and drops client→server `Mutation` / `Action` frames (join,
presence heartbeats, anonymous sign-in). Queries still stream, so the room
renders real data. Run with `LIVE=1`. Pass the same `dropped` array to a
second context (e.g. a phone profile) to keep one log.

To test one write path without opening the rest, copy the same route handler
with an allowlist — `.context/ask-stream/check.mjs` drives the real "ask the
space" stream on prod while still dropping join/presence/sign-in, so the blast
radius is exactly the mutations the feature is made of.

## Gotchas

- **`?mock=1` must be in the search string, before the hash** —
  `/?mock=1#/space/trip`. Inside the hash (`#/space/trip?mock=1`) the mock
  flag still registers but the space-slug parser breaks and you silently land
  on the crew space.
- **Vite drifts to port 5174+** when 5173 is held by another workspace's dev
  server. `drive` sidesteps this with its own strict port (5291); the old
  driver probes for the `OurSpaces` title. Never kill a 517x Vite you didn't start.
- **Headless WebGL** (the voice orb): `drive` runs headless Chromium on the
  real GPU (`--use-angle=metal`); SwiftShader also renders it but makes every
  frame ~2× slower. If the orb comes out blank: `drive down; DRIVE_GL=swiftshader drive up`.
- **Mock lab writes**: plain `npm run dev` + `#/play` used to write real prod
  presence; `drive`'s Vite env points at the dev deployment instead.
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
  post). Use `drive` or the driver — both build the URL correctly.
- **Driver clicks the card but no dock appears, `ctx.pages()` grew to 2**:
  you clicked the article anchor, which opened a new tab. Click the comment
  chip or the cover art instead.
- **`drive` says `daemon … alive but not answering`**: `drive down`, then retry; read `.context/drive/daemon.log`.
- **`ERROR go: <f>:<s> ready test id "x" never appeared`**: wrong room, a modal on top, or the id moved — `drive shot` and look.
- **`No OurSpaces vite server found`**: dev server not up or on a port
  outside 5173-5176 — start it, or pass `PORT=<n>`.
