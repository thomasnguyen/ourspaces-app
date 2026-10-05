---
route: #/space/family
ready: checkin
testids: space-link-family
states:
  board: ?mock=1 | sleep 600
  logged: ?mock=1&challenge=logged | sleep 600
  final: ?mock=1&challenge=final | sleep 600
  knows: ?mock=1 #/space/family/knows | wait room-knows | sleep 900
take:
---
# The family (the fourth example room)

**For a user:** a house of four on one board, cobalt wall, yellow tape.
Three corners: **push-ups till <day>** (the challenge: sign-up, check-in,
standings, the deal, a countdown to the reveal), **jobs this week** (chores
with Casey's bathroom three days late, the dishwasher wheel, who's home for
dinner, house rule no. 1, allowance) and **this weekend** (the saturday poll
stuck 2–2, kids against parents; places we keep saying; Mina's birthday).
Fridge notes along the bottom, Alex's "out till thursday" frame, the dog.

**The week (what the fixtures say):** Dev (dad, orange) logs before coffee
and leads. Alex (mom, pink) is in Denver for work till Thursday and missed
one day flying. Casey (16, teal) is 26 behind Dev, hasn't logged today, and
owes the house a bathroom. Mina (11, yellow) is last on total and has never
missed a day. The stake ties it together: most push-ups by the reveal picks
saturday, last place takes the winner's chores. Every date is an offset
from today (`STARTED = -4`, `REVEAL = 2` in `src/data/family.ts`), so the
room is always on day 5 of 6; shot on a Wednesday it reads "till fri".

**Get there:** the fourth tile in the rail (`space-link-family`), or
`#/space/family`. Live on the dev lane: `seed:seedFamily {today, hero?}`
(`convex/seed.ts`) creates the room, its four seeded members and the board
with every date from `today` (pass the local date: Convex runs on UTC);
a rerun puts back the designed board and the mid-week logs and writes
nothing when it is already so. `hero: true` takes the challenge corner off
(`FAMILY_CHALLENGE_IDS`) so the voice ask can build it again. Never run it
on prod. Wrapper: `.context/f2/seed.sh [hero]`.

**Drive:** `drive sheet family:board family:logged family:knows --w 1440,390`.
In mock you sit in the seat of the first person who hasn't logged today
(Casey); `?as=<name>` picks another. `?challenge=logged` and
`?challenge=final` are the two later states of the challenge. The cards
themselves: [check-in](check-in.md), [standings](standings.md). The page:
[room-brain](room-brain.md) (`family:knows`, fixtures in
`src/data/roomKnows.ts`: Alex away, the reveal, the 2–2 poll, Friday as
the usual day, the four places, what it made: the challenge, kept, and a
bathroom wheel Casey asked for, removed; Mina's told note about the dog).

**Phone:** under 800px the board is one column, challenge first
(`src/data/family.css`); stickers are dropped, frames become labels.

**Code:** `src/data/family.ts` (members, widgets, the week) + `family.css`
· registered in `src/data/spaces.ts` (`SPACES`, `SPACES_BY_ID`,
`SPACE_CURSORS`) · theme `cobalt` + accent in `src/data/spaceThemes.ts`
(`SPACE_DEFAULT_ACCENTS`) · chat in `src/data/chat.ts` (`FAMILY_GLOBAL`) ·
`mina` → a face in `src/data/avatars.ts` · `EXAMPLE_COUNT = 4` in `Rail.tsx`.

**Your turn (not built in this branch).** When the `your turn` feature
lands, these are the family's tickets, one list per person, from the board:

| who | tickets |
|---|---|
| Casey | log today's push-ups (standings are face down until you do) · the bathroom, due Sunday · break the saturday tie: you're 26 behind dad |
| Dev | bins go out Thursday · Casey is 26 behind and hasn't logged: your lead is one check-in deep · pay allowance Friday |
| Alex | log from the hotel (you missed the flight day) · laundry mountain is unclaimed and you're back Thursday · judge Mina's form video |
| Mina | walk biscuit, 7am · 5 for 5: don't break it · your birthday is in 11 days and nobody has made a list |

**Seeding it for real (next task):** add a `family` space + these widgets
to `convex/seed.ts`, add `checkIn` / `standings` validators to
`convex/widgetData.ts` (shapes in the two card files), teach
`convex/roomBrief.ts` to read a check-in (streaks → "takes things on",
`revealAt` → "coming up"), and pass `onWidgetData` from `LiveSpace.tsx`
to `Canvas` as `updateWidgetData`.

**Gotchas:** no family photos exist yet; the one photo is the crew's
camera-roll table. The countdown card counts to midnight of the reveal
day, not 9:00.
