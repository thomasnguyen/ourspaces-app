---
route: #/space/crew
ready: dock-voice-orb
testids: row-halo row-halo-tag row-ghost row-ghost-on row-ghost-cancel knows-held-back widget-edit-button widget-editor-title widget-editor-save dev-context-edit-lease dev-context-edit-outcome voice-edit-slip
states:
  held: ?mock=1&row=held | wait row-halo-tag | sleep 400
  ghost: ?mock=1&row=ghost | wait row-ghost | sleep 600
  land: ?mock=1&row=land | wait row-ghost | sleep 5200
  knows: ?mock=1&row=ghost #/space/crew/knows | wait knows-held-back | sleep 600
  boot-land: ?mock=1&row=land | sleep 300
  liveknows: ?enter=1 #/space/crew/knows | wait knows-held-back | sleep 800
take:
  land: boot-land real 30fps 180f focus css:[data-widget-id="poll-cake"]
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
knows" lists it under "what it held back" (`knows-held-back`).

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
`src/lib/rowMock.ts`. Drawer: `dev-context-edit-lease`,
`dev-context-edit-outcome`. Eval: `nebius/eval/r1-right-of-way.md`.
