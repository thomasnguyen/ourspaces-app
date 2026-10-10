---
route: #/space/the-crew
ready: dock-voice-orb
testids: dock-voice-orb checkin standings
states:
  crew: ?enter=1&take=1&timing=0
  house: ?enter=1&take=1&timing=0 #/space/our-house
  couple: ?enter=1&take=1&timing=0 #/space/couple
  league: ?enter=1&take=1&timing=0 #/space/league
---
# Filming fixtures (dev lane only)

**One lever:** `node .context/fixtures/reset.mjs <room>:<fixture>` puts a room
on the dev deployment (dusty-condor-648, never prod) back to a named board and
prints what's on it, card by card, plus whose seat holds Thomas's and Holly's
rows. Running it twice gives the same board. `list` names them, `show <room>`
prints a board without touching it. Then `drive go fixtures:<room>` to look.

| fixture | what's on the board |
|---|---|
| `the-crew:before` | the lived-in crew room (group photo, memories, the socks note, jokes, quote, dinner rsvp + poll, game night, daily question, playlist, tahoe IOUs); the challenge corner (right of the photo column) empty: the start of the hero ask |
| `the-crew:day5` | before + the push-up challenge, the six cards the ask makes (frame, who's in, check-in, standings, the deal, the reveal countdown), day 5 of 6, Holly not logged today (her 40 puts her first), stake "last place hosts the next one." |
| `the-crew:reveal` | the same six cards after the last day: every day in, the reveal this morning 9:00, standings final (Holly 211 first, Kenji 95 last) |
| `our-house:dinner` | our house as designed: challenge day 5 of 6, the dinner poll without ramen (Right of Way, ramen, Tavily), game night friday, Bumi's walks |
| `our-house:hero` | our house without the challenge corner: the house hero ask builds it |
| `couple:tour` | us two, the tour room as shot for the montage (snapshot) |
| `league:tour` | game day, the tour room as shot for the montage (snapshot) |

**The crew is one continuous story.** `before` → the hero take (Holly's phone
asks "set up a push-up challenge for the crew"; `ROOM=the-crew take.mjs hero`
keeps its cards and hands their ids to the lever) → `day5` and `reveal` edit
those same cards in place (dates, logs, the stake), so the check-in, standings
and reveal beats continue the ask. With no hero take kept, `day5` makes the
six cards itself from the same recipe (`seed:crewChallenge`, the ask's own
`expandRecipe` + `applyCard`) at the spot the ask lands. `before` sweeps them.

**Seats.** `as=Holly` / `as=Thomas` are the seeded Holly and Thomas. Open the
phones first, then reset (take.mjs does): the seed stamps each person's rows
with the newest phone seat of that name, so her log and his vote are theirs. A
`⚠ rows held by an older seat` line in the print means reset again with the
phones open. Never `as=Dev`: that name lands on the cards.

**Deletes only its own** (ids files: `.context/house/crew-ids.json`,
`.context/house/ids.json` shared with seed-crew.sh / seed.sh, the challenge in
`.context/fixtures/the-crew.json`). The tour rooms are never deleted from: each
card goes back to its snapshot (`.context/fixtures/snap/<slug>.json`) on its own
id; a card not in the snapshot is listed and left.

**Stills:** `node .context/fixtures/stills.mjs` resets each fixture and shoots
a 1920×1080 desktop still into a sheet (crew order: day5, reveal, before).

Code: `convex/seed.ts` (seedCrew, crewChallenge, boardOf, restoreCards, seedHouse).
