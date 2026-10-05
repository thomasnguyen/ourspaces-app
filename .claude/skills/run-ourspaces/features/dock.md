---
route: #/space/crew
ready: dock-voice-orb
testids: dock-voice-orb dock-recap dock-chat dock-sound dock-sound-toggle dock-radio-key
states:
  idle:
  sound: | click dock-sound | wait dock-radio-key | sleep 450
  recap: | click dock-recap | wait css:.recap-panel | sleep 450
---
# The dock (bottom bar)

**For a user:** one black pill at the bottom of every room. The voice orb and
"say what to add" lead it; after a divider come three quiet icon keys: `✦`
catch me up, chat with its count, and `♪`. The `♪` key opens a small menu
with the room radio (play key + station, the label pans to the radio card)
and the interface sounds switch. With the radio on, `♪` turns into dancing
bars; a lime dot on it means someone else has it on.

**Get there:** any room. `idle` = page loaded.

**Drive:** `click dock-sound` opens the menu; `dock-radio-key` plays or stops
the station, `dock-sound-toggle` flips interface sounds. In a room with no
radio widget `dock-sound` is the sounds switch itself and there is no menu.
Voice states live in [voice-orb](voice-orb.md), the panel in [recap](recap.md).

**Code:** `src/components/ActionDock.tsx` (`DockVoice`, `DockSound`,
`ActionDock`) · styles in `src/index.css` from `.action-dock`.

**Gotchas:** tapping the orb opens the voice stage over the whole room; the dock keys are hidden once the orb is back and listening or working.
The menu closes on a press outside it.
