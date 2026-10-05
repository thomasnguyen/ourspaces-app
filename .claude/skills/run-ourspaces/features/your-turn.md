---
route: #/space/crew
ready: your-turn
testids: your-turn your-turn-tab your-turn-item your-turn-go your-turn-choice your-turn-answer your-turn-more your-turn-clear rail-turn
states:
  rio: ?as=Rio
  ash: ?as=Ash
  guest: ?turn=open
  tucked: ?as=Rio&turn=tucked
  mid: ?as=Rio&turn=open | click css:[data-testid="your-turn-item"][data-kind="rsvp"] [data-choice="yes"] | sleep 240
  next: ?as=Rio&turn=open | click css:[data-testid="your-turn-item"][data-kind="rsvp"] [data-choice="yes"] | sleep 1100
  more: ?as=Rio&turn=open | click your-turn-more | sleep 400
  house: ?as=theo&turn=open #/space/house
  couple: ?turn=open #/space/couple
  rail: ?as=Rio #/space/house | wait rail-turn
take:
  clear: ash real 60fps 480f | 70 click your-turn-go | 190 click css:.yt-item.is-top [data-choice="a"] | 320 click css:.yt-item.is-top [data-choice="b"]
---
# Your turn

**For a user:** on entering a room, a small pile of paper tickets by the
room's name says what's waiting on *you*: "you in? maya's bday · in 5 days ·
4 in, just you left". The top ticket is open with its one tap (`in · maybe ·
can't`, the poll's options, the days, the open slots, or an answer box); the
next two peek out under it and `+N` holds the rest. Doing it, there or on the
card itself, strikes the ticket, drops it, and the next one is already
underneath. After the last: a black `✓ that's you done` stamp, then nothing.
Nobody who has nothing waiting ever sees the layer (`?as=Maya`).

A guest (not joined; in mock, anyone not on the room's list) gets the same
pile labelled `jump in` with a `nothing's on you yet` tag: at most three, one
of each kind, no backlog count.

**Computed, never stored:** `yourTurn()` in `src/lib/yourTurn.ts` is a pure
function over the widgets the room already loaded. Per widget type:

| widget | waits on you when | from the ticket |
|---|---|---|
| `rsvp` | no row of yours (and it isn't your own party) | in / maybe / can't |
| `poll` | no vote of yours (live: only the poll whose votes are loaded) | the options (≤4) |
| `dailyQ` | no answer of yours ("yours unlocks theirs") | type + send |
| `availability` | no row of yours | one day (adds your row) |
| `potluck` | open slots and you hold none (soft, ranked last) | claim a slot |
| `wheel` | it landed on your name | take me there |
| `letter` | still sealed (live only, the seal is shared there) | take me there |

Order: hard before soft, then urgency = kind + a date (the countdown sharing
the card's frame) + how much of the room has already answered.

**Get there:** any room; `?as=<name>` plays the mock room as a fixture person
(`Rio` has four things, `Ash` has the cake vote, `Maya` none, `theo` in the house has the wheel).
`?turn=open` holds the pile open, `?turn=tucked` starts it as the label.

**Drive:** `your-turn-choice` (with `data-choice`) does the top ticket;
`your-turn-go` on the top ticket pans the board to the card and rings it lime
(`.is-your-turn`), on a ticket behind it brings that one to the front;
`your-turn-tab` tucks / reopens; `your-turn-more` shows all (on a phone: deals
the next ticket); `your-turn-clear` is the stamp. `rail-turn` is the small
count on another room's tile (mock, `?as=`).

**Behaviour:** desktop ≥1400 it sits in the empty band between the room name
and who's-here; narrower it hangs under who's-here; a phone shows one line
above the dock (`your turn 4 · maya's bday`) that opens the top ticket. A
press or pan on the board tucks it (its own fly-to doesn't); it reopens only when a new item appears.
Hidden behind the gate, chat, editors and focus.

**Code:** `src/lib/yourTurn.ts` (logic, `mockViewer`, `playAsOverrides`,
`mockWaitingByRoom`) · `src/components/YourTurn.tsx` + `yourTurn.css` ·
mounts: `src/App.tsx` (mock, next to `ActionDock`; `claimSlot` / `addMyDays`
write the mock overrides) and `src/pages/LiveSpace.tsx` (live).

**Gotchas:** the header scrolls with the board, the pile does not, hence the
tuck on pan. Availability's own "You" row is tab-local, so the ticket writes
a real row. Two other placements were tried and dropped (a row of three
tickets over the dock; a list slip under who's-here).
