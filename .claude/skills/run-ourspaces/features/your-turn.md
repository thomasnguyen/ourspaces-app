---
route: #/space/crew
ready: your-turn-tab
testids: your-turn your-turn-tab your-turn-close your-turn-item your-turn-go your-turn-choice your-turn-answer your-turn-more your-turn-clear rail-turn
states:
  badge: ?as=Rio
  rio: ?as=Rio&turn=open | wait your-turn
  ash: ?as=Ash&turn=open | wait your-turn
  guest: ?turn=open | wait your-turn
  pressed: ?as=Rio | click your-turn-tab | wait your-turn | sleep 500
  mid: ?as=Rio&turn=open | click css:[data-testid="your-turn-item"][data-kind="rsvp"] [data-choice="yes"] | sleep 240
  next: ?as=Rio&turn=open | click css:[data-testid="your-turn-item"][data-kind="rsvp"] [data-choice="yes"] | sleep 1100
  more: ?as=Rio&turn=open | click your-turn-more | sleep 400
  house: ?as=theo&turn=open #/space/house | wait your-turn
  couple: ?turn=open #/space/couple | wait your-turn
  rail: ?as=Rio #/space/house | wait rail-turn
take:
  clear: badge real 60fps 540f | 60 click your-turn-tab | 130 click your-turn-go | 250 click css:.yt-item.is-top [data-choice="yes"] | 370 click css:.yt-item.is-top [data-choice="1"]
---
# Your turn

**For a user:** a small orange count sits on the dock's orb when something in
the room is waiting on *you*; nothing else shows unasked. Press it and a pile
of paper tickets opens above the dock: "you in? maya's bday · in 5 days ·
4 in, just you left". The top ticket is open with its one tap (`in · maybe ·
can't`, the poll's options, the days, the open slots, or an answer box); the
next two peek out above it and `+N` holds the rest. Doing it, there or on the
card itself, strikes the ticket, drops it, the count goes down and the next
one is already underneath. After the last: a black `✓ that's you done` stamp,
then the count is gone. Nobody with nothing waiting sees anything (`?as=Maya`).

A guest (not joined; in mock, anyone not on the room's list) gets a white
count and the pile labelled `jump in` with a `nothing's on you yet` tag: at
most three, one of each kind, no backlog.

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
`?turn=open` starts with the pile open and holds it there.

**Drive:** `your-turn-tab` is the count on the orb (opens / shuts the pile);
`your-turn-close` is the pile's own label. `your-turn-choice` (with
`data-choice`) does the top ticket; `your-turn-go` on the top ticket pans the
board to the card and rings it lime (`.is-your-turn`), on a ticket behind it
brings that one to the front; `your-turn-more` shows all (on a phone: deals
the next ticket); `your-turn-clear` is the stamp. `rail-turn` is the small
count on another room's tile (mock, `?as=`).

**Behaviour:** the pile never opens itself; a new item only raises the count.
A press or pan on the board shuts it (its own fly-to doesn't). Same layout at
every width; a phone shows one ticket at a time. The count is portalled into
`.action-dock` and steps out with the other keys during a voice ask.

**Code:** `src/lib/yourTurn.ts` (logic, `mockViewer`, `playAsOverrides`,
`mockWaitingByRoom`) · `src/components/YourTurn.tsx` + `yourTurn.css` ·
mounts: `src/App.tsx` (mock, next to `ActionDock`; `claimSlot` / `addMyDays`
write the mock overrides) and `src/pages/LiveSpace.tsx` (live).

**Gotchas:** Availability's own "You" row is tab-local, so the ticket writes
a real row. Tried and dropped: a row of three tickets over the dock, a list slip under
who's-here, and the pile open on entry in the header band (covered cards
below 1400px, weak on phones).
