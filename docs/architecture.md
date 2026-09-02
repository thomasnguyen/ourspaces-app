# How OurSpaces works

The whole system explained in prose, so you can reason about it with no
editor open — on a plane, on a borrowed laptop, from the docs alone.

- `docs/code-map.md` answers **where** something lives (file, line landmark).
- **This file** answers **what** the pieces are, **how** they fit, and
  **why** each one is shaped the way it is.
- `docs/spaces-and-widgets.md` is the product-side catalog of rooms.
- `docs/mail.md` and `docs/data-model-plan.md` go deeper on mail and schema.

The last two sections are working briefs for the two things most likely to
be designed away from the code: **vision** and **video**. They list what
already exists, the real constraints, and the exact seams to plug into.

---

## 1. The 30-second model

A **space** is a friend group's shared room. A room is an infinite-ish
**canvas**. Everything on the canvas is a **widget** — a poll, a countdown,
a photo pile, a sealed letter, a link card. Widgets are rows in one Convex
table; the canvas is a reactive query over that table. Two browsers open on
the same space see the same board, live, with no sync code — that is the
entire trick, and it is Convex's, not ours.

On top of that: every space has a **real email address**. Mail sent to it is
read by a model, which decides what it means and mutates the canvas —
a receipt becomes an expense row, a booking becomes an itinerary day, a love
letter becomes a sealed envelope you click to open. The space then **replies
to the sender** saying what it did.

Three inputs write to a canvas: **people** (clicks, drags, chat), **email**,
and **URLs** (Firecrawl turns a link into a card, a search into a pile of
cards, a whole site into a live-streaming crawl).

---

## 2. Two runtimes: mock and live

This is the single most confusing thing about the codebase, and the thing
you will most likely forget offline.

There are **two complete implementations of the canvas**:

| | Mock | Live |
|---|---|---|
| Entry | `src/App.tsx` (~2470 lines, one giant `App()`) | `src/pages/LiveSpace.tsx` (~2170 lines) |
| Data | in-memory fixtures from `src/data/` | Convex reactive queries |
| Trigger | `?mock=1`, `#/...?mock=1`, or `VITE_DATA_MODE=mock` | default when `VITE_CONVEX_URL` is set |
| Decided by | `src/live/dataMode.ts` → `getDataMode()` | same |
| Good for | screenshots, design work, no backend needed | everything real |

They are twins, not layers. A widget interaction usually has to be written
twice — once against local `useState`, once against a Convex mutation. When
a doc says "verified in mock mode", it means the pixels are right and
nothing about the backend was exercised.

**The fixtures are also the seed.** `convex/seed.ts` imports
`SPACES_BY_ID`, `CREW_WIDGETS`, `COUPLE_WIDGETS` and the chat threads
straight out of `src/data/`. So the mock fixtures are not a throwaway
prototype — they are the source of truth that populates the live database.
Change a fixture and re-seed, and the live room changes too.

The five spaces (`src/data/spaces.ts` → `SPACES`, `meta.id` becomes the
slug):

| Slug | Name | Color | What it is |
|---|---|---|---|
| `buildroom` | the build room | `#ff7c42` orange | dev guild — links, ships, roundtables. `#/` lands here (`DEFAULT_SPACE_SLUG`) |
| `crew` | the crew | `#e9369d` magenta | friend group / birthday HQ — the most complete room |
| `couple` | us two | `#e63da8` pink | long distance — clocks, countdowns, letters, coloring |
| `house` | the house | `#ffb02e` amber | roommates — chores, rent split |
| `league` | game day | `#13b8a6` teal | sports — scores, punishment wheel, trash talk |

Three of them have real inboxes (`convex/agentmail.ts`, `ensureShowcaseInboxes`):
`crew → ourspaces@`, `couple → ustwo@`, `buildroom → buildroom@`. AgentMail's
free tier caps the account at **3 inboxes total**, which is why `house` and
`league` have none and why "just make another inbox" is never the answer.

---

## 3. The data model

Ten tables, all in `convex/schema.ts`. Everything reactive flows through them.

**`spaces`** — one row per room. `name`, `type` (`ongoing` | `event`), `icon`,
`color`, `slug`, `canvasW/H`, `tagline`, timestamps. Plus three fields that
are really pointers into subsystems: `inboxId`/`inboxAddress` (AgentMail),
`askThreadId` (the agent component's conversation thread), `ragIndexedAt`
(when the semantic index was last refreshed). Indexed by name, slug, inbox.

**`widgets`** — the canvas. `spaceId`, `type` (open string), `x/y/w/h/z`,
optional `rotate`, `createdBy`, `createdAt`, and `data`. A **frame is just a
widget** with `type: "frame"` — there is no grouping table; membership is
computed geometrically (`src/lib/frameMembership.ts`).

`data` is the interesting part. It used to be `v.any()`. It is now a
**discriminated union** in `convex/widgetData.ts`: twelve real shapes typed
properly (`poll`, `note`, `decision`, `countdown`, `linkCard`, `letter`,
`photoWall`, `expenseSplit`, `itinerary`, `potluck`, `rsvp`, `dailyQ`) plus
`v.record(v.string(), v.any())` as a permissive fallback for the other
~eighteen types no backend code reads into. The shapes were reverse-engineered
from every actual producer, not designed up front. Note the wrinkle: `type`
lives on the widget row, not inside `data`, so TypeScript can't narrow the
union from `widget.type === "poll"` — call sites cast through the exported
`PollData` / `LetterData` / etc. types.

**`messages`** — chat. `widgetId` is `"global"` or the widget the thread
hangs off, which is how one table serves global chat, per-widget threads,
photo comments (`<widgetId>::photo:<id>`), reading-circle questions
(`<widgetId>::q:<id>`) and the recap follow-up thread (`"recap"`) with no
schema change. Has a **full-text search index** (`search_text` on `text`,
filtered by `spaceId`) and is read with **real cursor pagination**.

**`members`** — who is in a space: `userId` (a plain string, see below),
`name`, `color`, `emoji`, `avatarUrl`, `lastSeen`.

**`votes`** — one row per (widget, user, option), with a `by_widget_user`
index enforcing one vote per person.

**`presence`** — ephemeral cursors. `x/y`, `updatedAt`, identity fields, an
optional `zone` (unset = canvas world coords; `cozy:<boardId>` = the coloring
room, normalized 0..1), and an embedded **`gesture`** object describing a live
move/resize in flight. Swept by a cron every minute.

**`emailEvents`** — every mail in and out. `direction`, `from`, `to`,
`subject`, `summary`, `body`, the resulting `widgetId`, AgentMail's own
`messageId`/`threadId` (so the router can reply in-thread and label), and
`because` — the one-sentence reason the router files on the canvas.

**`paintMarks`** — the collaborative coloring room. One row per stroke or
per filled region (`regionId`), with a `tone` and an optional shared `preset`.

**`recaps`** — generated "catch me up" briefings. `kind` is `daily` or `ask`;
`lines` each carry optional `widgetId`/`messageId` citations.

**`linkRefreshQueue`** — the batch-worker's queue of stale link cards.
Cursor is `v.commitTs()`, i.e. commit order, not a wall-clock read.

**Identity is not auth.** `userId` is `v.string()` everywhere. Today it's a
session UUID from `src/live/identity.ts` plus a claimed name/color/emoji;
seeded people are literal strings like `"seed:crew:maya"`. There are no
`authTables`. Guest-or-join (Anonymous by default, Passkey to upgrade the
same `members` row, never a login wall) is **decided and specced** in
`docs/data-model-plan.md` §1 but **not built**.

---

## 4. The canvas

Widgets are created, moved, resized and edited through ordinary Convex
mutations in `convex/widgets.ts` and `convex/spaces.ts`. Every open tab is
subscribed to `by_space`, so a write lands everywhere at once. There is no
optimistic-update layer, no client store, no reconciliation — a drag writes
through presence (below) and commits on release.

Widget rendering: `src/components/WidgetCard.tsx` is the shell (drag, resize,
thread chip, focus), and the bodies live in `src/widgets/core.tsx` (sticker,
frame, countdown, poll, note…), `src/widgets/extras.tsx` (rsvp, dailyQ,
expense, itinerary, letter, link card, quote, weather, sports, playlist…) and
`src/widgets/buildroom.tsx` (`linkPile`, `hotLinks`, `shipPost`, `roundtable`).
About thirty types exist; the catalog with product intent is in
`docs/spaces-and-widgets.md`.

Several widgets zoom into **rooms** — full-screen `<dialog>` shells that grow
out of the card that opened them (`src/components/CanvasRoom.tsx`, driven by
`--room-origin-*` CSS vars): the reading room, the ship room, the photo
gallery, the coloring room.

---

## 5. Presence: two systems, deliberately

This looks like duplication and isn't.

**`convex/presence.ts`** — hand-rolled, and the hot path. ~90ms writes carry
cursor position *and* the in-flight `gesture` (which widget, move or resize,
its live x/y/w/h/z). Other tabs render your drag from that gesture. Critically,
`claimGesture` / `updateGesture` / `finishGesture` **double as the widget
commit and lock arbitration mechanism** — two people can't drag the same
widget into a fight. TTLs: 30s for presence, 1.5s for a gesture.

**`convex/roomPresence.ts`** — the `@convex-dev/presence` component, used for
one thing: "who has this space open right now", shown as `· N here` on the
space rail (`src/components/Rail.tsx`, heartbeat mounted by `LiveSpace.tsx`).

They stay separate because the component tracks occupancy, not coordinates,
and has no concept of lock arbitration. Swapping the hand-rolled system for
it would mean two write paths on the hottest path in the app for no gain.

---

## 6. Chat, threads, promote

`convex/messages.ts`. Global chat and per-widget threads are the same table
keyed by `widgetId`. A message can be marked `promotable` and then
**promoted** into a real widget (`promotedWidgetId` links them) — that's the
crew demo's climax: "6pm works" stops being chat and becomes a countdown on
the board. `messages.search` does full-text search over a space's chat.

---

## 7. The mail brain

The most product-defining subsystem. Full spec in `docs/mail.md`.

### The pipe

```
inbound email
  → AgentMail
  → POST /api/agentmail/webhook              (convex/http.ts)
  → svix HMAC verify (hand-rolled WebCrypto)
  → components.agentMail.lib.ingestWebhook   (dedup + inbound store)
  → emailEvents row                          (convex/agentmail.ts)
  → router                                   (convex/inbox.ts)
  → widget mutations                         → every open tab updates
  → ackInbound: reply in-thread + label the message
```

### The component

`convex/components/agentMail/` is **our own first-party Convex component**,
not a package. The published `@agentmail/convex` 0.1.0 is unusable: its
actions never resolve through `ctx.runAction` (nested workpool subcomponents
break the reference) and it declares no env schema, so the API key needed a
hand-patch in `node_modules`.

Ours has three deliberate properties:
1. **No nested workpool** — that was the hang.
2. **The API key is passed in as an argument on every call**, because
   component functions cannot read `process.env`. That seam is the whole fix.
3. It **owns its own tables**: `events` (webhook dedup — AgentMail redelivers)
   and `inboundMessages` (every inbound message, reactively queryable per
   inbox). Only AgentMail's own string ids cross the boundary, never a
   `v.id()` from the app.

It wraps `createInbox`, `sendMessage`, `replyToMessage`, `addLabels`,
`ingestWebhook`, `listInbound`. `convex/agentmail.ts` holds the thin app-side
wrappers. `fetch()` runs in the default Convex runtime, so no `"use node"`.

### The router — `convex/inbox.ts`

`processInbound` branches on the space's slug:

- **`couple`** → the email *is* the artifact. It becomes a sealed kraft
  `letter` widget (envelope with flap, seal, stamp; click to unfold). Letters
  stack with a per-letter positional drift and a hash-derived rotation so the
  pile looks organic.
- **`buildroom`** → pull URLs out of subject + body, prepend them to the link
  pile as `pending` rows, then Firecrawl-enrich each one **sequentially**
  (each patch read-modify-writes the same pile document, so parallel would
  clobber).
- **everything else** → `routeSmart`, the actual brain.

`routeSmart` builds a **live inventory of the canvas** — every
`expenseSplit` (title, people, total), `itinerary` (title, day labels),
`frame` and `countdown`, each with its real widget id — and hands it to the
model with the email. The model returns one JSON object:

```json
{"action":"expense"|"itinerary"|"create"|"unfiled"|"discard",
 "widgetId":"...","kind":"...","title":"...",
 "expense":{"who":"...","amount":0,"label":"..."},
 "day":"nov 8","plan":"...","because":"..."}
```

- **expense** → append/merge a split row, decrement what that person owes,
  bump the total, stash `lastEmail`. Creates the tracker if none matches.
- **itinerary** → append a day. Creates the itinerary if none matches.
- **discard** → spam, nothing lands.
- **unfiled** (or the model was unsure or unavailable) → a sealed envelope on
  the canvas you open and file by hand. This is the safety net: the router
  never guesses loudly.

Past-vs-future is the test that makes the demo legible: money about a past
trip goes to that trip's tracker; a booking with future dates goes to the
itinerary. The crew canvas carries a past *tahoe* IOU set and a future
*japan* frame side by side on purpose.

### `because` — the visible reason (brain play B1, half shipped)

The same model call returns `because`: one sentence the group reads on the
canvas, in the voice of a friend who just moved something for them. The prompt
is strict — all lowercase, ≤10 words, no period, state what is now *true* for
the group rather than what the model did, use first names, and **never name
anything on the board** ("tracker", "itinerary", "poll", "canvas" are all
banned) and never include ids. `cleanBecause()` then strips Convex ids,
quotes and trailing punctuation as a second line of defense.

Good: `this clears jules' tahoe iou` · `nov 8 has a dinner now`.
Bad: `filed the receipt to the expense widget`.

It persists in three places — `emailEvents.because`, `letterData.because`,
and `lastEmail.because` on expense/itinerary — and renders through
`BecauseSlip` (`src/widgets/extras.tsx`) two ways: **tucked** (a paper chip
hanging off the envelope) and **pinned** (a footer line inside the receipt;
cards have a clip-path and fixed height, so a padded chip overruns by ~4px —
hence two variants).

### The acknowledgement

`ackInbound` replies **in the same thread** ("Logged $84 from Sam on the
expense tracker.", "Dropped 3 links into the build room pile.") and **labels**
the message with the router's verdict: `receipt`, `booking`, `letter`,
`links`, `spam`, `filed`. This is why `emailEvents` needed `messageId` and
`threadId`.

### Outbound: the weekly digest

`convex/digest.ts`, Friday 16:00 UTC. Recipients are **everyone who has ever
emailed that space's inbox** — mailing the space subscribes you to its week.
The cron path is a **durable workflow** (recipients → board snapshot → LLM
compose → send), each step retried independently so a restart mid-run doesn't
lose progress. The manual `sendNow` demo trigger keeps a simpler
action-retrier path, because a demo wants a synchronous-looking result.

---

## 8. Firecrawl: three surfaces

`convex/firecrawl.ts`, on `@firecrawl/firecrawl-convex`.

1. **Scrape one URL** → `scrapeLink`. Returns a small stable payload
   (title, description, imageUrl, siteName, author, publishedAt, plus HN
   metadata). It asks Firecrawl for `markdown`, `summary`, `images` and a
   **JSON extraction with a prompt**, then falls back field by field through
   extracted → og metadata → summary → markdown → a canned line, so a card is
   never blank. Hacker News links get special handling: an HN item URL points
   at a comments page, so it resolves the story via the HN Firebase API and
   scrapes the *article* while keeping points/comment count.
   Behind the plain-looking call: `ActionCache` (1h TTL, keyed by URL) in
   front of `ActionRetrier` (2 retries, backoff), polled to completion so
   callers still see an ordinary action.
2. **Search a topic** → `searchTopic`. One query → up to N web results
   shaped exactly like link cards, dropped into the reading-room pile.
   Driven by the research bar in `ReadingRoom.tsx`.
3. **Crawl a site** → `crawlSite`. A durable crawl; pages land in the
   Firecrawl component's own tables. The UI **subscribes** rather than
   copying — `listCrawlPages` is a paginated reactive query feeding
   `usePaginatedQuery` in `src/components/CrawlStrip.tsx`, so pages appear as
   Firecrawl finds them and each is keepable into the pile.

---

## 9. The AI layer

**Read this before planning anything model-shaped.** `convex/ai.ts` is the
only place models are configured.

### Which model, and where it runs

| Use | Model | Route |
|---|---|---|
| Chat / structured decisions (primary) | `@cf/openai/gpt-oss-120b` | RoomDone's shared Cloudflare Worker proxy, OpenAI-shaped `/v1`, via `AI_PROXY_URL` + `AI_PROXY_TOKEN` |
| Chat fallback | `gpt-4o-mini` | OpenAI directly, via `OPENAI_API_KEY` |
| Embeddings (rag only) | `text-embedding-3-small`, 1536 dims | **OpenAI directly, always** — the proxy has no `/v1/embeddings` route |

`chatTarget()` prefers the proxy and silently falls back to OpenAI; if
neither is configured it returns `null` and **every caller degrades to canned
output rather than erroring**. That fallback discipline is load-bearing for
demos: pull the keys and the app still runs, just less smart.

### The one entry point

```ts
completeJson({ system, user, temperature }) -> Record<string, unknown> | null
```

It posts `messages: [{role:"system", content: <string>}, {role:"user",
content: <string>}]` and parses JSON out of the reply, with a brace-slicing
salvage path when the model wraps its JSON in prose. `response_format:
json_object` is only set on the **direct OpenAI** path — gpt-oss on the proxy
rejects the extra guided-JSON field, so there it's prompt-only.

**`content` is a plain string.** There is no multimodal parts array anywhere
in this codebase. That is the single fact that shapes the vision brief below.

### The three consumers

- **`completeJson` directly** — the mail router (`inbox.ts`), the recap and
  digest composers, and `questions.ts` (two conversation starters per saved
  article; OpenAI as a structured decider, never a chatbot UI, with a canned
  pair as fallback and an ActionCache keyed by title+description).
- **`languageModel()`** — the same backend wrapped as an AI SDK model for the
  **agent component** (`convex/agent.ts`, `askAgent`). "Ask the space" runs on
  a durable per-space thread (`spaces.askThreadId`) so follow-ups have real
  conversational memory instead of being stateless one-shots. Its instructions
  pin it hard: 1–2 sentences, lowercase, cite at most one real widget or
  message id, never invent one, **never write to the canvas**.
- **`embeddingModel()`** — **rag** (`convex/rag.ts`). Indexes each space's
  widget summaries plus recent chat into a per-space namespace, keyed
  `widget:<id>` / `message:<id>` so re-adding replaces rather than duplicates.
  Re-indexes if staler than 5 minutes, then semantic-searches the top 6 chunks
  above a 0.4 score threshold and returns ready-to-prompt text. Returns `null`
  when unconfigured and every caller skips instead of crashing.

### Streaming

`convex/streaming.ts` + `POST /api/ask-stream`. The persistent-text-streaming
component streams the agent's answer token by token over HTTP and persists it,
so a reload or a second viewer sees the same answer. It grounds each question
with rag and the board snapshot in parallel before streaming.

It is **verified but not the default UI path** — `ActionDock` still uses its
existing fake-reveal animation, because real streaming is a genuinely
different data flow and swapping it was judged not worth the regression risk
for a cosmetic change.

---

## 10. Catch me up, and the recap

`convex/recap.ts` is the biggest backend file (~530 lines) and the most
prompt-heavy.

`snapshot()` turns a whole space into a compact digest: each widget
summarized by type (a poll becomes `matcha: 4; chocolate: 2`, a potluck
becomes `taken: … open: …`, an rsvp becomes `in / out / waiting`), plus
recent chat with a `promoted` flag, plus the recap follow-up thread. Poll
tallies come from the **aggregate** component in one batched O(log n) call
instead of collecting vote rows.

Two modes:
- **daily** (cron, 15:00 UTC, fanned out through a **workpool** capped at 3
  concurrent LLM calls) → 2–4 lines, each under 18 words, lowercase, each
  citing a real `widgetId` or `messageId`.
- **ask** → one follow-up, answered through the agent thread + rag.

Every path has a hand-written **canned fallback** (`cannedRecap`,
`cannedPollLine`, `cannedPotluckLine`, `cannedAsk`) that reads the snapshot
with regexes and produces a plausible line with no model at all. The demo
survives an API outage.

Today the recap renders in a panel. The decided-but-unbuilt next step (B1)
is that it lands **on the canvas** as a dated strip where tapping a line pans
to the widget it cites.

---

## 11. The infrastructure components

Each of these earns its place; none is decorative.

- **migrations** (`migrations.ts`) — backfills the `unfiled` field on letters
  seeded before the router set it explicitly.
- **aggregate**, two named instances (`votes.ts`, `spaces.ts`) — `pollTallies`
  gives O(log n) per-option vote counts, `memberCounts` gives O(log n) member
  counts per space. Both replace `.collect()`-and-count, and both are wired
  into every insert/delete site for their tables.
- **sharded-counter** (`stats.ts`) — global live totals (spaces 4 shards,
  widgets 8, messages 16) for the landing page's "live backend" widget. Sharded
  because every session everywhere can write at once and a single counter
  document would serialize them.
- **rate-limiter** (`rateLimits.ts`) — token buckets on everything that costs
  money or hits a free tier: `sparkQuestions` and `recapAsk` 5/min,
  `recapGenerate` 3/min, `mailSend` 10/hour (AgentMail's cap), `paintStroke`
  60/min per user. Keyed by **space**, not user, since there's no auth yet.
  Paint strokes **fail soft** — a dropped stroke beats an error toast on a
  live drawing surface.
- **action-retrier** — Firecrawl scrapes and AgentMail sends.
- **action-cache** — scrape-by-URL (1h TTL, matching Firecrawl's own
  `maxAge`) and questions-by-(title, description) (no TTL — starters for the
  same article don't go stale).
- **workpool** — bounds the daily recap fan-out to 3.
- **workflow** — the durable weekly digest.
- **batch-worker** (`batch.ts` + `linkRefreshQueue`) — drains stale link
  cards back through the cached/retried scraper a few at a time. Enqueued
  Friday 17:00 UTC.
- **presence** — room occupancy (§5).
- **static-hosting** — serves the built frontend. Note `httpPrefix`: static
  hosting owns `/`, so **our own HTTP endpoints live under `/api`**.
- **prosemirror-sync** and **better-auth** are installed in
  `convex.config.ts` but **not used** — no collaborative editor, no auth.

Crons (`convex/crons.ts`): presence sweep every minute · daily recap 15:00 ·
weekly digest Friday 16:00 · stale-link refresh Friday 17:00.

---

## 12. Files and images

Small and worth knowing exactly, because it's the foundation for vision.

`convex/photos.ts`:
- `generateUploadUrl()` — client POSTs the bytes straight to Convex storage.
- `storageUrl(storageId)` — returns a **public URL**.
- `addPhoto({widgetId, storageId, caption, by})` — prepends a photo onto a
  `photoWall` widget's `data.photos[]`, giving it a rotation from a fixed
  tilt cycle so the pile stays organic.

A photo object is `{ id (the storageId), caption, date, by, rotate, src,
thumbnailSrc, addedAt }`. `src` and `thumbnailSrc` are the same URL for
uploads; the seeded crew photos point at static files in `public/photos/`.

Client side, `LiveSpace.tsx` does upload → `storageId` → `getUrl` → persist
the URL in widget data, for both photo-wall prints and ship-post cover
images. `PhotoWallGallery.tsx` is the full-screen room; each print has its own
comment thread keyed `<widgetId>::photo:<photoId>`.

The `media` widget type is a **single pinned photo** (`src`, `thumbnailSrc`,
`caption`, `date`) — a still image, not a player.

---

## 13. The frontend, briefly

- `src/main.tsx` picks the mode and mounts.
- `src/App.tsx` — mock canvas + the camera system: `applyCanvasScale`,
  `animateCanvasCamera`, the focus system (`focusCameraTarget`, `leaveFocus`,
  `focusFrame`, `focusWidgetThread`), block zoom, hash routing.
  **Naming trap: "camera" in this codebase means canvas pan/zoom, never a
  device camera.**
- `src/pages/LiveSpace.tsx` — the live twin: all the Convex hooks, upload
  handlers, room open/close, presence wiring.
- `src/live/` — `useLiveHandlers.ts` (widget CRUD against Convex),
  `usePresence.ts` (cursors + gesture lifecycle), `identity.ts` (session
  identity and the claim card), `dataMode.ts`, `useSpaceData.ts`.
- `src/lib/` — pure helpers: `linkRanking.ts` (tag facets, hotness),
  `buildRoomFeed.ts`, `widgetDefaults.ts` (default sizes per type),
  `blockZoom.ts`, `flipLanding.ts`, `entrance.ts`, `sounds.ts`, `radio.ts`
  (SomaFM shared station).
- `src/index.css` — one large file; **all design tokens live in `@theme`**.
  No hex literals in components. Motion follows the house system (three
  easing curves, a six-step duration scale) documented in the local
  eye-candy skill.

---

## 14. Environment and deployment

Declared in `convex.config.ts` (`app.env`), set on the deployment with
`npx convex env set`, never in `.env.local` and never committed:

- `FIRECRAWL_API_KEY` (required), `FIRECRAWL_WEBHOOK_SECRET`
- `AGENTMAIL_API_KEY` (required), `AGENTMAIL_WEBHOOK_SECRET`
- `AI_PROXY_URL`, `AI_PROXY_TOKEN` — the Cloudflare chat proxy
- `OPENAI_API_KEY` — chat fallback *and* the only route to embeddings

Dev deployment is where everything has been verified. Prod is
`necessary-cobra-892`; the site origin is
`https://necessary-cobra-892.convex.site`. **The prod mail cutover is still
open** — it needs a second AgentMail webhook, keys set with `--prod`, and
`setSpaceInbox` to bind existing addresses to prod space ids. Do **not**
create new inboxes (the 3-inbox cap). Steps live in
`docs/firecrawl-agentmail-setup.md`.

Build/typecheck is `npm run build`. There are no tests, by explicit decision.

---

## 15. What's real vs what's staged

Worth knowing before you plan a demo around something.

**Real, verified live:** inbound mail → canvas mutations, in all three
personalities · reply-in-thread + labels (shipped; the live round trip has
not been re-verified since the component swap) · the weekly digest delivered
to a real Gmail · Firecrawl scrape, search and crawl · rag semantic search ·
the agent thread's memory across follow-ups · token streaming over
`/ask-stream` (curl-verified) · presence, cursors, gestures · paint sync ·
photo upload → storage → live pile.

**Real but not the UI path:** token streaming (ActionDock still animates a
reveal).

**Staged / fixture:** the crew's six members are seeded strings, not real
users — one live visitor drives the demo · mock mode fakes link enrichment
and recap replies entirely · the build room's shipping wall uses people-photos
rather than real product screenshots.

**Decided but not built:** guest-or-join auth · the recap strip landing on
the canvas · the meal-train frame · vision on prints · Firecrawl writing
widgets rather than cards.

---

## 16. Brainstorm brief — vision

**Where this is going (B2, decided, not built):** vision writes the note on
the back of a photo-wall print, and a photographed receipt files through the
same router as an emailed one.

### What already exists

- Images already get **public URLs** from `ctx.storage.getUrl()`. That is
  exactly the shape an `image_url` message part wants. **No new storage work
  is needed.**
- The mail router already defines the **output schema** you'd want a vision
  call to produce: `{action, widgetId, kind, title, expense{who, amount,
  label}, day, plan, because}`. A receipt photo should return that same
  object, so it can reuse `applyExpense` / `applyItinerary` / `addLetter`
  untouched.
- `because` already exists end to end, with a written voice spec and a
  renderer (`BecauseSlip`, tucked and pinned variants). A vision note can
  ride the same rails.
- The fallback discipline is established: `completeJson` returns `null` and
  callers degrade. Any vision path should do the same, not throw.
- action-cache, action-retrier and rate-limiter are all in place and are the
  obvious wrappers for an image call.

### The real constraints

1. **`completeJson` sends `content` as a plain string.** Vision needs the
   parts array (`[{type:"text"}, {type:"image_url", image_url:{url}}]`).
   Either extend `completeJson` to accept parts, or add a sibling
   `completeVision()`. Extending is cleaner but touches every existing caller's
   type; a sibling is the lower-risk move.
2. **The primary model can't see.** `@cf/openai/gpt-oss-120b` on the shared
   proxy is text-only. Vision must go **direct to OpenAI** with
   `OPENAI_API_KEY` (`gpt-4o-mini` handles images). There is already precedent
   for exactly this exception — rag's embeddings — so it's a known-good shape,
   not a new pattern. Consequence: **vision does not work when only the proxy
   is configured**, so it needs a canned/skip path like everything else.
3. **Emailed photos don't arrive yet.** The webhook only reads
   `message.text`/`preview`, and the component's `inboundMessages` table
   stores text with no attachment field. "Email a receipt photo" therefore
   depends on attachment support first: webhook parse → component schema →
   probably pulling bytes into Convex storage. That is a real prerequisite
   and it is currently on the explicit not-doing list. **Uploading a photo
   in the app has no such dependency** — that path is clear today.
4. **`photoWallData` is a typed union arm.** Adding a `note` (or `visionNote`)
   field to a photo means editing `convex/widgetData.ts`, not just writing a
   new key — the validator will reject unknown fields on typed arms.
5. Cost and latency are per-image, and the photo pile is the one surface where
   someone might drop ten at once. Cache by `storageId` (the same image never
   needs describing twice) and add a rate-limiter bucket.

### The seams, concretely

| To do this | Touch |
|---|---|
| Describe an uploaded print | `photos.addPhoto` schedules an action after the patch |
| Make the vision call | new `completeVision()` in `convex/ai.ts`, OpenAI-direct |
| Store the note | a field on the photo object in `photoWallData` (`widgetData.ts`) |
| Show it | `PhotoWallGallery.tsx` (back of the print), `BecauseSlip` for voice |
| File a photographed receipt | reuse `routeSmart`'s JSON schema → existing `applyExpense` |
| Emailed photos | webhook attachment parse → component schema → storage (**prereq**) |

### Open questions worth deciding on the plane

- Is the note in the **group's voice** (like `because`) or the photo's
  caption voice? They're different registers and the prompt spec for the first
  one already exists.
- Does vision **write** to the canvas, or only annotate? Everything AI-facing
  so far either files (mail) or explicitly never writes (the agent).
- One image at a time, or a batch describing a whole pile in one call?
- What's the fallback line when there's no key — silence, or a caption echo?

---

## 17. Brainstorm brief — video

Two different things are called "video". Decide which one you're planning.

### A. The demo tape (most likely what you mean)

Nothing in the code needs to change; this is a shot list. The rooms were
built with specific beats in mind, and they're scattered across docs — here
they are together:

- **The crew** — two-window liveness (votes, potluck claims, cursors moving),
  then the **promote climax**: a chat line becomes a widget on the board.
  Then the inbound brain beat: send mail from a phone → the flap sentence
  appears → the board moves on the second tab.
- **The build room** — the volume story (47 links that don't wreck the
  canvas), a live Firecrawl paste, and the **keep-takeaway climax** where the
  note physically flies out of the reading room onto the canvas and lands
  with a squash. Now also: research-a-topic and a live crawl streaming pages
  into `CrawlStrip`.
- **Us two** — distance made physical: clocks, countdown, coloring together,
  and a sealed letter arriving by email and unfolding.
- **The arrival choreography is the known gap.** Emailed widgets currently
  *reactive-pop* into place. The stated money shot is a split screen: send
  from a phone, watch it **land** — envelope drop, house motion, sound. It's
  goal 1 in `docs/mail.md` and it is not built.
- Clips were planned as batch-recorded MP4s; the calendar for that lives in
  the local playbook, not here.

Things to remember while planning shots: mock mode (`?mock=1`) gives you a
perfect-looking canvas with no backend, which is great for b-roll and lies
about liveness. Anything claiming "live" should be shot in live mode with two
real windows.

### B. Video as a product feature

There is **none today** — no `getUserMedia`, no `MediaRecorder`, no `<video>`
element, no `.mp4`/`.webm` handling anywhere in `src/` or `convex/`. The
`media` widget is a still photo. Every "camera" in the code is the canvas
pan/zoom camera.

If you want to design it in, the honest constraints:

- **Upload is free.** `generateUploadUrl` takes any content type; a video
  upload is the same three-step dance as a photo (upload → storageId →
  `getUrl` → persist URL in widget data). A `video` widget rendering a
  `<video>` tag off a stored URL is genuinely small.
- **Everything else is not.** No transcoding, no thumbnail extraction, no
  duration probe, no poster frame. Convex storage stores bytes; it doesn't
  process media. A first version has to accept whatever the phone produced.
- **Live video is a different universe.** Convex gives you reactive documents,
  not media streams. Anything call-shaped means a third-party WebRTC service
  and a signalling path this app has no shape for. That is out of scope for
  the current build in any honest reading.
- **The cheap, in-character version:** a short **video note** — a few seconds,
  uploaded like a photo, landing on the wall as a print that plays on hover
  or tap. It reuses the photo pipeline exactly, keeps the paper metaphor, and
  is the only video idea that fits the existing material language.
- **The vision tie-in:** one extracted frame → the same vision path in §16 →
  a `because`-voiced note on the back. That makes video a variation on the
  photo brain rather than a new subsystem, which is the only way it earns
  its keep.

---

## 18. Guardrails — decided, don't undo on the plane

These are settled decisions recorded in `docs/todos.md` § Decisions. They
exist because each was already argued once.

- **No chatbot UI.** The models are structured deciders and filers. The agent
  explicitly never writes to the canvas.
- **No login wall.** Guest is a complete product; join is "I'm this person",
  not "unlock the app".
- **No new spaces** for new ideas — care lives as a meal-train frame on the
  crew, not a fourth room or a health product.
- **No more reading-circle questions.** Ground the existing ones or leave them.
- **No tests**, B/C-grade code is fine, `npm run build` is the check.
- **Design is locked:** tokens in `src/index.css` `@theme`, no hex literals,
  no glassmorphism, Plus Jakarta Sans only.
- **Don't clutter the crew.** It's the most complete room; the only sanctioned
  additions are the brain-play beats (B1 → B4 → B2 → B3).
