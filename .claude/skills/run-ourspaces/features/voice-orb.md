---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb dock-voice-text dock-voice-done voice-stage voice-stage-status voice-stage-wave voice-stage-text voice-stage-chip-0 voice-stage-chip-1 voice-stage-chip-2 voice-stage-mute voice-stage-finish
states:
  idle: ?voice=Make a space for our Tahoe weekend
  open: ?stage=center | click dock-voice-orb | wait voice-stage | sleep 1300
  quiet: ?voice=Make a space for our Tahoe weekend&stage=center&stageHold=1&level=0.12 | click dock-voice-orb | wait voice-stage | sleep 3300
  loud: ?voice=Make a space for our Tahoe weekend&stage=center&stageHold=1&level=0.9 | click dock-voice-orb | wait voice-stage | sleep 3300
  working: ?stage=center&voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait voice-stage | sleep 1500 | click voice-stage-finish | sleep 900
  dock-listening: ?voice=Make a space for our Tahoe weekend&stage=0 | click dock-voice-orb | wait dock-voice-text | sleep 2200
  idle-knot: ?orb=knot&voice=Make a space for our Tahoe weekend
  idle-glass: ?orb=glass&voice=Make a space for our Tahoe weekend
  open-glass: ?orb=glass&stage=center | click dock-voice-orb | wait voice-stage | sleep 1300
  open-knot: ?orb=knot&stage=center | click dock-voice-orb | wait voice-stage | sleep 1300
  quiet-knot: ?orb=knot&voice=Make a space for our Tahoe weekend&stage=center&stageHold=1&level=0.12 | click dock-voice-orb | wait voice-stage | sleep 3300
  loud-knot: ?orb=knot&voice=Make a space for our Tahoe weekend&stage=center&stageHold=1&level=0.9 | click dock-voice-orb | wait voice-stage | sleep 3300
  working-knot: ?orb=knot&stage=center&voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait voice-stage | sleep 1500 | click voice-stage-finish | sleep 900
take:
  ask: idle real 60fps 330f warmup 1500 | 20 click dock-voice-orb
  ask-glass: idle-glass real 60fps 330f warmup 1500 | 20 click dock-voice-orb
  ask-knot: idle-knot real 60fps 330f warmup 1500 | 20 click dock-voice-orb
---
# Voice orb + the centred stage

**For a user:** talk to the space. The calm glass orb leads the bottom dock.
Tap it (or "say what to add"): the orb itself lifts out of the dock into the
voice stage. The default stage is the two-part one, you speak on the left
and it builds on the right: see [voice-stage](voice-stage.md). This file
covers the orb and the earlier centred stage (`?stage=center`): the orb in
the middle of the dark, "What are we doing together?", a lime "Listening"
pill, a waveform, your words as a headline, three starter asks, Mute and
Finish. It lets go when the ask ends ([voice-build](voice-build.md)).

**Looks:** the default is `calm`, the orb the dock has always had (a clear
ball, one soft field of liquid light, violet → pink → orange), scaled up for
the stage. For that size it runs on a clock that never jumps when the mood
changes and carries one step of dither against banding; nothing else in it
changed. `?orb=glass` (three translucent lobes of light, lights the dark
around it) and `?orb=knot` (glossy ribbons passing over and under) are the
stage looks from the first pass. All three are live shaders driven by the
voice level.

**Drive:** `?voice=<sentence>` scripts the ask (one word per 300 ms, fake
loudness; `&voicePace=talk` = the measured pace). `&stageHold=1` stops the
script finishing; `&level=0.9` pins the loudness (stills). `?stage=0` =
the old dock-only strip (`dock-listening`). `voice-stage` carries
`data-phase` (`open` → `closing`) and `data-mode` (`two | center`).
Centred chips: `voice-stage-chip-0..2` fill the ask and send it after
650 ms. States ending `-knot` / `-glass` are the other looks. Take:
`drive take voice-orb:ask --real` (default stage and orb).

**The release seam (centred stage only):** `releaseVoiceStage()` in
`src/lib/voiceStage.ts`: the stage closes, the orb flies home and keeps
listening in the dock strip. The two-part stage lets go on it too, but
normally closes itself when the card is whole.

**Code:** `src/components/VoiceStage.tsx` (`useVoiceStage`: owns the orb's
host span, moves it dock ⇄ stage and flies it per frame) + `voice-stage.css`
· `ActionDock.tsx` `DockVoice` (seat + dock strip) · `VoiceOrb.tsx` over
`src/lib/orbShader.ts` (three looks) · `src/lib/voice.ts` `useVoice`
(`mute`, `say`, `play`, `cancel` in one block at the end).

**Gotchas:** headless WebGL runs on Metal; blank orb → `DRIVE_GL=swiftshader`.
The orb is ONE canvas: never render a second `VoiceOrb`. While the stage is
up the dock shows its idle layout under the blur. Mute drops what the
recogniser hears but a browser may replay muted words after unmute. On the
phone the ball is capped: wider and the 160% canvas box grows the mobile
layout viewport.
