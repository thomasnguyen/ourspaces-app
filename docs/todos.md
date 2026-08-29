# Status

Session handoff file. Update at the end of every session (see `AGENTS.md`).
Backward-looking history lives in `hackathon.md`.

## Now working

- Full app deployed live: https://necessary-cobra-892.convex.site (Convex
  static hosting + prod backend, all spaces seeded).
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
