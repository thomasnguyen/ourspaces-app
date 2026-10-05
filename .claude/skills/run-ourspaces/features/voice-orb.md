---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb dock-voice-text dock-voice-done
states:
  idle: ?voice=Make a space for our Tahoe weekend
  listening: ?voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait dock-voice-text | sleep 1600
  working: ?voice=Make a space for our Tahoe weekend | click dock-voice-orb | wait dock-voice-text | sleep 1600 | click dock-voice-done | sleep 250
take:
  ask: idle real 60fps 280f warmup 1500 focus css:.action-dock | 20 click dock-voice-orb | 130 click dock-voice-done
---
# Voice orb (dock)

**For a user:** talk to the space. The glass orb leads the bottom dock, bigger
than the bar, with "say what to add" beside it. Tap either: the orb lifts and
listens, the other dock keys step out and your words take the bar; a pause
ends the ask (tap again or `done` to end it sooner). The room deals a card from it ([voice-build](voice-build.md)).

**Get there:** any room; it leads the action dock. `idle` = page loaded.

**Drive:** `?voice=<sentence>` swaps the mic for a scripted ask (one word per
300 ms, fake loudness). It still needs the orb click to start. `listening` =
click orb, words appear in `dock-voice-text`, `done` shows. `working` = click
`done`; it lasts until the room's ask settles (1.4 s with none, 15 s cap).
The script never ends the ask itself: the pause after its last word does
(~650 ms of quiet; longer if the words hang on "for…"), so `done` must come
before ~words×300+300 ms.

**Code:** `src/components/ActionDock.tsx` `DockVoice` · orb `VoiceOrb.tsx` over
`src/lib/orbShader.ts` (WebGL: clear glass, liquid light inside) ·
`src/lib/voice.ts` `useVoice` / `runScript`. code-map: line 70.

**Gotchas:** headless WebGL runs on Metal; blank orb → `DRIVE_GL=swiftshader`.
While listening or working the rest of the dock is `display: none`, so
`dock-recap` / `dock-chat` / `dock-sound` can't be clicked until it's idle.
No URL lands directly in listening/working.
