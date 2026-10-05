---
route: #/space/family
ready: checkin
testids: checkin checkin-total checkin-row checkin-today checkin-streak checkin-status checkin-logger checkin-draft checkin-less checkin-more checkin-log
states:
  open: ?mock=1 | sleep 600
  logging: ?mock=1 | sleep 600 | click checkin-today | wait checkin-logger | sleep 400
  logged: ?mock=1 | sleep 600 | click checkin-today | wait checkin-logger | click checkin-log | sleep 900
  mina: ?mock=1&as=mina | sleep 600
  final: ?mock=1&challenge=final | sleep 600
take:
  log: open real 30fps 150f focus checkin | 20 click checkin-today | 50 click checkin-more | 80 click checkin-log
---
# Check-in (a new card kind: `checkIn`)

**For a user:** a chart for a challenge the group is in together. One
strip per person in their colour; one round magnet per day with what they
logged ("40"), a dashed ring with × for a day they missed, a dot for days
to come, a star under the reveal. Today's column wears a black pill. Your
own cell for today is a black button with a lime ＋: tap it and the foot of
the card turns into the logger (`i did` −5 − **44** + +5 `log it →`). On
`log it` the magnet slaps on with a squash, your streak (the black tile at
the end of the strip: days in a row) ticks, and the big total top right
counts up. A streak that is alive but not banked today is a dashed tile.
Tap your magnet again to raise today's number. A `done` challenge skips
the logger: tap = ✓. The foot otherwise says one thing: who the card is
waiting on.

**Settings (`widget.data`, type `CheckInData` in `src/lib/challenge.ts`):**

```
title    string                          "push-ups"
kind     "number" | "done"               a count, or a tick (stored as 1)
unit     string                          "push-ups": lowercase plural
start    "YYYY-MM-DD" (local)            day one
days     number, 1–14                    loggable days
revealAt "YYYY-MM-DDTHH:mm" (local), optional   adds the star column; standings open to all then
goal     number, optional                "going for 700"
people   { name, color }[]               who signed up, in row order
logs     { [name]: (number | null)[] }   one slot per day, null = nothing
```

Today is worked out from `start` and the clock, never stored. A log is
`withLog(data, name, day, value)`; the card hands the whole next `data` to
`onWidgetData(widgetId, data)` from `BoardLinkContext`. Mock keeps it in
`widgetDataOverrides`; live needs `LiveSpace` to pass `updateWidgetData`.
Without `onWidgetData` the card is read-only (no ＋).

**For the voice deck (next task):** a catalog entry needs only
`{ title, kind, unit, days, revealAt?, goal? }` from the model; code fills
`start` = today, `people` = `@everyone` (or `@coming`), `logs` = `{}`. The
"challenge" recipe = rsvp + this + [standings](standings.md) with
`source` = this card's id + a countdown to `revealAt`.

**Drive:** `drive sheet check-in:open check-in:logging check-in:logged --w 1440,390`.
Whose seat: live = your name if it is in `people`; mock = `?as=<name>`,
else the first person with nothing today (Casey in the family). A row is
`checkin-row` with `data-person`; the card has `data-viewer`.

**Phone (container under 430px):** each strip becomes two lines, name and
streak over the magnets; the weekday header is dropped; the logger wraps
with a full-width `log it`.

**Code:** `src/widgets/challenge.tsx` (`CheckInWidget`, `useChallenge`,
`viewerOf`, `BoardLinkContext`) + `challenge.css` · maths in
`src/lib/challenge.ts` (`streakOf`, `groupTotal`, `loggableDay`, `withLog`)
· registered in `WidgetCard.tsx`, `types.ts`, `widgetDefaults.ts`,
`widgetLabels.ts`, `templates.ts` (hidden from the add tray until it has
an editor) · provider in `Canvas.tsx`, mock store in `App.tsx`
(`storeWidgetData`).

**Gotchas:** tapping the cell also selects the card, so the
drag/zoom/edit/delete bar shows in `logging`. Not in `convex/widgetData.ts`
yet, so a live room can't save one.
