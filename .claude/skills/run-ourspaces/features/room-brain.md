---
route: #/space/crew
ready: room-knows-open
testids: room-knows-open room-knows room-knows-close room-knows-who room-knows-soon room-knows-decided room-knows-habits room-knows-made room-knows-line room-knows-forget room-knows-restore room-knows-told room-knows-untell room-knows-tell room-knows-tell-send room-knows-empty room-knows-honest
states:
  door: ?mock=1
  open: ?mock=1 #/space/crew/knows | wait room-knows | sleep 900
  visit: ?mock=1 #/space/crew/knows | wait room-knows | sleep 700 | click room-knows-fact-day:Saturday | sleep 1300
  forget: ?mock=1 #/space/crew/knows | wait room-knows | sleep 700 | click room-knows-line[data-key=payer:Jules] room-knows-forget | sleep 400
  told: ?mock=1 #/space/crew/knows | wait room-knows | sleep 700 | type room-knows-tell Ash is vegetarian | click room-knows-tell-send | wait room-knows-told | sleep 400
  draft: ?mock=1 #/space/crew/knows | wait room-knows | sleep 700 | type room-knows-tell Ash is vegetarian
  house: ?mock=1 #/space/house/knows | wait room-knows | sleep 900
  couple: ?mock=1 #/space/couple/knows | wait room-knows | sleep 900
  family: ?mock=1 #/space/family/knows | wait room-knows | sleep 900
  empty: ?mock=1 #/space/league/knows | wait room-knows-empty | sleep 700
  live: ?enter=1 #/space/crew/knows | wait room-knows | sleep 1500
  livedoor: ?enter=1 | sleep 1500
take:
  habit: door real 30fps 150f | 20 click room-knows-open | 75 click room-knows-fact-day:Saturday
  open: door real 30fps 90f | 15 click room-knows-open
  cross: open real 30fps 130f | 4 scroll room-knows-line[data-key=payer:Jules] | 15 click room-knows-line[data-key=payer:Jules] room-knows-forget | 80 click room-knows-restore
  tell: draft real 30fps 90f | 15 click room-knows-tell-send
  visit: open real 30fps 120f | 15 click room-knows-fact-day:Saturday
  back: open real 30fps 75f | 15 click room-knows-close
---
# What this space knows (the room's brain, as a page)

**For a user:** every room has a second side. The black chip by the room's
name, `this space knows 13`, flips the room over to its own page
(`#/space/<slug>/knows`, the room's colour, flat). On the wall: **who we
are**, the group as big face stickers (someone away sits tilted and grey
under a strip of tape, "back sunday"); and each thing the space has noticed
as the paper object a group would pin up. **coming up**: a taped tear-off
page with the days left set huge, and the sticker of whoever the countdown
names. **how we usually do things**: the week with the usual day ringed in
marker, a receipt stub for who covered the most, address slips for our
places, a tick list for who takes things on, a specimen of our own titles,
word magnets. Under each, where it came from, as stubs of the source cards
("said in 3 places · poll · availability"). **where things stand** is one
ledger sheet: each poll's votes as dots, the rsvp and split with faces.
**what it has made** lists the cards from voice asks (kept, edited, removed).
Tap an object and its words lift off in your colour and ride to the card
they came from while the camera pans; the card is ringed as they land.
`cross out` drags three marker strokes across the words in your colour,
drains the object and stamps "Thomas crossed this out" on it (`put back`
undoes it). `tell it something` drops a taped note in your colour on top of
the habits ("Kenji said so", `take back`). One line at the bottom says what
it reads and that everyone sees the same page.

**Under it:** no model writes any of this. `convex/roomBrief.ts` builds the
lines with the room brief (`buildBrief` → `knows`), each with a stable `key`
and its widget ids; `roomBrief.knows` (public query) serves the page and
`roomBrief.correct` (public mutation: tell / untell / forget / restore, with
who) stores corrections inside the room's existing `briefs` row (`facts`
JSON: `told`, `forgot`), so the schema didn't grow and a rebuild never drops
them. `roomBrief.inspect` hands the voice ask the facts **after**
corrections (`applyCorrections`, `src/lib/roomKnows.ts`): a crossed-out
payer is no longer a payer, crossed-out places are gone, and told facts ride
along as one line ("The group told us …: Ash is vegetarian (Holly said)",
8 facts × 90 chars at most) on any ask that already uses room facts. They show
in the dev context drawer under "facts sent". Habits about days, times and
words are on the page but were never sent to the ask; crossing them out only
changes the page. The objects add nothing: every number, name and title they
draw is read back out of the line's own `key`, `text` and `why` (or a
sibling line), in `RoomKnowsObjects.tsx`.

**Get there:** click `room-knows-open` in any room, or load
`#/space/<slug>/knows`. Browser back returns to the board.

**Drive:** every state above carrying `?mock=1` is the fixture page (no
writes). The mock crew starts with one told note (Kenji) and one cross-out
(Rio, the words). `visit` taps "Saturday is our usual day" and lands on the
board with its poll ringed (`.is-knows-source`). `forget` / `told` correct
on the mock screen only; `draft` has the tell field filled, ready to send.
`live` / `livedoor` are the dev-lane room (run `drive up --lane`);
corrections there are real writes to the dev `briefs` row. Takes (all
`real`, so the flip films): `habit` door → page → tap a habit → camera on
the poll; `open` the flip and the objects arriving; `cross` cross out the
payer, then put it back; `tell` the note dropping; `visit` a line riding to
its card. A line is `room-knows-line` with `data-key` (`day:Saturday`,
`payer:Jules`, `places`, `poll:<title>`, `date:<title>`, `away:<name>`,
`zones`, …).

**Code:** `src/components/RoomKnows.tsx` (`RoomKnowsPage`, `RoomKnowsDoor`,
`useSpacePage`, `visitSources`, `turnRoom` = the flip, `flyToSource`) ·
`RoomKnowsObjects.tsx` (`KnowObject` and its forms, `ToldNote`, `Portrait`,
`Face`) + `room-knows.css` · `src/lib/roomKnows.ts` (types,
`applyCorrections`, `toldLines`) · `src/lib/routes.ts` (`knowsHash`,
`spacePageFromHash`) · mock fixtures `src/data/roomKnows.ts` (crew, couple,
house, family; any other mock room shows the empty state) · mounted in
`LiveSpace.tsx` and `App.tsx`; the door is `SpaceHeader`'s `knowsDoor` slot.

**Gotchas:** the board stays mounted behind the page (that's how the camera
can already be moving as the page lifts away). The flip is a view transition
on the room's `<main>` (`view-transition-name: knows-room`, set only while
it runs); a deterministic take or a direct load of `/knows` never plays it,
and reduced motion skips it. The page's lines refresh with the brief (cron,
every 10 min on activity), so a vote cast a minute ago may not be there yet;
corrections are instant. In mock mode nothing is stored.

**Quiet by default.** "cross out" shows when the pointer is on an object
(always on touch); take recipes still click `room-knows-forget` directly.
"what it held back" is a row of paper slips with a stamp each (lime: waited
and landed · dashed: dropped or waiting · orange: didn't). A place's own
comma ("lake loop, 5 mi") stays inside its slip.
