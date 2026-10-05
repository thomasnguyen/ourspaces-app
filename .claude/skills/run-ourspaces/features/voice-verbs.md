---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb voice-stage-reply voice-stage-choices voice-stage-choice-0 voice-stage-choice-1 voice-reply voice-reply-offer-0 voice-found voice-found-pulse dev-readout dev-context-drawer dev-context-verb dev-context-answer-facts
states:
  answer: ?mock=1&voicePace=talk&voice=when's maya's birthday? | click dock-voice-orb | wait voice-stage-reply | sleep 500
  answer-card: ?mock=1&voicePace=talk&voice=when's maya's birthday? | click dock-voice-orb | wait voice-stage-reply | sleep 2800
  dontknow: ?mock=1&voicePace=talk&voice=when's sam's birthday? | click dock-voice-orb | wait voice-stage-reply | sleep 500
  recap: ?mock=1&voicePace=talk&voice=catch me up | click dock-voice-orb | wait css:.recap-panel | sleep 900
  mine: ?mock=1&voicePace=talk&voice=vote matcha | click dock-voice-orb | wait voice-stage-reply | sleep 2800
  refuse: ?mock=1&voicePace=talk&voice=put maya down for balloons | click dock-voice-orb | wait voice-stage-reply | sleep 500
  tie: ?mock=1&voicePace=talk&voice=who's coming to karaoke night? | click dock-voice-orb | wait voice-stage-choice-0 | sleep 400
  go: ?mock=1&voicePace=talk&voice=show me the cake poll | click dock-voice-orb | wait voice-stage-reply | sleep 2800
  room: ?mock=1&voicePace=talk&voice=take me to the family | click dock-voice-orb | wait voice-stage-reply | sleep 1500
  game: ?mock=1&voicePace=talk&voice=let's play most likely to | click dock-voice-orb | wait voice-stage-reply | sleep 500
  edit: ?mock=1&voicePace=talk&voice=add ramen to the dinner poll | click dock-voice-orb | wait voice-stage-reply | sleep 500
  drawer: ?mock=1&timing=1&voicePace=talk&voice=when's maya's birthday? | click dock-voice-orb | wait voice-stage-reply | sleep 2800 | click dev-readout | wait dev-context-verb | sleep 300
  answersay: ?mock=1&voicePace=talk&voice=when's maya's birthday? | sleep 600
  liveanswer: ?enter=1&timing=1&voicePace=talk&voice=when's maya's birthday? | wait css:[data-widget-id] | sleep 4000
  liveask: ?enter=1&timing=1&voicePace=talk&voice=what's the plan for the japan trip? | wait css:[data-widget-id] | sleep 4000
  liverecap: ?enter=1&timing=1&voicePace=talk&voice=catch me up | wait css:[data-widget-id] | sleep 4000
  livego: ?enter=1&timing=1&voicePace=talk&voice=show me the cake poll | wait css:[data-widget-id] | sleep 4000
  livedrawer: ?enter=1&timing=1&voicePace=talk&voice=when's maya's birthday? | wait css:[data-widget-id] | sleep 4000 | click dock-voice-orb | wait voice-stage-reply | sleep 2800 | click dev-readout | wait dev-context-verb | sleep 300
take:
  answer: answersay real 30fps 150f | 3 click dock-voice-orb
  liveanswer: liveanswer real 30fps 150f | 3 click dock-voice-orb
  liveask: liveask real 30fps 160f | 3 click dock-voice-orb
  liverecap: liverecap real 30fps 120f | 3 click dock-voice-orb
  livego: livego real 30fps 150f | 3 click dock-voice-orb
---
# The orb's verbs (answer, catch me up, your part, go, games, edit)

**For a user:** the orb does more than make cards. Ask it a question —
"when's maya's birthday?" — and no card skeleton appears: the stage shows
your words and, under them, a plain slip with the answer and where it came
from ("maya's bday is sun oct 11 · in 6 days · from the maya's bday
countdown"). Then the stage lets go, the camera goes to that card, a ring
pulses round it and the same slip sits on it. Nothing is added to the board.
If the space doesn't know, it says "the space doesn't know that yet". "catch
me up" / "what did i miss?" opens catch me up as if its key were tapped. "i'm
in for friday", "put me down for ice", "vote coffee", "i did 40" do *your*
part on the card waiting on you (the same write as the tap) and the camera
goes there; two cards fit ("vote matcha" with two polls that have matcha) →
the stage shows both as offers to tap, never a guess. "put maya down for
balloons" / "jules is in" is refused: it only acts as you. "show me the cake
poll" goes to the card; "take me to the family" opens that room; "open what
this space knows" flips to the knows page. "let's play most likely to" says
"games are coming"; "add ramen to the dinner poll" changes that card (see
[voice-edits](voice-edits.md); the mock crew has no dinner poll, so `edit` says so). A question code can't place ("who's coming to karaoke night?" with no
such card) asks the decide make-or-answer; unsure → both readings as offers.

**Under it:** `src/lib/deck/verbs.ts` (pure): `routeVerb` (0 ms, the words'
shape: recap / game / do my part for someone else (refused) / first person /
go / edit / question → answer; tool-asking questions like "who's driving",
"whose turn", "who's bringing what" stay make), `answerFor` (code reads the
room facts and the board's cards: countdowns, splits, sign-ups, rsvps, polls,
decisions, who's away, the wheel, a pinned note; every value off a row),
`mineFor` (rsvp / vote / claim as the speaker; offers when two fit; a slot
someone else has is never taken), `goFor`, `cardAnswer`. `useVoiceBuild`
routes on every word (another verb: no skeleton, no fill) and dispatches at
the pause (`routeAt`), state `reply`. Retrieval: `convex/voiceBuild.ts`
`answer` (snapshot + unsummarised cards ranked by the question's words in
code, top six numbered, one Ultra call ≤ 60 tokens that must cite one, a
truth check on numbers and names; a poll it cites is counted by code).
The decide's verb letter: `decide {verb:true}` (`VERB_Q`, A make / B answer).
`startGame` is the one function the games task replaces.

**Drive:** mock states need no backend (answers from the mock board are the
real code path; retrieval is a stand-in that says so). Lane states: `drive up
--lane`; do-my-part live needs test cards (`.context/v1/fixtures.mjs add`,
sweep after) and a test seat. Readout (`dev-readout`): verb · how · last word
→ slip · model calls. Drawer section `dev-context-verb`: verb, by code /
decide / offers / tapped, why, the answer and the facts or snippets
(`dev-context-answer-facts`).

**Code:** `src/lib/deck/verbs.ts` · `src/live/useVoiceBuild.ts` (`routeAt`,
`say`, `VerbHooks`, `startGame`) · `src/components/VoiceStage.tsx`
(`StageReplySlip`) + `voice-stage.css` `.voice-two-reply` · `VoiceBuildLayer`
(`voice-reply`, readout, drawer) · `src/lib/voiceStage.ts` (`reply`) · hooks
wired in `LiveSpace.tsx` (`verbs:`) and `App.tsx` (mock) · `convex/voiceBuild.ts`
`answer`, `decide`.

**Gotchas:** The answer's camera only moves if the card is drawn on this screen.
