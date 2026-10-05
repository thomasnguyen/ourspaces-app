---
route: #/space/crew
ready: room-knows-open
testids: room-knows-open room-knows room-knows-close room-knows-who room-knows-soon room-knows-decided room-knows-habits room-knows-made room-knows-line room-knows-forget room-knows-restore room-knows-told room-knows-untell room-knows-tell room-knows-tell-send room-knows-empty room-knows-honest
states:
  door: ?mock=1
  open: ?mock=1 #/space/crew/knows | wait room-knows | sleep 900
  visit: ?mock=1 #/space/crew/knows | wait room-knows | sleep 700 | click css:[data-key="day:Saturday"] .knows-fact | sleep 1300
  forget: ?mock=1 #/space/crew/knows | wait room-knows | sleep 700 | click css:[data-key="payer:Jules"] [data-testid="room-knows-forget"] | sleep 400
  told: ?mock=1 #/space/crew/knows | wait room-knows | sleep 700 | type room-knows-tell Ash is vegetarian | click room-knows-tell-send | wait room-knows-told | sleep 400
  house: ?mock=1 #/space/house/knows | wait room-knows | sleep 900
  couple: ?mock=1 #/space/couple/knows | wait room-knows | sleep 900
  empty: ?mock=1 #/space/league/knows | wait room-knows-empty | sleep 700
  live: ?enter=1 #/space/crew/knows | wait room-knows | sleep 1500
  livedoor: ?enter=1 | sleep 1500
take:
  habit: door real 30fps 150f | 20 click room-knows-open | 75 click css:[data-key="day:Saturday"] .knows-fact
---
# What this space knows (the room's brain, as a page)

**For a user:** every room has a second side. The black chip by the room's
name, `this space knows 14`, turns the board over to the room's own page
(`#/space/<slug>/knows`, in the room's colour): three paper sheets. **who we
are** (the real members with their colours, who's away, time zones) and
**coming up** (dates, days left set big); **how we usually do things** (the
habits code has counted, each with its evidence under it: "said in 3 places:
poll …"); **where things stand** (who's ahead in each poll, the RSVP, splits,
the wheel's last spin) and **what it has made** (cards from voice asks: kept,
edited, removed). Tap a line and you're back on the board with the camera on
the card it came from, ringed in your colour. `cross out` strikes a noticed
line in your colour ("Thomas crossed this out", `put back` undoes it). The
black field `tell it something` adds a fact in your own words; it sits at the
top of the habits sheet as "Holly said so" with `take back`. One line at the
bottom says what it reads and that everyone sees the same page.

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
changes the page.

**Get there:** click `room-knows-open` in any room, or load
`#/space/<slug>/knows`. Browser back returns to the board.

**Drive:** every state above carrying `?mock=1` is the fixture page (no
writes). `visit` taps "Saturday is our usual day" and lands on the board
with its poll ringed (`.is-knows-source`). `forget` / `told` correct on the
mock screen only. `live` / `livedoor` are the dev-lane room (run `drive up
--lane`); corrections there are real writes to the dev `briefs` row. Take
`room-brain:habit` films door → page → tap a habit → camera on the poll.
A line is `room-knows-line` with `data-key` (`day:Saturday`, `payer:Jules`,
`places`, `poll:<title>`, `date:<title>`, `away:<name>`, `zones`, …).

**Code:** `src/components/RoomKnows.tsx` (`RoomKnowsPage`, `RoomKnowsDoor`,
`useSpacePage`, `visitSources`) + `room-knows.css` · `src/lib/roomKnows.ts`
(types, `applyCorrections`, `toldLines`) · `src/lib/routes.ts` (`knowsHash`,
`spacePageFromHash`) · mock fixtures `src/data/roomKnows.ts` (crew, couple,
house; any other mock room shows the empty state) · mounted in
`LiveSpace.tsx` and `App.tsx`; the door is `SpaceHeader`'s `knowsDoor` slot.

**Gotchas:** the board stays mounted behind the page (that's how the camera
can already be moving as the page turns away). The page's lines refresh with
the brief (cron, every 10 min on activity), so a vote cast a minute ago may
not be there yet; corrections are instant. In mock mode nothing is stored.
