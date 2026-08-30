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

**To build** (the only real engineering left, per PRD §8):

- **paint** — tiny shared pixel canvas, both cursors coloring the same cells
  live. The couple-space demo beat and the purest Convex flex. Fixed grid,
  few colors, one mutation per stroke. No brushes, layers, or undo.
- **linkCard discussion layer** — the Firecrawl-powered URL → title, image,
  summary card is built. Add two OpenAI-generated questions and live upvotes
  for the full article-club beat. Distinct from `linkShelf`, which remains a
  static prop list of links.

---

## 1. the crew — friend group (hero, `#7c5cff` violet)

**Status: done.** Six members, the demo's home base. Don't add — protect.

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
