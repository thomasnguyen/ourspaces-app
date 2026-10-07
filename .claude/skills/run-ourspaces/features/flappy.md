---
route: #/space/crew
ready: scoreboard
testids: flappy-start flappy-sheet flappy-canvas flappy-board flappy-over flappy-again flappy-close
states:
  pill: ?as=Rio&board=open&fly=scoreboard | wait flappy-start | sleep 900
  open: ?as=Rio&flappy=open | wait flappy-canvas | sleep 900
  flying: ?as=Rio&flappy=open | wait flappy-canvas | click flappy-canvas | sleep 350 | click flappy-canvas | sleep 350 | click flappy-canvas | sleep 300
  over: ?as=Rio&flappy=open | wait flappy-canvas | click flappy-canvas | wait flappy-over | sleep 700
  auto: ?as=Rio&flappy=auto | wait flappy-canvas | sleep 9500
---
# Flappy (the room's week-long high score)

**For a user:** the scoreboard's `flappy · beat the room →` pill opens a
sheet over the board in the classic flappy look, drawn in code (no borrowed
sprites): teal sky, clouds, a city and bushes in parallax, shaded green
pipes, striped grass. You are the classic bird in your colour (pale belly,
big eye, two-lip beak, a wing that beats); friends perch as small birds in
theirs where their best run went down. `get ready` → score pops per pipe
with a ding → hit = white flash + shake → `game over` with a medal panel
(bronze 10, silver 20, gold 30, platinum 40). Sounds are synthesised
(WebAudio), off when the app's sound is off. Everyone in the room
flies the same pipes all week (seeded by room + week). On the ground, a
flag with each friend's face stands where their best run went down, so you
fly past them. Beside it, the room's bests, you in your colour. Dying shows
your score, "new best", and how many more to pass the next person;
`again →`, a tap or space restarts.

**Prototype honesty:** bests are kept in this browser (localStorage
`flappy:<room>:<week>`); in mock rooms the cast's bests are seeded from a
hash, in a live room only what was flown here shows. Nothing reaches the
scoreboard points or Convex yet.

**State URLs:** `?flappy=open` opens the sheet at once; `?flappy=auto` opens it and flies itself through the gaps (for takes and to see the perched birds).

**Code:** `src/components/games/Flappy.tsx` (+ `flappy.css` `.fl-*`), pill
mounted in `Scoreboard.tsx`'s footer. Physics on a fixed 1/120 s step.
