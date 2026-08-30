# Code map

For agents: read this before searching the codebase. Update it when structure
changes. Stale line numbers are fine (treat them as landmarks); missing files
are not.

## src/App.tsx (~2150 lines, one giant `App()`) — the MOCK/demo canvas path

| ~Lines | Section |
|---|---|
| 1–97 | Imports, lazy routes (`CursorLab`, `WidgetLab`, `BlockPage`, `LiveBlockPage`, `Welcome`) |
| 99–150 | Local types (`Route`, `WidgetPlacement`, `FocusedTarget`…) + camera/zoom constants |
| 152–241 | Geometry helpers + hash routing helpers (`routeFromHash`, `spaceFromHash`) |
| 248–333 | `App()` state: ~35 `useState` + ~12 refs (canvas pan/scale, focus, picker, thread dock…) |
| 335–444 | Camera core: `applyCanvasScale`, `animateCanvasCamera` |
| 446–800 | Focus system: `focusCameraTarget`, `leaveFocus`, `focusFrame`, `focusWidgetThread` |
| 802–884 | Block zoom in/out transitions |
| 886–1101 | ~11 `useEffect`s (route/hash listeners, resize fitting, camera cleanup) |
| 1103–1208 | Navigation + panel openers (`selectSpace`, `openPicker`, `openWidgetEditor`, `saveSpace`) |
| 1221–1394 | Widget CRUD/layout (`addWidget`, `moveWidget`, drag handlers, frame layout) |
| 1396–1580 | Widget interactions (poll/wheel/rsvp/dailyQ), threads, delete/undo |
| 1582–1638 | Recap ("catch me up") + sound toggle |
| 1640–1717 | Route early-returns → pages (live/join/space → `LiveSpacePage`, home → `(Live)BlockPage`) |
| 1719–2130 | Mock-mode derived data + the big JSX render (`Rail`, `Canvas` ~1921, panels, docks, toasts) |

`src/pages/LiveSpace.tsx` (~1375 lines) is the LIVE twin of App.tsx's inline canvas.

## src/ directories

**components/** — `Canvas.tsx` (canvas + SpaceHeader, presence/gestures) ·
`WidgetCard.tsx` (widget shell: drag/resize/thread chip) · `WidgetEditorPanel.tsx`
(per-type edit forms) · `WidgetPicker.tsx` · `WidgetThreadDock.tsx` ·
`GlobalChatPanel.tsx` · `ThreadContent.tsx` (messages + composer + promote) ·
`Rail.tsx` (space rail) · `ActionDock.tsx` (bottom dock + recap trigger) ·
`CanvasNavigator.tsx` (minimap) · `CanvasEdgePan.tsx` · `SpaceEditorPanel.tsx`
(theme editor) · `ClaimCard.tsx` (identity claim) · `FirstRunSticky.tsx` ·
`GhostCanvas.tsx` · `MemberFace.tsx` · `PhotoWallGallery.tsx` · `WelcomePill.tsx` ·
`LinkQuestionStrip.tsx` (web post conversation starters in the thread dock)

**pages/** — `LiveSpace.tsx` (live canvas) · `Block.tsx` (mock `#/home`) ·
`LiveBlock.tsx` (live home) · `Welcome.tsx` (`#/test`) · `WidgetLab.tsx` ·
`CursorLab.tsx` · `labs.css`

**widgets/** — `core.tsx` (sticker, frame, countdown, poll, note…) ·
`extras.tsx` (rsvp, dailyQ, availability, Firecrawl link card, link shelf, playlist, expense,
itinerary, quote, weather, sports…) · `CozyColorWidget.tsx` (full-screen
paint-by-number game on an inline SVG board: 50 closed vector regions fill via
CSS `--paint-*` vars, numbers live in the SVG, tapping a dim number switches
color; two live palette presets; mock-local or Convex-backed region fills) ·
`cozyColorArt.ts` (AUTO-GENERATED region/decor path data — regenerate with
`node scripts/generate-cozy-art.mjs`, don't hand-edit) ·
`cozyColorBoards.ts` (postcard gallery adapter: unifies the generated scene +
traced masterpieces into `CozyBoard[]`; stroke ids are prefixed `<boardId>:`
except the legacy unprefixed scene) · `boards/starry.ts` + `boards/wave.ts`
(AUTO-GENERATED traced-painting data from `scripts/trace-artwork.mjs`)

**live/** — `useSpaceData.ts` / `useLiveSpace.ts` / `useLiveHandlers.ts`
(gesture claim/accept/reject) / `useLivePoll.ts` / `usePresence.ts`
(canvas cursors + gestures; `reportZone(x, y, "cozy:<boardId>")` switches the
heartbeat to 0..1 zone coords for the coloring room, canvas pointermove
switches it back) ·
`dataMode.ts` (live/mock detection) · `identity.ts` (local identity + colors) ·
`presenceTypes.ts` · `snapshot.ts` (localStorage snapshot) · `adapt.ts`
(Convex↔UI key escaping)

**cursors/** — `registry.ts` + `styles.tsx` (8+ cursor styles) · `LiveCursor.tsx`

**lib/** — `routes.ts` (hash + invite URLs) · `widgetDefaults.ts`
(`WIDGET_BLUEPRINTS`) · `widgetLabels.ts` · `widgetThreads.ts` · `blockZoom.ts` ·
`entrance.ts` · `onboarding.ts` · `sounds.ts` · `radio.ts` (SomaFM singleton) ·
`backendCounts.ts` · `linkQuestions.ts` (web post question threads:
`<widgetId>::q:<id>` ride the normal message pipes; canned fallback generator)

**data/** — `types.ts` (`Widget`/`Space`) · `spaces.ts` (all seeded spaces,
1300+ lines) · `chat.ts` (mock threads) · `recap.ts` · `spaceThemes.ts` ·
`templates.ts` (`WIDGET_CATALOG`) · `stickers.ts` (stable sticker ids → die-cut
character art, dimensions, tilt) · `avatars.ts` · `crew.ts`

## public/

**photos/crew/** — seven casual camera-roll memories for the crew wall; generated
`friday-at-mayas`, `roof-dusk`, and `paint-night` intentionally use imperfect
iPhone framing/flash and matching cast continuity. `photos/thumbs/crew/` holds
640×480 preview copies used during the pile-to-room animation.

**assets/textures/** — generated real-paper surfaces for `NoteWidget`:
`note-paper.jpg` (fibers/tape) + `note-torn-paper.png` (transparent restrained
bottom tear), plus `widget-paper-v1.jpg` (quiet seamless fibers from the
superseded first-pass material study). `daily-question-paper.jpg` is a soft
cotton-rag worksheet stock; `link-shelf-ledger.jpg` is a cooler speckled receipt
stock. The crew poll shares the note/Hall of Fame torn-paper surface, while the
daily question and saved-links card intentionally use different paper families.

**assets/link-card-fallback.jpg** — generated crop-safe paper collage used when
a Firecrawl link card has no page image.

**assets/ui/quote-pushpin.png** — image-generated transparent purple plastic
pushpin used by the “same moon, both windows” quote scrap.

**assets/stickers/** — twelve generated transparent die-cut crew stickers mixing
character art, holographic foil, and flash-lit photo cutouts (`hello-cat`,
`socks-terrier`, `holo-smiley`, `pizza-pals`, `blah-blah`, `matcha-cake`,
`roller-crew`, `crew-high-five`, `skate-sun`, `tahoe-car`, `cherry-duo`,
`moon-sparkle`); legacy badge assets remain on disk but are no longer catalogued.

**assets/cozy-color-poster.svg** — AUTO-GENERATED finished "same moon, both
windows" poster (door preview for `CozyColorWidget`); emitted by
`scripts/generate-cozy-art.mjs` alongside `src/widgets/cozyColorArt.ts`.

**assets/cozy-poster-starry.svg / cozy-poster-wave.svg** — AUTO-GENERATED
finished posters for the traced masterpiece boards (door + shelf thumbs),
emitted by `scripts/trace-artwork.mjs`.

**assets/cozy-color-same-moon*.png** — legacy raster line art from the
flood-fill era; no longer rendered (widget `data.src` is ignored).

**assets/coloring-concepts/** — superseded selection prototypes from before the
generated vector board; kept for history only.

## convex/

`schema.ts` (spaces, members, widgets, messages, votes, presence; frames are
widgets) · `spaces.ts` · `widgets.ts` (CRUD/move/resize) · `messages.ts`
(per-widget threads) · `votes.ts` · `presence.ts` (cursors + gestures, TTLs) ·
`stats.ts` (live counts) · `seed.ts` · `crons.ts` (presence cleanup) ·
`http.ts` + `agentmail.ts` (webhook `/api/agentmail/webhook`, per-space inbox) ·
`firecrawl.ts` (`scrapeLink` action) · `questions.ts` (`sparkQuestions`: OpenAI →
2 conversation starters on a link card, canned fallback without a key) ·
`paint.ts` (reactive numbered-region fills + couple-room widget backfill) ·
`photos.ts` (`generateUploadUrl` + `addPhoto`: file-storage upload prepended to
a photoWall widget's `data.photos`, becomes the pile cover) ·
`convex.config.ts` (components, env)

## src/index.css (~17.3k lines, hand-written, banner comments)

Tokens `@theme` (lines 4–27) → base (~1–1000) → space entrance (~1048) →
per-widget sections (~1670–6300) → chrome: picker ~6305, threads ~7047,
navigator ~7357, chat drawer ~8313, action dock ~9744, recap ~9951 → pages:
block ~10718, zoom ~10977, cursors ~11005 → append-only "pass" sections
(~11482+), ending with the "SPACE HEADER — SCROLL-LINKED FADE" section
(`--header-scroll-fade` var set by the space-scroll onScroll handlers in
App.tsx/LiveSpace.tsx). New CSS goes in a new banner section at the end.

## scripts/

`generate-cozy-art.mjs` — computes the cozy-color scene geometry (halo-ring
donuts, peaks/caps, pine zigzags, sine river ribbons, mirrored houses, birds)
and emits `src/widgets/cozyColorArt.ts` + `public/assets/cozy-color-poster.svg`.
Edit the script, rerun it, never the outputs.

`trace-artwork.mjs` — public-domain painting JPEG → paint-by-number board:
downscale + blur merges brushstrokes, quantize (~6-7 colors), trace via
imagetracerjs, keep only tappable regions with auto-placed number spots.
With `--id/--title/--credit` it emits `src/widgets/boards/<id>.ts` +
`public/assets/cozy-poster-<id>.svg`; always writes previews next to the input.
Source scans live in `.context/art-candidates/` (Wikimedia, PD). Example:
`node scripts/trace-artwork.mjs in.jpg out 7 560 --id=starry --title="the starry night" --credit="van gogh, 1889"`

## Agent tooling

`.claude/skills/run-ourspaces/` — `/run-ourspaces` skill: headless browser
driver (`driver.mjs`, playwright-core + cached Chromium) for screenshotting
the app in mock mode. `shot <route>` · `dock` (web post reading circle) ·
`eval <file>`. See its SKILL.md for the port/mock-flag gotchas.

`.claude/skills/eye-candy/` — `/eye-candy` skill: the hackathon override layer
on `impeccable`. No accessibility findings (ARIA, screen readers, keyboard nav,
WCAG ratios, alt text, touch targets); per-command overrides for `audit`,
`critique`, `polish`, `harden`, `craft`, `adapt`; freed budget goes to motion,
identity color, liveness. Restated in `PRODUCT.md` § Accessibility & Inclusion
(impeccable prints that file every run) and `AGENTS.md`. Matching detector
suppressions in `.impeccable/config.json`.
