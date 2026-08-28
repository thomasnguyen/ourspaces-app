# Spaces & widgets

The three demo verticals, what's on each canvas today, and what each still
needs. Source of truth for seed content is `src/data/spaces.ts` (+ `chat.ts`
for threads); widget components live in `src/widgets/core.tsx` and
`extras.tsx`. The crew is the reference — it's the most complete space, and
its anatomy is the pattern the other two should follow.

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
| **Props** | Set dressing, camera pans past | playlist, weather, link shelf, expense split, itinerary, availability |

## Widget catalog (all built unless marked)

**Core** (`core.tsx`): sticker · frame · countdown · poll · potluck · chat ·
note · media.

**Extras** (`extras.tsx`): wheel · dualClock · dailyQ · rsvp · decision ·
availability · photoWall · linkShelf · playlist · jokeRegistry ·
expenseSplit · itinerary · messageWall · quote · weather · sports ·
backendLive.

**To build** (the only real engineering left, per PRD §8):

- **paint** — tiny shared pixel canvas, both cursors coloring the same cells
  live. The couple-space demo beat and the purest Convex flex. Fixed grid,
  few colors, one mutation per stroke. No brushes, layers, or undo.
- **linkCard** (Firecrawl) — drop a URL, it unfurls into a rich card:
  scraped title, image, summary, a couple of discussion questions, live
  upvotes (the `votes` table already covers this; backend hooks exist in
  `convex/firecrawl.ts`). The buildclub demo beat. Distinct from
  `linkShelf`, which is a static prop list of links.

---

## 1. the crew — friend group (hero, `#7c5cff` violet)

**Status: done.** Six members, the demo's home base. Don't add — protect.

| Layer | Widgets on canvas |
|---|---|
| Identity | 3 stickers ("glad", "since", smile) · media poster · quote |
| Memory | photo wall · joke registry · inside-joke note · "summer?" note · message wall |
| Now | **"Maya's bday" frame** → countdown · cake poll (matcha winning) · RSVP (4 yes) · potluck (balloons claimed, candles open) |
| Talk | daily question (3 answered) · chat threads |
| Props | playlist · weather · link shelf · expense split · itinerary · availability |

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

## 3. the hackathon (buildclub) — dev group (`#3f70ff` blue, "you're invited")

**Status: well-furnished, needs its demo beat.** Seven members, the open
room (312 visitors). Already the most frame-organized space: reading table,
shipped board, watch party, poll, wall.

Has today: backendLive counter (spaces/widgets/messages/here-now — the
"prove it's real" widget) · link shelf ("survival kit") · notes · photo
wall · media · daily question · poll · message wall (guestbook).

Needs:

1. **linkCard** (Firecrawl) — the demo beat: drop a link on the reading
   table, it unfurls to a summary card with discussion questions, someone
   answers in window B, upvotes land live. "Hacker News as a bedroom wall."
2. Optionally a **"front page" frame** where link cards cluster, sorted by
   votes — the HN joke made spatial. Visual only, cuttable.

## Background spaces (Home-grid set dressing only)

These exist so the gallery reads alive and personal — never demo beats.

- **the house** (`#ffb02e`) — roommates: chore wheel, rent split, groceries
  potluck, wifi quote, fridge wall.
- **tahoe** (`#ff7a3d`, event) — trip: countdown, expense split, itinerary,
  poll, note.
- **game day** (`#13b8a6`) — rec league: live sports score, punishment
  wheel, pizza poll, trash-talk wall, daily q.
