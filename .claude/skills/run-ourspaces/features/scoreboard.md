---
route: #/space/crew
ready: scoreboard
testids: scoreboard scoreboard-locked scoreboard-open scoreboard-row scoreboard-challenge scoreboard-challenge-row game-notice game-start
states:
  locked: ?as=Rio&fly=scoreboard | sleep 1400
  lane-family: ?enter=1&fly=scoreboard #/space/family | wait scoreboard | sleep 1500
  open: ?as=Rio&board=open&fly=scoreboard | sleep 1400
  after: ?as=Maya&game=awards | wait game-awards | sleep 1300
  house: ?as=gigi&board=open&fly=scoreboard #/space/house | sleep 1400
take:
  open: locked real 30fps 60f
---
# The room scoreboard

**For a user:** a paper card in the games corner: "this week · resets sun
9:00". Each person is a row in their colour: rank, face with their latest
award stickers on it, a line, points. Points are rounds where your pick was
the room's pick; stickers are counted beside, not into, the score. It is
kind on purpose: nobody's line is a number alone, first place "reads the
room", last place "calls the rematch" (or "last. loved anyway" with a
sticker). A dashed slot holds the place for the fitness challenge's
standings. The black pill starts a game (`play most likely to →`, or
`it's on. go →` while one runs).

**Face down until you've played:** before your first revealed round this
week the rows are black slips with a rank and a `?`, under a lime note
"play one to see". That's the shared "answer to see" lock
(`{ until: { answered: true }, hides: "ranking", revealsTo: "each" }`).
`?board=open` shows it face up without playing.

**Mock:** last week's points and two earlier stickers are seeded per room
in `src/data/games.ts` (`seed`, `seedAwards`); games played in the tab add
to them. Nothing resets by itself in mock.

**Drive:** `?fly=scoreboard` puts the camera on it · `scoreboard` the card ·
`scoreboard-locked` / `scoreboard-open` the lock's two sides ·
`scoreboard-row` · `game-start`.

**Code:** `src/components/games/Scoreboard.tsx` (+ `games.css` `.sb-*`) ·
`scoreRows` in `src/lib/games/engine.ts` · mounted as widget type
`scoreboard`, injected by `App.tsx` at `GAME_SPOTS[room].board`.

**Live:** `games.forRoom` gives this week's rows (points from every game
since sun 9:00, stickers from `awards`); `games.challenge` puts a running
check-in on the same card (`scoreboard-challenge`, rows
`scoreboard-challenge-row`): the family's push-ups, ranked, behind the
standings' own lock (`LOCKS.standings`: open once you've logged today, or at
the reveal; face down for anyone not in it). No weekly reset cron yet: the
week is computed from sun 9:00 (UTC-7). A refused start prints one line
(`game-notice`). Its pills are the only way to start a game by tap.
