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

**Your turn (built, `src/lib/yourTurn.ts`).** Two family tickets come from
the board's own data: **log today** (a check-in you're in with nothing from
you today: "3 of 4 logged · you're 26 behind dev", opens the card) and
**yours** (an open chore with your name on it, "casey: bathroom": one tap
ticks it). With the seeded week that is Casey: log today's push-ups + the
bathroom, and the soft "grab one" for laundry. The rest of the design list
(bins Thursday, allowance Friday, judge Mina's form video, the 7am walk,
nobody made a birthday list) lives in note text and isn't derived. Drive:
`your-turn:casey`.

**Live:** seeded on dev (see Get there); `roomBrief` reads the check-in
(who's in, logged today, the lead, streaks, the stake, the reveal), the
chore list's last week and "Alex is away till thursday".

**Gotchas:** no family photos exist yet; the one photo is the crew's
camera-roll table. The countdown card counts to midnight of the reveal
day, not 9:00.
