# Spaces & widgets

The demo rooms, what's on each canvas today, and what each still needs.
Source of truth for seed content is `src/data/spaces.ts` (+ `chat.ts`
for threads); widget components live in `src/widgets/core.tsx` and
`extras.tsx`. The crew is the reference — it's the most complete space, and
its anatomy is the pattern the others should follow.

## The anatomy of a lived-in space (learned from the crew)

Every space is the same five layers wearing a different skin. This is the
"one canvas, three skins" structure from the PRD — build to these layers and
a space reads lived-in instead of demo-empty.

| Layer | Job | Crew examples |
|---|---|---|
| **Identity** | "This is *us*" at a glance | stickers, quote, media poster |
| **Memory** | Proof of history — the accumulation pitch | photo wall, joke registry, inside-joke notes, message wall |
| **Now** | The current occasion, grouped in a frame | "Maya's bday" frame: countdown, cake poll, RSVP, potluck |
| **Talk** | Something to talk about, daily | daily question, chat threads |
| **Props** | Set dressing, camera pans past | SomaFM room radio, weather, link shelf, expense split, itinerary, availability |

## Widget catalog (all built unless marked)

**Core** (`core.tsx`): sticker · frame · countdown · poll · potluck · chat ·
note · media.

**Extras** (`extras.tsx`): wheel · dualClock · dailyQ · rsvp · decision ·
availability · photoWall · linkCard · linkShelf · playlist · jokeRegistry ·
expenseSplit · itinerary · messageWall · quote · weather · sports ·
backendLive · letter (kraft envelope — an email that landed; click unfolds it).

**Rooms** (`CozyColorWidget.tsx`): cozyColor — the shared paint-by-number
postcard, fills and palette synced through the `paintMarks` table.

**Build room** (`buildroom.tsx`): linkPile · hotLinks · shipPost · roundtable.
All four are pure and read one `BuildRoomFeed` prop; keepers reuse `note` with
`data.title` + `data.pin`.

**Both PRD §8 "to build" items have shipped:**

- ~~**paint**~~ — shipped as the cozy-color room: 50 closed vector regions on
  generated + traced boards, region fills and palette presets reactive through
  `paintMarks`, board-scoped cursors (`reportZone(x, y, "cozy:<boardId>")`).
- ~~**linkCard discussion layer**~~ — shipped: `convex/questions.ts`
  (`sparkQuestions`, OpenAI → two starters, canned fallback) +
  `LinkQuestionStrip.tsx` in the thread dock; threads ride
  `<widgetId>::q:<id>`. `linkShelf` stays the static prop list.

Left on the widget layer: no editor forms yet for the four build-room types
(`WidgetEditorPanel`), and Hot Now doesn't FLIP when a vote reorders it.

---

## 0. the build room — dev guild (`#/`, `#ff7c42` orange, `torch` theme)

**Status: built.** Seven members, 1640×1080. The default demo space; the crew
stays one click away in the rail.

Desktop opens on a compact overview of all five zones. The shared mock/live
camera fits the existing frame bounds between the tighter header and dock,
capped at `.84`; focus still zooms to a widget and returns to that overview.
Mobile keeps its existing stacked layout. The three pinned links use the local
ceramic, violet-collage, and riso covers when Firecrawl has no image; scraped
images and monograms remain the fallbacks for the rest.

The problem it answers: a dev group drops links one at a time all week and ends
up with 50, and 50 cards on a canvas fails. So it's an **attention funnel** —
`50 raw links → 3–5 hot → 2–3 keeper takeaways`. Links live *inside* the pile;
only hot links and keepers graduate into canvas objects.

| Layer | Widgets on canvas |
|---|---|
| Identity | the orange field itself — one loud flat color, black objects |
| Memory | **keepers** frame → pinned `note` takeaways promoted out of the pile |
| Now | **the pile** frame → `linkPile` (47 links, fanned covers) · **hot now** frame → `hotLinks` (3 ranked rows) |
| Talk | **roundtable** frame → `roundtable` (threaded, previews its own tail) |
| Props | **shipping wall** frame → three `shipPost` polaroids |

**The reading room** (`ReadingRoom.tsx`, on the shared `CanvasRoom` shell) is
the pile's full-screen view — opened by the pile card *or its frame label*,
since the frame has nothing to zoom into. An always-ready single-link drop bar
(a multi-url paste still works) with a **research bar** under it (type a topic →
`firecrawl.search` drops ready cards into the pile; or hit **crawl** on a site →
`firecrawl.startCrawl`), a **tag row** above the
`all / new / hot / discussed / kept` filters (kinds first by count, then the
top hosts — six chips, kind-tinted, `#host` for the rest; `tagFacets()` in
`src/lib/linkRanking.ts`), links stitched into *runs* — consecutive drops by the same person within 30
minutes share one header — first 15 then "show N more", and a reading circle
down the right: cover, who dropped it, why it matters, two question threads,
replies, `pin to hot`, `keep takeaway`. Rows carry a kind dot (article / video
/ repo / docs / tool / discussion) and a 🔥 on the hot-ranked five. The tag is
the *outer* cut: it narrows the pile first, so the new/hot/kept counts describe
the tagged set, and the reading circle's own tag pills are buttons that set it
(a rare tag picked there is carried into the row so it can be undone). Mock mode
fakes the drop→enrich beat locally (`mockDropped` in `App.tsx`); live mode
runs Firecrawl.

Demo role: the volume story (47 links that don't wreck the canvas), Firecrawl
on a live paste, and the **keep takeaway** climax — the note physically flies
out of the room onto the canvas and lands with a squash. Two more Firecrawl
surfaces beyond the single scrape: **research a topic** (web search → a batch of
ready cards) and **crawl a site** — a durable crawl whose pages stream live into
the `CrawlStrip` (`src/components/CrawlStrip.tsx`, `usePaginatedQuery` over the
Firecrawl component's own `listPages`), each keepable into the pile. The crawl
is the realtime showcase: pages appear as Firecrawl finds them.

Mail: `buildroom@agentmail.to` is the pile's other mouth — any URL in an
email body drops in as a `dropped` row and gets Firecrawl-enriched, with the
sender shown as "Name ✉" (`convex/inbox.ts`, `docs/mail.md`).

Data note: link content is fixtures (`src/data/buildroom.ts`); votes, pins,
keeps and runtime drops persist into the pile widget's own `data`, so there is
**no new Convex table**. Replies ride `messages` under `<pileId>::link:<linkId>`.

## 1. the crew — friend group (`#7c5cff` violet)

**Status: done, plus one allowed add.** Six members, and still the most
complete space — the anatomy above was learned here. Don't clutter it.
The one add (brain play, 2026-08-31): make the existing mail brain *visible*,
and a meal-train frame so care lives here instead of a new space. (It handed
`#/` to the build room; `DEFAULT_SPACE_SLUG` in `src/lib/routes.ts` is the one
place that decides.)

| Layer | Widgets on canvas |
|---|---|
| Identity | 3 stickers ("glad", "since", smile) · media poster · quote |
| Memory | photo wall · joke registry · inside-joke note · "summer?" note · message wall |
| Now | **"Maya's bday" frame** → countdown · cake poll (matcha winning) · RSVP (4 yes) · potluck (balloons claimed, candles open) |
| Talk | daily question (3 answered) · chat threads |
| Props | SomaFM room radio · weather · link shelf · expense split · itinerary · availability |

Also: a **japan trip frame** (itinerary rebranded from tahoe, future dates —
the router's past-vs-future money/booking test), and a black `✉ ourspaces@…`
chip under the title (click copies). Mail here is **AI-filed**: a receipt
appends an expense row and decrements what someone owes, a booking appends an
itinerary day, anything unsure becomes an unfiled envelope (`convex/inbox.ts`,
spec in `docs/mail.md`). The filing is silent today — next is a `because`
sentence on the flap.

**Allowed next (do not sprawl past this):**

1. **B1** — `because` on the flap / torn slip; catch-me-up as a dated strip
   that lands on the canvas (tap pans to the widget).
2. **B4** — Now-layer frame *"jules is out this week"* (meal train on the
   potluck). No fourth space, no medical product. An emailed "I can do
   tuesday soup" files onto a slot.
3. **B2** — vision writes the note on the back of a new photo-wall print;
   a receipt photo also files, same router as email.
4. **B3** — a recipe URL in the mail becomes potluck slots, not a link card.

Demo role: two-window liveness (votes, potluck claims, cursors), the promote
climax, then the inbound brain beat (phone send → flap sentence → board
moves on the second tab).

## 2. us two — long-distance couple (`#e63da8` magenta, "an ocean apart")

**Status: has its demo beat.** Two members (ren + sky), smaller canvas
(1120×760).

Has today: countdown to next visit · "47 days to SFO" countdown · dual
clocks (two timezones — a great long-distance detail) · playlist · media ·
note · quote · sticker · the **cozy-color room** (the shared paint-by-number
postcard: both windows filling the same board live) · **letters** — mail to
`ustwo@agentmail.to` lands as a sealed kraft envelope that unfolds on click.

Needs, in priority order:

1. **daily question** — the talk layer is empty; a two-person daily q ("what
   did you eat today") is the cheapest liveness.
2. **photo wall** — the memory layer is thin; one small wall of crooked
   polaroids covers it.
3. **shared letter opening** — `sealed` is per-tab local state; flipping it
   through `updateWidgetData` would let both people watch it open.

Skin note: same widgets, softer register — fewer, larger objects, more
whitespace than the crew's clutter. Two people, not six.

## Background spaces (Home-grid set dressing only)

These exist so the gallery reads alive and personal — never demo beats.

- **the house** (`#ffb02e`) — roommates: chore wheel, rent split, groceries
  potluck, wifi quote, fridge wall.
- **game day** (`#13b8a6`) — rec league: live sports score, punishment
  wheel, pizza poll, trash-talk wall, daily q.

The hackathon (buildclub) and Tahoe (trip) stay cut. `npx convex run seed:demo`
retires leftover backend rows for both.
