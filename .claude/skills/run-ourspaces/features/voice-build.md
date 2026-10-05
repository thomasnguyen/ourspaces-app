---
route: #/space/crew
ready: dock-voice-orb
testids: voice-shell voice-landed voice-receipt dev-readout dev-context-drawer dev-context-close claim-enter dock-voice-orb
states:
  room: ?enter=1
  ask: ?enter=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-shell | wait voice-landed | sleep 900
  hesitate: ?enter=1&voicePace=talk&voice=add a poll for … Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  drawer: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 1500 | click dev-readout | wait dev-context-drawer | sleep 300
  mock: ?stage=0&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-landed | sleep 900
  shell: ?stage=0&voice=add a poll for Saturday dinner&voiceHold=1 | click dock-voice-orb | wait voice-shell | sleep 2600
  mockdrawer: ?stage=0&timing=1&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-landed | sleep 1200 | click dev-readout | wait dev-context-drawer | sleep 300
  gate: | click claim-enter | wait dock-voice-orb | sleep 1200
  say: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1400
  mocksay: ?voice=add a poll for Saturday dinner | sleep 600
  dockstrip: ?stage=0&voicePace=talk&voice=add a poll for Saturday dinner | sleep 600
take:
  ask: say real 30fps 165f | 3 click dock-voice-orb
  dockstrip: dockstrip real 30fps 165f | 3 click dock-voice-orb
---
# Voice build (say it → it builds)

**For a user:** tap the orb and say "add a poll for Saturday dinner". By
"poll" a real poll card is already on the board in your view, empty, in a
ring of your colour, its title filling from your words. You don't tap
anything: a pause ends the ask (a sentence left hanging on "for…", "the…" or
a comma gets a longer wait). Within a beat of your last word the poll's
question and options fill in, it settles into a clear spot (gliding there,
the camera following only if the spot is off-screen), the ring lets go and
a slip says `Thomas said it`. Everyone else in the room gets the card
through Convex. No card fits: "couldn't place that" above the dock.

**Under it:** code guesses the card from the words (0 ms, `deck/guess.ts`);
words steady for 200 ms (4+ words, not hanging) go to Nemotron early as a
speculative `deal` that only returns cards; its answer streams into the
skeleton field by field. On the pause, the call for exactly those words is
used (else one goes out then), the card renders here first, `placeCards`
picks the spot, `commit` writes it, and the synced card replaces the local
one in the same frame. Usually 2–3 calls per ask.

**Dev readout** (dev lane, or `?timing=1`; `?timing=0` hides it): a mono
line under the live strip (`dev-readout`): model · last word → card ms ·
calls · guess right/wrong; `voice-receipt` inside it carries `data-ms` =
last word → card complete on this screen. Click it (or a slip, in dev) for
the context drawer (`dev-context-drawer`, `dev-context-close`): words heard
with times, every call (speculative or not, used or ignored), the code's
guess, the room context sent to the model (one `context` string), the raw
answer, cards after `applyCard` (rejects with the reason), why the spot,
stage times from the last word. Last 10 asks, older/newer. Mock: "simulated from
measurements · no model ran", "not sent", no ms.

**Drive:** `?voice=<sentence>` scripts the ask; `&voicePace=talk` = ~180
wpm, each word lands when it ends, "…" = a 900 ms hesitation
(`&voicePause=`). Lane states write real widgets to the dev board (clear
them with `widgets:deleteWidget`). `shell` = mock skeleton held
(`&voiceHold=1`); `drawer`/`mockdrawer` open the drawer. `voice-landed`
carries `data-widget-ref` (draft id, then the synced id after commit).
`voice-shell` carries `data-phase` (`dealing` → `landing`). Marks:
`performance.mark("voice:*")`; the last ask's trace is `window.__voiceTrace`.

**Code:** `src/live/useVoiceBuild.ts` (session, guess, specs, settle,
commit, `withDrafts`) · `src/lib/deck/guess.ts` · `src/lib/voice.ts`
(pause detection, script) · `convex/voiceBuild.ts` (`deal`, `live`,
`commit`, `warm`; rows in `deals`, read with `npx convex run
voiceBuild:recent`) · `src/components/VoiceBuildLayer.tsx` (ring, slip,
readout, drawer) · styles `.voice-shell`, `voice-draft-`, `.dev-readout`,
`.dev-context` in `src/index.css` · wired in `LiveSpace.tsx`, `App.tsx` (mock).

**Gotchas:** the skeleton is a local draft (`data-widget-id="voice-draft-…"`,
not clickable); WidgetCard renders it. A crowded view means it floats over
the board (`data-voice-draft="lifted"`) until placed. Speculative calls
cost tokens even when ignored.

**Voice stage:** the orb tap opens the two-part stage
([voice-stage](voice-stage.md)): the skeleton and its fill show there,
larger, and the card flies to its board spot when it is whole. The stage
only reads this build (`feedVoiceStage` in `VoiceBuildLayer`). Mock asks
are simulated on the measured clock (`src/lib/deck/mockDeal.ts`,
`src/lib/voiceTimings.ts`); `?stage=0` shows the build on the board as before.
