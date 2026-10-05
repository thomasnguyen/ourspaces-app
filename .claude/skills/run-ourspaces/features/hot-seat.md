---
route: #/space/crew
ready: game-door
testids: hot-seat-start hot-seat-why hot-seat-short hot-seat-others hot-seat-pick hot-seat-option hot-seat-slider hot-seat-value hot-seat-lock hot-seat-watch hot-seat-answer hot-seat-fact hot-seat-reacts hot-seat-react hot-seat-reaction hot-seat-podium hot-seat-rank hot-seat-to-keepsake hot-seat-keepsake keepsake-row
states:
  lobby: ?as=Sam&game=lobby&play=seat | wait game-lobby | sleep 1300
  round: ?as=Sam&game=round&play=seat | wait game-round | sleep 1300
  reveal: ?as=Sam&game=reveal&play=seat | wait game-reveal | sleep 3200
  slider: ?as=Sam&game=round&play=seat&round=5 | wait game-round | sleep 1300
  slider-reveal: ?as=Sam&game=reveal&play=seat&round=5 | wait game-reveal | sleep 3200
  done: ?as=Sam&game=awards&play=seat | wait game-awards | sleep 1500
  keepsake: ?as=Sam&game=keepsake&play=seat | wait hot-seat-keepsake | sleep 1200
  seat-invited: ?as=Maya&game=invited&play=seat | wait game-invite | sleep 900
  seat-lobby: ?as=Maya&game=lobby&play=seat | wait game-lobby | sleep 1300
  seat-round: ?as=Maya&game=round&play=seat&round=2 | wait game-round | sleep 1300
  seat-reveal: ?as=Maya&game=reveal&play=seat&round=2 | wait hot-seat-reacts | sleep 3000
  seat-reacted: ?as=Maya&game=reveal&play=seat&round=2&react=who-told-you | wait hot-seat-reaction | sleep 3200
  seat-done: ?as=Maya&game=awards&play=seat | wait game-awards | sleep 1500
  other: ?as=Maya&game=lobby&play=seat&about=Rio | wait hot-seat-short | sleep 1300
  house: ?as=gigi&game=lobby&play=seat #/space/house | wait hot-seat-short | sleep 1300
  house-round: ?as=gigi&game=round&play=seat&round=2 #/space/house | wait game-round | sleep 1300
  house-reveal: ?as=gigi&game=reveal&play=seat&round=4 #/space/house | wait game-reveal | sleep 3200
  house-done: ?as=gigi&game=awards&play=seat #/space/house | wait game-awards | sleep 1500
  two: ?game=round&play=seat #/space/couple | wait game-round | sleep 1300
  two-slider: ?game=round&play=seat&round=3 #/space/couple | wait game-round | sleep 1300
  two-reveal: ?game=reveal&play=seat&round=1 #/space/couple | wait game-reveal | sleep 3200
  two-done: ?game=awards&play=seat #/space/couple | wait game-awards | sleep 1500
  play: ?as=Sam&game=round&play=seat&live=1 | wait game-round | sleep 600
  play-seat: ?as=Maya&game=round&play=seat&live=1 | wait game-round | sleep 600
  idle-sam: ?as=Sam
take:
  reveal: play real 30fps 250f focus css:[data-widget-id="game-card"] | 15 click css:[data-testid="hot-seat-option"][data-option="matcha"]
  reveal-phone: play real 30fps 250f | 15 click css:[data-testid="hot-seat-option"][data-option="matcha"]
  seat: play-seat real 30fps 330f focus css:[data-widget-id="game-card"] | 280 click css:[data-testid="hot-seat-react"][data-kind="who-told-you"]
  seat-phone: play-seat real 30fps 330f | 280 click css:[data-testid="hot-seat-react"][data-kind="who-told-you"]
---
# The hot seat ("how well do you know maya")

**For a user:** the third game on the frame (`games.md`), and the one that
shows the room's brain. One person sits; up to five questions about them,
each built by code from something on "what this space knows"; everyone else
answers on their own screen (paper options, or a slider where closest wins)
while a face-down slip per player turns in beside the 14 s timer. The reveal
is the frame's flood, in the seat's colour, for everyone at once: the right
answer set huge under their face, "3 of 4 knew", a receipt of who said what,
and one line saying where it came from ("↳ from the cake poll · 3 of 5",
`see it →` flies to that card). The person in the seat never answers: they
see the answer marked "only you can see this", watch the slips come in, and
after each reveal get one tap (`ha` · `wrong` · `who told you`) that
lands as a paper sticker on the question, tagged with their name in their
colour (the reveal's one `snap`).

**Who sits (`seatPicks`):** the space offers one person and says why, in
this order: a birthday inside two weeks ("birthday in 6 days") · just back
from being away (a `back:<name>` line; no mock room has one) · most award
stickers this week · top of the board. Someone away can't sit (the seat has
to be here to react). The starter sees `someone else?` chips with how many
things the space could ask about each; tapping one re-deals. Fewer than
five usable facts: the lobby says so ("it knows 4 things about noor for
sure. a round of 4, nothing made up") and the button reads `play 4 →`;
fewer than two: it won't start.

**The end:** "sam knows maya best": guessers as paper slips, each a step
shorter than the one above (a tie goes to whoever was nearer on the sliders,
then quicker), the sticker `knows maya best 🔮` on first and the kind one
`has met maya 👋` on last, the seat's reactions counted underneath. A point
per right answer (or closest number) goes on the room scoreboard; the seat
scores nothing but the game turns their scoreboard face up. **What stays:**
a taped paper card under the birthday frame (`hot-seat-keepsake`, widget
type `keepsake`): "how well we know maya · played oct 5 · birthday week",
each question with its right answer, how many knew and Maya's reaction, and
who knew best. Each row flies to the card its fact came from.

**Two people (long distance):** "how well do you know each other". Each
round asks one question each, about the other; both turn over together on
one flood and each reacts to the one about them. Closest number wins the
round. Stickers: `knows ren by heart`, or `two of a kind` on a tie.

**Starting / finding out:** the scoreboard's pill `how well do you know
maya →` (`hot-seat-start`), or `?game=start&play=seat` as if spoken
(`&about=Sam` to name someone). Invitations are the frame's; the person in
the seat gets their own: the strip reads "you're in the hot seat · sam
started a game about you · `sit down →`", and so does their ticket. Header
chip: "the hot seat is on".

## Facts and questions (`src/lib/games/hotSeat.ts`)

`SeatRoom` is what the maker takes: `lines` + `forgot` exactly as the knows
page reads them (`RoomKnows`), plus `cards`, the rows those lines were
built from (a line holds the group's summary; a question about one person
needs their row: who voted what). A crossed-out line is never asked.
`seatFacts(room, name) → SeatFact[]`, each `{ kind, key, card, from, … }`:

| kind | read from | question (template in `WORD`) | wrong answers |
|---|---|---|---|
| `lead` | a poll pinned inside a frame that names them, with a clear leader | what's maya's cake going to be? | the poll's other options |
| `said` | their answer on today's question | what's maya's current comfort show? | the others' answers |
| `vote` | a poll they voted in (asked-for-by-voice first, from a `made` line) | what did maya vote on "friday dinner?" | its other options, + the room's places if it's a places poll |
| `free` | their row on an availability card | which day can't maya make? / how many of wed, sat and sun can ren make? | the card's other days / slider |
| `claim` | an item they claimed on a list | what did noor take on "chores this week"? | the list's other items |
| `wrote` | their note on a message wall | which one on "fridge notes" is noor's? | the other notes |
| `date` | a countdown that names them (two people: one both are counting to) | how many days till maya's bday 🎂? | slider, closest wins |
| `back` | the `away:<name>` line ("back sunday") | when is theo back? | other weekdays the board mentions |
| `clock` | their side of the clocks card | what time is it for ren right now? | slider 12 am–11 pm, wraps |
| `count` | the `claims:<name>` habit line | how many of the 8 things on the lists has noor taken on? | slider |

`askFrom(fact, about)` → `HotQuestion { id, about, text, form: choice |
number, options, right, range, fact: { key, kind, card, from } }`. One per
kind first, then seconds (two at most), one per card, sliders last, five at
most. **Wording is its own step:** `WORD[kind](fact, name)` is one template
per kind, and the comment on it marks where a model will word the line
later; options, the right answer and the fact line stay code's. Never read:
shared costs, the daily question's history; anything matching `PRYING`
(bodies, money owed, who likes whom) is dropped.

**Every question, by room** (`key` on the knows page · card):

*The crew, Maya (birthday in 6 days; 6 usable facts, 5 played):*
1. what's maya's cake going to be? → **matcha** (chocolate, tres leches) · `poll:cake flavor?` · poll-cake · "from the cake poll · 3 of 5"
2. what's maya's current comfort show? → **the bear** (survivor (again), avatar) · `question:…comfort show?` · daily-q · "from today's question · maya answered"
3. what did maya vote on "friday dinner?" → **ramen on 3rd** (sam's place, tacos on 4th) · `poll:friday dinner?` + `made:1` · poll-fri-ramen · "…· maya asked for it"
4. which day can't maya make? → **Sat** (Fri, Sun) · `days:when can we all meet?` · availability
5. how many days till maya's bday 🎂? → **6**, slider 0–14 · `date:maya's bday 🎂` · countdown · "from the countdown · sun oct 11"
- spare: her vote on "where we ate last sat?" (sam's place). Others the starter can pick: Sam 6, Kenji 4, Ash 3, Rio 2 (a round of 2), Jules away.
- **Not there:** "brought up three times" and "who she'd carpool with" need facts no mock room has (mentions per person, a carpool card), so they aren't asked.

*The house, noor (top of the board; theo has the sticker but is away; 4 facts, a round of 4):*
1. what did noor take on "grocery run · saturday"? → **oat milk** (eggs, hot sauce, paper towels) · `claims:noor` · house-groceries
2. which one on "fridge notes" is noor's? → **watered your plant. you're welcome** (the three other notes) · `wall:fridge notes` · house-fridge
3. what did noor take on "chores this week"? → **vacuum** (trash + recycling, bathroom, restock dish soap) · `claims:noor` · house-chores
4. how many of the 8 things on the lists has noor taken on? → **2**, slider 0–8 · `claims:noor` ("noor takes things on: oat milk, vacuum")

*Long distance, ren and sky (4 rounds, one question each):*
1. how many of wed, sat and sun can ren make? → **3** (slider 0–3) / which day can't sky make? → **Sun** (Wed, Sat) · `days:our usual call days` · us-usual-days
2. how many days till half-year ♥? → **142** (slider 0–230), both · `date:half-year ♥` · us-countdown
3. what time is it for ren / sky right now? → the hour in Seoul / Los Angeles at deal time · `zones` · us-clocks
4. how many days till sfo ✈? → **47** (slider 0–80), both · `date:SFO ✈` · us-sfo

*The family (not on this branch; what the same maker deals from main's `data/family.ts`), Mina (turns 12 in 11 days):*
1. what did mina vote on "saturday?" → **trampoline park** (hike + pancakes, lake loop, noodles by the library) · `poll:saturday?` · fam-poll-saturday
2. what did mina take on "chores this week"? → **walk biscuit** (bins + recycling, casey: bathroom, laundry mountain) · `claims:Mina` · fam-chores
3. which one on "fridge notes" is mina's? → **biscuit ate a sock. not mine** (the three others) · `wall:fridge notes` · fam-fridge
4. how many of tue, wed, thu and fri can mina make? → **4**, slider 0–4 · `days:home for dinner` · fam-home
5. how many days till mina turns 12 🎂? → **11**, slider 0–20 · `date:mina turns 12 🎂` · fam-bday
- spare: the `count` line (1 of 4). At merge: add `family` to `ROOM_GAMES`, `SEAT_SKILL`, `KEEPSAKE_SPOTS`; nothing else. Not asked: the allowance note (money). Push-up logs would need a `checkIn` fact kind.

## "answer to see" (one module)

`src/lib/answerToSee.ts` `seeState(lock, facts)` + `components/AnswerToSee.tsx`
(`AnswerToSee`, `SeeSlip`) is the only lock on this branch; the scoreboard,
"most likely to" and this game all call it, none has its own.

```
SeeLock  { until: { answered?, everyone?, at? }, mode?: any | all,
           hides: answers | ranking | right-answer, revealsTo: each | everyone }
SeeFacts { mine, answered, of, now, waitingOn? }   →   SeeState { open, by, line }
```

| user | lock |
|---|---|
| scoreboard | `{ until: { answered }, hides: ranking, revealsTo: each }` |
| most likely to | `{ until: { everyone, at: round end }, hides: answers, revealsTo: everyone }` |
| hot seat | `{ until: { everyone, at: round end }, hides: right-answer, revealsTo: everyone }` (`of` = the guessers; the seat's `mine` is true) |

Main's standings card still has its own ("log yours to see"): it maps to
`{ until: { answered }, hides: ranking, revealsTo: each }`, and Friday's
flip to `{ until: { at }, …, revealsTo: everyone }`.

## Drive

**State URLs (mock):** everything in `games.md` plus `&play=seat`
(`&about=<name>`, `&react=ha|wrong|who-told-you`) and `?game=keepsake`.
`?as=Sam` is a guesser, `?as=Maya` is the seat. Test ids: the frame's
(`game-card` now has `data-kind`, `game-lobby` `data-seat`) and
`hot-seat-start` · `hot-seat-why` · `hot-seat-short` · `hot-seat-others`
/ `hot-seat-pick` (`data-name`) · `hot-seat-option` (`data-option`) ·
`hot-seat-slider`, `hot-seat-value`, `hot-seat-lock` · `hot-seat-watch`
(the seat's view) · `hot-seat-answer` · `hot-seat-fact` (`data-card`,
`data-key`) · `hot-seat-reacts` / `hot-seat-react` (`data-kind`) ·
`hot-seat-reaction` · `hot-seat-podium`, `hot-seat-rank` ·
`hot-seat-to-keepsake` · `hot-seat-keepsake`, `keepsake-row`.
**Takes:** `reveal` (a guesser answers, slips, flood, fact line, Maya's
sticker lands) · `seat` (Maya watches, then taps "who told you"); the
`-phone` twins with `--w 390`.

**Code:** `src/lib/games/hotSeat.ts` (facts, maker, wording, seat choice,
scoring, awards, keepsake; pure) · `engine.ts` (`newSeatGame`, `react`,
hot-seat branches in `roundPlayers answer reveal pointsOf awardsOf`) ·
`types.ts` (`HotQuestion`, `HotFact`, `SeatReaction`, `Game.seat`,
`GameRound.asks / reactions`) · `useMockGames.tsx` (deal, simulated guesses
and reactions, state URLs) · `components/games/HotSeat.tsx` + `hot-seat.css`
· `data/games.ts` (`SEAT_SKILL`, `KEEPSAKE_SPOTS`). Shared edits:
`GameCard.tsx` (dispatch, header name), `Scoreboard.tsx` (pill),
`GameInvite.tsx` (seat wording), `data/types.ts` (+`keepsake`),
`WidgetCard.tsx` (one case), `App.tsx` (keepsake widget, seat ticket,
scoreboard height), `lib/yourTurn.ts` (`ticket` title).

**Live version needs:** `roomBrief` to hand out per-person rows (votes by
voter, daily answers, claims, availability rows) beside the lines, i.e. a
`seatFacts` query run on the server so a client never holds the right
answer before the reveal; `gameRounds.asks` and `reactions` stored, with
`right` held back like `pick`; the model wording step behind `WORD`, its
output checked against the fact's names; a `keepsakes` row (or a widget
written at the end); "just back" as a `back:<name>` line when an away
frame expires; "wrong" offered as a cross-out on the knows page.

**Gotchas:** mock only. Simulated players are right about as often as
`SEAT_SKILL` says; a simulated seat reacts by how many knew (all = "who
told you", a third or fewer = "wrong", else "ha"). The couple's knows page
says 9 days to SFO while its countdown card says 47; the game reads the
card, so the fact line and the card agree. The clock question's answer is
the hour when the game was dealt. Your own hot seat never auto-starts (you
may still be choosing who sits).
