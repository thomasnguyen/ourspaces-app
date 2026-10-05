---
route: #/space/crew
ready: scoreboard
testids: jigsaw-mat jigsaw-piece jigsaw-count jigsaw-ghost jigsaw-helper jigsaw-done jigsaw-slip jigsaw-invite jigsaw-invite-join jigsaw-invite-hide jigsaw-start jigsaw-sheet jigsaw-sheet-close jigsaw-sheet-leave jigsaw-dev
states:
  start: ?as=Maya&jigsaw=start&you=play | wait jigsaw-mat | sleep 2800
  playing: ?as=Maya&jigsaw=start&you=play | wait jigsaw-mat | sleep 9000
  ghost: ?as=Maya&jigsaw=start&you=play&beat=yield | wait jigsaw-ghost | sleep 900
  late: ?as=Rio&jigsaw=late | wait jigsaw-invite | sleep 1200
  last: ?as=Maya&jigsaw=last&you=play | wait jigsaw-mat | sleep 600
  done: ?as=Maya&jigsaw=done | wait jigsaw-slip | sleep 900
  boot: ?as=Maya&jigsaw=start&you=play
  boot-yield: ?as=Maya&jigsaw=start&you=play&beat=yield
  boot-nod: ?as=Maya&jigsaw=start&you=play&beat=nod
  boot-reach: ?as=Maya&jigsaw=start&you=reach
  boot-hold: ?as=Maya&jigsaw=start&you=hold
take:
  start: boot real 30fps 210f
  work: playing real 30fps 300f
  yield: boot-yield real 30fps 420f
  nod: boot-nod real 30fps 420f
  reach: boot-reach real 30fps 330f
  hold: boot-hold real 30fps 450f
  finish: last real 30fps 450f
---
# Jigsaw (the group photo, put back together by everyone at once)

**For a user:** someone starts a puzzle and a photo from the room lifts off
the wall onto a paper mat on the board (its place on the wall reads "out for
a puzzle"), is cut into 20 interlocking pieces and bursts out around the
frame. Everyone drags at once. A piece near its place snaps in with a squash
and the `place` sound, and stays. When the last one is in the photo flashes
whole, the seams go, and it flies back to the wall with a slip: "put together
by maya, jules, sam and rio in 0:48 · the space placed 4 · waited its turn 3×".

**Right of Way, visible (the point):**
- A held piece wears a flat **halo** in its holder's colour and a tag
  ("jules has this"). Nobody else can take it. Reach for it and it leans
  away and the tag bumps; nothing else happens.
- **The space's hand** (a black sticker cursor, "the space") places a piece
  every few seconds. If the piece it wants is in someone's hand, its move
  shows as a **ghost**: a dashed outline at the destination, "waiting on
  ● jules", the hand parked beside it. Jules lets go → the space picks it up
  and lands it. Jules places it → the ghost dissolves ("all yours") with a nod.
- A person may take a piece out of the space's hand; it lets go at once.
- The space never places the last piece: its tag turns lime, "last one's yours".
- All of it is one pure function, `rightOfWay(holds, move) → go | wait(on) |
  never` in `src/lib/games/rightOfWay.ts`, called for every pick-up and
  placement. The live gate (Convex, later) is meant to be the same decision.
- **Honest:** in mock the space's hand is scripted, not a model, and so are
  the other players. The readout at the bottom right says so.

**Starting / finding out:** the scoreboard's second pill `puzzle the group
photo →`; `?jigsaw=start` as if spoken ("let's do a puzzle of the tahoe
photo" = `&photo=tahoe`). Others get the same strip as any game ("maya
started a puzzle · 9 of 20 in, jump in"), the "your turn" ticket, and the
header chip turns lime ("a puzzle is on"). Late joiners drop straight in;
grabbing a piece joins you too. A phone plays on a sheet: the picture on top,
a tray under it, 12 bigger pieces, `board ↗` to leave and the chip to return.

**After:** a point for every two pieces you placed goes on the room
scoreboard (and turns it face up), plus two stickers that aren't "most
pieces": "found the last corner 📐" and "patient hands 🧩" (held one piece
longest before it fit). The slip stays on the photo.

**State URLs (mock, crew only):** `?jigsaw=start | invited | late | last |
done` · `&photo=friday|tahoe` · `&players=0-5` (default 3) · `&seed=n`
(same seed = same cut, scatter and game; the sim runs on a fixed 4 ms step) ·
`&pieces=12|20|30` · `&in=n` (late: pieces already in) · `&you=play|reach|
hold|none` scripts your own hand for a take (reach = you go for a held piece;
hold = you hold one until the space waits on you, then let go) · `&beat=yield|
nod` a player takes the piece the space is reaching for, then lets go | places
it, and everyone else pauses for the beat · `&hand=1` draws your cursor.

**Piece data (`src/lib/jigsaw/engine.ts`, what a table row would hold):**
`{ id, col, row, x, y, r, state: loose|held|placed, holder, heldAt, placedBy }`,
positions in mat units (900×612, frame 440×330); the cut is `cutPicture(w, h,
cols, rows, seed)` (shared bezier tabs, so only the seed is stored). Placed
pieces lock to the frame; loose pieces don't join each other off the frame.

**Drive:** `jigsaw-mat` (`data-stage` fly|play|whole|return, `data-phase`,
`data-placed`, `data-helper` idle|waiting|last, `data-waits`,
`data-refusals`) · `jigsaw-piece` (`data-state`, `data-holder`) ·
`jigsaw-count` · `jigsaw-ghost` · `jigsaw-helper` · `jigsaw-done` ·
`jigsaw-slip` · `jigsaw-invite` / `-join` / `-hide` · `jigsaw-start` ·
`jigsaw-sheet`, `jigsaw-sheet-leave`, `jigsaw-sheet-close` · `jigsaw-dev`.
Takes (real time, no clicks): `start` · `work` · `yield` · `nod` · `reach`
· `hold` · `finish`; add `--w 390` for the phone. `window.__jig` is the
engine, for probes.

**Code:** `src/lib/games/rightOfWay.ts` (the decision) · `src/lib/jigsaw/`
(`cut`, `engine` = pieces, simulated hands, the space's hand, all motion as
transforms on rAF; `useMockJigsaw` = room state, state URLs, scoring) ·
`src/components/games/Jigsaw.tsx` + `jigsaw.css` · `src/data/jigsaw.ts`
(photos, mat spot). Shared edits: `Canvas.tsx` (+`overlay` prop), `App.tsx`
(hook, provider, overlay, mounts, ticket), `Scoreboard.tsx` (second pill),
`GameInvite.tsx` (the chip), `parts.tsx` (`useNoticeAside`),
`DemoBanner.tsx` (no notice on a game link), `lib/yourTurn.ts` (`waiting`).

**Live version needs:** a `jigsaws` row (photo, seed, grid, startedBy,
startedAt) and `jigsawPieces` rows synced like widget drags (position at
20 Hz through presence while held, one write on drop); holders as leases
that expire after a few silent seconds; the snap and `rightOfWay` inside
the mutation, so two hands on one piece resolve on the server; who may start
(any member; one puzzle per room); loose positions stored per layout (a
phone's tray isn't the desk's mat); the space's hand driven by the real
helper through the same gate, with its waits written to the ledger.

**Gotchas:** crew only. Mock: two tabs don't share a puzzle. The mat covers
the middle of the board while it's on. Frame time at 1440 (20 pieces, 3
players + you + the space): 8.7 ms average, p95 9.8, worst 27; about 1.5% of
frames run past 16.7 ms (idle board: 0.5%), not tied to piece count.
`:has()` on the mat re-styles the page per piece; use the `body.jg-on` class.
