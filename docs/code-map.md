# Code map

For agents: read this before searching the codebase. Update it when structure
changes. Stale line numbers are fine (treat them as landmarks); missing files
are not.

## src/App.tsx (~2470 lines, one giant `App()`) — the MOCK/demo canvas path

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
| 1582–1670 | Recap ("catch me up") + mock follow-up chat + sound toggle |
| 1640–1717 | Route early-returns → pages (live/join/space → `LiveSpacePage`, home → `(Live)BlockPage`) |
| 1719–2130 | Mock-mode derived data + the big JSX render (`Rail`, `Canvas` ~1921, panels, docks, toasts) |

`src/pages/LiveSpace.tsx` (~2060 lines) is the LIVE twin of App.tsx's inline canvas.

## src/ directories

**components/** — `Canvas.tsx` (canvas + SpaceHeader, presence/gestures) ·
`WidgetCard.tsx` (widget shell: drag/resize/thread chip) · `WidgetEditorPanel.tsx`
(per-type edit forms) · `WidgetPicker.tsx` · `WidgetThreadDock.tsx` ·
`GlobalChatPanel.tsx` · `ThreadContent.tsx` (messages + composer + promote) ·
`Rail.tsx` (space rail; `OnlineCountSuffix` shows "· N here" per space via the
presence component's `roomPresence.onlineCountForSpace`, mounted by
`LiveSpace.tsx`'s `RoomPresenceHeartbeat` once a room is entered) ·
`ActionDock.tsx` (bottom dock + catch-me-up panel:
briefing, ↻ refresh, follow-up composer) ·
`CanvasNavigator.tsx` (minimap) · `CanvasEdgePan.tsx` · `SpaceEditorPanel.tsx`
(theme editor) · `ClaimCard.tsx` (identity claim) · `FirstRunSticky.tsx` ·
`GhostCanvas.tsx` · `MemberFace.tsx` · `PhotoWallGallery.tsx` · `WelcomePill.tsx` ·
`LinkQuestionStrip.tsx` (web post conversation starters in the thread dock) ·
`CanvasRoom.tsx` (shared full-screen `<dialog>` shell: grows out of the card
that opened it via `--room-origin-*`, shrinks back on close) ·
`ReadingRoom.tsx` (the pile's full view — single-link drop bar + a research bar
[`onSearch` topic / `onCrawl` site], a tag row over the `all / new / hot /
discussed / kept` filters, per-person runs, dense rows, reading circle whose tag
pills set the same tag filter) · `CrawlStrip.tsx` (live Firecrawl crawl panel —
usePaginatedQuery over `firecrawl.listCrawlPages`, pages stream in, each keepable
to the pile) · `ShipRoom.tsx` (a ship post's full view)

**pages/** — `LiveSpace.tsx` (live canvas) · `Block.tsx` (mock `#/home`) ·
`LiveBlock.tsx` (live home) · `Welcome.tsx` (`#/test`) · `WidgetLab.tsx` ·
`CursorLab.tsx` · `labs.css`

**widgets/** — `buildroom.tsx` (the build room's four: `linkPile`, `hotLinks`,
`shipPost`, `roundtable`; all pure, fed one `BuildRoomFeed` prop threaded
Canvas → WidgetCard) · `core.tsx` (sticker, frame, countdown, poll, note…) ·
`extras.tsx` (rsvp, dailyQ, availability, Firecrawl link card, link shelf, playlist, expense,
itinerary, quote, weather, sports, letter — kraft envelope that unfolds; buttons
inside so WidgetCard's drag capture doesn't eat the click…) · `CozyColorWidget.tsx` (full-screen
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
`backendCounts.ts` · `canvasSpacePan.ts` (hold-Space + drag pans
`.space-scroll`, Figma-style; used by App.tsx + LiveSpace.tsx) ·
`linkRanking.ts` (Hot Now's `pinned → voteCount×3 + replyCount×2 → newest`,
pile counts, per-domain tile tones, and the pile's tag vocabulary —
`linkTags` / `tagFacets` (kinds first, then top hosts, synonyms dropped) /
`linkHasTag` / `isKindTag`) · `buildRoomFeed.ts` (link state + thread-id
namespacing; `pileLinks()` folds the pile widget's `data.linkState`/`data.dropped`
over the fixtures) · `buildRoomPresentation.ts` (desktop overview scale from
frame bounds + viewport padding, capped at `.84`; pinned local cover fallback) ·
`frameMembership.ts` (`widgetIsInsideFrame`, moved out of
`Canvas.tsx`; `pileInsideFrame` makes the pile's frame open the room instead of
zooming) · `flipLanding.ts` (`flyWidgetIn` — the kept-takeaway arc) ·
`routes.ts` also exports `DEFAULT_SPACE_SLUG` (`#/` → `buildroom`) ·
`linkQuestions.ts` (web post question threads:
`<widgetId>::q:<id>` ride the normal message pipes; canned fallback generator)

**data/** — `buildroom.ts` (47 seeded links, dropped one at a time — `RAW`
entries expand into `BUILD_ROOM_LINKS` with jitter-staggered `droppedAt`;
covers are deliberately absent, rows render a flat monogram tile) · `types.ts` (`Widget`/`Space`) · `spaces.ts` (seeded spaces: crew,
couple, house, league) · `chat.ts` (mock threads) · `recap.ts` · `spaceThemes.ts` ·
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

**assets/link-card-fallback.jpg** — original generated crop-safe paper collage
used when a Firecrawl link card has no page image. Its staged house comparison
set includes the cut-paper siblings `link-card-collage-{amber,teal,violet}.png`
plus three material departures: `link-card-riso.png`,
`link-card-textile.png`, and `link-card-ceramic.png`.

**assets/ui/quote-pushpin.png** — image-generated transparent purple plastic
pushpin used by the “same moon, both windows” quote scrap.

**assets/space-covers/** — three generated square flash-photo covers used by
the rail for `us two`, `the house`, and `game day`; Crew keeps its existing
snapshot cover.

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

15 real components in use (`grep -rE '\bcomponents\.' convex --include='*.ts'`
lists every one) — installed + `app.use()`-wired in `convex.config.ts`, each
with a real job below, not just mounted.

`schema.ts` (spaces — carries `inboxId`/`inboxAddress`/`askThreadId`/
`ragIndexedAt` — plus emailEvents, members, widgets [`data`: typed
discriminated union, see `widgetData.ts`], messages [+ full-text search
index], votes, paintMarks, recaps, presence, `linkRefreshQueue`
[batch-worker queue]; frames are widgets) · `widgetData.ts` (the 12 typed
widget-data shapes + permissive record fallback, reverse-engineered from
every real producer) · `spaces.ts` (CRUD + `memberCounts` aggregate) ·
`widgets.ts` (CRUD/move/resize + `widgetsCounter` sharded-counter) ·
`messages.ts` (per-widget threads, real cursor pagination, `search` full-text
query, `messagesCounter`) · `votes.ts` (`pollTallies` aggregate + `vote`) ·
`presence.ts` (hand-rolled canvas cursors + gesture-lock arbitration, TTLs —
the ~90ms hot path; `finishGesture` commits the widget layout server-side.
**Do not** try to replace this with `@convex-dev/presence` — see
`roomPresence.ts`) · `roomPresence.ts` (`@convex-dev/presence`: "who has this
space open" room-occupancy signal for the space-rail tooltip, deliberately
separate from `presence.ts`) ·
`stats.ts` (`spacesCounter`/`widgetsCounter`/`messagesCounter` sharded
counters for the "live backend" widget's global totals) ·
`rateLimits.ts` (token-bucket quotas: LLM calls, mail sends, paint strokes) ·
`migrations.ts` (`@convex-dev/migrations`: one-off backfills — currently
normalizes legacy letter widgets) · `seed.ts` ·
`crons.ts` (presence sweep every minute, daily recap via the `recap.ts`
workpool, Friday 16:00 UTC digest via the `digest.ts` durable workflow,
Friday 17:00 UTC stale-link refresh via `batch.ts`) ·
`http.ts` (svix-verified inbound-mail webhook `/api/agentmail/webhook` → dedup
via `components.agentMail.lib.ingestWebhook` → router; persistent-text-streaming's
`/ask-stream`) ·
`components/agentMail/` (OUR first-party AgentMail component — `convex.config.ts`,
`schema.ts` [events dedup + inboundMessages], `lib.ts` [createInbox/sendMessage/
replyToMessage/addLabels/ingestWebhook/listInbound]; no nested workpool, key
passed in from app. Replaces the broken published `@agentmail/convex` 0.1.0) ·
`agentmail.ts` (app wrappers over `components.agentMail`: ensure/clear inboxes,
send [rate-limiter wrapped], `ackInbound` [reply-in-thread + label], and
`onMessageReceived` → `emailEvents` [now carries messageId/threadId] → router) ·
`inbox.ts` (per-space email router: couple→letter widget, buildroom→pile drop +
Firecrawl enrich, default→AI files into expense/itinerary/create/unfiled — each
branch returns an `{label, reply}` ack the space mails back) ·
`digest.ts` (`weeklyDigestWorkflow`: durable multi-step weekly digest —
recipients → snapshot → LLM compose → send, each independently retried;
cron calls `start()` fire-and-forget with an `onComplete` logger; manual
`sendNow` demo trigger keeps the simpler action-retrier `digestFor` path) ·
`firecrawl.ts` (`scrapeLink`: action-cache-wrapped [1h TTL] around
`scrapeLinkRetried`, which retries `scrapeLinkOnce` via action-retrier —
callers see one plain action. Plus `searchTopic` [web search → pile cards],
`crawlSite` [durable startCrawl] + `getCrawlStatus`/`listCrawlPages` reactive
wrappers + `crawlComplete` onComplete) ·
`questions.ts` (`sparkQuestions`: action-cache-wrapped [by title+description]
OpenAI → 2 conversation starters on a link card, canned fallback) ·
`ai.ts` (Cloudflare `ai-proxy` first, OpenAI fallback for chat;
`languageModel()`/`embeddingModel()` wrap the same targets as AI SDK models
for `agent.ts`/`rag.ts` — embeddings are real-OpenAI-only, the proxy has no
`/v1/embeddings` route) ·
`agent.ts` (`askAgent`: `@convex-dev/agent` thread per space, backs
`recap.ask`'s conversational memory) ·
`rag.ts` (`@convex-dev/rag`: indexes a space's widgets + recent chat,
semantic-searches to ground `recap.ask`; lazy 5min-staleness reindex) ·
`streaming.ts` (`@convex-dev/persistent-text-streaming`: real HTTP token
streaming for ask answers at `POST /ask-stream` — not wired into
`ActionDock`'s UI, which keeps its own fake-reveal animation) ·
`recap.ts` (`generate` / `ask` [agent + rag grounded, rate-limited] / daily
`generateAll` [workpool-bounded, `maxParallelism: 3`]: catch-me-up from a
board snapshot; follow-up chat on `messages.widgetId === "recap"`) ·
`batch.ts` (`@convex-dev/batch-worker`: drains `linkRefreshQueue` — stale
linkCards re-scraped a few at a time through the cached/retried scraper) ·
`paint.ts` (reactive numbered-region fills + couple-room widget backfill,
rate-limited per user) ·
`photos.ts` (`generateUploadUrl` + `storageUrl` + `addPhoto`: file-storage upload prepended to
a photoWall widget's `data.photos`, becomes the pile cover;
`backfillCrewMemorySources` replaces the two old test-upload sources without
changing their ids/note threads) ·
`convex.config.ts` (all 15 components + env)

## src/index.css (~21.1k lines, hand-written, banner comments)

Tokens `@theme` (lines 4–27) → base (~1–1000) → space entrance (~1048) →
per-widget sections (~1670–6300) → chrome: picker ~6305, threads ~7047,
navigator ~7357, chat drawer ~8313, action dock ~9744, recap ~9951 → pages:
block ~10718, zoom ~10977, cursors ~11005 → append-only "pass" sections
(~11482+): catch-me-up recap, the kraft-mat frames, the full-screen rooms
(`.canvas-room` shell → `.reading-room` / `.rr-*` incl. the tag row, ship room
`.sr-*`), the quote pushpin (~17882), the scroll-linked header fade (~17905),
the letter envelope + mail chip, and "BUILD ROOM — COMPACT OVERVIEW" (~20762)
last. New CSS goes in a new banner section at the end.

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

`.agents/skills/ourspaces-docs/` + `.claude/skills/ourspaces-docs/` —
`/ourspaces-docs` skill: read `docs/doc-map.md`, then at most 1–2 files.
Public map; local drafts stay gitignored.

`.claude/skills/run-ourspaces/` — `/run-ourspaces` skill: headless browser
driver (`driver.mjs`, playwright-core + cached Chromium) for screenshotting
the app in mock mode. `shot <route>` · `dock` (web post reading circle) ·
`eval <file>`. See its SKILL.md for the port/mock-flag gotchas.

`.claude/skills/eye-candy/` — **local-only (gitignored)**, alongside
`PRODUCT.md` and `.impeccable/`. The design override layer on `impeccable` and
the home of the house motion system: three easing curves, the six-step duration
scale, stagger, FLIP, and which moments earn cinematic treatment. Read it
before any UI work; skip it if a clone doesn't have it. Token names are
mirrored publicly in `docs/tokens.md`.
