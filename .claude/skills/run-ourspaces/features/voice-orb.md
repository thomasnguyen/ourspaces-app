---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb dock-voice-text dock-voice-done
states:
  idle: ?voice=Make a space for our Tahoe weekend
  listening: ?voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait dock-voice-text | sleep 900
  working: ?voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait dock-voice-text | click dock-voice-done | sleep 150
take:
  ask: idle real 60fps 280f warmup 1500 focus css:.action-dock | 20 click dock-voice-orb | 170 click dock-voice-done
---
# Voice orb (dock)

**For a user:** talk to the space. Tap the orb at the left of the bottom dock;
it lifts and listens, your words run beside it; tap again or `done` to send.
Nothing acts on the ask yet (Nemotron call lands next).

**Get there:** any room; it leads the action dock. `idle` = page loaded.

**Drive:** `?voice=<sentence>` swaps the mic for a scripted ask (one word per
300 ms, fake loudness). It still needs the orb click to start. `listening` =
click orb, words appear in `dock-voice-text`, `done` shows. `working` = click
`done`; it lasts 1.4 s, then back to idle.
The script self-finishes at words×300+700 ms.

**Code:** `src/components/ActionDock.tsx` `DockVoice` · orb `VoiceOrb.tsx` over
`src/lib/orbShader.ts` (WebGL, `?orb=` variants in `lib/orbVariants.ts`) ·
`src/lib/voice.ts` `useVoice` / `runScript`. code-map: line 70.

**Gotchas:** headless WebGL runs on Metal; blank orb → `DRIVE_GL=swiftshader`.
No URL lands directly in listening/working.
