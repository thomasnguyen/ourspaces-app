---
route: #/space/league
ready: poll-option
testids: poll-closes poll-needs poll-stamp poll-option dock-voice-orb voice-landed
states:
  open: ?mock=1&timing=0 | wait poll-closes | sleep 700
  passed: ?mock=1&timing=0&poll=passed | wait poll-stamp | sleep 700
  failed: ?mock=1&timing=0&poll=closed | wait poll-stamp | sleep 700
  voice: ?mock=1&timing=0&voicePace=talk&voice=put the trade up for a vote, 24 hours | click dock-voice-orb | wait voice-landed | sleep 1800
  voice-needs: ?mock=1&timing=0&voicePace=talk&voice=rule change: FAAB to 200, needs 8 of 12, till wednesday | click dock-voice-orb | wait voice-landed | sleep 1800
take:
  passed: passed real 30fps 60f focus poll-stamp
---
# Vote rules (a poll that closes, a poll that needs a number)

**For a user:** the league's commissioner says "put the trade up for a
vote, 24 hours" or "rule change: FAAB to 200, needs 8 of 12". It is the
ordinary poll card, with a line of black pills under the options:
`closes wed 9:00 pm` (`poll-closes`; "closes in 3h" in its last twelve
hours, a lime dot while the clock runs) and `5 of 8 needed` (`poll-needs`,
one pip per vote it needs, the ones it has lit lime; the count is for the
"yes" option, else the leader). At that minute it closes on every screen at
once (a timer to `closesAt`); when an option reaches `needs` it is decided
early. Decided: no more votes, the "live" tag goes, the losing rows step
back and a stamp slaps on (`poll-stamp`, `data-verdict`): **passed**
("8 of 8"), **failed** ("5 of 8", or "N said no" when "no" reached it), or,
without `needs`, the winner ("pho won") or a tie. A poll without rules
renders exactly as before.

**Mock** (`#/space/league`, the "FAAB budget to $200?" card, needs 8,
closes tomorrow 9 pm): `?poll=passed` lifts "yes" to 8 · `?poll=closed`
puts its deadline two hours ago. Only polls with rules read the param.

**The words:** `closes` and `needs` are poll settings the model may fill
with the words as said; code reads them off the words too
(`rulesSaid`), keeps a rule only when the words carry one, and turns them
into a local `closesAt` ("24 hours" → now + 24 h to the next 5 min; a day
with no time → 9 pm) and a number ("majority" → half the room + 1, "8 of
12" → 8). Edits: "make it need 7", "close it friday", "keep the vote open
till sunday" (ops `setNeeds` / `setCloses`).

**Right of Way:** with votes on it, changing `needs` or `closesAt` asks
everyone who voted (they voted under the old rule), like taking off an
option they chose. A vote that passed or closed is a finished choice: adding
or removing an option, or changing its rules, asks everyone who voted.

**Code:** maths `src/lib/pollRules.ts` (`closesFromWords`,
`needsFromWords`, `rulesSaid`, `pinPollRules`, `pollOutcome`,
`closesLabel`) · card `src/widgets/pollRules.tsx` (`usePollRules`, pills,
stamp, mock params) + `poll-rules.css`, mounted in `core.tsx`
`PollWidgetComponent` · deck `catalog.ts` poll (`closes`, `needs`,
`setNeeds`, `setCloses`) · pinned on the asker's clock in `useVoiceBuild`
`itemsOf` · stand-in `mockDeal.ts` · edits `lib/deck/edits.ts` ·
validator `convex/widgetData.ts` `pollData` · your-turn skips a decided
poll (`lib/yourTurn.ts`).
