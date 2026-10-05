---
route: #/space/crew
ready: dock-voice-orb
testids: voice-stage-ask voice-stage-ask-slip voice-stage-offers voice-stage-offer-0 voice-stage-card card-slot card-slot-input voice-landed
states:
  poll: ?voicePace=talk&timing=0&voice=add a poll | click dock-voice-orb | wait voice-stage-ask | sleep 500
  poll-second: ?voicePace=talk&timing=0&voice=add a poll …2600 the team name | click dock-voice-orb | wait voice-stage-ask | sleep 4200
  poll-answered: ?voicePace=talk&timing=0&voice=add a poll …2600 the team name …2600 otters, owls or bats | click dock-voice-orb | wait voice-landed | sleep 1200
  delegated: ?voicePace=talk&timing=0&voice=add a poll …2600 saturday dinner | click dock-voice-orb | wait voice-landed | sleep 1200
  countdown: ?voicePace=talk&timing=0&voice=start a countdown | click dock-voice-orb | wait voice-stage-offer-0 | sleep 500
  countdown-offer: ?voicePace=talk&timing=0&voice=start a countdown | click dock-voice-orb | wait voice-stage-offer-0 | sleep 500 | click voice-stage-offer-0 | wait voice-landed | sleep 1200
  countdown-when: ?voicePace=talk&timing=0&voice=countdown to the bake sale | click dock-voice-orb | wait voice-stage-ask | sleep 500
  split: ?voicePace=talk&timing=0&voice=split the bill | click dock-voice-orb | wait voice-stage-ask | sleep 500
  challenge: ?voicePace=talk&timing=0&voice=set up a challenge | click dock-voice-orb | wait voice-stage-ask | sleep 500
  walkaway: ?voicePace=talk&timing=0&voice=add a poll …2600 the team name | click dock-voice-orb | wait voice-landed | sleep 1500
  unfinished: ?voicePace=talk&timing=0&voice=add a poll …2600 the team name | click dock-voice-orb | wait card-slot | sleep 2500
  letgo: ?voicePace=talk&timing=0&voice=add a poll | click dock-voice-orb | wait voice-stage-ask | sleep 6000
take:
  poll-answered: poll-answered real 30fps 420f warmup 1200 | 6 click dock-voice-orb
  countdown-offer: countdown real 30fps 300f warmup 1200 | 6 click dock-voice-orb | 90 click voice-stage-offer-0
  walkaway: walkaway real 30fps 420f warmup 1200 | 6 click dock-voice-orb
---
# It asks for what's missing (C1)

**For a user:** name a card with nothing to put in it ("add a poll") and the
pause doesn't end the ask. The question lands on the card's shoulder and in
the cream slip ("what are we voting on?"), the empty part of the skeleton is
the one it asks about, and under the card the room offers what it knows,
each saying where it's from. Say the answer or tap an offer: the answer fills
only that field. Two questions at most ("the team name" → "what are the
choices?"). An ask that already gives the card something to stand on is
never asked about ("add a poll for saturday dinner": the options are the
model's and the room's job, as before).

**Walk away** (4 s quiet after the question): a card with its type and one
real field lands **unfinished**, its empty slot marked in place
(`card-slot`: "+ add choices") and a "your turn" ticket for whoever asked
("finish the poll you started"). Nothing real in it: let go, as before. Finish
it by tapping the slot and typing (Enter), or by voice: "the choices are
tacos, pho and pizza" with the card selected, named, or the only card
missing something (an edit, `fill` op, undoable).

**What each card can't do without** is data, `needs` next to its schema in
`src/lib/deck/catalog.ts` (recipes: `recipes.ts`): poll question ("what are
we voting on?") and choices ("what are the choices?", asked only when only
the group can name them: names, themes, gifts); countdown what+when ("a
countdown to what, and when?", one question; "when is it?" when the date
alone is missing and the room doesn't count down to it); split title + total
("split how much?"); checklist, rsvp, itinerary, check-in, question: their
title; wheel: what it picks from; note: its words; the challenge recipe: "a
challenge of what?"; the cabin flow: "split how much?".

**Code:** `src/lib/deck/needs.ts` (`saidOf` what the words give, `missingNeeds`,
`mapAnswer` answer → that field, `needOffers` offers that answer outright,
`fillSlot` / `blankSlot`, `settingsFromWords`) · stage logic in
`src/components/VoiceStage.tsx` ("it asks for what's missing") → the outcome
seam `setAskOutcome` / `takeAskOutcome` in `src/lib/voiceStage.ts` →
`useVoiceBuild` `ask()` (pins over the model's fields; `codeSpec` = the
answers gave code the whole card, no model; `unfinishedKept`) →
`applyCard(…, { blank, unfinished })` on both sides (`voiceBuild.commit`) ·
the slot `src/widgets/flowMarks.tsx` `EmptySlot` · ticket `lib/yourTurn.ts`
kind `finish` · voice finish `lib/deck/edits.ts` `fillFor` / op `fill`.
Drawer: `trace.asked` (questions, last word → question ms, pins, direct).

**Drive:** `poll` (asked) · `poll-second` (second question) ·
`poll-answered` (both answered: built by code, no model) · `delegated` (one
answer, the model fills options) · `countdown` / `countdown-offer` (an offer
from the room answers what + when) · `countdown-when` · `split` · `challenge`
· `walkaway` / `unfinished` (lands with its slot) · `letgo`.
