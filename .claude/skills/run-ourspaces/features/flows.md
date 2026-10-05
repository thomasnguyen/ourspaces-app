---
route: #/space/crew
ready: dock-voice-orb
testids: voice-stage-cluster voice-landed card-waiting card-call-it link-threads link-thread link-cut link-lock link-deal row-ghost
states:
  dinner: ?voicePace=talk&timing=0&voice=plan dinner saturday | click dock-voice-orb | wait voice-landed | sleep 1800
  dinner-stage: ?voicePace=talk&timing=0&voice=plan dinner saturday | click dock-voice-orb | wait voice-stage-cluster | sleep 700
  hangout: ?voicePace=talk&timing=0&voice=when can we all hang out | click dock-voice-orb | wait voice-landed | sleep 1800
  cabin: ?voicePace=talk&timing=0&voice=split the beach house, 900 | click dock-voice-orb | wait voice-landed | sleep 1800
  potluck: ?voicePace=talk&timing=0&voice=who's bringing what to the bbq | click dock-voice-orb | wait voice-landed | sleep 1800
  cut: ?voicePace=talk&timing=0&voice=plan dinner saturday | click dock-voice-orb | wait link-cut | sleep 1500 | click link-cut | sleep 900
take:
  dinner: dinner-stage real 30fps 300f warmup 1200 | 6 click dock-voice-orb
---
# Flows: one ask, two cards that feed each other (W2)

**For a user:** say "plan dinner saturday" and two cards build as one group on
the stage, joined by a thread: a poll on where, and who's in. On the board
they land side by side; the who's-in card **waits** ("··· waiting on the
poll", the shared "locked until another card resolves" lock, drawn by the
card itself), and the thread between them carries a tag ("winner names it").
When the poll is called (anyone taps **call it** on it) or everyone it asked
has voted, the who's-in card takes the winning place as its title on every
screen. A person can **cut** the thread (✂ on the tag): the link stops for
good and the second card is an ordinary card.

| you say | card one | card two | resolves when | it writes |
|---|---|---|---|---|
| plan dinner saturday | poll: where | who's in · saturday | called, or everyone voted | the winner as its title |
| when can we all hang out | availability (tap your row) | countdown | called, or everyone answered | the best day as its date |
| split the beach house, 900 (people still deciding) | who's in | split | every answer, until **lock it** | whoever said yes, the total shared |
| who's bringing what to the bbq (by friday) | sign-up list | wheel | the deadline (18:00 that day) or **deal the rest** | what nobody claimed; titled for who hasn't claimed |

A cost whose people the room already knows (the crew's tahoe cabin) is a plain
split among them, not a flow. The flows are data: `RECIPES` entries with
`flow.cue` (the words that pick it, by code) and one `links` row each
(`src/lib/deck/recipes.ts`). The model only fills the slots ("Deal one dinner
card."); code makes the pair, the layout (`pair()`), the link and the thread.

**Link kinds** (`convex/links.ts`, `when` joined by `|`): `always` · `closed`
(call it) · `everyone` · `time` (a scheduled `tick` at `at`) · `tap` (deal the
rest) · `live` (follows until lock). Values: `id` · `winner` · `date` · `yes` ·
`unclaimed`. Every link write goes through `writeLinked` → `rightOfWay()`:
held, it waits as a ghost (`row-ghost`) and lands when the holder lets go.
`cut` sets `cutAt`; nothing re-ties it.

**Mock** (`?mock=1`): a marked stand-in (`mockDeal.ts`, no model) builds the
pair; it waits and shows its thread, and cut works. Resolving is the live
server's: call it / lock / deal do nothing in mock.

**Code:** recipes `src/lib/deck/recipes.ts` (`flowFor`, `isFlow`) · build
`useVoiceBuild` `buildRecipe` (footprint = the parts' box; flow drafts carry
`flowTag` / `flowBox` for the stage) · stage `StageCluster` + `Thread` · board
`src/components/LinkThreads.tsx` (+ `link-threads.css`, follows drags by
reading the board each frame) · marks `src/widgets/flowMarks.tsx` (`CallIt`),
`WaitingOn` in `src/widgets/challenge.tsx` · server `convex/links.ts`
(`callIt`, `deal`, `lock`, `cut`, `tick`, `waiting`), votes resolve links
(`votes.ts`), availability taps write your row live (`extras.tsx`).
Live harness: `.context/c1w2/flows.mjs` (two browsers, local only).
