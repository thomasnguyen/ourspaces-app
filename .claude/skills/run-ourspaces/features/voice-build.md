---
route: #/space/crew
ready: dock-voice-orb
testids: voice-shell voice-landed voice-receipt dev-readout dev-context-drawer dev-context-close claim-enter dock-voice-orb
states:
  room: ?enter=1
  ask: ?enter=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-shell | wait voice-landed | sleep 900
  hesitate: ?enter=1&voicePace=talk&voice=add a poll for … Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  tentative: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | sleep 1750
  gapand: ?enter=1&voicePace=talk&voice=make a checklist: chips, salsa and … drinks | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  gapdate: ?enter=1&voicePace=talk&voice=countdown to Holly's birthday on … November 14 | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  late: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday …600 dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 3500
  drawer: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 1500 | click dev-readout | wait dev-context-drawer | sleep 300
  mock: ?voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-landed | sleep 900
  shell: ?voice=add a poll for Saturday dinner&voiceHold=1 | click dock-voice-orb | wait voice-shell | sleep 2600
  mockdrawer: ?timing=1&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-landed | sleep 1200 | click dev-readout | wait dev-context-drawer | sleep 300
  gate: | click claim-enter | wait dock-voice-orb | sleep 1200
  say: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1400
  mocksay: ?voice=add a poll for Saturday dinner | sleep 600
take:
  ask: say real 30fps 165f | 3 click dock-voice-orb
---
# Voice build (say it → it builds)

**For a user:** tap the orb and say "add a poll for Saturday dinner". By
"poll" a real poll card is already on the board in your view, empty, in a
ring of your colour. While you're still talking it fills *tentatively*
(washed out): "add a poll" already brings a question and options, "…for
Saturday" updates them in place. You don't tap anything: a pause ends the
ask (shorter when your exact words already made a whole card; longer when
the sentence hangs on "for…", "and…", "the…", a comma; never short on a
trailing number). About 0.6 s after your last word the card goes final
(full colour, a settle), glides to a clear spot, the ring lets go and a slip
says `Thomas said it`. Everyone else has it ~0.25 s later. A word that lands
just after the pause (within 1.2 s) reopens the ask: the card already
written is corrected in place, never dealt twice. No card fits: "couldn't
place that" above the dock.

**Under it:** code guesses the card from the words (0 ms, `deck/guess.ts`).
Every new word that names a card (not hanging) goes to Nemotron at once as
a speculative `deal` that only returns cards (no card named: 4+ words
steady 200 ms); two in flight at most, the newest words wait for a slot,
six per ask. The newest call's answer fills the draft (only closed fields,
merged over the last answer, so unchanged fields stay put); answers for
older words than the one shown are ignored. Nothing is committed while you
talk. On the pause, the call for exactly those words is used (else one goes
out then); the moment its first card closes in the stream the card goes
final, `placeCards` picks the spot and `commit` writes it with that spot
in one insert (counter, activity stamp and log line follow in a scheduled
mutation). Extra cards in the answer follow in a second write. Usually 3–4
calls per ask.

**Dev readout** (dev lane, or `?timing=1`; `?timing=0` hides it): a mono
line under the live strip (`dev-readout`): model · last word → final card ms ·
tentative ms (negative = before the last word) · calls · late word · guess right/wrong; `voice-receipt` inside it carries `data-ms` =
last word → card complete on this screen. Click it (or a slip, in dev) for
the context drawer (`dev-context-drawer`, `dev-context-close`): words heard
with times, every call (final, tentative only, or ignored), every fill
with its time (tentative or final, which fields changed), late words and
what happened to the card, the code's
guess, the room context sent to the model (one `context` string), the raw
answer, cards after `applyCard` (rejects with the reason), why the spot,
stage times from the last word. Last 10 asks, older/newer. Mock: stand-in,
"not sent", no ms.

**Drive:** `?voice=<sentence>` scripts the ask; `&voicePace=talk` = ~180
wpm, each word lands when it ends, "…" = a 900 ms hesitation
(`&voicePause=`), "…600" a 600 ms one. `tentative` stops mid-sentence on
the washed-out fill; `gapand`/`gapdate`/`hesitate` are pauses the ask
must survive; `late` ends early, then "dinner" reopens it and corrects
the card in place. Lane states write real widgets to the dev board (clear
them with `widgets:deleteWidget`). `shell` = mock skeleton held
(`&voiceHold=1`); `drawer`/`mockdrawer` open the drawer. `voice-landed`
carries `data-widget-ref` (draft id, then the synced id after commit).
`voice-shell` carries `data-phase` (`dealing` → `landing`). Marks:
`performance.mark("voice:*")`; the last ask's trace is `window.__voiceTrace`.

**Code:** `src/live/useVoiceBuild.ts` (session, guess, specs, settle,
commit, `withDrafts`) · `src/lib/deck/guess.ts` · `src/lib/voice.ts`
(pause detection, ready/late-word reopen, script) · `convex/voiceBuild.ts` (`deal`, `live`,
`commit`, `amend`, `noteCommitted`, `warm`; rows in `deals`, read with `npx convex run
voiceBuild:recent`) · `src/components/VoiceBuildLayer.tsx` (ring, slip,
readout, drawer) · styles `.voice-shell`, `voice-draft-`, `[data-voice-tentative]`, `.dev-readout`,
`.dev-context` in `src/index.css` · wired in `LiveSpace.tsx`, `App.tsx` (mock).

**Gotchas:** the skeleton is a local draft (`data-widget-id="voice-draft-…"`,
not clickable); WidgetCard renders it. A crowded view means it floats over
the board (`data-voice-draft="lifted"`) until placed; tentative fills carry
`data-voice-tentative` (a wash, not opacity: a floating draft must not show
the card under it). Speculative calls
cost tokens even when ignored.
