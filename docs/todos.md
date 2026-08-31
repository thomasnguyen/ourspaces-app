# Status

Session handoff file. Update at the end of every session (see `AGENTS.md`).
Backward-looking history lives in `hackathon.md`.

## Now working

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
  broken `@agentmail/convex` component; `convex/agentmail.ts` is a plain REST
  client (create inbox / send / `clearStubInboxes` / `ensureShowcaseInboxes`)
  and `convex/http.ts` hand-verifies the svix webhook. Inbound mail →
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
  Desktop now opens on a mock/live shared overview camera (frame-fit, max
  `.84`) with all five zones clear of the compact header, rail, and dock; focus
  returns there, resize recomputes it while unfocused, and mobile stacking is
  unchanged. The three pinned links use the local ceramic, violet-collage, and
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
  instantly with an "N enriching…" pill, then `firecrawl.scrapeLink` fills each
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

- **Mail is dev-only until the prod cutover.** Inboxes, webhook and secret are
  bound on the dev deployment (`dusty-condor-648`); production
  (`necessary-cobra-892`) has no AgentMail webhook yet, so email → canvas does
  nothing on the live URL. Steps (second webhook, `setSpaceInbox` binds, do
  **not** create inboxes again) are in `docs/firecrawl-agentmail-setup.md`
  § Prod. The 3-inbox free tier is per **org** and shared dev↔prod, which is
  why prod has to reuse the same three addresses.
- **The daily recap cron is commented out** in `convex/crons.ts` — deliberate,
  re-enable `recap.generateAll` closer to the deadline. Only the presence
  sweep (1 min) and the Friday digest run today.
- **Live Convex still needs a re-seed** for the SomaFM playlist fields and the
  seeded buildclub / Tahoe web-post cards (`npx convex run seed:demo`).

## Now also working

- Playlist widget is a real SomaFM room radio: play/pause, 6 stations,
  live track titles, Convex-synced station so others can tap join.
- Audio is local (browser autoplay). Pause does not stop the room for
  everyone. Streams are ice2/ice6/ice5 `*-128-mp3` from somafm.com.
- **Catch me up is live** on the personal Convex dev deployment. Daily cron
  (8am PT) writes a `recaps` row per space; tap generates if none exists; ↻
  refreshes now.   Follow-up composer is board-only. Live calls go through RoomDone's
  Cloudflare Worker (`AI_PROXY_URL` / `AI_PROXY_TOKEN` →
  `@cf/openai/gpt-oss-120b`); OpenAI is fallback only. Chat rides
  `messages.widgetId === "recap"`. Never writes the canvas. Mock keeps the
  scripted Jules/matcha/6pm lines plus local replies. Verified mock + live
  crew: `.context/recap-live-check.png`, `.context/recap-live-board.png`.

## Next up

- vibeapps listing description is drafted in `docs/vibeapps-listing.md`
  (**local-only / gitignored** — submission copy doesn't ship in the public
  repo). Fill the [bracketed] placeholders at submit time (Sep 21) and cut any
  line whose feature didn't land.
- **Prod mail cutover** — the one thing between "works" and "works in the
  demo": second AgentMail webhook at `necessary-cobra-892.convex.site`, key +
  secret with `--prod`, then `setSpaceInbox` for the three spaces. Do not
  create inboxes again (org-wide 3-inbox cap). Recipe in the setup doc § Prod.
- Re-seed live Convex (`npx convex run seed:demo` or equivalent) so
  production canvases pick up the SomaFM fields and seeded buildclub/Tahoe
  web-post cards.
- ~~Surface AgentMail in the UI (email → canvas mutations)~~ — done 2026-08-30,
  live on dev with real mail (crew `ourspaces@`, couple `ustwo@`, buildroom
  `buildroom@`).
- ~~Reading-room tag filters~~ — done 2026-08-30 night.
- Mail polish, if time: emailed widgets should *arrive* (envelope drop + house
  motion, not a reactive pop-in); letters could open live for both people
  (shared `sealed` state) instead of per-tab local state.
- Build room, still open: the shipping wall uses the old
  `public/photos/hackathon/*.jpg` people-shots, not product screenshots —
  generate three dashboard images. OpenAI doesn't write `whyItMatters`/`kind`
  yet (dropped links fall back to Firecrawl's description + canned questions);
  wire a structured extractor like `convex/questions.ts` does. No editor forms
  for the four new types yet (`WidgetEditorPanel`), and Hot Now doesn't FLIP
  when a vote reorders it.
- Add the web-post discussion layer: OpenAI creates two direct questions, then
  answers and upvotes sync live. This satisfies the structured
  extractor/decider sponsor beat without a chatbot UI.
- Build four static vendor pages in `public/` (convex / agentmail / firecrawl /
  openai) from one shared template: per-page OG tags, hero clip,
  what-it-does-in-OurSpaces, code peek, deep link into the live app. Needed
  live by Sep 16. Spec in `.context/ourspaces-marketing-playbook-v2.md` §5.
- Stand up the public "commons" space for hackathon builders (separate from
  the demo spaces — strangers get write access) around Sep 16.

## Decisions

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
- 2026-08-29 (marketing): Playbook v2 finalized in chat; canonical doc is
  `.context/ourspaces-marketing-playbook-v2.md` (gitignored — marketing
  strategy stays out of the public repo). Shape: quiet until Sep 12, then a
  10-day build-in-public arc on X (one post/day), sponsor posts staggered
  Sep 17–20 with AgentMail as the Sat Sep 19 finale + the single LinkedIn
  post, submit early Sep 21. Build items it creates are in "Next up" (vendor
  pages, commons space); clips get batch-recorded Sep 10–11 as MP4s.
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
