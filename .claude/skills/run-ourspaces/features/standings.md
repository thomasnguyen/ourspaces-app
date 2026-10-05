---
route: #/space/family
ready: standings
testids: standings standings-row standings-lock standings-log standings-gap standings-beat
states:
  locked: ?mock=1 | wait standings-lock | sleep 600
  open: ?mock=1&challenge=logged | wait standings-gap | sleep 600
  unlocked: ?mock=1 | sleep 600 | click standings-log | wait checkin-logger | click checkin-log | wait standings-gap | sleep 1400
  final: ?mock=1&challenge=final | wait standings-gap | sleep 600
take:
  unlock: locked real 30fps 180f | 25 click standings-log | 60 click checkin-more | 90 click checkin-log
  beat: open real 30fps 120f | 20 click standings-beat | 60 click checkin-log
---
# Standings (a new card kind: `standings`)

**For a user:** the ranking of a check-in, and you only get it by giving.
Until you've logged today the slips lie **face down**: four black slips,
ranks 1–4 beside them, and a tilted black sticker on top, `log yours to
see` · "3 of 4 have logged today. you haven't." · a lime `log today →`
that opens the check-in's logger. The moment your number lands the slips
flip, last place first and the leader last: each a strip in its person's
colour with a face, the total set big, and one line that invites a move
instead of reporting one ("dev did 40 today" + a black `beat 40 →` pill;
"19 more and you pass casey" + `log 59 →`; "5 for 5 · hasn't missed a
day"; "missed sun · back on it today"). A pill opens your logger at that
number. Top right: how many are between first and second ("18 in it").
The foot is the stake. After `revealAt` it is open to everyone and the
kicker reads `final · wed 9:00`.

**Settings (`widget.data`, type `StandingsData`):**

```
title   string             "standings"
source  string             widget id of the check-in it ranks
stake   string, optional   "most by the reveal picks saturday. …"
```

It stores nothing else: rows, totals, streaks and lines are computed from
the source card every render (`rank`, `lineFor` in `src/lib/challenge.ts`),
so it can't disagree with the check-in. No model writes the lines. Locked
= not after the reveal, and (you aren't in `people`, or you have nothing
today). Someone outside the challenge sees "only the people in it can look".

**For the voice deck (next task):** the model gives `{ title, stake? }`;
code sets `source` to the check-in dealt in the same answer (the
"challenge" recipe), or `existingFor` a check-in already on the board.

**Drive:** `drive sheet standings:locked standings:open standings:final --w 1440,390`
· `drive take standings:unlock` (log → the flip) · `standings:beat`.
`data-state` on the card is `locked` / `open` / `final`; a revealed row
is `standings-row` with `data-person`.

**Code:** `src/widgets/challenge.tsx` (`StandingsWidget`; reads its source
out of `BoardLinkContext.widgets`; `OPEN_LOG` window event to the
check-in) + `challenge.css` (`.st-back` face down, `st-flip`).

**Gotchas:** the flip only plays when the lock opens under you; a load
that is already open (`?challenge=logged`) shows the rows straight away.
A reveal "at the same moment on every phone" needs a clock tick in live
(today the card re-reads the time when its data changes).
