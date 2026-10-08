---
route: #/space/crew
ready: dock-voice-orb
testids: row-halo row-halo-tag row-ghost row-ghost-on row-ghost-cancel row-vote row-vote-ask row-vote-stake row-vote-option row-vote-you row-vote-tally row-vote-withdraw row-vote-note dev-context-edit-affected dev-context-edit-vote knows-held-back knows-held-sum knows-held-row widget-edit-button widget-editor-title widget-editor-save dev-context-edit-lease dev-context-edit-outcome voice-edit-slip
states:
  held: ?mock=1&row=held | wait row-halo-tag | sleep 400
  ghost: ?mock=1&row=ghost | wait row-ghost | sleep 600
  land: ?mock=1&row=land | wait row-ghost | sleep 5200
  knows: ?mock=1&row=ghost #/space/crew/knows | wait knows-held-back | sleep 600
  boot-land: ?mock=1&row=land | sleep 300
  liveknows: ?enter=1 #/space/crew/knows | wait knows-held-back | sleep 800
  ask: ?mock=1&row=ask | wait row-vote | sleep 600
  askland: ?mock=1&row=askland | wait row-vote | sleep 3400
  boot-ask: ?mock=1&row=askland | sleep 300
take:
  land: boot-land real 30fps 180f focus widget-poll-cake
  askland: boot-ask real 30fps 120f focus widget-poll-cake
---
# Right of Way (the AI never changes what someone is touching)

**For a user:** while someone drags a card, has its editor open (typing,
the title too) or is pressing one of its choices, everyone else sees a thick
flat frame in that person's colour (ink keyline, hard shadow) with a tab
"jules has this" (`row-halo`, `row-halo-tag`; not on a tap under 250 ms). If
the AI is asked to change that card meanwhile, the change waits: the stage
says "waiting on jules · jules is moving it" for under a second and goes to
the board, where every screen shows the change as a lime row with a dashed
ink edge on the card (a new option row, a struck one, the new name) and an
ink ticket hanging off the card's bottom edge: "maya added ramen ··· waiting
on [jules]" (`row-ghost`, `row-ghost-on`; the asker gets `row-ghost-cancel`;
the holder reads "waiting on you"). Solid = a person's hand, dashed = the
space waiting. When jules lets go the handover plays: the frame draws in over
the grace (0.6 s after a drag, 1.5 s after typing or choosing), the ticket
turns lime "jules let go", goes up into the card, and the row closes solid
and lets its lime go, with the slip "added ramen · waited 4.8 s for jules"
(`voice-edit-slip`); if the card
changed meanwhile it is dropped: "that changed while you waited; nothing done".
After 30 s it gives up the same way. Asking about a card you hold yourself
just goes. A closed laptop frees its cards within 3 s. "what this space
knows" lists it under "what it held back" (`knows-held-back`): up to 12 slips from the
week's ledger (waits: who, how long, what happened; votes: who was asked and the outcome; refusals),
each a tap back to its card (`knows-held-row`), under one computed line (`knows-held-sum`): "held back
14 times this week · never changed something someone was holding · 37 writes checked". The second half
checks every committed write against who the leases said held it (`aiWrites.others`, a landed wait's
`heldBy`), not the verdict; it turns orange and says so if that is ever false. Proof of the rule
against a model judge: `eval/right-of-way/` (README).

**Choices become a vote (R2).** If a spoken change would override what
other people chose (a vote for an option, a claimed item, a yes to an rsvp's
time, a payment into a split, logged check-ins, a date someone set in the
card's editor), it isn't written. The stage says "that's 3 people's choice ·
asked them" and goes to the card, where every screen shows an ink ticket off
its bottom edge: "move game night to sunday?" / "tara asked · 3 people said
yes to friday" (`row-vote`, `row-vote-ask`, `row-vote-stake`). Only those
people get `keep it` / `change it` (`row-vote-option`, `data-option`
keep | c1 | c2) and "waiting on you" (`row-vote-you`); it is also a ticket in
their "waiting on you" pile (kind `decide`). Everyone sees who has answered
(`row-vote-tally`); the asker can `row-vote-withdraw`. One person at stake
is asked directly: "tara wants to take towels off the list · ok / no". If it
was only the asker's own choice, it just goes. Code closes it: more than half
→ that; everyone answered without that (a tie) → kept; a day passes → kept;
withdrawn; everyone changed their own answer by hand → moot, the change just
goes. A passed change goes back through the door, so a held card makes it
wait as a ghost. It closes into a cream note on the card (`row-vote-note`):
"2 of 3 said change it · friday rsvps cleared · 3 people, answer again" (the
choices that no longer make sense are cleared, never converted), or "kept".
A second ask on the same choice joins as another option (named by what it
changes to: keep it / sunday / saturday); a fourth says "one thing at a time".
Drawer: `dev-context-edit-affected` (who counted and why), `dev-context-edit-vote`.
"what it held back" lists asks with their outcome. `?asklife=<s>` gives a
vote a short life (tests).

**Take (four browsers, live):** `.context/r2/run.mjs <tag> [run ids] [--strip]`
(seats Tara asks, Holly / Sam / Jo at stake; runs core1 core2 keep1 poll1 poll2
tie expire withdraw one-claim one-split asker-only moot composed second busy
checkin date; `BASE=http://127.0.0.1:5591` for a lane Vite; `--strip` tiles
the four screens at asked / first answer / held / after). Safety:
`.context/r2/safety.mjs <tag>` on the server versions it logged.

**Take (mock):** `drive take right-of-way:askland --real` (the cake poll,
two scripted voters; you are the third). `?row=ask` holds open.

**Take (two browsers, live):** `.context/r1/core.mjs` via `drive eval` (cfg.json runs: HOLD drag|title|titlekeep|vote|self|kill, CANCEL, STRIP → a two-screen filmstrip). `.context/l3/row.mjs` is the same with `BURST: n` (n two-screen frames right after the let-go) and `?timing=0`.

**Take (mock):** `drive take right-of-way:land --real` (the cake poll, scripted holder).

**Mock:** `?row=held|ghost|land` (`&rowCard=<title words>`): a scripted
second person holds the first poll, every tag says "scripted"; nothing is
decided by the real gate. `land` lets go at 3 s, lands at 3.6 s.

**Under it:** the gate `src/lib/rightOfWay.ts` (pure, case table + `CASES`),
the door `convex/rightOfWay.ts` (reads leases, logs `aiWrites`, `pending`
rows, `landWaiting`, `expire`, `cancel`, queries `room` and `heldBack`),
leases `convex/leases.ts` (hold, letGo, one scheduled `settle` per lease),
your hands `src/live/useHolds.ts`, the halo/ghost
`src/components/RightOfWay.tsx` + `right-of-way.css`, mock
`src/lib/rowMock.ts`. Votes: who counts = `applyEdit` in `src/lib/deck/edits.ts`
(`Choice`), counting = `src/lib/choiceVote.ts` (`tally`, case table), the
vote = `convex/choiceVotes.ts` (open/join, answer, withdraw, expire, `recheck`
for moot, `land` through the door, `room`), the ticket and note =
`src/components/ChoiceVote.tsx`. Drawer: `dev-context-edit-lease`,
`dev-context-edit-outcome`. Eval: `nebius/eval/r1-right-of-way.md`, `nebius/eval/r2-choices.md`.
