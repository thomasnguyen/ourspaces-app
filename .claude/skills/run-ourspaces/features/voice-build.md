---
route: #/space/crew
ready: dock-voice-orb
testids: voice-shell voice-landed voice-receipt claim-enter dock-voice-orb
states:
  room: ?enter=1
  ask: ?enter=1&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-shell | wait voice-receipt | sleep 600
  mock: ?voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-receipt | sleep 900
  shell: ?voice=add a poll for Saturday dinner&voiceHold=1 | click dock-voice-orb | wait voice-shell | sleep 900
  gate: | click claim-enter | wait dock-voice-orb | sleep 1200
  say: ?enter=1&voice=add a poll for Saturday dinner | sleep 1400
  mocksay: ?voice=add a poll for Saturday dinner | sleep 600
take:
  ask: say real 30fps 165f | 3 click dock-voice-orb
---
# Voice build (say it → it builds)

**For a user:** tap the orb and say "add a poll for Saturday dinner". When
you stop talking the board glides to a clear spot and a dashed shell in your
colour opens there, card-sized: "Lightning · dealing", a running clock, your
words in quotes. Nemotron Lightning picks a card from the deck; code places
it and commits it, so it lands on every screen in the room. On yours it
drops into the shell, which goes solid, takes the card's real box and lets
go. Then a slip tapes itself to the card's corner: `Thomas said it` in your
colour, and the receipt `Lightning · 640 ms` (end of speech → card on your
screen, measured; the same clock the shell was running). The slip leaves
after 6 s. No card fits, or the answer is invalid: "couldn't place that"
above the dock, nothing is committed.

**Get there:** live rooms on the dev lane (`drive up --lane`); every room
opens behind the gate (`claim-enter`). Mock (`?mock=1`) runs a marked
stand-in (`src/lib/deck/standIn.ts`): one fixed poll through the same
apply/place path, slip `… said it · stand-in`, no model, no clock, no ms.

**Drive:** `?voice=<sentence>` scripts the ask (words × 300 ms + 700 ms,
then speech ends). `ask` = enter, click orb, wait `voice-shell`, wait
`voice-receipt` (lane; each run is one real Token Factory call and one
widget on the dev board). `mock` = same in mock; `shell` = mock with
`&voiceHold=1`, which keeps the shell up for a still. `voice-shell` carries
`data-phase` (`dealing` → `landing` for the half second it lets go);
`voice-receipt` carries `data-ms`; `voice-landed` carries
`data-widget-ref` = the new widget id; the landing card wears
`data-voice-land` for a second. `room` = in, nothing asked; `say` = in,
scripted, orb not tapped; `gate` = the gate. Two people: `drive eval` with
two contexts (A asks, B just sits in `room`); `drive two` runs the same
steps in both, so both would ask. Sheet: `drive sheet voice-build:shell
voice-build:mock --w 1440,390` (mock).

**Code:** `convex/voiceBuild.ts` (`deal` action: `streamChat` →
`parseDeal` per line → `applyCard` → `placeCards` → `widgets.createWidget`;
numbers in the `deals` table, read with `npx convex run
voiceBuild:recent`) · `src/live/useVoiceBuild.ts` (measure widgets and
frames, guess the shell's size from the words, pan, watch for the card,
handoff, slip) · `src/components/VoiceBuildLayer.tsx` + `.voice-shell` /
`.voice-slip` / `.voice-receipt` / `[data-voice-land]` in `src/index.css`
· wired in `LiveSpace.tsx` and `App.tsx` (mock) via `ActionDock onVoiceAsk`.

**Gotchas:** every lane ask writes a real widget to the dev room; clear
them with `widgets:deleteWidget` (ids are in `voiceBuild:recent`). The
shell's size is a guess from the words (a card name in the sentence, else a
poll); it snaps to the real card's box as it lets go. Cards land in view when
a clear spot is in view, so frame the take on open board to skip the pan.
Frames are obstacles too (`data-frame-id`, measured with their label and
garland). A dealt poll grows 42 px per option past three. The ms includes
Convex sync to the asker's own screen, which is the honest number.
