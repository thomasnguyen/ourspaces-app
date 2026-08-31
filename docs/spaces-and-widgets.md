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
backendLive.

**Build room** (`buildroom.tsx`): linkPile · hotLinks · shipPost · roundtable.
All four are pure and read one `BuildRoomFeed` prop; keepers reuse `note` with
`data.title` + `data.pin`.

**To build** (the only real engineering left, per PRD §8):

- **paint** — tiny shared pixel canvas, both cursors coloring the same cells
  live. The couple-space demo beat and the purest Convex flex. Fixed grid,
  few colors, one mutation per stroke. No brushes, layers, or undo.
- **linkCard discussion layer** — the Firecrawl-powered URL → title, image,
  summary card is built. Add two OpenAI-generated questions and live upvotes
  for the full article-club beat. Distinct from `linkShelf`, which remains a
  static prop list of links. *(The build room's pile now does the upvote +
  discussion half — see §0.)*

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
(a multi-url paste still works), a **tag row** above the
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
out of the room onto the canvas and lands with a squash.

Data note: link content is fixtures (`src/data/buildroom.ts`); votes, pins,
keeps and runtime drops persist into the pile widget's own `data`, so there is
**no new Convex table**. Replies ride `messages` under `<pileId>::link:<linkId>`.

## 1. the crew — friend group (`#7c5cff` violet)

**Status: done.** Six members, and still the most complete space — the anatomy
above was learned here. Don't add — protect. (It handed `#/` to the build room;
`DEFAULT_SPACE_SLUG` in `src/lib/routes.ts` is the one place that decides.)

| Layer | Widgets on canvas |
|---|---|
| Identity | 3 stickers ("glad", "since", smile) · media poster · quote |
| Memory | photo wall · joke registry · inside-joke note · "summer?" note · message wall |
| Now | **"Maya's bday" frame** → countdown · cake poll (matcha winning) · RSVP (4 yes) · potluck (balloons claimed, candles open) |
| Talk | daily question (3 answered) · chat threads |
| Props | SomaFM room radio · weather · link shelf · expense split · itinerary · availability |

Demo role: two-window liveness (votes, potluck claims, cursors), the promote
climax, the AgentMail follow-up sequence.

## 2. us two — long-distance couple (`#e63da8` magenta, "an ocean apart")

**Status: identity layer done, needs its demo beat.** Two members (ren + sky),
smaller canvas (1120×760).

Has today: countdown to next visit · "47 days to SFO" countdown · dual
clocks (two timezones — a great long-distance detail) · playlist · media ·
note · quote · sticker.

Needs, in priority order:

1. **paint** — the demo beat. The cameo shot is the two of them coloring the
   same canvas from two windows. This is the "something to *do* together"
   answer for long distance.
2. **daily question** — the talk layer is empty; a two-person daily q ("what
   did you eat today") is the cheapest liveness.
3. **photo wall** — the memory layer is thin; one small wall of crooked
   polaroids covers it.

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
