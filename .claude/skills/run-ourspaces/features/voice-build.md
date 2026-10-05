---
route: #/space/crew
ready: dock-voice-orb
testids: voice-shell voice-landed voice-receipt claim-enter dock-voice-orb
states:
  room: ?enter=1
  ask: ?enter=1&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-shell | wait voice-receipt | sleep 600
  mock: ?voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-receipt | sleep 400
  gate: | click claim-enter | wait dock-voice-orb | sleep 1200
  say: ?enter=1&voice=add a poll for Saturday dinner | sleep 1400
  mocksay: ?voice=add a poll for Saturday dinner | sleep 600
take:
  ask: say real 30fps 135f | 3 click dock-voice-orb
---
# Voice build (say it → it builds)

**For a user:** tap the orb and say "add a poll for Saturday dinner". When
you stop talking a dashed shell in your colour drops where the card will
land ("Lightning · dealing", your words in quotes) while the orb works.
Nemotron Lightning picks a card from the deck; code places it and commits
it, so it lands on every screen in the room. A tag ("Thomas said it") sits
on the new card and a receipt shows above the dock: `poll · Lightning ·
640 ms` (end of speech → card on your screen, measured). No card fits, or
the answer is invalid: "couldn't place that", nothing is committed.

**Get there:** live rooms on the dev lane (`drive up --lane`); every room
opens behind the gate (`claim-enter`). Mock (`?mock=1`) runs a marked
stand-in (`src/lib/deck/standIn.ts`): one fixed poll through the same
apply/place path, receipt `poll · stand-in`, no model, no ms.

**Drive:** `?voice=<sentence>` scripts the ask (words × 300 ms + 700 ms,
then speech ends). `ask` = enter, click orb, wait `voice-shell`, wait
`voice-receipt` (lane; each run is one real Token Factory call and one
widget on the dev board). `mock` = same in mock. `voice-receipt` carries
`data-ms`; `voice-landed` carries `data-widget-ref` = the new widget id.
`room` = in, nothing asked; `say` = in, scripted, orb not tapped; `gate` = the gate. Two people: `drive eval` with two contexts (A asks, B just sits in `room`);
`drive two` runs the same steps in both, so both would ask.

**Code:** `convex/voiceBuild.ts` (`deal` action: `streamChat` →
`parseDeal` per line → `applyCard` → `placeCards` → `widgets.createWidget`;
numbers in the `deals` table, read with `npx convex run
voiceBuild:recent`) · `src/live/useVoiceBuild.ts` (measure, shell, watch
for the card, pan, receipt) · `src/components/VoiceBuildLayer.tsx` +
`.voice-shell` / `.voice-receipt` in `src/index.css` · wired in
`LiveSpace.tsx` and `App.tsx` (mock) via `ActionDock onVoiceAsk`.

**Gotchas:** every lane ask writes a real widget to the dev room; clear
them with `widgets:deleteWidget`. The shell is poll-sized; a bigger card
lands as close to its spot as fits. The ms includes Convex sync to the
asker's own screen, which is the honest number.
