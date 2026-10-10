---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb voice-stage-edit voice-stage-card voice-stage-reply voice-found voice-found-pulse voice-edit-undo voice-edit-undone voice-edit-slip poll-option dev-readout dev-context-verb dev-context-edit dev-context-edit-refusal
states:
  mock: ?mock=1&voicePace=talk&voice=add ube to the cake poll | click dock-voice-orb | wait voice-stage-edit | sleep 400
  mockboard: ?mock=1&voicePace=talk&voice=add ube to the cake poll | click dock-voice-orb | wait voice-found | sleep 1200
  mockrefuse: ?mock=1&voicePace=talk&voice=take matcha off the cake poll | click dock-voice-orb | wait voice-stage-reply | sleep 400
  mocktentative: ?mock=1&voicePace=talk&voice=add ube to the cake poll and … | click dock-voice-orb | wait voice-stage-edit | sleep 300
  mockdrawer: ?mock=1&timing=1&voicePace=talk&voice=add ube to the cake poll | click dock-voice-orb | wait voice-found | sleep 1500 | click dev-readout | wait dev-context-edit | sleep 300
  ramen: ?enter=1&timing=1&voicePace=talk&voice=add ramen to the dinner poll | wait widget-body | sleep 2500 | click dock-voice-orb | wait voice-found | sleep 1200
  time: ?enter=1&timing=1&select=game night&voicePace=talk&voice=move it to 7:30 | wait widget-body | sleep 2500 | click dock-voice-orb | wait voice-found | sleep 1200
  undo: ?enter=1&timing=1&voicePace=talk&voice=add sunscreen to the packing list | wait widget-body | sleep 2500 | click dock-voice-orb | wait voice-edit-undo | click voice-edit-undo | wait voice-edit-undone | sleep 400
  refuse: ?enter=1&timing=1&voicePace=talk&voice=take pizza off the dinner poll | wait widget-body | sleep 2500 | click dock-voice-orb | wait voice-stage-reply | sleep 400
  mocksay: ?mock=1&voicePace=talk&voice=add ube to the cake poll | sleep 600
  mockrefusesay: ?mock=1&voicePace=talk&voice=take matcha off the cake poll | sleep 600
  ramensay: ?enter=1&timing=1&voicePace=talk&voice=add ramen to the dinner poll | wait widget-body | sleep 2500
  refusesay: ?enter=1&timing=1&voicePace=talk&voice=take pizza off the dinner poll | wait widget-body | sleep 2500
  undosay: ?enter=1&timing=1&voicePace=talk&voice=add sunscreen to the packing list | wait widget-body | sleep 2500
take:
  mock: mocksay real 30fps 210f | 3 click dock-voice-orb
  mockrefuse: mockrefusesay real 30fps 180f | 3 click dock-voice-orb
  ramen: ramensay real 30fps 150f | 3 click dock-voice-orb
  refuse: refusesay real 30fps 120f | 3 click dock-voice-orb
  undo: undosay real 30fps 180f | 3 click dock-voice-orb | 75 click voice-edit-undo
---
# Voice edits (change a card that's already there)

**For a user:** "add ramen to the dinner poll", "take pizza off", "move it to
7:30", "make it sunday", "take ash off the cabin split", "add rio", "add
sunscreen to the packing list", "rename it to friday dinner", "make the
challenge 10 days". "it" is the card you tapped (its toolbar is up, or you
tapped it in the last 8 s). While you talk the stage shows **that card itself**
with the change dashed in lime (`voice-stage-edit` `data-state=tentative`);
nothing is sent. At the pause the change goes solid, the card travels back to
its place, the board card has changed, a ring pulses and the slip says "added
ramen" with **undo** for 5 s (`voice-edit-undo` → `voice-edit-undone`
"undone"). Everyone else sees the card change and a slip in the asker's colour:
"tara added ramen" (`voice-edit-slip`). Two cards fit ("add ramen to the
poll" with five polls) → offers on the stage, never a guess. No card → "which
card? select it or say its name".

**Refused (until R2 makes them a vote):** removing an option people voted for
("3 people voted for pizza; i won't remove it"), taking a claimed item off a
list ("jules has towels…"), moving the time of an rsvp people said yes/maybe
to, taking someone who paid off a split, cutting a challenge shorter than the
days already logged. The camera goes to the card, the slip says why, nothing
is written.

**Under it:** `src/lib/deck/edits.ts` (pure, the asker and the server run the
same code): `parseSaid` (op family from the words), `editFor` (target: the
selected card, else the card the words name by kind + title words, else the
one card holding the thing named), `applyEdit` (new data, the fields touched,
the inverse op, or a refusal). Each card's closed op set sits next to its
schema in `catalog.ts` (`edits:`). `convex/edits.ts` `apply` re-applies the op
to the stored card (votes counted from the votes table), refuses, passes
**the one door** `convex/rightOfWay.ts` `rightOfWay()` (every AI write: edits,
undo, links' `writeLinked`, voice builds' `commit`/`amend`; returns
go/wait/ask, always go in R0, logs an `aiWrites` row), then writes through
`widgets.writeWidgetData` (the card's own edit path). `undo` = the inverse op,
asker only, 30 s. `recent` feeds the other screens' slips. Code parses every
op: no model call. A whole edit ends on the short pause.

**Drive:** mock states need no backend (stand-in: "· stand-in, not saved").
Lane states need the harness cards (`.context/r0/fixtures.mjs add`, `reset`
after a run; they are `createdBy: harness:r0`). `&select=<title words>` picks
a card on load. The drawer (`dev-context-edit`): target and how it was found,
the op and the fields it touches, the door's verdict, any refusal.

**Code:** `src/lib/deck/edits.ts` · `src/lib/deck/catalog.ts` (`edits`) ·
`src/live/useVoiceBuild.ts` (`case "edit"`, `setEdit`, `ready`) ·
`src/lib/voiceStage.ts` (`edit`) · `src/components/VoiceStage.tsx`
(`data-edit-changed`) · `VoiceBuildLayer.tsx` (`UndoButton`, `EditSlips`,
drawer) · `src/pages/LiveSpace.tsx` (optimistic `applyVoiceEdit`,
`edits.recent` slips, `voiceSelectedId`) · `convex/edits.ts` ·
`convex/rightOfWay.ts`.
