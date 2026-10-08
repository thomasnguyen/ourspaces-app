---
route: #/space/crew
ready: scoreboard
testids: game-card game-lobby game-round game-see game-reveal game-awards game-sticker game-join game-begin game-pick game-next game-next-waiting game-rematch game-to-board game-start game-invite game-invite-join game-invite-hide game-sheet game-sheet-close game-sheet-tab games-dev game-notice rail-game award-dots award-row
states:
  idle: ?as=Rio
  start: ?as=Maya&game=start | wait game-lobby | sleep 5200
  invited: ?as=Rio&game=invited | wait game-invite | sleep 900
  ticket: ?as=Rio&game=late | wait game-invite | click game-invite-hide | click dock-recap | wait your-turn | sleep 700
  rail: ?as=Rio&game=invited&gameRoom=crew #/space/house | wait rail-game | sleep 400
  lobby: ?as=Maya&game=lobby | wait game-lobby | sleep 1300
  round: ?as=Maya&game=round | wait game-round | sleep 1300
  answered: ?as=Maya&game=answered | wait game-round | sleep 1300
  reveal: ?as=Maya&game=reveal | wait game-reveal | sleep 2600
  reveal-b: ?as=Maya&game=reveal&reveal=b | wait game-reveal | sleep 2600
  reveal-c: ?as=Maya&game=reveal&reveal=c | wait game-reveal | sleep 2600
  awards: ?as=Maya&game=awards | wait game-awards | sleep 1300
  late: ?as=Rio&game=late | wait game-invite | sleep 500
  knows: ?as=Maya&game=awards #/space/crew/knows | wait room-knows | sleep 900
  board: ?as=Rio&board=open&fly=scoreboard | sleep 1400
  locked: ?as=Rio&fly=scoreboard | sleep 1400
  house: ?as=gigi&game=reveal&round=3 #/space/house | wait game-reveal | sleep 2800
  house-awards: ?as=gigi&game=awards #/space/house | wait game-awards | sleep 1300
  couple: ?game=round&round=2 #/space/couple | wait game-round | sleep 1300
  couple-match: ?game=reveal&round=1 #/space/couple | wait game-reveal | sleep 2800
  couple-awards: ?game=awards #/space/couple | wait game-awards | sleep 1300
  idle-maya: ?as=Maya
  lane: ?enter=1 | wait scoreboard | sleep 1500
  idle-maya-board: ?as=Maya&fly=scoreboard
  late-live: ?as=Ash&game=late
  invited-live: ?as=Rio&game=invited
  play: ?as=Maya&game=round&live=1 | wait game-round | sleep 600
  play-b: ?as=Maya&game=round&live=1&reveal=b | wait game-round | sleep 600
  play-c: ?as=Maya&game=round&live=1&reveal=c | wait game-round | sleep 600
take:
  start: idle-maya-board real 30fps 400f | 70 click game-start | 215 click game-begin | 255 click css:[data-testid="game-pick"][data-name="Sam"]
  invitee: invited-live real 30fps 560f | 85 click game-invite-join | 420 click css:[data-testid="game-pick"][data-name="Sam"]
  phone: late-live real 30fps 330f | 40 click game-invite-join | 110 click css:[data-testid="game-sheet"] [data-name="Rio"]
  reveal: play real 30fps 170f focus widget-game-card | 15 click css:[data-testid="game-pick"][data-name="Sam"]
  reveal-b: play-b real 30fps 170f focus widget-game-card | 15 click css:[data-testid="game-pick"][data-name="Sam"]
  reveal-c: play-c real 30fps 170f focus widget-game-card | 15 click css:[data-testid="game-pick"][data-name="Sam"]
---
# Games (the frame every game uses)

**For a user:** someone starts a game and it becomes a card on the board
with a life. **invite**: the card wears the starter's colour, faces pop in
as people join, the starter presses `start →` (anyone else sees a short
count). **round**: one prompt on a paper slip, the room's faces to tap, and
under them one face-down slip per player that turns in as they answer
("3 of 5 in · waiting on kenji and ash") beside a 14 s timer; nobody sees a
pick early. **reveal**, for everyone at the same moment: the votes land on
the faces one by one, then the whole card floods with the winner's colour:
their face, a huge count, the award sticker stamped on (the one `snap`),
and a paper receipt of who said who. **done**: the awards wall stays on the
card (who took what, the closest call, `rematch →`). A late joiner enters
at the round that's on.

**How others find out:** people in the room get a strip in the starter's
colour at the top (above the dock on a phone): sticker, "maya started most
likely to", `join →`, `×`. It never covers the board. Anyone not in the
game also gets a "your turn" ticket (`join`, ranked first) until the game
ends, the header chip turns lime ("most likely to is on"), and the room's
rail tile wears a lime ▶ when you're in another room. Banner, ticket and
chip all join and fly the camera to the card; a phone opens the game as a
full sheet instead (`board ↗` leaves it, a tab brings it back).

**Starting one:** the scoreboard card's pills (`play most likely to →`, `how
well do you know maya →`, `puzzle the group photo →`) or the orb: "let's play
most likely to", "how well do you know maya", "let's do a puzzle of the tahoe
photo" (`lib/deck/verbs.ts` `gameAsk`; live through `games.start` and the
one door `rightOfWay()`). There is no header chip any more (folded into the
scoreboard and the orb, Oct 5); `?fly=scoreboard` puts the camera on it.
`?game=start` starts one in mock.

**State URLs (mock):** `?game=start | invited | late` run live;
`lobby | round | answered | reveal | awards` are held still for sheets
(`&round=1-5`, `&live=1` to let one run on), `&gameRoom=crew` to have it
happen in another room, `&reveal=b|c` for the two directions not picked,
`?as=<name>` to be someone. Simulated players join 1–4 s after a start and
answer 1.5–6 s into a round (sooner once you have); someone away never
joins but can still win.

**Data (typed, `src/lib/games/types.ts`; mock keeps it in one tab):**

| type | would be table | holds |
|---|---|---|
| `Game` | `games` by room | kind, name, startedBy, phase, round, phaseEndsAt, cast |
| `GamePlayer` | `gamePlayers` by game | who, joinedAt, fromRound (late join) |
| `GameRound` | `gameRounds` by game | prompt (+ the room fact key it came from), endsAt, revealedAt, winners |
| `GameAnswer` | `gameAnswers` by round | by, pick. Its own table so a query can hold `pick` back until the reveal |
| `Award` | `awards` by room + week | to, title, glyph, prompt |

Rules are pure functions in `engine.ts` (`newGame joinGame beginRound
answer reveal nextRound tally awardsOf pointsOf scoreRows`); a live version
calls the same ones inside mutations, with a scheduled function for the
timers. The reveal's lock is the shared "answer to see" piece
(`src/lib/answerToSee.ts` `seeState(lock, facts)` + `AnswerToSee.tsx`):
locked until (you've answered | everyone has | a time), what's hidden, who
it reveals to. The family room's standings has its own copy; unify at merge.

**Drive:** `game-door` header chip · `game-start` on the scoreboard ·
`game-invite` / `game-invite-join` / `game-invite-hide` the strip ·
`game-card` (`data-phase`, `data-round`) · `game-lobby`, `game-join`,
`game-begin` · `game-round`, `game-pick` (`data-name`), `game-see` the
lock · `game-reveal`, `game-sticker`, `game-next` · `game-awards`,
`game-rematch`, `game-to-board` · phone: `game-sheet`,
`game-sheet-close`, `game-sheet-tab` · `rail-game` · `award-dots` (header
faces), `award-row` (the knows page). Takes: `start` (chip → start →
lobby → round → reveal → sticker), `invitee` (the strip arrives → join →
same), `reveal` / `reveal-b` / `reveal-c`, `phone` (late join on a phone).

**Code:** `src/lib/games/` (`types`, `engine`, `useMockGames` = clock,
simulated players, state URLs, context) · `src/components/games/`
(`GameCard`, `Scoreboard`, `GameInvite` = strip, sheet, door, award dots,
`parts`, `games.css`) · `src/data/games.ts` (prompts, seeds, board spots).
Shared edits: `data/types.ts` (+`game`, `scoreboard`), `WidgetCard.tsx`
(two cases), `App.tsx` (hook, provider, widgets, mounts), `lib/yourTurn.ts`
+ `YourTurn.tsx` (the `game` ticket, `onJoin`), `Rail.tsx` (`gameOn`),
`Canvas.tsx` (dots on header faces), `RoomKnowsObjects.tsx` (stickers
under portraits).

**Live (dev lane, Oct 5, `nebius/eval/g5-games-live.md`):** `convex/games.ts`
(tables `games gamePlayers gameRounds gameAnswers awards`), `src/live/useLiveGames.tsx`
(the same `GamesApi`), mounted in `pages/LiveSpace.tsx` for crew, house, couple,
family (`LIVE_GAME_ROOMS`). Any joined member starts; a silent guest joins and
plays but can't start (`game-notice` says so). Rounds move on a scheduled `tick`
(14 s) or the write that makes everyone in; the reveal is that one write. The
query never sends another player's pick, or a hot-seat right answer, before the
round's reveal is written (`redact`, `LOCKS` in `lib/answerToSee.ts`). `next →`
moves on once every player pressed it, or 15 s after the reveal. A game that
starts while you're here shows the strip; one already on when you arrive is a
ticket only. Two players with one name play as "juno" and "juno 2". No
simulated players in a live room; `games-dev` (bottom right) says who is real.
Drive live with two members: `.context/g5/` (`mlt.mjs`, `live2.mjs`, `jig.mjs`).

**Gotchas:** mock: nothing is stored and two tabs don't share a game. The
games corner (game card + scoreboard) is placed once per room with
`placeCards` (`lib/games/place.ts`), inside the board; on a full board that
is below the cards. In a game you're in, the reveal
waits for `next →` (27 s cap); a game you're not in moves on by itself.
Tried and dropped for the reveal: paper slips turning one by one (reads as
a log) and a row count (reads as a poll); the receipt is what was kept of
the slips.

**After `next →` (live).** The round moves on when everyone in has pressed
it; once you have, the key turns into a dashed "waiting on juno"
(`game-next-waiting`, `NextKey` in `parts.tsx`; the round's `ready` list
comes with the game). One or two winners: the awards wall goes big and
centred (`data-few`). Two-browser take: `.context/l3/game.mjs` via `drive eval`.
