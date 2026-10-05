---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb voice-stage voice-stage-left voice-stage-right voice-stage-text voice-stage-status voice-stage-wave voice-stage-card voice-stage-parts voice-stage-part-question voice-stage-part-option-0 voice-stage-part-option-1 voice-stage-part-option-2 voice-stage-part-title voice-stage-part-item-0 voice-stage-part-who voice-stage-part-event voice-stage-part-date voice-stage-part-days voice-stage-part-total voice-stage-part-person-0 voice-stage-chip-0 voice-stage-chip-3 voice-stage-mute voice-stage-finish voice-stage-beats voice-stage-ask voice-stage-offers voice-stage-offer-0 voice-stage-sources voice-stage-found voice-found-pulse voice-landed
states:
  poll: ?voicePace=talk&voice=add a poll for Saturday dinner
  countdown: ?voicePace=talk&voice=countdown to Holly's birthday on November 14
  checklist: ?voicePace=talk&voice=who's bringing what for the potluck
  split: ?voicePace=talk&voice=split the cabin, 640
  where: ?voicePace=talk&voice=where should we eat Saturday
  nokey: ?voicePace=talk&voice=dinner Saturday, tacos or pho
  poll-slow: ?slow=3&timing=1&voicePace=talk&voice=add a poll for Saturday dinner
  poll-timing: ?timing=1&voicePace=talk&voice=add a poll for Saturday dinner
  open: | click dock-voice-orb | wait voice-stage | sleep 1400
  words: ?voicePace=talk&stageHold=1&voice=add a | click dock-voice-orb | wait voice-stage | sleep 1500
  type: ?stageFreeze=type&voicePace=talk&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-stage-card | sleep 2600
  mid: ?stageFreeze=mid&voicePace=talk&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-stage-card | sleep 3200
  complete: ?stageFreeze=complete&voicePace=talk&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-stage-card | sleep 3600
  closing: ?slow=3&voicePace=talk&voice=add a poll for Saturday dinner | click dock-voice-orb | sleep 9000 | wait css:.voice-stage[data-phase=closing] | sleep 420
  landed: ?voicePace=talk&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-landed | sleep 2200
  countdown-mid: ?stageFreeze=complete&voicePace=talk&voice=countdown to Holly's birthday on November 14 | click dock-voice-orb | wait voice-stage-card | sleep 4600
  checklist-mid: ?stageFreeze=complete&voicePace=talk&voice=who's bringing what for the potluck | click dock-voice-orb | wait voice-stage-card | sleep 4400
  split-mid: ?stageFreeze=complete&voicePace=talk&voice=split the cabin, 640 | click dock-voice-orb | wait voice-stage-card | sleep 4000
  ask: ?voicePace=talk&voice=add a poll | click dock-voice-orb | wait voice-stage-ask | sleep 900
  ask-answered: ?voicePace=talk&voice=add a poll … … … for Saturday dinner
  ask-offer: ?voicePace=talk&voice=add a poll | click dock-voice-orb | wait voice-stage-offer-0 | sleep 500 | click voice-stage-offer-0 | wait voice-stage-sources | sleep 500
  room: ?stageFreeze=complete&voicePace=talk&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-stage-sources | sleep 600
  already: ?voicePace=talk&voice=add a poll for cake flavor
  already-found: ?voicePace=talk&voice=add a poll for cake flavor | click dock-voice-orb | wait voice-stage-found | sleep 300
  already-landed: ?voicePace=talk&voice=add a poll for cake flavor | click dock-voice-orb | wait voice-stage-found | sleep 2600
  center: ?stage=center&voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait voice-stage | sleep 1500
take:
  poll: poll real 60fps 300f warmup 1200 | 20 click dock-voice-orb
  countdown: countdown real 60fps 340f warmup 1200 | 20 click dock-voice-orb
  checklist: checklist real 60fps 330f warmup 1200 | 20 click dock-voice-orb
  split: split real 60fps 300f warmup 1200 | 20 click dock-voice-orb
  where: where real 60fps 300f warmup 1200 | 20 click dock-voice-orb
  nokey: nokey real 60fps 330f warmup 1200 | 20 click dock-voice-orb
  poll-slow: poll-slow real 30fps 400f warmup 1200 | 10 click dock-voice-orb
  ask-answered: ask-answered real 60fps 480f warmup 1200 | 20 click dock-voice-orb
  already: already real 60fps 360f warmup 1200 | 20 click dock-voice-orb
---
# Voice stage (two parts: you speak, it builds)

**For a user:** tap the dock orb. The same orb lifts out of the dock, grows
and settles on the left half of the dimmed, blurred room. Your words appear
under it one by one: the newest word lime, the words that named the card a
sticker in your colour. The moment the card type is known (at "poll") the
real widget pops in on the right, larger than on the board, as a skeleton in
a dashed ring of your colour; its parts land one at a time (question from
your own words, then each option). When it is whole the ring lets go, the
orb flies back to the dock and the card shrinks and travels to its spot on
the board, where the "said it" slip appears. Phone: orb on top, words under
it, the card rising from below. Nothing said yet: four asks on the right you
can tap to hear said.

**The moves.** Up: the orb presses down into the dock, then leaves on one
arc, stretching along its travel while it is fast, grows the whole way and
lands with a small swell and one flat ring. The card is dealt out of the
orb (it leaves small from the orb, turns, stands up) inside a ring of
marching ants in your colour; whole, the ring closes lime and lets go.
Down: the orb flies the arc back and lands in the dock with a squash, the
bar gives under it; the card passes in front of it on its way to the board.
Status and the two keys (mute, finish) share one bar under the orb.

**It asks for the rest.** Name a card with nothing to put in it ("add a
poll") and the pause does not end the ask: the ring goes white and waits,
"what's it about?" lands on the card's shoulder (`voice-stage-ask`), your
words end on a lime caret, and under the card the room offers what it
already knows could fill it (`voice-stage-offer-0..`: "where we eat · from
your saved places"). Say the rest or tap one. Four quiet seconds: a guess
that is already showing is kept, an empty card is let go, nothing is built.

**From the room.** A part a room fact filled (the group's saved places as
poll options, the trip's people on a split, a date the board already
counts down to) gets an orange pip and the card a line under it
(`voice-stage-sources`: "from the room: your saved places").

**Already here.** The words name a card the board already has ("add a poll
for cake flavor"). The check is the build's own ([voice-build](voice-build.md):
code's match, then the model's yes/no; mock: code's match alone). The stage
keeps the card it was showing, says "already on the board"
(`voice-stage-found`), then that card travels to the one on the board and
melts into it, and the build's pulse and "already here" slip play there.
Nothing is written.

**Fill plans** (`src/lib/voiceFillPlan.ts`, data): poll = question, then
options one per beat · checklist = title, items one per beat, who · countdown
= event, then date and the day count ticking up together · split = title,
total counting up, people one per beat · anything else = title, then body.
Pips over the card: `voice-stage-part-<id>` with `data-status`
(`pending | tentative | final`) and `data-shown` once it is on screen.

**Timings:** every mock beat comes from `src/lib/voiceTimings.ts` (one row
per number: measured / derived / code / assumed / design, with its source).
`&slow=3` plays it all at a third of the speed. `&timing=1` shows
`voice-stage-beats`: the table's number beside this run's, from the last
word, headed "simulated from measurements · no model ran" in mock.

**Drive:** `ask` (asked, offers up) · `ask-answered` (a take: asked, then
the rest is said) · `ask-offer` (an offer tapped) · `room` (sources line)
· `already` / `already-found` / `already-landed`. States `poll countdown
checklist split where nokey` are the six
scripted asks (tap the orb to start; `nokey` has no card word, so the type
arrives after the words). Stills: `open` (nothing said), `words`, `type`
(`&stageFreeze=type`: card just known), `mid`, `complete`, `closing`
(slow, mid-flight), `landed`. Takes: `drive take voice-stage:poll --real`
(also `countdown checklist split where nokey poll-slow`, `--w 390`).
`voice-stage` carries `data-phase` (`open | closing`), `data-mode`
(`two | center`), `data-build` (`waiting | filling | complete`);
`voice-stage-card` carries `data-kind` and `data-state`.
`?stage=center` = the earlier centred stage · `?stage=0` = dock strip only ·
`?stage=1` opens on load · `?orb=glass|knot` = the other orbs.

**Mock runs the real brain path.** `src/lib/deck/mockFacts.ts` reads a
`RoomFacts` off the mock board, so `routeAsk`, the token resolver and the
duplicate rule all run as live; the simulated answer writes tokens
(`@places`, `@on-trip(…)`, `@date(…)`), never their values. Mock has no
pick: with no card word the type arrives with the first field.

**The seam (what live code must feed):** the stage never reads the build. It
reads `StageBuild` from `src/lib/voiceStage.ts`: `kind` (type known),
`widget` (the build's own skeleton/card), `parts[]` (`pending | tentative |
final`), `complete`, `placed` (board element to fly to), `failed`.
`VoiceBuildLayer` makes it with one call,
`feedVoiceStage({ drafts, shell, landed, receipt, traces, color, by })`:
exactly `useVoiceBuild`'s return value plus the maker. Keep these true and
the stage keeps working: the draft's id is `voice-draft-<session key>-0`;
`landed.traceKey` is that key and `landed.widgetId` becomes the synced id;
`traces[].how` is set when the ask ends; an unfilled field is blank
(` `), an unknown date equals `startDate`. Tentative fills mid-sentence
need nothing more: a non-blank field before `how` is set shows as tentative.
Three more: (1) `traces[].notes` (the resolver's notes): `expanded` notes
become "from the room". (2) `found` (the build's "already here"): the stage
flies its card to that widget. (3) Offers: the room calls
`setVoiceStageOffers((card) => offersFor(facts, card))`
(`src/lib/deck/suggest.ts`, pure); `App.tsx` does it over the mock facts,
`LiveSpace.tsx` over the room brief. The stage holds the ask open with
`voice.hold()` (`src/lib/voice.ts`), which the pause detector respects.

**Code:** `src/components/VoiceStage.tsx` (`useVoiceStage`: orb travel,
reveal engine `useReveal`, arrivals, `flyCard`, beats readout) +
`voice-stage.css` (`.voice-two-*`) · `src/lib/voiceStage.ts` (adapter,
beats) · `src/lib/voiceFillPlan.ts` · `src/lib/voiceTimings.ts` ·
`src/lib/deck/mockDeal.ts` (simulated answer on the measured clock, scripted
asks) · `src/lib/deck/mockFacts.ts` · `src/lib/deck/suggest.ts` · mock wiring in `src/App.tsx`.

**Gotchas:** the orb flies to its full canvas box (1.6 × the slot), never the
slot itself: aim at the slot and it travels small and snaps at the end. Flights use `performance.now()`, never the rAF timestamp (the
driver speeds the animation clock on load and the two drift apart). The
stage card is the real `WidgetCard` under CSS `zoom`; it inherits ink from
`.voice-two-card-body`. While the stage is up `body.voice-stage-up` hides
the board ring and pauses the slip. The beats readout runs along the top
edge and takes no taps. The room sends its call 200 ms after
the words settle; that wait is not slowed by `&slow=`, mockDeal makes it up.
