---
route: #/space/crew
ready: dock-recap
testids: dock-recap recap-panel recap-line
states:
  closed:
  open: | click dock-recap | wait recap-panel | sleep 450
  landed: | click dock-recap | wait recap-line | sleep 2500
take:
  open: closed real 60fps 210f | 15 click dock-recap
---
# Catch me up (recap)

**For a user:** the `✦` key in the dock (catch me up) opens "what moved", a short
numbered briefing of what changed on the board. Each line lights and pans to
its card as it lands; a follow-up box lets you ask about the board.

**Get there:** any room's dock; mock lines live in `src/data/recap.ts`.

**Drive:** `click dock-recap` opens the panel (`.recap-panel`); in mock the
"reading the board" beat is brief, so `open` usually already shows 1–2 lines;
`landed` waits for all of them. Click again or `×` to close.

**Code:** `src/components/ActionDock.tsx` recap panel (~l.380) · `src/App.tsx`
`openRecap` / `revealRecap` / `mockRecapReply` (code-map table: 1582–1670) ·
`src/lib/recapBoard.ts` (cites, pan clear of the panel). Live:
`convex/recap.ts` generate / ask.

**Gotchas:** opening pans the board to the first cited card, so the canvas
moves under the panel. The panel, its lines and the ask input have no test
ids, and no URL opens it.
