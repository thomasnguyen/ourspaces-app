# Status

Session handoff file. Update at the end of every session (see `AGENTS.md`).
Backward-looking history lives in `hackathon.md`.

## Now working

- **Live drag + two-window cursors (2026-09-16):** presence is now keyed per
  TAB (`getPresenceId()`), not per authenticated user. Two windows of one
  browser share the Convex Auth session, so they shared `identity.userId` and
  therefore one presence row — each overwrote the other and filtered it out as
  "me". Peer cursors and mid-drag widget motion were fully built and simply
  never visible to the one person testing them; only the committed drop synced,
  because that rides the widgets table. Room occupancy (`RoomPresenceHeartbeat`,
  Rail) uses the same key, so "N here" matches the cursors on screen. Also added
  a 500ms gesture keepalive: holding a drag still stopped all writes, the lock
  went stale at 1.5s, peers saw the card glide home and the drop was refused.
  Verified two tabs in one context against prod with
  `.context/live-perf/two-tabs.mjs`: peer cursor travels 1584px over 197
  spots, the widget moves 251px mid-drag across 439 held frames, held through a
  2.2s pause, "here now" reads 2, board restored. **Deployed** — verified
  2026-09-17 by fetching the live bundle off
  `necessary-cobra-892.convex.site`; it carries the `ourspaces:tab-id`
  sessionStorage key, so the fix is on the public site.

- **Brand exploration (2026-09-16):** two new local concept boards and full
  generation prompts are indexed in `docs/local/doc-map.local.md`. Visually
  reviewed. User selected Common room; a more playful brand system and landing
  concept are now saved locally with prompts and implementation handoff.
  Follow-up: revised the logo itself with softer geometry and an asymmetric
  opening; local v3 logo board is indexed with its prompt. Not yet implemented.
  Selection is a design direction, not an app implementation: source and
  deployment unchanged. Build passes. Git is blocked by the pending Xcode license.

- **Local submission draft (2026-09-16):** presentation assets and copy are
  indexed in `docs/local/doc-map.local.md`. All five gallery slots now contain
  visually reviewed saved app captures, with provenance in the local copy
  document. Revised thumbnail and a five-image download pack are included.
  Project copy now pairs a short tagline with two conversational paragraphs
  explaining the need and concrete behavior. Implementation credits remain
  in the longer video description.
  All creative material stays gitignored. App source and deployment unchanged.
  `npm run build` passes; browser preview was unavailable in this session.
  Follow-up: checked the local preview against the public VibeApps source;
  corrected field limits, card order and gallery behavior. Verification
  details remain in the local copy document; live organizer settings unknown.

- **The space narrates itself while it works (2026-09-15):** new `work` table
  + `convex/work.ts`. Every slow thing the brain does used to be invisible —
  the board showed nothing for 3–8 seconds and then the finished thing
  appeared, so the one moment the space was visibly thinking was the one
  moment it was silent. Now each action writes a line at each real boundary
  it crosses and the canvas's live strip reads it out: `live · fetching
  anthropic.com` → `live · read "Building effective agents"`. Wired into the
  mail brain (`inbox.processInbound`: open → read attachments → decide →
  file, using the router's own `because` sentence for the filed line → reply),
  the emailed-link fan-out (`inboxRouting.routeBuildRoom`, one fetch/done per
  link, same runId as the email so it reads as one arrival), and
  `firecrawl.scrapeLink` / `searchTopic` / `crawlSite` (which take an
  optional narration-only `spaceId`).
  **Decision: nothing is ever on a timer.** A step with no real boundary
  gets no line — a shorter honest sequence beats a longer invented one. That
  is also the bar the strip's credibility rests on.
  `useSpaceWork` expires every line (done lingers 9s, running capped at 45s
  so a dead action can't pin "fetching x" forever), and `work` outranks a
  gesture on the strip because a person dragging a poll is already visible
  and this is not. Verified live against prod in a **read-only browser**
  (only `Action:auth:signIn` was dropped — the page wrote nothing; the work
  rows came from a CLI-triggered `scrapeLink`, which is server-side):
  idle → `fetching convex.dev` (sweeping) → `read "All gas no breakages"`
  (lime) → back to idle at +10s. Build passes.
  **Backend IS deployed** (`npx convex deploy`, additive — new table, new
  functions, optional args); the frontend is NOT, so the public site's
  current bundle never calls `work.recent` and nothing changed for visitors.
  Ship the frontend with `npm run deploy` when the rest of the session's UI
  work goes out.

- **Next up — retire the reading room's fake clock.** `ARRIVAL_STEPS` +
  `STEP_AT_MS = [0, 800, 1700, 2700, 3800, 5000]` in `ReadingRoom.tsx`
  narrates a dropped link's six "steps" off `link.droppedAt` — a timer, not
  the pipeline. It is the last simulated narration in the app now that `work`
  exists. Swap it to the real rows (keyed by runId), keep the copy, and let a
  link with no matching run fall back to the clock so old rows still read.

- **Entry gate — the door opens (2026-09-15):** the claim gate is a doorway,
  not a form. Every entry names the room at the top (roster faces + the live
  "N here right now" from the presence component, or "nobody in yet · you're
  first"); the name is the loud field, pre-selected on desktop so one
  keystroke replaces "momo" and Enter walks in; colour + face + placeholder
  name collapsed into eight one-tap **looks** (`PERSONAS`, a typed name
  survives a look change; two colours added so all eight are distinct). Your
  own cursor — the same LiveCursor peers see — rides the pointer over the
  blurred room and recolours as you tap (`GateCursor.tsx`; the OS arrow is
  hidden over the scrim; phones get it parked in the card). On enter the card
  collapses into the cursor tip (WAAPI, glide, 440ms), the scrim lifts from
  120ms off a canvas that was there all along (the canvas is keyed on the slug
  now, not on the gate state — remounting it on entry replayed the wavefront
  and the widgets you were looking at blinked out), the header enters at
  200ms, and the drawn cursor hands over to the real one last. The popover
  variant (header self face) mounts the same riding cursor — it appears at
  the click point, the native cursor hides over the room while the popover is
  open, and done collapses the popover into it the same way. Decision: the
  cursor is a preview that lives with the identity card, not a full-time
  companion (the native grab / I-beam states are real information in the room). Browser-verified in live mode at 1440×900
  and on a 390px touch profile with a **read-only harness** (the Convex
  socket forwards reads but drops every Mutation/Action, so the run wrote no
  member, presence or sign-in into prod — `.claude/skills/run-ourspaces/readonly.mjs`).
  Mock mode has no gate at all (App.tsx's mock page never mounts ClaimCard),
  so the gate can only be checked live. Build passes. Not deployed.

- **New-space flow (2026-09-15):** templates now lead above a compact board
  preview, with a single “create space” action. Color, symbol and starting
  widgets are tucked into Customize; removed the decorative cursor and crowd.
  The empty template can be created without picking widgets. Existing email
  verification stays inline. The native modal stays above raised canvas items.
  Browser-verified at 1280px, 390px and 320px: templates, naming, optional
  controls, six-widget cap, empty start and email handoff/back navigation.
  Build passes; no email sent or space created during verification. Not deployed.

- **Browse-all gallery (2026-09-15):** expanded catalog to an 880px gallery
  with illustrated widget samples, grouped Share / Plan / Play / Build sections,
  counted filters, and a smaller single-row sticker footer. Phone layouts use
  two columns and nearly the full screen. Quick picks keep their compact tray.
  Browser-verified at 1280px, 390px, and 320px: categories, search, empty
  results, and photo-wall placement handoff. Build passes. Not deployed.

- **Build room overview spacing (2026-09-15):** the overview was a 3:2 box
  fitted by height into a ~2:1 band, so it shrank to ~64% and floated
  mid-right with a void under the nameplate. Recomposed to three columns
  (pile / roundtable · hot now, five deep / wide shipping wall · keepers as
  two stacked index cards) at ~2.1:1 so it fits by width and spans the band
  flush with the title; leftover height is split above and below. Same
  widget scale on a 1440×900, larger on 1920×1080. All placements are remapped
  in `buildRoomPresentation.ts` (nothing written to the DB; the canvas grows
  in `LiveSpace` past the row's 1640×1080). Kept takeaways now land in the
  keepers column via `keeperNoteSlot`. Build passes; not deployed.

- **Add tray redesign (2026-09-15):** eight quick-pick widgets now lead;
  the frame action is a compact secondary row. Stickers sit in one horizontal
  paper strip at the bottom with scroll arrows. “Browse all” opens a searchable
  catalog with Share / Plan / Play / Build filters, short descriptions, and
  drawn previews instead of emoji fallbacks. Both live and mock paths share
  `WidgetPicker.tsx`; no backend changes. Browser-verified at 1280px, 390px, and 320px, including search, filters,
  empty results, sticker scrolling, and widget placement handoff. Build passes;
  not deployed.

- **Potluck sheet no longer collides with itself (2026-09-15):** on a
  narrow card the item name and the claimant's signature printed on top of
  each other ("monday" under "Maya"). The row was a 4-column grid whose
  `1fr` signature track collapsed to zero and then overflowed leftwards.
  The row is a flex line now — nothing can overlap at any width — and
  `.widget-potluck` is a named query container with two fallbacks:
  **≤340px** drops the pen-name (the face already says who signed) and
  **≤286px** drops the center fold and runs one item per line, which buys the
  signature back. That last one is gated on `.potluck-short` (≤4 items, set
  in `core.tsx`) — a six-slot sheet in one column runs off the bottom of the
  paper, so it stays in two columns. A line you claimed shows "you've got it"
  at rest and swaps it for **release** on hover, so a half-width line never
  carries three things. Repros (local-only): `.context/potluck/repro.mjs`,
  `states.mjs`, `stress.mjs` — the last one asserts no line overlaps or
  spills and the list still fits, at six slots with long names.

- **Room liveness: your own clicks, and who's here (2026-09-14):** two gaps
  left after the cursor work, both now closed.
  **Your own actions no longer wait for the server.** Claiming a potluck item
  took **175ms** to paint — the whole round trip, for something the client
  already knew. `claimItem`, `votes.vote` and `updateWidgetData` now carry
  `withOptimisticUpdate`, so it paints on the next frame: **13ms**. That one
  `updateWidgetData` update covers rsvp, the daily question and its reactions,
  the playlist dial and opening a letter, since they all route their complete
  new `data` through it.
  **"N here now" now clears when someone leaves.** It took ~17s (worst case
  30s). @convex-dev/presence's hook says goodbye on `beforeunload` with a
  `sendBeacon` to a HARDCODED path — `presence:disconnect` — and our
  room-occupancy API lives in `roomPresence.ts`, so the beacon was hitting a
  function that did not exist and failing silently. `convex/presence.ts` now
  exports a `disconnect` adapter at exactly that path: **466ms**. A crash or
  force-quit still waits out the 30s window; that is the backstop, not the
  normal path.
  Also fixed: the end of a remote drag flashed the card ~200px for one frame.
  WidgetCard's motion attach is a **`useLayoutEffect`** now — a passive effect
  runs after paint, so the frame with the new `left/top` and the old transform
  was reaching the screen. 205px → 3px.
  **At the floor:** peer-visible latency stays ~150ms. That is Convex's
  write + reactive-push path (network RTT is only ~17ms of it) and is not
  something the app can shorten.
  Probes: `.context/live-perf/self-latency.mjs`, `poll-self-latency.mjs`,
  `here-now.mjs` (local-only).

- **The coloring room is smooth too (2026-09-14):** its peer cursors now run
  through the same `peerMotion` engine as the canvas — 262ms lag and 9.7%
  stalled frames → **150ms and 0%**. They used to transition `left`/`top`,
  which both lagged the samples by a fixed 110ms and made the browser lay the
  board out again every frame; they now get an interpolated `transform` on
  rAF. Two things fixed along the way:
  `usePeerMotion` now returns a **memoised** handle — it was a fresh object
  every render, so every consumer holding it in effect deps was detaching and
  re-attaching constantly, and in the coloring room (whose pump calls
  `setState`) that was an infinite render loop that froze the cursor outright.
  And `CozyColorWidget` takes `peersRef` instead of a peers array, so the
  room no longer rides on Canvas's `widgetCards` memo re-running.
  Receiver frame budget measured clean throughout: 0–2% of frames over 20ms.
  Probe: `.context/live-perf/cozy-cursor.mjs` (local-only).

- **Live cursors + remote drags are smooth (2026-09-14):** a peer's cursor
  used to arrive as a jump every ~90ms and then sit still, ~240ms behind the
  hand that moved it. Three changes, all measured against prod, not guessed:
  (1) `src/live/peerMotion.ts` — a new rAF layer that interpolates between
  presence samples and *leads* the newest one by its own age, so a moving peer
  is drawn about where they are now. Positions go straight to the DOM, so a
  peer waving their cursor re-renders nothing; `Canvas`'s gesture signature
  deliberately excludes x/y for the same reason. Prediction is cut the instant
  a peer decelerates or reverses, and unwinds when samples dry up — without
  that, a hard stop threw the cursor ~100px past and crawled it back.
  (2) `SEND_INTERVAL_MS` 90ms → 50ms. Write-to-peer latency is ~135ms p50 and
  **flat** from 11Hz to 25Hz — fire-and-forget mutations pipeline rather than
  queue — so the old throttle bought nothing and cost up to 90ms.
  (3) `presence.updateGesture` no longer scans the room every frame; that
  `collect()` put every peer's cursor in the dragger's read set, so they took
  an OCC retry off each friend's heartbeat. Arbitration stays at
  `claimGesture` / `finishGesture`.
  Result: 240ms → ~150ms perceived lag, 7.6% → 0% stalled frames, drag RTT p90
  flat at ~134ms with two friends also moving (was 223ms with one). Probes and
  baselines: `.context/live-perf/` (local-only).
  **Still on the old path:** the coloring-room zone cursors inside
  `CozyColorWidget` — they render from React state, not peerMotion.

- **Demo MySpace portraits (2026-09-14, local-only):** the glitter, scene,
  and banner recorder variants now use fictional 2005-era snapshots for every
  profile, Top 8/Top 16 friend, and comment avatar. The 13 new friends are
  deliberately ordinary — plain tees, hoodies and polos in classrooms,
  kitchens, parks and hallways — while Jules keeps the first slightly
  alternative bedroom shot. All 16 friend photos load at 720×720 with no
  monogram fallbacks; assets stay under gitignored
  `docs/local/demo-video-assets/myspace/assets/` with no network requests or
  real people. Browser-verified the classic Top 8 and Maya's full Top 16.

- **Demo feed media (2026-09-13, local-only):** the `v=photos` recorder
  insert now replaces its flat picture placeholders with seven generated,
  fictional feed images: three polished product ads, travel and fitness
  creator bait, a viral dog reel, and one deliberately scrappy friend-made
  birthday cake. The same sneaker creative repeats in the sticky rail so the
  5.5s doomscroll reads as ad saturation immediately. All assets stay under
  gitignored `docs/local/demo-video-assets/feed/assets/`; no network requests
  or real brands/people. Browser-verified at the 1200×1120 recording viewport,
  including the loop recording and all seven loaded image sources.

- **Direct room navigation (2026-09-13):** retired the home/block page.
  `#/home` now redirects to `#/space/crew`; About’s entry buttons and the
  invalid-invite return link go straight to the crew. Removed the sidebar’s
  redundant all-spaces grid button. The bare URL and `#/` now open
  `#/space/crew` (updated per user preference); the build room keeps its
  explicit `#/space/buildroom` URL. Every generated room link includes its slug.
  The Welcome entry and cold About return also default to the crew.
  Removed the block route and its transition wiring from `App.tsx`.
  Verified on port 5174: old URL redirects, sidebar room switches, About
  entry/return links, browser history, and desktop/phone layouts. The first
  live visit still shows the existing name picker. `npm run build` passes.
  Local frontend only.

- **Vendor section placement + logos (2026-09-13):** moved the four vendor
  links directly below the About hero, before the live totals and room story.
  About and vendor heroes use the vendors’ original SVG wordmarks, embedded
  in `About.tsx` with source URLs so they load without external requests.
  Original artwork and brand colors are preserved. Verified on live port 5174
  at 1280px, 390px, and 320px: logos load, columns fit, clicking a logo
  opens its vendor page, and no console errors. `npm run build` passes.

- **Vendor stories (2026-09-13):** the four vendor names on About now open
  `#/about/convex`, `#/about/openai`, `#/about/agentmail`, and
  `#/about/firecrawl`. Each has an interactive, explicitly illustrative
  example; a four-step workflow; implementation-backed capability details;
  expandable technical notes with source links; and a direct room link.
  Vendor-to-vendor navigation stays inside About and preserves the return
  room. The user chose visual examples + expandable technical detail.
  Examples are local UI state and do not invoke APIs or mutate room data.
  Verified on port 5174 at desktop, 390px, and 320px: all four deep links,
  examples, technical disclosures, browser history, return room, live About
  totals, and reduced motion; no console errors. Fixed the blank-page React
  crash by keeping the scroll-reset effect void (do not return `scrollTo`).
  `npm run build` passes. Local frontend change; not deployed.

- **About redesign (2026-09-13):** `#/about` now opens with a full-color
  birthday collage and a sample cake poll you can vote on. The preview uses
  the real poll component, keeps its vote local, and labels itself a preview;
  the live totals still subscribe to `stats.getLiveTotals` in live mode only.
  Short outcome-led sections lead into five room links, Thomas + Holly’s
  origin story, and a compact maker section with expandable technical detail.
  The rail logo opens About. A quiet `about ↗` link is fixed bottom-right on
  both canvas paths (above the rail on mobile). Back returns to the last room;
  entry buttons now open the crew, and the all-spaces grid icon is retired.
  Uses existing artwork and house tokens. Browser-verified at 1440, 800,
  390, and 320px, including the preview vote, room links, logo/back flow,
  live totals, mobile corner link, and reduced motion. `npm run build` passes.
  Local frontend change; not deployed.

- **Mail arrival — the envelope that thinks out loud (2026-09-13):** an
  inbound email lands as a kraft envelope beside the space's address chip
  (`components/MailArrival.tsx`, page-level, measured off the nameplate)
  with a cream slip that narrates the wait — `opening it` → `reading it` /
  `reading the pdf` → `deciding` (holds at `slow one — still reading` past
  7s) — caret, three step dots, a scan line over the envelope. The verdict
  stamps down as a black sticker (`RECEIPT` · `BOOKING` · `LETTER` · `3
  LINKS` · `NOT SURE` · red `SPAM`), the because sentence prints in, then
  `filing it → expenses` and the envelope FLIPs to the widget it filed into
  (`flyEnvelopeTo` in `lib/flipLanding.ts`, per-segment easing so the throw
  reads at 1×), the widget takes a held lime wash, and `↩ told holly` ticks
  at its foot once the reply really went out. Spam slides off; unfiled with
  nowhere to go fades late. Every tick is a field on the `emailEvents` row:
  `label` (patched with `widgetId`/`because` in the four filing mutations),
  `readingAt`, `repliedAt` (`inbox.markEvent`; `ackInbound` now returns
  whether the reply went out). `mailArrival.recentInbound` is the bounded
  query it watches (no body leaves the server). The unfiled AgentMail label
  is now `unfiled` (was `filed`). **Lab: `#/mail`** (the crew) or **`#/mail/<slug>`** — the real space (mock
  or live) with a pill: receipt · booking · letter · unfiled · spam · ¼
  speed · replay · clear (`pages/MailLabBar.tsx`, lazy; fixtures in
  `lib/mailArrival.ts`). Verified in mock via `.context/shot-mail-lab.mjs`
  (frames in `/tmp/mail/`) and the live crew page mounts it clean; **not
  yet verified with a real inbound email** — rehearse one receipt + one PDF
  before shoot week. **Shared letter open** (mail goal 3): `open` is now
  `data.sealed` on the widget via `updateWidgetData` when live
  (`onLetterOpen` threaded Canvas → WidgetCard → LetterWidget), per-tab in
  mock. **Take reset:** `npx convex run shootReset:shootReset
  '{"slug":"crew","sinceMinutes":180}'` drops the take's events + mail-made
  widgets, restores the tahoe tracker / potluck / cake poll (+ its votes)
  to the fixtures, clears recaps. A letter target (the widget this very email made) stays hidden from the
  verdict until the envelope lands on it, so the envelope that lands IS the
  letter — verified on `#/mail/couple`. Shoot note: the seeded tahoe tracker sits
  at x=1378, off-screen below ~1500px wide — frame the tracker (zoom out or
  move it) before the take or the flight leaves the crop. Design decisions
  in `docs/mail-arrival.md` § Design decisions.
- **Prod cutover — done 2026-09-13. There is now ONE deployment and ONE
  database.** `prod:necessary-cobra-892` serves the public site *and* local
  `npm run dev` (`.env.local` points at it), so what you see locally is the
  demo data. Steps taken: 9 env vars copied to prod; `npx convex deploy`
  (explicit `--env-file` with `CONVEX_DEPLOYMENT=prod:…`, because the CLI
  prompts for confirmation otherwise and that fails in a non-interactive
  shell); full snapshot `npx convex export --include-file-storage` from dev →
  `npx convex import --prod --replace-all` (2421 documents, all tables +
  file storage; the snapshot is the rollback, in `.private/snapshots/`);
  static re-upload **after** the import, because `_components/staticHosting`
  is in the snapshot and importing it points prod's file manifest at dev's
  blob ids; new AgentMail webhook; dev webhook deleted.
  - **`npm run deploy` is now the single ship command** and runs without a
    prompt. **Do NOT run `convex dev`** — it pushes to the retired
    `dusty-condor-648`, which nothing reads, so changes silently do nothing.
  - Migrating the data fixed two things on its own: the build room renders
    **bottle green** (not the rejected orange) and the shipping wall shows
    dashboard screenshots (not the old people-shots). Those were stale *prod
    seed data*, not code.
  - Still burning quota: the retired dev deployment's four crons keep firing
    against the same team Free quota. Worth neutralising before the deadline.
- **The nameplate came from a stale fixture, not the DB (2026-09-13).**
  `LiveSpace.tsx` did `if (fixture) return fixture`, so the five showcase
  slugs always rendered `src/data/spaces.ts` names — which had drifted to the
  pre-rename copy ("the group chat", "long distance", "the dev guild") while
  the DB, every doc and the demo script say "the crew", "us two", "the build
  room". Nobody saw it because the old deployed bundle read the DB; shipping
  the current build to prod surfaced it. Fixed both ends: fixtures renamed,
  and the live row now wins on name/tagline/icon (the fixture stays the
  source for layout, widgets, canvas size, faces).

- **Pick it up, put it down — adding is now click-to-place (2026-09-13):**
  adding a sticker or a widget used to drop it at a fixed spot — mock mode used
  the viewport centre, live mode used `canvasWidth/canvasHeight` minus a
  gutter, i.e. the **bottom-right corner of a 1640×1080 board**, so on any
  panned or zoomed view the new thing landed off-screen. Now the tray hands it
  to the cursor: `src/components/PlacementGhost.tsx` renders the sticker art or
  a dashed card at the widget's real footprint, follows the pointer, and
  `onPlaceItem(point, keepPlacing)` creates it centred on the click.
  Shift-click keeps it in hand for another, esc/right-click drops it, and the
  ghost seeds at the tray button you clicked so it reads as peeled off that
  sheet. Both canvases share the flow (`placing` state in `App.tsx` and
  `LiveSpace.tsx`, `placingItem` prop on `Canvas.tsx`); `WidgetPicker` now
  hands back the click point. New `src/lib/canvasPlacement.ts` holds the
  placement math (`visibleCanvasCenter` moved out of App.tsx). Verified in the
  browser on mock `#/space/trip` and on the live crew board (sticker synced to
  Convex, then deleted); `npm run build` passes.


- **Room rename + rail reorder (2026-09-13):** the rail put the dev guild
  first; Thomas asked for it **third**, then for names that are "easily
  recognizable". `SPACES` in `src/data/spaces.ts` is now ordered
  `crew · couple · buildroom · house · league`, and three display names
  changed: **the crew → the group chat**, **us two → long distance**,
  **the build room → the dev guild**. Slugs, ids, filenames and CSS hooks are
  untouched — see the name/slug key at the top of `docs/spaces-and-widgets.md`.
  `SPACES_BY_ID` no longer spreads `SPACES[0..4]` positionally (reordering used
  to hand a room someone else's meta); it looks up by id. Two showcase strings
  lost their new-name echo on the home board: couple → "two time zones · …",
  buildroom → "link pile · ships, roundtables, hot takes". Also renamed in the
  two room back-buttons, the first-run pill, the home board facts and the
  emailed-links reply body. `DEFAULT_SPACE_SLUG` is still `buildroom`, so `#/`
  still opens the dev guild — being third in the rail and being the landing
  room are separate. **Live rows keep their old names until
  `npx convex run seed:backfillSpaceNames` is run** (new, non-destructive,
  idempotent — patches `name` only; `seedMissing` skips existing spaces, which
  is why a plain reseed wouldn't do it). Not run yet. The `by_name "the crew"`
  fallback in `convex/spaces.ts` is the *historical* name for pre-slug rows and
  is commented as such — don't "fix" it. `npm run build` and
  `npx tsc -p convex --noEmit` pass; rail order and all three headers verified
  in the browser at 1440.

- **Sign-in email implementation (2026-09-13):** approved the envelope
  direction. `convex/emails/signIn.ts` owns subject, plain text and responsive
  HTML; `otp.ts` uses its shared **20-minute** lifetime for the real auth
  expiry. The generated `public/assets/email/signin-header.png` combines
  wordmark + small envelope so the brand lettering survives email clients;
  the code and instructions stay selectable HTML, with sans-serif fallbacks.
  Sender display name updated to **OurSpaces** through AgentMail's inbox API.
  Browser-checked at 860, 390 and 320px, plus images hidden: no horizontal
  overflow and the code remains visible. `npm run build` and `convex dev --once`
  pass. Published backend + static assets to dev `dusty-condor-648`; hosted
  header returns image/png and matches the source. No email was sent during
  verification; the next requested code uses the new design and 20-minute expiry.
- **Widget wall, the "thirty of these" insert (2026-09-12, four passes in
  one evening — this is where it landed):** `#/wall` (`pages/WidgetWall.tsx`,
  CSS at the end of `pages/labs.css`) puts every widget on one drifting wall
  for the 0:12 line. 32 real `WidgetCard`s from the seeded rooms (the crew's
  cake poll, the couple's letter and postcard, the build room's pile, both
  stickers), each wearing a **black sticker name tag** on its bottom-left
  corner (emoji + catalog name, counter-zoomed so it's the same size on
  every card), dealt greedy-shortest to three masonry columns sized with
  `zoom` to fit the viewport width, on a tilted wall. **The 3D is done in
  JavaScript, not CSS:** Thomas asked "why does it look blurred?" and 2×
  clips proved it — under a CSS `perspective` Chrome resamples every
  drifting layer and small text goes soft at any angle (a flat plane inside
  the perspective was as soft as the tilted one; the same card with
  perspective removed was crisp). Thomas: "can we do javascript 3d? it
  doesn't have to be performant, this is only for the video." So there is no
  `perspective`/`preserve-3d` anywhere: each frame the rAF loop projects
  every tile's centre through a virtual camera (rotateY −13°, rotateX 16°,
  depth 80, perspective 2000, the pointer/sway added to the angles) and
  writes a plain 2D `translate + scale` per tile; cards stay flat rectangles
  Chrome paints crisp. **Smoothness pass (same night, "can we make it
  smoother? maybe with javascript?"):** every `.ww-tile` is now its own
  compositor layer (`will-change: transform`), so the per-frame projection
  moves on the GPU with no repaint — the layer rasters once at device
  resolution and the projected scale only nudges it ±15%, which 2× clips
  show stays as sharp as the repaint version (probe at 1728×1080@2×: 8.3ms
  avg rAF interval, 0.6ms jitter, no long tasks, `.context/shot-wall-smooth.mjs`).
  Track offsets are snapped to device pixels and cards carry no
  transform/opacity of their own beyond that hint. **Jagged-edge fix
  (same night, "why do i see jagged border here???"):** the pile's black
  card stair-stepped on Thomas's screen — it multiplies a paper texture
  over near-black (`background-blend-mode`) and sits rotated ~3° (its own
  −2° plus the scrapbook tilt); on a GPU-rasterized layer that blend path
  can drop edge anti-aliasing (headless software raster does not reproduce
  it — the diagnosis is by elimination: the tape, pills and plain paper
  cards beside it were smooth). Ten widgets use the same multiply-texture
  trick, so on the wall every `.widget-group` sits straight (`rotate: 0`,
  the tags keep their angle and the JS tilt supplies the depth) and the pile
  card is flat black with no texture. `tilt` in the pill (on by default) switches to the flat 2D
  wall. Columns drift up/down alternately at golden-ratio-spread speeds,
  loop seamlessly, and enter middle-first with a 70ms stagger on
  `--ease-pop`. Roll call lifts the card
  nearest the middle of the next column every 1.6s (translateZ +
  drop-shadow, straightens, tag swings up lime and 1.3×); hover does the
  same and holds the column. **Click = spotlight:** the widget FLIPs (WAAPI,
  `--ease-pop`, 560ms) from its card to the middle at up to 1.8×, the wall
  dims to 32% and recedes 180px, columns slow to half, the card's slot stays
  empty, and an emoji chip + name + one-line blurb (`BLURBS`: "vote on
  anything", "count down to the day") pop in under it in lime. It's usable
  there — poll vote, potluck claim, wheel spin are wired to local state and
  show on the wall copy after. Click anywhere or Esc flies it back (glide,
  380ms) to wherever its card drifted. Lab pill: replay · pause · roll call
  · name tags · tilt · **size S/M/L** (card zoom 0.56 / 0.68 / 0.82; Thomas
  asked for "a little smaller" after the 0.86 pass, M is the new default) ·
  ½/1/2×; pill and cursor hide after 2.2s idle. History, so nobody re-walks
  it: pass 1 was five columns at 0.66 with only a roll-call tag ("looks
  amazing"), pass 2 three columns at 0.86 with tags on every card + a sticky
  click-select ring, pass 3 a picker-screen gallery with uniform translucent
  tiles, captions and an "add a widget · 31 kinds" header ("too much of the
  outer widget border"), then floating slots with centered captions —
  Thomas preferred pass 2, smaller. Gotchas kept: `zoom` on tiles so cards
  keep their own layout; growing widgets measured once via `scrollHeight`;
  the entrance waits two rAFs past first paint. Verified in mock mode with
  frames (`.context/shot-wall-tags.mjs`: M, spotlight, S;
  `.context/shot-wall-sharp.mjs`: 2× clips of one card with `FLAT=1` /
  `PLAIN=1` / `NOZOOM=1` overrides — the sharpness experiment;
  `.context/shot-wall-2d.mjs`: the flat wall at 2×;
  `.context/shot-wall-js3d.mjs`: the JS-projected tilt at 2× with a card
  clip, hover, spotlight and a frame-time sample) and earlier a 12s
  recording scrubbed at 6fps (`.context/video-wall.mjs`, Homebrew ffmpeg —
  Playwright's bundled build has no `fps` filter). Not linked from the
  canvas; the widget lab header has a "widget wall →" link.
- **Link arrival narrates itself (2026-09-12):** a dropped link no longer
  sits as a bare url under a global "enriching…" pill. The row runs the
  story in the slot the title will fill — `fetching github.com` →
  `reading the page` → `pulling out the title` (holds at `slow page — still
  reading` past 7s) — with a blinking caret, three step ticks under the
  domain (done = ink, live = lime) and a scan line sweeping the tile. On
  resolve the fields print in one at a time: tile settles (pop), title
  wipes in left→right, kind verdict pops (the classification made visible),
  summary prints last, a 16% lime wash fades over the row, `place` sound.
  The clock is the row's own `droppedAt` (`arrivalStage` in
  `ReadingRoom.tsx`), so mock and live play the identical beat — live just
  holds on stage 3 until Firecrawl's patch lands. Mock drops resolve on
  per-link clocks (2.3s + 0.5s per link + jitter) so a multi-paste deals
  out instead of flipping as a wall, and `mockLinkKind` guesses the verdict
  off the host (github→repo, youtube→video, HN/reddit→discussion, docs.→docs).
  Header pill now reads "reading N pages…". CSS: "BUILD ROOM — ARRIVAL
  CHOREOGRAPHY" at the end of `index.css`. **Second pass (same day):** the
  title gets a lime highlighter swipe that hugs the words and lifts off, the
  verdict stamps down (scale 1.45, −6°, pop), the tile squashes on landing,
  pending rows deal in at 110ms apart, the live tick no longer pulses (caret
  + scan line are enough), failed rows land too (red-tinted wash, black
  `retry` pill — it was invisible before), and every duration is multiplied
  by `--arrival-slow`. **Test area: `#/arrival`** (`pages/ArrivalLab.tsx`) —
  the real ReadingRoom over the fixtures with a lab pill: drop 1 / 3 / 6,
  one fails, ¼ speed, clear. Mock helpers moved to `lib/mockArrival.ts` so
  App.tsx and the lab share one fake. Verified via
  `.context/shot-arrival-lab.mjs` (frames in `/tmp/arrival/`); not yet
  verified live (no credits spent). Brainstorm + the unbuilt directions
  (research-bar narration, crawl counter hero, mail envelope) stay in
  `docs/local/build-room-arrival.md`.
- **Start a new space is one sheet (2026-09-12):** rail "+" opens
  `components/SpaceMaker.tsx` — pick a shape (the whole sheet wears its
  colour, the switcher is a black dock on the seam, the foot is the black
  strip below; the wall is the new space at postage-stamp size: dot-grid
  wall, hand-placed paper tiles with a per-type mini widget — countdown is
  a number, poll is bars, chat is bubbles — your cursor with your claimed
  name, and the name typed straight onto the board), keep it. Every preset
  is a starting point: the builder in the strip (colour swatches = the
  identity tokens, ten marks, widget pills, max 6 on the wall) is prefilled
  by the pick and editable; **blank** starts empty. Two prongs: "keep it"
  swaps the strip for the email + code under the same board (dock and
  builder leave), with "← back to the board". The couple preset was
  removed 2026-09-12 (two pinks in the dock; "us two" is already a showcase
  space). Presets: friend group, birthday, trip, game night.
  Joined people get one "make it" button. Guests get email → six slots
  inline at the bottom, folded until "keep it"; the sixth digit verifies,
  waits for `useAccount().joined` to flip, creates from the held draft, and
  opens the room — no "you're in the book" pit stop. `WidgetPicker` is
  widgets-only again; mock's "+" opens the widget picker (no backend to make
  a space in). Verified live as a guest through the email step
  (`/tmp/maker-*.png`); the code/verify path is the unchanged `useJoin`.
- **Build room wall pass (2026-09-12, supersedes the color pass below):** the
  user didn't want the orange wall at all ("I don't like the orange bg"), then
  asked for something different than the first replacement (a denim felt).
  Round one shot five candidates via `.context/shot-buildroom-wall.mjs`
  (soft/mid denim, ink navy, cork, chalk); round two shot four non-blue
  directions via `.context/shot-buildroom-wall-v2.mjs` (blueprint, plaster,
  mustard, bottle green — each a complete torch override, so any can be
  landed by copying its CSS). Blueprint landed first; the user picked
  **bottle green** off the sheet: `--color-buildroom: oklch(0.42 0.09 160)`,
  `--color-buildroom-deep: oklch(0.20 0.05 160)`, white ink (torch preset
  `ink: "#ffffff"`), pegboard dots with a light rim, zone panels one step
  *lighter* (12% toward card so they read on the dark green), shadows at
  65%. Orange stays the
  room's identity but only as accent (pile tape, third ship tape, hue-rotated
  pushpins, kept count, vote arrows, rail tile — all via `--space-accent`).
  The compact header (mail chip, presence label, live strip) now reads
  `--space-heading-color` instead of hardcoded ink, so it follows the preset.
  Plaster (quiet warm neutral) and blueprint (cobalt + ruled grid) are the
  ready-to-swap alternates in the v2 script. Theme id stays `torch`.
  `npm run build` passed. No deployment.

- **Header nameplate v2 (2026-09-12):** the user rejected the chevron and
  said they liked the other rooms' tall header — "but make it better". So
  every room (build room included) now gets the tall block: kicker, name at
  3.25rem, then a handles row under the name — inbox address chip + pencil
  "edit" chip, both 30px tall and tinted 12% of the room's ink, black on
  hover. The single black pill on the right stays, top-aligned. The build
  room's scroll padding-top went 82 → 150px so the frame-fit overview camera
  (which reads that padding) keeps the five zones clear of the taller
  header. Verified live at 1440 / 1024 / 390 in the build room, crew, house.
  `npm run build` passed.

- **Header nameplate (2026-09-12):** the user asked for a header redesign
  for the build room and every other room. Decision: one structure
  everywhere, rooms differ only by ink and offsets. Left: name at 2.75rem,
  one line, a round tinted chevron (all rooms — `✎ edit` is gone) that opens
  the editor, and the inbox address as a chip tinted 12% of the room's ink
  (black on hover, lime when copied). Right: the four separate pills (faces,
  "N here now", add, invite) collapsed into ONE black sticker pill in the
  action dock's vocabulary — faces inside the pill, hairline, transparent
  add/invite that fill white/12% on hover and lime when active. The
  kicker/tagline row is hidden in the header (first to fade on scroll
  anyway). Pill arrives on `space-header-in` at 200ms; faces/buttons keep
  their existing stagger inside it. Mail chip wraps under the title at
  narrow desktop; phone (≤800px) keeps separate pills, and the build room's
  phone header now uses the shared grid instead of absolute positioning.
  The build room's desktop fork lost every header rule except top/left/right;
  the crew's "edit recedes" override went too so the chevron matches. CSS is
  appended at the end of `index.css` (SPACE HEADER — THE NAMEPLATE) so it
  wins the cascade. Verified live at 1440, 1024, and 390 in the build room,
  crew, house, and game day via `.context/shot-headers*.mjs`. `npm run
  build` passed.

- **Bottom gutter dedupe (2026-09-12):** the user flagged the live strip
  repeating the header ("3 here now" twice, the room name twice) and the strip
  + dock "hanging out" separately. Decision: one fact, one home. The header
  keeps faces + "N here now"; the title keeps the name; the strip is now a
  pulse line only — `● live · last change 19h ago`, the gesture line when
  someone has a hand on something, "nothing on the board yet" only while the
  board is empty (a populated count is a stat, not news). The name stays in
  the DOM collapsed (`grid-template-columns: 0fr`) and opens on
  `.is-canvas-away` so the strip becomes the wayfinder exactly when the title
  scrolls off. Strip box is dock-tall (54px default / 44px build room) at
  `bottom: 18px` so both sit on one midline; the default pill is drawn on a
  `::before` so it stays text-tall. Verified live with
  `.context/shot-live-strip.mjs`. The dock's chat dot went from lime to
  white so lime in the bottom row is only the live pulse and the count
  badge. Decision (user): the build room keeps its own compact-chrome
  override block in `index.css`; chrome edits land in both forks, no
  unification. `npm run build` passed.

- **Build room color pass (2026-09-12):** the user asked for a more appealing
  orange. Decision: keep orange as the identity but stop treating it as one
  flat fill. `--color-buildroom` is now `oklch(0.62 0.175 41)` (richer, a hair
  deeper; ink contrast 4.8:1), the five zone frames are tonal panels 10% toward
  ink in the wall's hue, every object's shadow uses the new
  `--color-buildroom-deep` token at half alpha instead of neutral black, the
  dot grid is a pegboard (dark hole + light rim), and crew violet is the room's
  single cool counterpoint (pile tape and one polaroid tape switched from
  magenta; pushpins were already violet). All wall rules are scoped to
  `.space-theme-torch`, so the theme carries them to any room. Variant shots
  via `.context/shot-buildroom-palette.mjs` (local-only). `npm run build`
  passed. No deployment.

- **Rail eye-candy pass (2026-09-12):** the space rail now floats on a soft
  deep shadow instead of a tight neutral drop; the active tile's hard offset
  shadow is the space accent darkened toward black (`color-mix … 58%, black`)
  so it reads on the rail and on a same-hue wall (build room orange); photo
  tiles lost most of their purple dim and gained a 1px printed-photo edge, and
  in the build room they sit 4px bigger than icon tiles for collage rhythm;
  the `+` is lime at rest (its rule in DESIGN.md), not a ghosted white; the
  tooltip slaps on with `--ease-pop`. New: a lime `.space-link-dot` on a tile
  when anyone is in that space — `OnlineDot` in `Rail.tsx`, same
  `roomPresence.onlineCountForSpace` query as the tooltip suffix (cache
  dedupes it), live mode only. Shot script: `.context/shot-rail.mjs` (3x rail
  clip for build room + crew, still / fake-dot / hover).
  Follow-up the same day: the dot now excludes the caller
  (`onlineCountForSpace` takes an optional `excludeUserId`; the header's
  "N here" still counts everyone), so the room you're standing in never
  lights for you. The build-room-only rail shrink (64px rail, 42px tiles) is
  gone — the rail is the same object in every space. The first three
  spaces (`EXAMPLE_COUNT` in `Rail.tsx`: build room, crew, us two) are the
  examples; a 2px rule (no label — the user cut it) separates them from the
  spaces a judge makes (house, game day) and the `+`. Mobile turns the rule
  vertical.
- **App-wide reading pass (2026-09-12):** the user
  clarified that body-text readability applies throughout the app. Messages,
  descriptions, letters, recaps and forms now share 16px regular IBM Plex Sans,
  1.5 line spacing; generous reading panels use 18px. Supporting text uses 14px.
  Reading-list descriptions now sit under their titles at full reading width.
  The reference pass made keeper
  body text ~8px and credits ~6px after the overview camera scaled it down.
  Keeper papers are taller with a 36px bottom inset; body text is now 20px
  before scaling, titles use IBM Plex Sans, and credits flow after the text.
  Hot links, shipping captions and roundtable text also have larger reading
  sizes and stronger contrast. Hot-link type/domain share a line to make room.
  Fixed the actual material clipping: the PNG's transparent margins no longer
  define the text surface; opaque paper carries the copy and a separate tear
  decorates the bottom. Smaller notes in other spaces grow with their copy;
  an unfolded letter's comment button sits above its text. Mobile reading
  room now switches between full-width links and reading circle; selecting a
  link opens the circle. Ship rooms stack image and copy on phones. Fixed
  mobile canvas stacking so notes cannot appear above the chat drawer.
  Browser-checked desktop/mobile keepers, chat, reading room, crew messages,
  couple notes/letter and editor fields. `npm run build` passed. No deployment.

- **Build room reference pass (2026-09-12):** centered the five zones, enlarged
  the layered link pile, made shipping posts landscape project previews, and
  reduced the header/rail/dock weight. The user found the full-screen orange
  too bright, so `--color-buildroom` now gives the torch theme a deeper burnt
  orange (also reflected in the theme picker). Email remains a copyable header chip;
  add, invite, presence, catch-up and threads retain their existing behavior.
  `buildRoomPresentation.ts` restyles only recognized old demo placements in
  mock/live mode; other saved placements remain user-owned. Project previews
  are illustrative demo art; uploaded images replace them normally.
  Fixed the pre-existing mobile overflow: groups now stack at phone width,
  section labels remain visible, and the pile fan stays inside the viewport.
  Verified live-data local preview on desktop and phone, reading/ship rooms,
  and frame focus/return. `npm run build` passed. No backend deployment.

- **AgentMail is now a real Convex component + Firecrawl went deep** (2026-08-31).
  Deepened both sponsor integrations. `npm run build` green.
  - **`components.agentMail`** — our OWN first-party component at
    `convex/components/agentMail/` (the published `@agentmail/convex` 0.1.0 is
    broken: nested-workpool hang, no env schema — see setup doc). No nested
    workpool; API key passed in from the app (components can't read env). Wraps
    `createInbox`/`sendMessage`/`replyToMessage`/`addLabels`/`ingestWebhook`/
    `listInbound`; owns inbound store + webhook dedup. `convex/agentmail.ts` are
    the app wrappers; `convex/http.ts` verifies svix then calls
    `components.agentMail.lib.ingestWebhook`. AgentMail now lives behind a
    real component boundary instead of raw REST scattered through app code.
  - **Reply-in-thread + labels** — the space email brain now replies to the
    sender ("Logged $84 from Sam on the expense tracker.", "Dropped 3 links…")
    and labels the message with the router's verdict (receipt/booking/letter/
    links/spam/filed). Needed `emailEvents.messageId/threadId` (new, optional)
    captured from the webhook. Router ack logic in `convex/inbox.ts`
    (`routeSmart` now returns `{label, reply}`), helper `ackInbound` in
    `convex/agentmail.ts`.
  - **Firecrawl search ("research a topic")** — `firecrawl.searchTopic`
    (`convex/firecrawl.ts`) → web results as ready pile cards. UI: the research
    bar in `ReadingRoom.tsx` → `searchTopic` in `LiveSpace.tsx`.
  - **Firecrawl streaming crawl ("crawl a site")** — durable `firecrawl.crawlSite`
    + reactive `getCrawlStatus`/`listCrawlPages` wrappers; pages stream live into
    the new `src/components/CrawlStrip.tsx` (usePaginatedQuery), each keepable to
    the pile. Firecrawl now covers scrape, search, and durable crawl.
  - **Left for later:** AgentMail attachments/parse-PDF, mail full-text search,
    drafts/human-in-loop, threads view; Firecrawl screenshot covers, map,
    change-tracking/monitor.

- **14 Convex components landed, each doing a real job** (2026-08-31). Went
  from 1 used component (`firecrawl`) to 15 real `components.X` references
  across 14 commits. Also: 78/78 functions have `returns:` validators
  (was 18), `widgets.data` went from `v.any()` to a typed discriminated
  union, and `messages` got real cursor pagination + a full-text search
  index.
  - **migrations** (`convex/migrations.ts`): backfills legacy letter widgets.
  - **aggregate**, two named instances (`convex/votes.ts`, `convex/spaces.ts`):
    O(log n) poll tallies + member counts, replacing `.collect()` counting.
  - **sharded-counter** (`convex/stats.ts`): global live spaces/widgets/
    messages totals for the landing widget, wired into every insert/delete.
  - **rate-limiter** (`convex/rateLimits.ts`): quotas on LLM calls, mail
    sends, paint strokes.
  - **action-retrier** + **action-cache** (`convex/firecrawl.ts`,
    `convex/questions.ts`, `convex/digest.ts`): Firecrawl scrapes and
    AgentMail sends retry with backoff; scrape-by-URL and questions-by-
    (title,description) are cached — verified live, repeat calls ~7x faster.
  - **workpool** (`convex/recap.ts`): bounds the daily recap fan-out;
    re-enabled the paused daily cron.
  - **workflow** (`convex/digest.ts`): the weekly digest cron is now a
    durable multi-step flow (recipients → snapshot → LLM → send).
  - **batch-worker** (`convex/batch.ts`, new `linkRefreshQueue` table):
    drains stale linkCards through the cached/retried scraper.
  - **agent** (`convex/agent.ts`): `recap.ask` runs through a real
    per-space thread with conversational memory (was stateless).
  - **rag** (`convex/rag.ts`): real vector search grounds `recap.ask` —
    needed `OPENAI_API_KEY` as a Convex env var since the shared chat proxy
    has no embeddings route; the proxy stays the chat backend.
  - **persistent-text-streaming** (`convex/streaming.ts`): real HTTP token
    streaming for ask answers, verified live via curl — not wired into
    ActionDock's UI (that has a working fake-reveal animation; real
    streaming is a genuinely different data flow and wasn't worth the
    regression risk for a cosmetic change).
  - **presence** (`convex/roomPresence.ts`): "N here" on the space-list
    tooltip (`Rail.tsx`) — deliberately separate from the hand-rolled
    canvas cursor/gesture system in `convex/presence.ts`, which stays
    untouched (its `claimGesture`/`updateGesture`/`finishGesture` calls
    double as the actual widget-commit + lock-arbitration mechanism; no
    component equivalent exists for that).
  - **Not done, by choice**: `prosemirror-sync` (collaborative note editor —
    real new styled UI, not just backend wiring; stopped before this one)
    (Better Auth was here too until 2026-09-12, when auth was switched to
    `@convex-dev/auth` and the guest path shipped — see the entry below.)
    Note that rag's vector search
    lives inside the component's own tables — there is no hand-rolled
    `.vectorIndex()` in `schema.ts`, and adding one we don't need would be
    dead weight.
  - `README.md` Stack + Convex-depth sections updated to match (was
    claiming "Convex AI Gateway", which was never true — always the
    Cloudflare proxy / OpenAI fallback already described further down).


- **Guest or join** (2026-08-31 decided; **guest built 2026-09-12**). Canvas
  stays open. Guest = silent Convex Auth Anonymous + today's claim-a-name —
  shipped, server-validated, stable across reloads. Join is still inert: the
  library has no passkey provider. Never a login wall, never email+password.
  Spec + the two traps that cost the most time (root-served discovery
  documents; `customJwt` rejects these tokens for a missing `kid`):
  `docs/data-model-plan.md` §1.

- **The brain play** (2026-08-31, decided — not built yet). Mail filing and
  catch-me-up exist but stay invisible. Make the reason visible in the
  group's voice: `because` on the flap, recap strip on the canvas. Build
  order **B1 → B4 → B2 → B3** (see Next up). Pitch: *the space has a brain.
  mail it something it would recognize.* No chatbot, no medical space, no
  more reading-circle questions. Do B1+B4 before reshooting tape.

- **The pile filters by tag** (2026-08-30 night). The reading room's filter bar
  leads with six tag chips — kinds first by count (`article 31`, `docs 6`,
  `repo 6`, `discussion 2`, `video 2`) then the top hosts (`#github 6`),
  kind-tinted, crooked sticker pills that stand straight and go full strength
  when picked. The tag is the **outer** cut: `all / new / hot / discussed /
  kept` re-count against the tagged pile (article → all 31, new 4, hot 5), and
  the reading circle's own tag pills are now buttons that set the same filter —
  a rare one picked there (`#oreilly`) is carried into the row so it can be
  undone. `tagFacets()` / `linkHasTag()` / `isKindTag()` in
  `src/lib/linkRanking.ts`; kind synonyms ("watch" for video) are dropped from
  the row because they'd be a second chip with an identical count and result.
  Verified headless in mock mode — `/tmp/rr-tags-{1,2,3}.png`.

- **Email → canvas is real, end to end** (2026-08-30 evening). Dropped the
  broken `@agentmail/convex`; `convex/agentmail.ts` was a plain REST client
  (create inbox / send / `clearStubInboxes` / `ensureShowcaseInboxes`) — **since
  replaced by our own `components.agentMail`, see the top entry** — and
  `convex/http.ts` verifies the svix webhook. Inbound mail →
  `emailEvents` row → `convex/inbox.ts` router, per space personality:
  **us two** = every email becomes a sealed kraft `letter` widget (new widget
  type: envelope with flap/seal/stamp, click unfolds the letter — buttons, so
  WidgetCard's drag capture doesn't eat the click); **build room** = URLs in
  the body drop into the pile as `dropped` rows + sequential
  `firecrawl.scrapeLink` enrich (sender shows as "Name ✉"); **crew (default)**
  = `gpt-oss/4o-mini` reads a widget inventory (expense splits w/ people +
  totals, itineraries w/ days, frames, countdowns) and files the email —
  append expense row (matches person, decrements owes), append itinerary day,
  create a new tracker, unfiled envelope when unsure, discard spam. Verified
  on dev with self-signed webhook posts: a fake Venmo receipt cleared Jules'
  exact $42 tahoe IOU; an emailed HN link came back enriched; the letter
  landed sealed. Weekly digest (`convex/digest.ts`, Fri 16:00 UTC cron +
  `digest:sendNow`) emails each space's week to everyone who ever wrote to
  its inbox (recipients mined from `emailEvents`), via the recap snapshot.
  Header now shows a black `✉ address` chip (click copies) on crew / couple /
  buildroom; crew got a **japan trip frame** (itinerary rebranded from tahoe,
  future dates — the router's past-vs-future money/booking demo) via
  `seed:backfillMailDemo`, already run on dev. **Blocked on one human step:**
  the AgentMail API key is too scoped (403 on everything) — create an
  unrestricted key in the console, `env set`, `clearStubInboxes`,
  `ensureShowcaseInboxes`, and it's live (see
  `docs/firecrawl-agentmail-setup.md` § Status).
  **Update, same evening: UNBLOCKED and live on dev with real mail.** Human
  supplied an unrestricted key; inboxes are crew→`ourspaces@agentmail.to`
  (`thecrew` is taken org-wide; 3-inbox cap is org-wide too, shared with
  prod), couple→`ustwo@`, buildroom→`buildroom@`; fresh webhook + secret on
  dev. Proven with real email: buildroom's inbox → ustwo@ → letter widget in
  us two; `digest:sendNow` delivered to the human's Gmail. Prod cutover steps
  (second webhook + `setSpaceInbox` binds, do NOT create inboxes again) are in
  the setup doc.

- **Catch-me-up panel redesigned as a real chat** (`ActionDock.tsx` + the two
  recap CSS sections). Head wears a tilted lime ✦ badge + since-pill; briefing
  gets a "what moved" kicker; stitch-dash divider before the follow-up thread;
  friend asks are flat lime bubbles w/ sticker text (global-chat language), AI
  replies are dark bubbles wearing a pinned lime ✦ spark that pulses while
  thinking/streaming; typing-dots indicator replaced "looking…"; composer is one
  capsule whose send button colorizes lime when a draft exists; lime caret +
  ::selection; thin scrollbar; scroll-driven fade dissolves lines under the head
  (`@supports animation-timeline`); panel pops in from the dock button. Fixed a
  real bug: auto-scroll targeted the non-scrolling `<ul>` — now scrolls
  `.recap-body` (smooth, instant while streaming). Dock chat count badge is now
  lime. Round 2: member turns show an 18px `MemberFace` beside the name
  (`RecapTurn` grew `fromEmoji`/`fromAvatarUrl`; live maps them from
  `authorEmoji`/`authorAvatarUrl`, mock asks use `getIdentity()` so the face
  matches live), and a ⤢ head button expands the panel to 620×780 via a WAAPI
  FLIP from the anchored corner (`toggleExpanded` in `ActionDock.tsx` —
  flushSync + scale delta, reduced-motion guarded; `.is-expanded` caps bubbles
  at 76%). Driver script: `.context/recap-shot.mjs`; shots `/tmp/recap-*.png`.

- **The build room** (`#/`, slug `buildroom`, orange `torch` theme) — a dev
  guild space built to the approved concept art in
  `.context/generated_images/exec-5620b45c-*.png` (canvas) and
  `exec-fb1d1e00-*.png` (reading room). Five outlined frames
  (`data.deco === "outline"`, no kraft mat): **the pile**, **hot now**,
  **keepers**, **shipping wall**, **roundtable**. Four new widget types live in
  `src/widgets/buildroom.tsx`; keepers reuse `note` with `data.title` +
  `data.pin` (`.is-keeper` drops the "remember this" affordance).
  Desktop opens on a centered mock/live shared overview camera (frame-fit, max
  `1`) with all five zones clear of the compact header, rail, and dock; focus
  returns there and resize recomputes it while unfocused. Phone widgets stack
  at the viewport width with visible section labels. The three pinned links use the local ceramic, violet-collage, and
  riso covers before falling back to monograms. Shots:
  `.context/buildroom-{canvas,reading-room,ship-room}.png`.
- **The attention funnel works end to end, live.** Open the pile card *or its
  frame label* → full-screen reading room: 47 links grouped by the paste that
  brought them in, a tag row (article / docs / repo / discussion / video /
  `#github`) above the `all / new / hot / discussed / kept` filters — tags cut
  first, so the state counts describe the tagged pile, and circle tag pills set
  the same filter — first 15 then
  "show 32 more", and a reading circle (cover, why-it-matters, two question
  threads, replies, composer). Votes re-rank Hot Now, `pin to hot` overrides the
  ranking, `keep takeaway` creates a pinned note that **flies onto the canvas**
  (`flyWidgetIn`, snap + squash) after the room shrinks away. Ship posts open
  their own full-screen room with the write-up, live replies and image upload.
- **Dropping links is real.** Paste up to 10 urls → placeholder rows appear
  instantly, narrating their own arrival (see "Link arrival narrates itself"
  above), then `firecrawl.scrapeLink` fills each
  one **sequentially** (they read-modify-write one document — do not parallelise
  them). Bad urls land in a `failed` state with a retry. Verified live with two
  real urls and one bogus one.
- **No schema change — deliberately.** Link *content* comes from the
  `src/data/buildroom.ts` fixtures; votes, pins, keeps and runtime drops persist
  into the pile widget's own `data.linkState` / `data.dropped` through the
  existing `widgets.updateWidgetData`, so the whole room is reactive and
  multiplayer today. Replies ride `messages` under
  `<pileId>::link:<linkId>` (and `::q:<qid>`), the same namespacing the reading
  circle already used. Moving to a real `links` table later only has to keep
  returning a `BuildRoomLink[]` from `pileLinks()`.

- Hold **Space + drag** to pan the canvas (Figma-style), including over
  widgets. Grab cursor while Space is down, grabbing while dragging. Skips
  text fields and chrome. Wired in mock `App.tsx` and live `LiveSpace.tsx`
  via `src/lib/canvasSpacePan.ts`. Empty-canvas click-drag in mock still
  works without Space.
- Canvas stacking is now **stickers (100000) > grabbed/selected card (99999) >
  everything else**. The old grab boost of `55` slipped under any card that
  had already been moved (`widget.z` starts at 1000). Verified with
  `.context/eval-z-index.mjs`: a second grab sits at 99999 over a previously
  moved card at 1001, under the sticker at 100000.
- The house now stages **seven copies of the Dan Luu web post** across two rows
  at the bottom of its live dev canvas. Row one keeps the original plus three
  cut-paper colorways; row two adds three genuinely different materials:
  fluorescent risograph, chunky woven textile, and handmade ceramic mosaic.
  The 640px assets live at `public/assets/link-card-{riso,textile,ceramic}.png`;
  comparison screenshot: `.context/house-link-variants-seven.png`. Dev only;
  the six preview clones can be deleted after the human picks a cover.
- Web-post clippings now default to a compact **300×250** footprint (down from
  420×360) without changing any typography. The live adapter visually
  normalizes already-created 340×280 and 420×340/360 cards on reload, so
  the Firecrawl cover becomes a short backing strip instead of dominating the
  clipping. Verified with the screenshot copy at
  `.context/link-card-compact.png`; `npm run build` passes.
- Rail spaces now use distinct generated flash-photo covers: two hands making a
  heart (`us two`), a chaotic four-key pile (`the house`), and a scuffed
  ball/foam-finger/snack still life (`game day`). `Rail.tsx` maps the four
  showcase spaces to image covers and falls back to the old glyph for any
  space without one. Verified in mock crew at `.context/space-cover-check.png`;
  commit `67d3fec`.
- Cut the hackathon again (and Tahoe stays gone). Showcase is crew, game day,
  us two, and the house. `seed:demo` retires leftover `buildclub` + `trip` rows.
- Crew media uses a deliberately unpolished **camera-roll trio**: `friday at
  maya's`, `roof dusk`, and `paint night`. Roof dusk + paint night got a looser
  second pass: only 3–4 people happen to be in frame, faces turn away or get
  cropped, a finger/arm blocks the lens, the roof is underexposed, and paint
  clutter wins over posing. The memory pile stays at **7 moments**, with roof
  dusk as cover and paint night + Friday as the peeks. Full-size and 640×480
  previews live under `public/photos/{,thumbs/}crew/`; verified in mock crew at
  `.context/generated-photo-wall-casual-v2.png`. **Live-data fix:** the old
  Juno test uploads were still ahead of the seed photos with their file-storage
  URLs, so `photos:backfillCrewMemorySources` now swaps matching captions to
  the final static JPGs while preserving photo ids + note threads. Dev patched
  2 photos / 1 widget; live proof: `.context/photo-wall-live-fixed.png`.

- Cut **the hackathon** (buildclub) and **tahoe** (trip) from the showcase:
  rail, home block, seed catalog, mock chat, and live home fetches. Home is
  now crew + game day (near) and us two + the house (far). Crew still mentions
  a past Tahoe trip in memories. Run `npx convex run spaces:retireCutSpaces`
  (or `seed:demo`) to drop leftover live rows.
- Party pass **v2** (same session, human asked for more eye candy): left garland
  gained an answering right swag tied off at the cake sticker and both settle
  with a one-shot rotate on entrance; five flat confetti die-cuts sit in the
  frame's dead zones (staggered pop-in via `.is-entering`, then still — nothing
  loops); **all poll bars app-wide sweep to their tallies on space open**
  (`poll-fill-sweep` keyframe animates the existing `--poll-pct` clip-path,
  staggered per row via `--i` now set on each `<li>`; the leader crown's
  `poll-crown-land` is delayed to land after its bar); potluck lists get faint
  ruled notepad lines (`repeating-linear-gradient` hard stops off
  `--potluck-muted`); the message-wall label pill tilts −2°. All in the
  "PARTY PASS v2" banner at the end of `index.css`, reduced-motion killed.
  Entrance verified frame-by-frame via `.context/shot-party-entrance.mjs`
  (shots `/tmp/party-entrance-*.png`, `/tmp/party-focused.png`).
- Maya's bday frame got a **party pass** (the human asked "square or not?" —
  verdict: shape was never the problem, the frame was the only dashboard-grid on
  a collage wall). Rectangles stay; what changed: seed data now staggers tops,
  hand-tilts (±0.9–1.8°) and overlaps the cards (poll over countdown, notes
  tucked under the rsvp), a `maya-cake` sticker breaches the frame's top border,
  and `FrameWidget` renders a flat SVG pennant garland when
  `data.deco === "party"`. Birthday messages are now pastel sticky notes
  (cream/butter/blush cycle, washi on every 3n+2, staggered pop-in on entrance);
  a `@container (min-height: 180px)` query flips the wall to a vertical stack,
  so the wide guestbook/fridge/trash-talk strips elsewhere keep their row —
  they just get the paper material too. Potluck kicker dropped to sentence
  case. Frame focus-softening now tests **center** containment
  (`widgetIsInsideFrame` in `Canvas.tsx`) so border-breaching pieces stay lit
  when the frame is focused. CSS in the "BDAY FRAME — PARTY PASS" banner at the
  end of `index.css`. Verified mock crew/crew2 + league + buildclub; focused
  shot via `.context/shot-bday-frame.mjs` (also proves the frame label stays
  clickable — the raised countdown buried it at first, y-nudged clear).
  **Live parity gap:** already-seeded live crew docs still hold the old
  positions/sizes; they need a reseed or a `retintSpace`-style backfill
  mutation to pick up the new composition + sticker.
- Space header (eyebrow + big title) now fades out scroll-linked instead of the
  old binary snap: `--header-scroll-fade` (0 → 1 over ~150px scrollTop / ~260px
  scrollLeft) is set on `<main>` by the `space-scroll` onScroll handlers in
  `App.tsx` and `LiveSpace.tsx` (live mode previously had no fade at all); CSS
  in the "SPACE HEADER — SCROLL-LINKED FADE" section at the end of `index.css`
  maps it to opacity + lift + slight scale + blur, eyebrow leading at 1.8×.
  `.is-canvas-away` now only guards pointer-events. Verified via
  `.context/eval-header-fade.mjs` (shots in `/tmp/header-fade-*.png`).
- The “same moon, both windows” quote scrap now uses an image-generated,
  transparent purple pushpin cutout (`public/assets/ui/quote-pushpin.png`) with
  a smaller matte head viewed almost straight-on; the collar and needle are
  fully hidden, and one hard 1px contact shadow seats the cap into the paper.
  Verified on `#/space/couple`; reference screenshot:
  `.context/quote-pin-final.png`.
- Selected-widget action bar is now more compact (36px controls, tighter
  padding/type/icons) so it reads as light canvas chrome instead of covering the
  card beneath it.
- Daily question and saved-links now carry deliberately different real-paper
  materials instead of sharing a flat cream card: the question is a soft
  cotton-rag worksheet stack with uneven edges and three binder punch marks;
  saved links is a cooler speckled ledger/receipt with a folded corner, rough
  serrated bottom, and dry dashed rules. Both textures are generated, text-free,
  crop-safe assets under real UI (`public/assets/textures/`).
- Full app deployed live: https://necessary-cobra-892.convex.site (Convex
  static hosting + prod backend, all spaces seeded).
- Sticker pack expanded to twelve crew-specific die-cuts, adding photoreal Rio
  in mismatched socks and Maya's matcha birthday cake, holographic smiley,
  chatty `blah blah blah`, crew high-five, and Tahoe road-trip pieces to the six
  original illustrated characters. Stable sticker ids preserve existing rows
  while the live adapter applies catalog proportions without a reseed. The 4×3
  picker presents them loose on a real paper sheet with staggered pop-in and
  silhouette shadows; hover/managed lift follows the artwork instead of drawing
  a rectangular widget shadow. Live sticker buttons are wired through the
  existing Convex create mutation. Verified on the crew canvas, open picker,
  and add/managed flow in `.context/sticker-redesign/`.
- Crew poll now carries a one-widget torn-paper prototype: the generated fiber
  study led to the same restrained paper surface used by Hall of Fame, with
  straight-cut sides and one shallow deckled bottom edge. Its transparent source
  margin is cropped away so the title gets a complete top edge, while the ballot
  stays unmasked and the paper lies flat without a fabricated drop shadow; the
  daisy pin can still overhang. Neighboring RSVP and potluck widgets stay flat
  for an on-screen A/B comparison.
- Potluck widget redesigned as a "sign-up sheet" (`/eye-candy` pass): chip
  rows → ruled baselines with a dashed center fold, wonky hand-drawn
  checkboxes whose ✓ draws in (`stroke-dashoffset`), claimants "sign" the
  line in italic accent ink (clip-path wipe on your own claim), tally-mark
  counter + big fraction top-right (replaced the redundant "N covered" pill
  and dashboard meter bars), solid sticker-black `claim` pills, masking tape
  (same material as `.photo-tape`) replacing the broken overflow-clipped
  paperclip, and an ALL SET rubber stamp (pointer-events: none) that slams
  in via `--ease-snap` when the last item is claimed — live-claim demo beat.
  Kicker is now data-driven (`data.kicker`, default "sign-up sheet"; crew =
  "party prep", house = "house errands"). Eval script:
  `.context/shot-potluck.mjs` (crew + house, hover/claim/all-set states).
- RSVP widget redesigned as a "postal reply card" (`/eye-candy` pass): accent
  went full-strength (was a 38%-alpha wash), sparkles → a dashed postage
  stamp in the corner (`::before`/`::after`), the headcount gets a postmark
  ring (`.rsvp-hero strong::after`) + staggered cancellation lines (offset
  `box-shadow` copies — equal offsets read as a hamburger icon, staggered
  ones read as stamped ink), a full-bleed perforation fold (`.rsvp-perf`)
  splits the "in" crowd from the ✗/… ledger rows (grayscale ghost faces
  dropped — read as disabled), the `waitingNote` quote now shows on the card
  (was detail-only), and the redundant bottom meter strip is gone. Entrance:
  faces land per-`--i` stagger, then the postmark stamps at 700ms. Crew seed
  grew 190×230 → 190×248 (y 100→92; potluck below at y 350 caps bottom at
  ~344). Eval script: `.context/shot-rsvp.mjs` (still/picking/answered).
  Overflow guard: `.widget-rsvp` is a size container (reset to `normal` in
  `.is-detail` — size containment collapses its `height: auto`); short cards
  shed the quote via `@container (max-height: 208px)`, and the crew block
  board (which renders rsvp with the ≥801px `paper-bg[data-space-id]`
  big-type overrides — the space page main has NO `data-space-id`, so those
  overrides only hit block boards) sheds it under 252px. Legacy 230 rows in
  the deployed backend keep the old height until reseeded — verified via
  `.context/measure-rsvp.mjs` (pill sits inside the card at 230 and 248) and
  `.context/shot-rsvp-block.mjs`.
- Prop widgets redesigned as physical objects (`/eye-candy` batch pass):
  **expense** = thermal receipt (dashed rules, dot leaders `.expense-dots`,
  tabular figures, lowercase names, TOTAL row + "settle up soon ♥" footer
  above the existing zigzag tear; seeds grew to h 200–205 + blueprint 205;
  `container-type: size` sheds the footer + tightens print under 150px
  content height for legacy rows) · **quote** = pinned scrap with torn
  bottom edge (irregular clip-path + drop-shadow filter — box-shadow dies
  under clip-path), giant butter “ mark, flat `#ffd84d` highlighter swipe
  via `mark.quote-hl` with `box-decoration-break: clone`; pin moved inside
  the clip region (straddling the edge gets clipped now) · **weather** =
  window (flat `#6fa8ff` sky panel, white mullion cross via
  `::before/::after`, flat sun disc with hard `#92bcff` ring — no alpha
  glows, temp + date on the glass, caption on the sill; TSX restructured:
  kicker = event · condition) · **link shelf** = objects on ledges (rows on
  2px ledge rules, tilted arrow tiles with standing shadows that straighten
  on hover; the 01/02/03 index column is gone — banned numbered-scaffold
  trope) · **daily q** = type polish only (17px balanced question). Eval:
  `.context/shot-props.mjs` (8 shots across crew/house/trip).
- Poll widget redesigned as a "ballot" (`/eye-candy` pass on the washed-out
  tinted bars): vote fills are now flat full-strength tone color — the row
  content renders twice (`.poll-row-base` + `.poll-row-fill` clipped via
  `clip-path: inset(… round 999px)` to `--poll-pct`), so labels/faces flip to
  fill ink exactly at the bar edge. Leading row gets an ink ring (drawn above
  the fill via `::after`) + a gold crown that lands with `--ease-pop`; tallies
  are chunky display-font numbers; question gets a tone-color marker underline;
  ballot bubble previews tone color on hover and fills sticker-black + lime
  when you vote; waiting-on faces breathe. Violet tone = loud card with cream
  rows and sticker-black bars. `pizza-poll` fixture now `tone: "mint"` to match
  league teal. Verified all 4 variants + hover/voted at 3x and 1x via
  `.context/shot-poll.mjs`; live prod shows it after redeploy (component API
  unchanged, CSS/JSX only).
- Countdown widget redesigned as a tear-off desk calendar: perforated top row
  (one page stub per day — torn days leave gaps on the dotted line, today's
  page pulses; replaces the old bottom day-strip), chunky flat offset shadow
  under the big number (`--cd-num-shadow`, digit-count-aware sizing via
  `data-len`), and the `+ 09h 08m 04s` text line is now three black sticker
  chips whose seconds digit rolls every tick (`ClockCell` in
  `src/widgets/core.tsx`). Sparkles twinkle out of phase; all four tones +
  reduced-motion covered; verified via `.context/shot-countdown*.mjs`.
  Seeded countdowns grew 230→250 tall (crew nudged to y86, us-sfo to y316) to
  fit the taller stack; a `@container (max-height: 202px)` step hides the hype
  row + shrinks the number on short cards so the still-230px widgets in the
  live deployment don't clip the event pill (container queries measure the
  CONTENT box — 202px ≈ 242px card). Live prod keeps old sizes until reseeded.
- Canvas with every widget type, drag/resize/frames, per-widget threads,
  presence cursors + gestures, polls/votes, recap, invite links.
- Note widgets now use restrained real-paper scraps with one torn bottom edge
  and a protected footer safe zone; Hall of Fame shares that real torn edge and
  adds one small pink backing scrap tucked left-of-center beneath the card.
  Drag states stay shadow-free and stickers layer above all regular widgets.
- AgentMail per-space inboxes + Firecrawl scrape action landed (`16fa04a`) —
  backend wired (`convex/agentmail.ts`, `convex/firecrawl.ts`, webhook at
  `/api/agentmail/webhook`).
- Firecrawl web-post widget is now surfaced end to end: add a web post, paste a
  URL, scrape title/summary/cover, then persist the result as a reactive canvas
  widget. Missing covers use the generated paper-collage fallback.
- Tahoe now includes the “How Convex Works” web post in both `TRIP_WIDGETS`
  and the connected dev deployment at `#/space/trip`, sized to `340×280`.
- Web-post reading sheets now use a 32%-opaque glass layer over a dedicated
  38px-blurred artwork echo; the date tab is frosted too.
- Hacker News links resolve through the story (`9a63ab7`): pasting a
  `news.ycombinator.com/item?id=…` URL hits the official HN Firebase API for the
  external article URL + points/comments, Firecrawl scrapes the article, and the
  card grows an orange “▲ points · comments” tab (top-right of cover) that opens
  the HN thread. Ask HN text posts scrape the HN page and credit the submitter.
  Scrape payload gained `discussionUrl`/`points`/`commentCount` (empty/0 for
  normal links).
- Reading-circle strip tightened (`3c83c6f`): inactive starter chips are
  dimmer, a tiny “↳ takes on qN” connector under the chips ties the message
  list to the active chip, and a lone starter renders as a static question row
  (no tab affordance). Verified headless in the mock trip space — decision:
  one thread panel with chips beats separate cards per starter.
- Web post click model (`22bb732`): clicking the cover art zooms into the
  reading circle (like the photo wall, `zoom-in` cursor); only the paper
  clipping / read pill is the article link (`.link-card-read`, display:
  contents). Drag-from-anywhere still works; empty cards still open manage.
  Verified headless: cover→dock, read→new tab, paper drag moves the card.
- Couple space now has a full-screen `cozyColor` paint-by-number room: the
  compact card opens an edge-to-edge portal, a bottom game dock selects one
  number at a time, and two shared palette presets recolor every completed
  region live through Convex. Existing seeded dev rooms still backfill the
  widget/layout on first load.
- The coloring room is **verified live multiplayer with in-room cursors**:
  presence rows gained an optional `zone` ("cozy:<boardId>", x/y normalized
  0..1 over the board); the room reports pointer moves through
  `presence.reportZone`, renders same-postcard peers as colored arrow cursors
  with name pills, and the canvas filters zone'd peers out. Proven with two
  fresh browser sessions on the dev deployment: cursors visible both ways and
  fills propagating (4→7 on the receiving window) — plus a third live
  participant's earlier fills/preset coexisting fine.
- The room is now a **three-postcard gallery**: traced Van Gogh "the starry
  night" (78 regions, default) + Hokusai "the great wave" (58 regions) + the
  generated scene. A shelf (top-right of the board) switches postcards with
  per-board live progress; fills are stored with `<boardId>:`-prefixed
  regionIds (scene stays unprefixed for back-compat, zero schema change).
  Traced boards show a muted ghost of the painting under the blank regions and
  their two shared presets are **classic** (real painting palette) and **neon**
  (token remix, luminance-ranked). Reset clears only the current board
  (`paint.clear` gained optional `regionPrefix`; pushed to dev). Verified
  headless: paint starry to 35%, complete wave, neon flip, per-board counts.
- Memory wall widget is a **pile of cream prints** (2026-08-29): cover + peeks
  share the media widget's paper anatomy (cream frame, chin caption in ink,
  tape scrap), the pile stacks one print over / one under the cover using each
  photo's seeded `rotate` (clamped ±4°), a buried print edge shows when >3
  photos, and prints deal in staggered on space open. Crew mock data now leads
  with pizza night so the wall doesn't duplicate the polaroid above it. Motion
  tokens `--ease-glide/pop/snap` + `--dur-instant…hero` live in `@theme`.
- Photo wall zoom is a **spread-the-pile FLIP** (2026-08-29, LiveSpace only —
  mock App.tsx still uses the generic focus zoom): clicking the wall grows the
  tile into a full-screen room (`#151517` dialog, clip-path reveal), the three
  visible prints fly (WAAPI, measured rects via `printOrigins`) to scattered
  table spots, buried photos deal out from the pile center, hover straightens
  a print ("pick it up"), the lightbox is a giant print that flies from its
  slot and back, and close gathers everything into the tile. StrictMode's
  phantom `<dialog>` close event is swallowed (`dialogRef.current?.open`
  guard in onClose) — without it the dialog self-destructs in dev.
- The memory room now **pins photos and takes notes on the back** (2026-08-29):
  "pin a moment" (header pill, lime ＋) opens a floating draft print → Convex
  file storage upload (`convex/photos.ts`) → the photo prepends to
  `data.photos`, becoming the pile cover + room hero on every screen (hero pop
  + place sound). The lifted lightbox print **flips over** (rotateY) to a
  ruled cream back where comments ride the message pipes as
  `<widgetId>::photo:<photoKey>` sub-threads (photoKey = storage id, or
  caption slug for seeded photos); everyone signs with their presence-color
  dot. Grid chins show `✎ n`. Verified two-window live: pin from A landed in
  B, note from A readable in B. Gotcha: an unhandled OS file chooser dismissal
  can leak a `cancel` to the `<dialog>` — `chooserGuardRef` swallows one; in
  Playwright drive the hidden input with `setInputFiles`, don't click the
  pill. Test data: crew wall gained "paint night" (flat sunset PNG) + one
  note on the dev deployment.
- The board is a **generated vector scene** ("same moon, both windows"):
  `scripts/generate-cozy-art.mjs` computes 50 closed SVG regions (moon +
  halo-ring donuts, snow-capped peaks, twin lit-window houses, two birds, a
  river carrying the moon shimmer) → `src/widgets/cozyColorArt.ts` +
  `public/assets/cozy-color-poster.svg` (door preview). Regions fill directly
  via CSS `--paint-*` vars — no more raster flood fill or white halos. Numbers
  render inside the SVG at generated safe spots; tapping a dim number switches
  the active color; finishing triggers glow + twinkling stars. Verified
  headless end-to-end in mock mode (blank → partial → 100% → sunset preset).

## Broken / known issues

- ~~**Mail is dev-only until the prod cutover.**~~ — **done 2026-09-13.** See
  the entry at the top of "Now working"; the old text below is kept only so
  the dev-era details stay findable.
- **Mail is dev-only until the prod cutover.** Inboxes, webhook and secret are
  bound on the dev deployment (`dusty-condor-648`); production
  (`necessary-cobra-892`) has no AgentMail webhook yet, so email → canvas does
  nothing on the live URL. Steps (second webhook, `setSpaceInbox` binds, do
  **not** create inboxes again) are in `docs/firecrawl-agentmail-setup.md`
  § Prod. The 3-inbox free tier is per **org** and shared dev↔prod, which is
  why prod has to reuse the same three addresses.
- ~~The daily recap cron is commented out~~ — stale note. All four crons run
  today (presence sweep, weekly digest, daily recap, Friday link refresh), and
  the recap one now fans out only over rooms with activity since their last
  daily recap (`recap.listSpacesDueForRecap`).
- **Fixed 2026-09-13: every lab route blanked the app (mock mode).**
  `mockLinks` / `mockReplyCounts` / `mockMessagesByThread` were `useMemo`s
  sitting *below* the early returns for `#/home`, `#/widgets`, `#/wall`,
  `#/arrival`, `#/cursors`. Those routes render a shorter hook list, React
  threw "Rendered fewer hooks than expected" and tore down the tree — the
  **widget lab / cursor lab pills are on every board**, so one click gave a
  white page with no way back. Hoisted above the first early return in
  `App.tsx`. Live mode never hit it (it early-returns to `LiveSpacePage`
  before those hooks either way). Verified crew <-> widgets / home / wall.

- **Live Convex still needs a re-seed** for the SomaFM playlist fields and the
  seeded buildclub / Tahoe web-post cards (`npx convex run seed:demo`).
- ~~**`prosemirror-sync` is wired in `convex.config.ts` but referenced
  nowhere in code.**~~ — resolved. Checked 2026-09-17: neither
  `prosemirror-sync` nor `better-auth` appears in `package.json` or
  `convex.config.ts` any more, so no repo scan reads an unused dep.
- ~~**`hackathon.md` contradicts the repo in three places.**~~ — resolved,
  re-read 2026-09-17. The header now says Convex Auth (`@convex-dev/auth`,
  guest + emailed code), the retrieval line is precise ("the `rag` component
  owns the vector index; no hand-rolled `.vectorIndex()` in our schema"), and
  the stale commit count is gone. `prosemirror-sync` / `better-auth` still
  appear at line 429, but that is a dated 2026-08-31 log entry describing what
  was installed that day — history, not a claim about today's manifest.
- **Fixed 2026-09-10: a live-missing space hung forever.** `#/space/trip`
  exists in the mock fixtures but not on the deployment, so
  `isInvalidInvite` (which requires `!SPACES_BY_ID[slug]`) never fired and
  the route fell through to the claim gate — you were asked to name yourself
  for a space that doesn't exist, and no canvas ever rendered. `LiveSpace.tsx`
  now treats `mode === "live" && status === "missing"` as authoritative and
  shows the existing dead-link card. Verified in a browser on the dev URL.
- **`npm install` goes stale and breaks the build.** `@convex-dev/presence`
  was missing from `node_modules` and `npm run build` failed with ~15
  implicit-any errors that look like real type bugs. Re-run `npm install`
  first if the build breaks for no reason.

## Now also working

- **The deployment went over the Free plan limit, and the cursor stream was
  why** (2026-09-12). Five changes, all verified live on `dusty-condor-648`:
  1. **Solo rooms no longer stream cursors.** `usePresence` wrote a presence
     row every 90ms whenever the pointer moved — ~11 mutations/sec, each one
     invalidating `listHereNow` for every subscriber in the room, so a
     four-person room cost ~220 function calls/sec. The 90ms stream is now
     gated on `peersLive`: alone, you write only the entrance heartbeat and
     the keepalive. Measured with a WS counter in the driver: 5 seconds of
     continuous mouse movement alone went **50 heartbeats → 0**, and the
     stream still runs at full 10/s the moment someone else walks in.
     The gesture path is deliberately NOT gated — a drag's updates keep
     `gesture.updatedAt` fresh, and a stale one makes `finishGesture` refuse
     the commit, so a solo drag would silently not move the widget.
  2. **A tab now filters out its own earlier identity.** Found while
     verifying (1): a first load writes presence under a local
     `crypto.randomUUID()`, then `adoptAuthUserId` swaps in the Convex user
     id, and the orphaned row rendered as a peer — a first-time visitor
     watched a second cursor wearing their own name and face for up to 30s.
     `selfIds` in `usePresence` remembers every id the tab has used. This
     also defeated (1): the ghost read as company.
  3. **The presence sweep reads only what it deletes.** `presence.cleanup`
     collected the whole table every minute, making its read set every row,
     so it took an OCC conflict from every heartbeat that landed mid-sweep
     (310 retries in 72h) and each loser re-executed. New `by_updated` index
     + a range read; a live cursor writes `now` and no longer overlaps.
  4. **Idle heartbeats halved.** `KEEPALIVE_MS` 10s → 20s (still 10s of slack
     under the 30s TTL) and the presence component's room heartbeat 10s → 30s
     (`ROOM_HEARTBEAT_MS` in `LiveSpace.tsx`) — that one writes through the
     component's own sessions/workers tables and was the single largest OCC
     source on the deployment (413 conflicts). Occupancy now clears up to 30s
     after someone leaves, which a badge can afford.
  5. **The two metered crons stopped paying for dead rooms.** The daily recap
     skips spaces with no activity since their last daily recap (8 spaces → 3
     on the dev deployment the day this landed), and the Friday link refresh
     only re-scrapes Firecrawl cards in spaces touched in the last 30 days.
  6. **`stats.getLiveCounts` was the actual bandwidth bill, and the cursors
     were not** (same day, after reading the dashboard's bytes-read
     breakdown — `npx convex insights` does not expose it, so the first pass
     ranked by call volume and OCC warnings and got this wrong). Database I/O
     is the meter that went over Free (1.47 GB / 1 GB) and this one query was
     **1.30 GB of it, 88%**: 843.85 MB under `shardedCounter/` plus 457.36 MB
     of its own. Two compounding causes — it bundled the three sharded
     totals (28 shard documents: 4 + 8 + 16) with "here now" behind a `now`
     bucket, so a new cache key every 15s re-ran the shard reads four times a
     minute per visitor forever; and it did `ctx.db.query("presence").take()`,
     which made its read set the whole presence table, so every cursor
     heartbeat invalidated it and dragged those shard reads through another
     run. Now split: `getLiveTotals` (argument-free, cached until a counter
     moves) + `getHereNow` (clock arg, reads the `by_updated` range added in
     3). Tick 15s → 30s, matching the TTL being measured. `getLiveCounts`
     stays as a thin legacy wrapper **only** until prod is redeployed — the
     shipped bundle still calls it. Worth knowing: no `backendLive` widget
     exists on any live board, and `visitorCount` is an unused prop, so all
     of that bandwidth was computing numbers nothing on the live site
     renders.
  7. **The presence sweep cron went 1 min → 5 min.** It is pure housekeeping —
     the client filters cursors at a 30s TTL and `getHereNow` reads the fresh
     range, so nothing user-facing waits on it — and at 1/min it was ~43k
     function calls a month PER deployment, dev and prod, running whether or
     not anyone had the app open.
  8. **The rail held two occupancy subscriptions per space tile.** "N here"
     (everyone) and the lime dot ("someone ELSE is here") called
     `onlineCountForSpace` with different args, and different args are
     different cache keys — so each tile ran the same `listRoom` read twice.
     Now one `onlineForSpace` returning `{ total, others }`, called with
     IDENTICAL args from both, which is what lets convex-helpers' query cache
     collapse them. Measured on `#/home` (5 spaces): **15 → 10 concurrent
     subscriptions**. Not the 2× it looks like on paper, because
     `adoptAuthUserId` swaps the identity mid-session and `userId` is in the
     args, so each tile briefly holds a pre-swap and a post-swap entry until
     the cache retires the old one — steady state is 1 per tile. Removing
     that churn (a stable id from the first paint) is the next easy win here.
     `onlineCountForSpace` stays as a legacy wrapper until prod redeploys.
  Not done, by choice: the duplicate presence system stays. `roomPresence`
  (the component) and `presence` (hand-rolled) still both run — collapsing
  them would trade disconnect-accurate occupancy for sweep-lagged occupancy,
  and that is a product call, not a cost one.

- Playlist widget is a real SomaFM room radio: play/pause, 6 stations,
  live track titles, Convex-synced station so others can tap join.
- **Radio in the dock (2026-09-15):** the bottom dock always shows the
  room's station once a playlist widget exists (play key + "tap play" /
  "join · X put this on" / live track). The card stays on the canvas as the
  room object; the dock label pans to it. Was hidden before: the chip only
  appeared once something was playing.
- Audio is local (browser autoplay). Pause does not stop the room for
  everyone. Audio is Radio Paradise (main/mellow/serenity/global/rock/beyond —
  SomaFM's streams 403 browsers); station names are still the SomaFM ones.
  Titles come from `/radio/now` on the Convex site (2026-09-15) so the line
  matches what's actually playing — RP's API has no CORS header, and Serenity
  has no API channel so its title is sniffed off the stream's ICY metadata.
- **Catch me up is live** on the personal Convex dev deployment. Daily cron
  (8am PT) writes a `recaps` row per space; tap generates if none exists; ↻
  refreshes now.   Follow-up composer is board-only. Live calls go through RoomDone's
  Cloudflare Worker (`AI_PROXY_URL` / `AI_PROXY_TOKEN` →
  `@cf/openai/gpt-oss-120b`); OpenAI is fallback only. Chat rides
  `messages.widgetId === "recap"`. Never writes the canvas. Mock keeps the
  scripted Jules/matcha/6pm lines plus local replies. Verified mock + live
  crew: `.context/recap-live-check.png`, `.context/recap-live-board.png`.

## Next up

- **Liveness to 10** — plan written 2026-09-17, not started.
  `docs/local/liveness-10.md`. Judge run that day: 10, 9, 10 on a
  byte-identical packet (mean 9.67), and the 9 names no fault, so part of
  the gap is variance. What is real: the scrape is 6,847 of its 8,000-char
  cap and **51% of it is image markdown with empty alt** (52 of 54 images),
  plus 466 chars of `⠿drag↗zoomeditdelete` control noise. Four fixes with
  acceptance tests — alt text on the 22 `alt=""` sites, publish
  `public/hackathon.json` (nobody in the field does; the judge fetches
  `origin/hackathon.json`), drop the redundant inner labels on widget
  controls (the `aria-label` already carries the name), one plain sentence
  in main content. Verify on `--tree origin/main` with 6 replays, not 3.
  Ceiling is +0.33 of one criterion — do it for the honest read, not the score.

- **Jev router split** — plan written 2026-09-17, not started. `docs/jev.md`.
  Jev decides where mail goes (typed Choice over the live canvas inventory,
  plus a calibrated confidence), OpenAI keeps the amounts/dates and the
  `because` sentence. Removes a real bug: `inboxRouting.ts` hands
  `applyExpense` an unvalidated model-typed widget id, and a fumbled one
  silently creates a duplicate tracker instead of erroring. Speculative
  prompting throughout — every branch's question asked in the one call,
  code reads what the action makes relevant. Steps 1-4 ship with no key
  (falls back to today's `routeSmartLLM`); **no `JEV_API_KEY` exists yet,
  early access is waitlist-only**. Open: `MAIL_VERDICT_FLOOR_MS` — 900ms
  lands the arrival at ~2.5s but re-times demo shots 8-11 and means a
  reshoot of the mail beat. Voice (`webkitSpeechRecognition` → same
  router, ~4h) only after step 5 is green.
- **Brain play B1** — half done (2026-09-01). **Shipped:** `because` on
  `routeSmart` (`convex/inbox.ts`) — one lowercase sentence, ≤10 words,
  banned from naming anything on the board; `cleanBecause()` strips convex
  ids and trailing punctuation; persisted on `emailEvents.because`,
  `letterData.because`, and `lastEmail.because` for expense + itinerary.
  `BecauseSlip` (`src/widgets/extras.tsx`) renders it two ways: **tucked**
  (a paper chip hanging off the letter envelope) and **pinned** (the
  receipt's own footer line — cards carry a clip-path/fixed height, and a
  padded chip overruns it by 4.2px; measured with
  `.context/measure-because.mjs`). Verified live on dev with real routed
  mail. **Still to build:** catch-me-up lands on the canvas as a dated
  strip, tap a line → pan to the widget (`docs/mail.md` goal 0,
  `docs/spaces-and-widgets.md` §1).
  - Open for review: the sentence voice (three runs of the same email gave
    "this clears jules' tahoe iou" / "jules' tahoe cabin half is settled" /
    "jules cleared his tahoe half"), and the crew canvas seats a decorative
    sticker over the tahoe receipt's footer, which covers the pinned line.
- ~~**Auth: join (the second half)**~~ — shipped 2026-09-12. Emailed six-digit
  code via AgentMail, joining keeps the same user id, registered people make
  and own spaces, invite link is full access, "yours" group in the rail.
  Verified end to end against a real inbox. `docs/data-model-plan.md` §1.
  Still open: no rename/delete UI for a space you own (the mutations exist),
  and `identityMerge` (folding a second browser's guest rows in) is designed
  but unbuilt — a returning user just gets their account back, which is fine.
- **Brain play B4** — crew frame *"jules is out this week"* (meal train).
  With B1; enough to reshoot tape.
- **Brain play B2** — vision writes the note on the back of a photo-wall
  print; receipt photos file through the same router.
- **Brain play B3** — Firecrawl writes widgets (recipe → potluck slots,
  booking → itinerary day), not just a card.
- vibeapps listing description is drafted in `docs/vibeapps-listing.md`
  (**local-only / gitignored** — submission copy doesn't ship in the public
  repo). Fill the [bracketed] placeholders at submit time (Sep 21) and cut any
  line whose feature didn't land.
- ~~**Prod mail cutover**~~ — done 2026-09-13 (see "Now working": one
  deployment, one database). This entry was left stale; removed from the
  queue 2026-09-17.
- Re-seed live Convex (`npx convex run seed:demo` or equivalent) so
  production canvases pick up the SomaFM fields and seeded buildclub/Tahoe
  web-post cards.
- ~~Surface AgentMail in the UI (email → canvas mutations)~~ — done 2026-08-30,
  live on dev with real mail (crew `ourspaces@`, couple `ustwo@`, buildroom
  `buildroom@`).
- ~~Reading-room tag filters~~ — done 2026-08-30 night.
- ~~Mail polish: envelope drop + shared `sealed` state.~~ — **both done**,
  confirmed 2026-09-17. The arrival is `src/components/MailArrival.tsx` +
  `src/lib/mailArrival.ts` (see `docs/mail-arrival.md`), and `sealed` rides
  the widget row in `src/live/useLiveHandlers.ts:517`, so a letter opened on
  one phone opens on every screen.
- Build room, still open: the shipping wall uses the old
  `public/photos/hackathon/*.jpg` people-shots, not product screenshots —
  generate three dashboard images. OpenAI doesn't write `whyItMatters`/`kind`
  yet (dropped links fall back to Firecrawl's description + canned questions);
  wire a structured extractor like `convex/questions.ts` does. No editor forms
  for the four new types yet (`WidgetEditorPanel`), and Hot Now doesn't FLIP
  when a vote reorders it.
- Add the web-post discussion layer: OpenAI creates two direct questions, then
  answers and upvotes sync live. **Superseded 2026-08-31** — questions stay;
  do not grow them. Ground them in the canvas snapshot as part of B3, or
  leave them. The OpenAI beat is the visible filing, not more starters.
- Build four static vendor pages in `public/` (convex / agentmail / firecrawl /
  openai) from one shared template: per-page OG tags, hero clip,
  what-it-does-in-OurSpaces, code peek, deep link into the live app.
  ~~Needed live by Sep 16.~~ **Shipped — as in-app routes, not static files.**
  Verified 2026-09-17: all four live at `#/about/{convex,openai,agentmail,
  firecrawl}` (`src/pages/About.tsx`, routed in `App.tsx:225`), each with
  role, headline, intro, a 4-step journey citing real files, capabilities,
  a technical list, and a deep link into a room. The `#/about` makers strip
  links out to them. **The one spec gap: no per-page OG tags** — a hash route
  never reaches the server, so every vendor link unfurls as the generic
  OurSpaces card from `index.html`. Fixing that means real paths
  (`/convex`), which today are the SPA catch-all: `/convex` is byte-identical
  to `/` on the live site. Spec in the local marketing playbook §5.
- Stand up the public "commons" space for hackathon builders (separate from
  the demo spaces — strangers get write access) around Sep 16 — **past its
  date as of 2026-09-17, and genuinely not built**: "commons" appears nowhere
  in `src/` or `convex/`. With 5 days to the Sep 22 deadline this is the last
  open marketing item (the vendor pages above shipped), so cut it or schedule
  it deliberately.

## Decisions

- 2026-09-16: **Demo-video clips are captured frame-by-frame, not screen-
  recorded.** `.context/web-video/record.mjs` drives headless Chrome over CDP
  with a virtual clock (setTimeout/setInterval/rAF/`performance.now` replaced,
  every CSS animation pinned to the frame's time), so motion is exact at any
  resolution with no dropped frames. Shot 1 (myspace, 8.0s), the ads beat
  (feed, 5.8s) and the widget wall (12.0s, 3840×2160) are in
  `docs/local/demo-video-assets/video/`. For the wall this added two query
  params to `WidgetWall.tsx`: `?cols=N` (three columns leave dead air at 16:9;
  four fills it, five makes the cards too small to read) and `?rec=1` (drops
  the lab pill, exposes `window.__wall = { replay, close }`). Both default to
  the page exactly as it ships, so `#/wall` from About is unchanged.

- 2026-09-15: **The entry gate is a doorway, not a form.** Name the room,
  show your cursor live, make the look one tap, Enter walks in, and the exit
  is a sequence (card → cursor, then blur lifts, then the wavefront) rather
  than an unmount. Kept the photo faces for visitors (they match the crew's
  faces on the canvas); the hash-assigned emoji stays in the data as the
  no-avatar fallback but is no longer shown in the heading. Invite links
  still remount on the route swap after the collapse.

- 2026-09-15: **Radio entry point lives in the bottom dock, not the header.**
  The header is the nameplate and fades on scroll; the dock is the room
  controls strip. The playlist card stays on the canvas (who put it on, vibes,
  station picker); the dock chip is the always-visible way in.

- 2026-09-13: **About is the logo destination.** The user asked for a full
  redesign and a small visible About link. The logo and bottom-right link
  open `#/about` and remember the current room, including the default route.
  A small grid icon in the rail opens the block. The About page uses the
  app’s existing artwork and an explicitly local preview poll; the site’s
  root continues to open a live room. Technical detail is expandable.

- 2026-09-13: **The room bar is a `<div>`, not a `<header>`.**
  `Canvas.tsx` wrapped the room's live state (faces, "N here now", title,
  actions) in `<header className="space-header">`. Readability-style text
  extractors — link previews, search snippets, crawlers — drop `<header>` as
  boilerplate by tag, regardless of nesting. Measured against prod: extracting
  main content only gives 3,735 chars with no "here now" in it; the unfiltered
  extraction gives 4,584 chars and has it. So a true, already-rendering live
  number was invisible to every reader that isn't a browser. Swapped the tag;
  all `.space-header` styling is class-based, so it is visually inert —
  pixel-diffed at 0 pixels changed beyond 2/255 across the header band,
  against a 0.222% frame-to-frame animation noise floor. Ships on the next
  `npm run deploy`.

- 2026-09-13: **No marketing landing page — the block is the front door.**
  Asked whether OurSpaces should have one, for legitimacy. Two reasons not
  to. A static pitch page at the root would replace the one thing that makes
  the product legible in five seconds — a live room with real people and real
  counts in it — with a page that only describes it. And the block (`#/home`)
  already is a lobby with real rooms and real counts, it was just unreachable:
  the rail brand pointed at `/`, which is the build room. Shipped instead:
  brand → the block, plus the `#/about` page above, both at non-root hashes so
  the root stays a live room. The remaining legitimacy lever is the URL —
  `necessary-cobra-892.convex.site` reads like a test deploy. **Open:**
  whether we own a domain to point at it (custom domains need Convex Pro).

- 2026-09-13: **Sign-in email direction.**
  Generated two local mockups: envelope header/light body (recommended) and
  violet room-key ticket. Proposed: shorter “Your sign-in code” headline,
  one selectable code block, expiry directly underneath, sans-serif type,
  smaller decorative artwork and OurSpaces sender name. **Follow-up:** user
  approved building the recommended envelope direction and changed the expiry
  to 20 minutes. Implemented above. Images and exact prompts:
  `.context/email-concepts/README.md`.
- 2026-09-10: **RSVP, daily-question answers and answer reactions persist
  per-person.** All three were `useState` in `LiveSpace.tsx` and never reached
  Convex, so two people saw different answers and a reload lost yours — on a
  canvas whose whole premise is that everyone sees the same board. They now
  ride the existing `handlers.onUpdate` → `widgets.updateWidgetData` route
  (the `widgetInSpace` guard is intact), keyed by `identity.userId` rather
  than by browser or display name, so a second browser is a second person and
  not an overwrite. `widgetData.ts` gained three *optional* fields
  (`responses[].userId`, `answers[].userId`, `answers[].reactedBy`), so no
  migration and every existing row still validates. Seeded rows carry no
  `userId` and read as everybody else. Verified with two live browser
  contexts: A responds, B sees it without reloading.
  - `data.youAnswered` is deliberately **not** written — it is one shared
    boolean, so flipping it would unlock the reveal for everyone. It is
    derived per-user at render instead.
  - Still local, and correctly so: the 1600ms scribble-reveal animation.
  - Still broken, the last of its kind: the `us two` letter's `sealed` flag.
  - Known limit: `onReact` matches the target answer by display name, so two
    people with the same name on one card collide. Needs `extras.tsx`.
- 2026-09-10: **Unicode widget-data keys were silently failing to save.**
  Every editor form spreads `widget.data`, which `adapt.ts`'s `restoreKeys`
  hands back with emoji keys unescaped — and Convex rejects non-ASCII field
  names at the encoder, so saving a daily question with a 😂 reaction tally
  threw `Field name 😂 has invalid character` and the edit vanished. Escaped
  at the write site. **This is the third copy of that escaping**
  (`convex/seed.ts`, `src/live/adapt.ts`, `LiveSpace.tsx`); it belongs next to
  `restoreKeys` and should be de-duplicated.

- 2026-09-10: **`spaces.lastActivityAt` is bumped, but only coarsely.** It used
  to be set at creation and never again — a creation time wearing a false name.
  Every real-activity mutation now calls `touchSpace()` from
  `convex/activity.ts`, which rewrites the field only when it is already more
  than 60s stale. Rationale: the `spaces` row is returned by both
  `getSpaceWithWidgets` (every open room) and `listSpaces` (Home, and it reads
  every space), so an unthrottled patch in a hot mutation would fan one paint
  stroke out into an app-wide subscription re-run and put every writer in the
  room into OCC contention on one document. Activity = widget
  create/move/resize/delete/edit/claim/spin/tune, message send, promote, paint
  stroke, paint clear, photo pin, `presence.finishGesture` (the real drag and
  resize commit — `widgets.moveWidget` only runs on the keyboard/editor
  fallback), `votes.vote`, the three inbound-mail landing paths in `inbox.ts`,
  `recap.reply`, and `questions.setQuestions`. **Not** activity:
  cursor/gesture heartbeats, `joinDemoSpace` (fires on every room entry — that
  is a page load), `firecrawl.crawlComplete` (terminal logging; the crawl's
  own user action already counted), seeds, backfills, CLI one-offs. No
  backfill — existing rows keep their creation time until something happens in
  them.
- 2026-08-31: **Guest or join, never a wall.** Real Convex Auth. Guest =
  Anonymous (silent) + claim a name — the demo path, a complete product.
  Join = Passkey on the same claim card; upgrades the same `members` row.
  Showcase spaces stay open. No email+password, no ClaimHero-style gate.
  Wire after brain-play B1. Spec: `docs/data-model-plan.md` §1.
- 2026-08-31: **The space has a brain. Mail it something it would recognize.**
  Filing, recap, digest, and reading-circle questions already exist; they
  are invisible. Next work makes one decision visible in the group's voice
  (flap sentence, recap strip on the canvas, Firecrawl that writes widgets,
  vision notes on prints). Catch-me-up *does* write to the canvas (reverses
  the 2026-08-30 recap-panel decision). Care lives as a meal-train frame on
  the crew, not a new health product. Kill: chatbot, medical space, more
  reading-circle questions. Spec: `docs/mail.md` goals, this file Next up.
- 2026-08-30 (night): **The GitHub repo is public, so tracked docs describe the
  product and how it's built — nothing about how we plan to present it.**
  `PRODUCT.md`, `docs/ourspaces-prd-v0.6.md`, `docs/vibeapps-listing.md`, the
  `/eye-candy` skill and `.impeccable/` are now gitignored (still on disk, still
  read by agents). Same sweep untracked `.mcp.json`, which carried a live
  AgentMail key in a header — it was never pushed, but the key should be
  rotated. Doc-map's bottom table is the list; when in doubt, write it local.
- 2026-08-30 (night): In the reading room, **tags cut before state**. The
  filter row is kinds-first (a stable vocabulary the room learns) plus the
  loudest hosts, capped at six so it stays one line; `new / hot / discussed /
  kept` are a second, quieter cut *inside* the picked tag. Kind synonyms are
  never chips. Tag pills in the reading circle are the same control, so a tag
  seen on a card is a tag you can pull.
- 2026-08-30: Live model calls go through RoomDone's shared `ai-proxy`
  Worker (`https://ai-proxy.corgi-quest.workers.dev/v1`, gpt-oss-120b),
  not OpenAI. OurSpaces has its own project token; RoomDone's hash map
  was left untouched (`APP_TOKEN_HASHES`).
- 2026-08-30: Catch me up is both a daily briefing and an on-demand refresh.
  Follow-ups live in the recap panel (not a ChatGPT drawer). OpenAI stays a
  structured decider: recap lines cite widget/message ids; chat replies are
  about this board only.
- 2026-08-30: Docs are routed through a public map + skill, not dumped as a
  set. Index is `docs/doc-map.md`; skill is `/ourspaces-docs` (lives in both
  `.agents/skills` and `.claude/skills` so it ships in the public repo).
  Marketing/strategy drafts stay gitignored (`docs/post-skeletons.md`,
  `docs/local/`, `docs/*.local.md`, `.context/`).
- 2026-08-29: Organic paper is a material family, not one repeated filter.
  Notes/poll keep the shallow deckled-bottom stock; daily question gets soft
  punched worksheet paper; saved links gets cooler machine-made ledger stock.
- 2026-08-29: Sticker ids stay stable for persisted rows, but the visible pack
  is character-led rather than slogan badges. The picker is a light physical
  sheet inside dark chrome so the white die-cut border reads like the supplied
  vinyl-sticker reference; canvas depth follows the transparent silhouette.
- 2026-08-29: Crew stickers can mix illustration, restrained holographic foil,
  simple symbols/type, and photographic cutouts as long as every piece shares
  the same black keyline, white vinyl cutline, and punchy physical-sheet feel.
- 2026-08-29: Sticker depth stays close to the vinyl edge: 1–2px at rest and
  3–4px when hovered or selected, so the cutline leads instead of the shadow.
- 2026-08-29: Trial the Hall-of-Fame-style torn paper on the crew poll only
  before spreading a shared material treatment across the birthday widget set.
- 2026-08-28: Hackathon mode locked in — no tests ever, B/C-grade code fine,
  keep TypeScript decent, 100% vibe-coded by the human.
- 2026-08-28: Replies to the human: ≤3 bullets, no paragraphs; bold
  **(question)** tags for anything needing input.
- 2026-08-28: Agents may split `App.tsx` / `index.css` when sections get hairy;
  keep `docs/code-map.md` updated.
- 2026-08-28: Notes keep straight top/sides and concentrate the physical tear
  at the bottom; related paper widgets reuse that tear while varying their
  content and backing layers. Hall of Fame keeps its one pink backing fully
  inside the card footprint; canvas stickers use a reserved top z-layer.
- 2026-08-28: Playlist is SomaFM, not Spotify. Shared station via Convex;
  each client starts audio with a tap.
- 2026-08-28: `linkCard` is the Firecrawl demo widget; `linkShelf` stays static
  set dressing. The card uses a real page image when available and a generated
  crisp collage fallback.
- 2026-08-28: Web post is a **paper clipping, not glass** — the frosted
  reading sheet was replaced with a solid `--color-card` printout using the
  notes' torn-paper texture, masking tape, a solid dated tab, and a
  `--space-accent` source chip. Glassmorphism is banned by PRODUCT.md; don't
  reintroduce backdrop-filter here.
- 2026-08-28: Zoomed web posts talk through a **reading circle** — up to 2 AI
  conversation starters in the thread dock, each its own thread under
  `<widgetId>::q:<id>` (rides the existing message pipes, no schema change).
  Seeded on the tahoe + hackathon cards; the editor attaches canned starters
  on link save and live mode swaps in OpenAI ones via
  `convex/questions.sparkQuestions` (canned fallback when `OPENAI_API_KEY`
  is unset — set it in Convex env for real generations).
- 2026-08-28: Collaborative coloring is a full-screen paint-by-number room, not
  freehand canvas zoom. Fixed seed points flood-fill enclosed line-art regions;
  each region is one optional `regionId` paint row, so another window sees every
  completed number arrive reactively without rewriting the widget document.
- 2026-08-28: The reference interaction wins over the gallery treatment: one
  selected color reveals only its matching numbers, a compact bottom dock shows
  remaining counts, and the shared `electric`/`sunset` preset is stored as a
  special paint row so both collaborators see the same palette instantly.
- 2026-08-28 (later): The coloring artwork is **generated, not drawn or
  fetched** — a Node script computes exact closed-path geometry, so every
  region is tappable SVG and the raster flood-fill (and its anti-aliasing
  halos) is gone. All numbers now show (dim → bright when matched) and tapping
  any dim number jumps to that color; this replaced hiding unmatched numbers.
  Two gotchas encoded in the widget: the full-screen room must
  `stopPropagation` on pointerdown/click (portal events bubble through the
  React tree into WidgetCard's drag pointer-capture, which eats SVG clicks),
  and mock-mode `onStroke` resolves null so local strokes are only dropped
  when a real Convex row id comes back.
- 2026-08-28 (later still): "Better artwork" = **traced public-domain
  masterpieces**, not clip art. Free SVG sites only had icon-tier scenes or
  36k–50k-path photo traces; instead `scripts/trace-artwork.mjs` retraces the
  original painting scans under our control (~60–80 tappable regions). The
  paintings are PD (Van Gogh d.1890, Hokusai d.1849; Wikimedia scans of PD 2D
  art are PD). Board palettes are per-artwork; the shared preset pair means
  classic/neon on traced boards and night pop/sunset on the scene. paintMarks
  `take(240)` still covers all three boards because addStroke dedupes per
  regionId (186 region rows max + preset rows).
- 2026-08-29: "the crew 2.0" (`#/space/crew2`) is a background-remix duplicate
  of the crew — the human disliked the blush field's low contrast, everything
  else stays. New `lagoon` theme preset (flat teal `#12a594`, white ink, same
  topo texture under a 0.72 wash) in `spaceThemes.ts` + `index.css`; mock entry
  reuses `CREW_MEMBERS`/`CREW_WIDGETS`; live copy created once via
  `spaces:duplicateCrew` (internal, idempotent — clones widgets/members/votes/
  messages/paint, skips the AgentMail inbox). The crew hero CSS pass now keys
  on `[data-space-id^="crew"]` so both spaces share it; crew2-only re-inks
  (white frame borders/subtitle) live in the "Crew 2.0" banner at the CSS end.
  Original crew untouched, so reverting = ignore/delete crew2.
- 2026-08-29 (later): Topo texture on crew2 calmed to a 0.86 wash per the human.
  Gotcha found doing it: App.tsx's mock wrapper never set `data-space-id`, so
  every `[data-space-id^="crew"]` rule (the whole crew hero pass) silently only
  applied in live mode — mock screenshots were lying. Fixed by adding the
  attribute to App.tsx's `<main>`; mock and live now render identically.
- 2026-08-29 (later still): Two color-direction remixes now exist to answer
  "violet fights the teal field": **crew2** keeps lagoon teal but hands the
  identity to magenta `#e9369d` (meta color → accent; birthday pill re-inked
  via `--space-accent`; live doc retinted with `spaces:retintSpace`), and
  **crew3 / "the crew 3.0"** is a new duplicate on a deep `spruce` theme
  (`#0f5c50`, 0.82 topo wash) where violet + cream read as jewelry (thinner
  frame fill, white ghost pills). `spaces:duplicateCrew` generalized to
  `spaces:duplicateBySlug({fromSlug,toSlug,name})`; crew3 cloned live.
  Human is picking between them; loser(s) can just be deleted.
- 2026-08-29 (final): Human picked the lagoon+magenta remix — it now IS the
  crew. `crew` meta color → `#e9369d`, default theme → `lagoon`; remix CSS
  retargeted from crew2/crew3 to `[data-space-id^="crew"]`; spruce stays as a
  selectable preset (its crew re-inks kept). crew2/crew3 removed from mock data
  and deleted live via new `spaces:deleteBySlug`; live crew retinted with
  `spaces:retintSpace`. Rail is back to six spaces.
- 2026-08-29 (marketing): Playbook v2 finalized; the canonical doc is
  gitignored and indexed in the local doc map — marketing strategy stays out
  of the public repo, including its calendar. The build items it creates are
  in "Next up" (vendor pages, commons space).
- 2026-08-30 (reading circle): The circle pane got the editorial layout from
  the approved shot — uppercase domain link over a display-size title, the
  cover as a taped polaroid snap in the corner, WHY IT MATTERS, TALK ABOUT IT
  question cards with take counts, threaded takes. One component
  (`ReadingRoom.tsx`), so mock and live render it identically (verified both
  via a driver eval that opens the pile; live needs
  `sessionStorage["ourspaces:claim-dismissed"]="done"` to skip the claim gate).
  Follow-up at 1440px: the pile h2 now shrinks instead of wrapping (font
  clamp + nowrap, drop bar cedes width first) and the row grid caps the title
  column at `min(290px, 48%)` so the description column never crushes to a
  sliver.
- **Presence pill redesign (2026-09-13).** The header's black pill read as
  four words in a bar: status ("4 here now") and actions (add, invite) at the
  same weight, nothing looked pressable, and lime was spent three times
  (dot, +, ↗). Decision: one sticker, two textures. Status half on flat
  black — the lime live dot moved off the label onto the face stack's corner
  as an online badge (ringed in sticker black), the count now leads with the
  number in Bricolage 15px and "here now" demoted to 78% Plex; the number is
  keyed so a count change rolls in on `pop`. Action half — add and invite
  became two filled keys (white 10%, 18% + lift on hover, lime while open)
  with stroke-SVG glyphs that weigh the same as the type; glyphs are white at
  rest and light lime on hover, so lime appears once at rest. Hairline gone.
  "+N" overflow is a grey chip, not a fifth face. Hovering the crowd fans the
  faces apart (-11px → -3px overlap). Phone keeps the old separate pills and
  the label's own dot. Pill went from 391×51 to 354×46 on the crew.
