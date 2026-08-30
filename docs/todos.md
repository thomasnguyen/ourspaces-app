# Status

Session handoff file. Update at the end of every session (see `AGENTS.md`).
Backward-looking history lives in `hackathon.md`.

## Now working

- The “same moon, both windows” quote scrap now uses an image-generated,
  transparent purple pushpin cutout (`public/assets/ui/quote-pushpin.png`) with
  real molded-plastic highlights and a steel point; the CSS-built dot/pin was
  removed. Verified on `#/space/couple`; reference screenshot:
  `.context/quote-pin-imagegen.png`.
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

- (none recorded yet)

## Now also working

- Playlist widget is a real SomaFM room radio: play/pause, 6 stations,
  live track titles, Convex-synced station so others can tap join.
- Audio is local (browser autoplay). Pause does not stop the room for
  everyone. Streams are ice2/ice6/ice5 `*-128-mp3` from somafm.com.

## Next up

- Re-seed live Convex (`npx convex run seed:demo` or equivalent) so
  production canvases pick up the SomaFM fields and seeded buildclub/Tahoe
  web-post cards.
- Surface AgentMail in the UI (email → canvas mutations).
- Add the web-post discussion layer: OpenAI creates two direct questions, then
  answers and upvotes sync live. This satisfies the structured
  extractor/decider sponsor beat without a chatbot UI.

## Decisions

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
