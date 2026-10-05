---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb dock-voice-text dock-voice-done voice-stage voice-stage-status voice-stage-wave voice-stage-text voice-stage-chip-0 voice-stage-chip-1 voice-stage-chip-2 voice-stage-mute voice-stage-finish
states:
  idle: ?voice=Make a space for our Tahoe weekend
  open: ?stage=1 | wait voice-stage | sleep 1300
  quiet: ?voice=Make a space for our Tahoe weekend&stage=1&stageHold=1&level=0.12 | wait voice-stage | sleep 3300
  loud: ?voice=Make a space for our Tahoe weekend&stage=1&stageHold=1&level=0.9 | wait voice-stage | sleep 3300
  working: ?voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait voice-stage | sleep 1500 | click voice-stage-finish | sleep 900
  dock-listening: ?voice=Make a space for our Tahoe weekend&stage=0 | click dock-voice-orb | wait dock-voice-text | sleep 2200
  idle-knot: ?orb=knot&voice=Make a space for our Tahoe weekend
  open-knot: ?orb=knot&stage=1 | wait voice-stage | sleep 1300
  quiet-knot: ?orb=knot&voice=Make a space for our Tahoe weekend&stage=1&stageHold=1&level=0.12 | wait voice-stage | sleep 3300
  loud-knot: ?orb=knot&voice=Make a space for our Tahoe weekend&stage=1&stageHold=1&level=0.9 | wait voice-stage | sleep 3300
  working-knot: ?orb=knot&voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait voice-stage | sleep 1500 | click voice-stage-finish | sleep 900
take:
  ask: idle real 60fps 330f warmup 1500 | 20 click dock-voice-orb
  ask-knot: idle-knot real 60fps 330f warmup 1500 | 20 click dock-voice-orb
---
# Voice orb + voice stage

**For a user:** talk to the space. A glass orb leads the bottom dock. Tap it
(or "say what to add"): the orb itself lifts out of the dock and grows into
the middle of a dark stage, the room dimmed and blurred behind it. The stage
asks "What are we doing together?", shows a lime "Listening" pill and a
waveform that follows your voice, sets your words as a headline, and offers
three starter asks. Finish (or a tap outside) sends it; Escape throws it
away; Mute stops the mic. The stage then lets go: the orb flies back to the
dock and the board is in view for the card ([voice-build](voice-build.md)).

**Looks:** `?orb=glass` (default: a clear ball, folded sheets of light
inside) or `?orb=knot` (glossy ribbons folded into a ball). Both are live
shaders driven by the voice level.

**Drive:** `?voice=<sentence>` scripts the ask (one word per 300 ms, fake
loudness). `?stage=1` opens the stage on load; `&stageHold=1` stops the
script finishing; `&level=0.9` pins the loudness (stills). `?stage=0` =
the old dock-only strip (`dock-listening`). `voice-stage` carries
`data-phase` (`open` → `closing`). Chips: `voice-stage-chip-0..2` fill
the ask and send it after 650 ms. States ending `-knot` are the other look.
Sheet: `drive sheet voice-orb:idle voice-orb:open voice-orb:quiet
voice-orb:loud voice-orb:working --w 1440,390`. Take: `drive take
voice-orb:ask --real` (tap → stage → words → release → card).

**The release seam:** `releaseVoiceStage()` in `src/lib/voiceStage.ts`.
Call it the moment a build starts (mid-sentence is fine): the stage closes,
the orb flies home and keeps listening in the dock strip (`dock-voice-text`,
`dock-voice-done`). It also releases by itself when the voice leaves
"listening". No-op when no stage is up.

**Code:** `src/components/VoiceStage.tsx` (`useVoiceStage`: owns the orb's
host span, moves it dock ⇄ stage and flies it per frame; stage markup,
waveform, chips) + `voice-stage.css` · `ActionDock.tsx` `DockVoice` (seat
+ dock strip) · `VoiceOrb.tsx` over `src/lib/orbShader.ts` (both looks) ·
`src/lib/voice.ts` `useVoice` (`mute`, `say`, `cancel` added in one
block at the end).

**Gotchas:** headless WebGL runs on Metal; blank orb → `DRIVE_GL=swiftshader`.
The orb is ONE canvas: never render a second `VoiceOrb`. While the stage is
up the dock shows its idle layout under the blur. Mute drops what the
recogniser hears but a browser may replay muted words after unmute. On the
phone the ball is capped at 76vw: wider and the 160% canvas box grows the
mobile layout viewport.
