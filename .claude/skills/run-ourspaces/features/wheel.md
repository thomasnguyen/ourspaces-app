---
route: #/space/house
ready: wheel-spin
testids: wheel-spin wheel-svg
states:
  idle:
  spinning: | click wheel-spin | sleep 500
  landed: | click wheel-spin | sleep 100 | wait wheel-svg | sleep 300
take:
  spin: idle real 60fps 270f focus wheel-svg | 15 click wheel-spin
---
# Spin the wheel

**For a user:** a group decision wheel ("who takes the bins"). Anyone hits
`spin it →`, the wheel turns for ~3 s and lands; the result line reads
"<name> spun → <slice>", and the spin shows for everyone in the room.

**Get there:** the house room (`#/space/house`, top-left card). The league
room has a second one (`league-wheel`).

**Drive:** `click wheel-spin`. While turning, the button reads `landing…` and
is disabled; the svg has `.is-spinning`. Lands after the 3.2 s `.wheel-rotor`
transition (`transitionend` → `finishSpin`).

**Code:** `src/widgets/extras.tsx` `WheelWidget` (button ~l.227) · wiring
`src/components/WidgetCard.tsx` `onWheelSpin` · mock handler in `src/App.tsx`
"Widget interactions (poll/wheel/rsvp/dailyQ)" (code-map table, l.21) ·
fixtures `HOUSE_WIDGETS` in `src/data/spaces.ts`.

**Gotchas:** clicking spin also selects the card, so the drag/zoom/edit/
delete toolbar shows in spinning/landed. The result is random, so `landed` differs per run. Without
`onWheelSpin` the button reads "preview only" (disabled) outside the widget lab.
