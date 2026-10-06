---
route: #/space/crew
ready: demo-banner
testids: demo-banner demo-make-space demo-notice-make rail-new-space space-maker space-maker-name space-maker-empty space-maker-create new-room-empty new-room-starter-0 new-room-starter-1 new-room-starter-2 new-room-invite new-room-invite-copy new-room-invite-close claim-enter
states:
  banner: ?notice=1 #/space/crew | wait demo-notice-make | sleep 700
  maker: ?enter=1 #/space/crew | click rail-new-space | wait space-maker | sleep 700
  named: ?enter=1 #/space/crew | click rail-new-space | wait space-maker | click space-maker-empty | type space-maker-name our house | sleep 500
  empty: ?enter=1 #/space/n1-test-delete-me-zysrrq | wait new-room-empty | sleep 1800
  nudge: ?enter=1&newroom=first #/space/n1-test-delete-me-zysrrq | wait new-room-invite | sleep 1900
  gate: #/join/n1-test-delete-me-zysrrq | wait claim-enter | sleep 900
  knows: ?enter=1 #/space/n1-test-delete-me-zysrrq/knows | wait room-knows | sleep 1300
take:
---
# A brand-new space (lane)

**For a user:** on the dev lane the banner says "These rooms are the tour.
Yours starts empty. · Make your own space", and the first-visit notice's
"Want a space for your own group?" says "Make your own" (on prod both still
say "Join the waitlist"). Either opens the space maker (also the rail's
dashed "+"): pick "start empty" or a starting point, name it on the preview,
"create space". A guest makes it at once (no email code on the dev lane),
walks through the room's own gate (name + look; a fresh browser starts on a
random persona and never on one already in the room), and lands on an empty
board with a black card: "<room> · just made / say the first thing / tap the
orb and talk, or try one:" and three starter asks ("plan dinner saturday:
thai or tacos", "start a push-up challenge for us", "who's in this group?");
a tap plays those words into the orb as if they were said. The dinner one
names its two places: a bare "plan dinner on saturday" in a room with no
saved places asks "where are we choosing between?" and waits for a spoken
answer (a scripted take says it after a hesitation: `plan dinner on saturday
…2500 the thai place or the taco truck`); with no answer it is let go, no
card. Either way it lands the poll + who's-in pair. When the first card
lands and you're still alone, a pill above the dock: "first card's up. it
gets good when your people are in. · copy invite link" (phones: "send the
link", the share sheet). A friend's invite link skips the demo notice and
opens the room's gate; a phone opens a made room on its cards. "What this
space knows" knows the room's name and everyone in it from the moment they
walk in, and "who's in this group?" is answered from it.

**Where it lives:** `src/components/NewRoom.tsx` + `newRoom.css` (the empty
card and the nudge), wired in `src/pages/LiveSpace.tsx` (search "a room
someone just made"); the banner switch `src/components/DemoBanner.tsx` +
`src/main.tsx` `LiveDemoBanner`; `convex/spaces.ts` `roomsOpen` (by
deployment: `OPEN_ROOM_DEPLOYMENTS`), `createSpace`, `joinDemoSpace`;
`SpaceMaker.tsx`; the starter's words go through `setNextVoiceScript` in
`src/lib/voice.ts`.

**States:** lane only (`drive up --lane`). the example room `n1-test-delete-me-zysrrq` is the one left on
dev by N1 (see the N1 write-up for its id); `empty`, `nudge` and `knows` need
a made room with no cards. `?newroom=first` forces the first-card nudge.
Entering a room from the drive browser writes a members row for it.

**Take recipe (the whole walk, two devices):** fresh desktop (1440) and phone
(390) contexts on the dev preview; desktop: `demo-notice-make` → `space-maker-empty`
→ type `space-maker-name` → `space-maker-create` → `claim-enter` → wait
`new-room-empty` → orb with `?voice=<ask>&voicePace=talk` (or tap
`new-room-starter-0`) → wait `voice-landed` → `new-room-invite`; phone: open
`#/join/<slug>` → `claim-enter` → wait the card; desktop asks again → the card
on both. Add `?timing=0` for clean frames.
