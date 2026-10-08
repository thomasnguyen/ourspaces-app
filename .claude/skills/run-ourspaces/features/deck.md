---
route: #/space/crew
ready: space-canvas
testids: space-canvas widget-deck-lab-0 widget-deck-lab-1 widget-deck-lab-3 widget-deck-lab-7
states:
  one: ?deck=1 | wait widget-deck-lab-0 | sleep 600
  four: ?deck=4 | wait widget-deck-lab-3 | sleep 600
  eight: ?deck=8 | wait widget-deck-lab-7 | sleep 600
  beside: ?deck=2&deckSel=playlist | wait widget-deck-lab-1 | sleep 600
take:
---
# The deck (dealt cards land on the board)

**For a user:** you ask out loud ("plan our Tahoe weekend") and cards land
in front of you as one tidy cluster, never on top of anything. With
something selected they land beside it. This lab deals a canned eight-card
answer through the real code path; the live model path is [voice-build](voice-build.md).

**Get there:** `?mock=1&deck=<1-8>` on any mock space. `&deckSel=<widget id>`
selects an object first (cards land beside it); `&deckHeld=<id,id>` marks
objects as held (wider berth). Lab card ids are `deck-lab-<i>`.

**Drive:** `drive sheet deck:one deck:four deck:eight --w 1440,390`. Cards
appear ~400 ms after load (the lab measures the view first). Cards that
don't fit the view land just outside it, so at 390 a shot can miss some.

**Code:** `src/lib/deck/` — `catalog.ts` (17 cards, settings schemas,
`build`), `schema.ts` (field DSL, `checkSettings`), `apply.ts`
(`checkCard`, `applyCard`), `place.ts` (`placeCards`), `prompt.ts`
(`deckPrompt`, `dealTurn`, `parseDeal`), `lab.ts` (this lab) · hook in
`src/App.tsx` next to `addedWidgets`. Print the catalog:
`node scripts/print-deck.mjs [--prompt]`.

**Gotchas:** mock only, and the lab places against the fixture rects
(`getSpace(id).widgets`), not dragged positions. The lab cards have no test
id (WidgetCard isn't the deck's file), so states wait on `data-widget-id`.
