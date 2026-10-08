---
route: #/space/crew
ready: your-turn-tab
testids: your-turn your-turn-tab your-turn-item your-turn-go your-turn-choice your-turn-answer your-turn-more your-turn-clear rail-turn
states:
  badge: ?as=Rio
  rio: ?as=Rio | click dock-recap | wait your-turn | sleep 700
  ash: ?as=Ash | click dock-recap | wait your-turn | sleep 700
  guest: | click dock-recap | wait your-turn | sleep 700
  mid: ?as=Rio | click dock-recap | wait your-turn | sleep 500 | click your-turn-item[data-top] your-turn-choice[data-choice=yes] | sleep 240
  next: ?as=Rio | click dock-recap | wait your-turn | sleep 500 | click your-turn-item[data-top] your-turn-choice[data-choice=yes] | sleep 1100
  more: ?as=Rio | click dock-recap | wait your-turn | sleep 500 | click your-turn-more | sleep 400
  house: ?as=theo #/space/house | click dock-recap | wait your-turn | sleep 700
  couple: #/space/couple | click dock-recap | wait your-turn | sleep 700
  rail: ?as=Rio #/space/house | wait rail-turn
  casey: ?as=casey #/space/family | click dock-recap | wait your-turn | sleep 700
  live: ?enter=1 | click dock-recap | wait your-turn | sleep 900
take:
  clear: badge real 60fps 540f | 60 click dock-recap | 170 click your-turn-item[data-top] your-turn-choice[data-choice=yes] | 290 click your-turn-item[data-top] your-turn-choice[data-choice=1] | 410 click your-turn-go
---
# Your turn

**For a user:** a small orange count rides the dock's `✦` key (catch me up)
when something in the room is waiting on *you*; nothing else shows unasked.
Press `✦` and "what moved" opens with a "waiting on you" section at the top:
a pile of paper tickets, "you in? maya's bday · in 5 days · 4 in, just you
left". The top ticket is open with its one tap (`in · maybe · can't`, the
poll's options, the days, the open slots, or an answer box); the next two peek
out under it and `+N` holds the rest. Doing it, there or on the card itself,
strikes the ticket, drops it, the count goes down and the next one is already
underneath. After the last: `✓ that's you done`, then the section and the
count are gone. Nobody with nothing waiting sees anything (`?as=Maya`).

A guest (not joined; in mock, anyone not on the room's list) gets a white
count and the section labelled `jump in` with `nothing's on you yet`: at most
three, one of each kind, no backlog.

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

**Live rooms (lane):** `LiveSpace.tsx` reads every poll's votes with one
query, `votes.inSpace` (same rows and scoping as `votes.getResults`; the
board itself still subscribes to the first poll only), so every poll, RSVP,
question and availability card can make a ticket. **Member = email-joined**
(`useAccount().joined`): everything waiting on them, orange count. **Silent
guest** (anyone with the link who hasn't joined): nothing is on them, so a
white count and `jump in`: three starters, one of each kind, never a
backlog, and the ticket lines say how many answered without "waiting on
you". Doing one works the same for both. A card the voice ask just built
(a poll, an RSVP, a question, an availability) becomes a ticket for everyone
else in the room on their next render; nothing is pushed. **Rail counts are
mock-only** (`?as=`): live rooms pass no `waiting` to `Rail`, so no
number shows on another room's tile. A voice ask closes catch me up (and
its tickets) as the orb wakes, so the card lands on a clear board. State
`live` = the guest view; the member view needs a joined browser (`.context/m1/member.mjs`).

**Get there:** any room; `?as=<name>` plays the mock room as a fixture person
(`Rio` has four things, `Ash` has the cake vote, `Maya` none, `theo` in the house has the wheel).
`?turn=open` starts with the pile open and holds it there.

**Drive:** `click dock-recap` opens the panel; `your-turn` is the section.
`your-turn-tab` is the count on the key (not clickable itself, the key is).
`your-turn-choice` (with `data-choice`) does the top ticket; `your-turn-go`
on the top ticket pans the board to the card and rings it lime
(`.is-your-turn`), on a ticket behind it brings that one to the front;
`your-turn-more` shows all (on a phone: deals the next ticket);
`your-turn-clear` is the done line. `rail-turn` is the small count on another
room's tile (mock, `?as=`).

**Behaviour:** nothing opens itself; a new item only raises the count. The
count and the section are portalled into the dock's `dock-recap` key and
`.recap-panel` (no edit to `ActionDock`), so they follow the panel on every
width and step out with the other keys during a voice ask.

**Code:** `src/lib/yourTurn.ts` (logic, `mockViewer`, `playAsOverrides`,
`mockWaitingByRoom`) · `src/components/YourTurn.tsx` + `yourTurn.css` ·
mounts: `src/App.tsx` (mock, before `ActionDock`; `claimSlot` / `addMyDays`
write the mock overrides) and `src/pages/LiveSpace.tsx` (live).

**Gotchas:** Availability's own "You" row is tab-local, so the ticket writes
a real row. In live the panel also runs the recap model, so opening it
for a ticket costs a call. Tried and dropped: a row of three tickets over the
dock, a list slip under who's-here, the pile open on entry in the header
band, and a count on the orb with its own pile above the dock.
