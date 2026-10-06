---
route: #/space/our-house
ready: dock-voice-orb
testids: dock-voice-orb voice-landed voice-found poll-web poll-option row-ghost row-ghost-on lookup-tick dev-readout dev-context-drawer dev-context-lookup dev-context-lookup-kept
states:
  ask: ?stage=0&enter=1&timing=1&voicePace=talk&voice=where should we eat Saturday | sleep 1500 | click dock-voice-orb | wait voice-landed | sleep 9000
  ask-tonight: ?stage=0&enter=1&timing=1&voicePace=talk&voice=where should we eat tonight | sleep 1500 | click dock-voice-orb | wait voice-landed | sleep 9000
  ask-sushi: ?stage=0&enter=1&timing=1&voicePace=talk&voice=where should we eat sushi on Friday | sleep 1500 | click dock-voice-orb | wait voice-landed | sleep 9000
  rows: ?enter=1&timing=0 | wait css:.widget-poll .poll-web | click css:.widget-poll:has(.poll-web) h3 | sleep 1500
  add: ?stage=0&enter=1&timing=1&voicePace=talk&voice=add ramen to the dinner poll | wait css:[data-widget-id] | sleep 2500 | click dock-voice-orb | wait voice-found | sleep 900
  added: ?stage=0&enter=1&timing=1&voicePace=talk&voice=add ramen to the dinner poll | wait css:[data-widget-id] | sleep 2500 | click dock-voice-orb | wait voice-found | sleep 8000
  added-dumplings: ?stage=0&enter=1&timing=1&voicePace=talk&voice=add dumplings to the dinner poll | wait css:[data-widget-id] | sleep 2500 | click dock-voice-orb | wait voice-found | sleep 8000
  held: ?stage=0&enter=1&timing=0&voicePace=talk&voice=add ramen to the dinner poll | wait css:[data-widget-id] | sleep 2500 | click dock-voice-orb | wait css:[data-ghost-changed]
  filled: ?stage=0&enter=1&timing=0&voicePace=talk&voice=add ramen to the dinner poll | wait css:[data-widget-id] | sleep 2500 | click dock-voice-orb | wait css:[data-ghost-changed] .poll-web
  drawer: ?stage=0&enter=1&timing=1&voicePace=talk&voice=where should we eat Saturday | sleep 1500 | click dock-voice-orb | wait voice-landed | sleep 9000 | click dev-readout | wait dev-context-lookup | sleep 300
take:
  ask: ask real 30fps 330f
  added: add real 30fps 240f
---
# Dinner from the web (Tavily, the lookup)

**For a user:** in our house (the dev lane), say "where should we eat
Saturday". The poll lands at once with the house's own places (the "dinner,
the usual" shelf). A ticket hangs off it on every screen: `looking up places
near San Jose · the house's city · not your usual places · waiting on the
web`. One to three seconds later up to three real places land under the
house's (`pop`, 40 ms apart), each a two-line row: `ADEGA` over a small line
`4.1 · tripadvisor` and a lime-on-ink `from the web` sticker (the page's
rating, else its review count, only when the page had one; the sticker
drops to its own line before anything truncates).
"add ramen to the dinner poll": the ramen row lands dashed (waiting on the
web; the ticket off the card reads `0.4s looking up near San Jose · the
house's city` with the numeral ticking, `lookup-tick`, no spinner), fills
in as `Kumako Ramen Den` over `4.7 · yelp · from the web` (the words glide
in, keyed on the label), and lands about a second later (the ticket turns
lime: `the web answered`). If someone is holding the poll (voting,
dragging), the row waits on them as always (`row-ghost`; the slip under the
orb says `looking up ramen near San Jose · the house's city` with the same
ticking numeral), fills in while they hold it, and lands as that place when
they let go. States `held` / `filled` stop at those two moments (run
`.context/tv1a/holder.mjs` first; `.context/tv1b/fill.mjs` shoots all four). Nothing already on
the poll ever changes. Closed places (Yelp's "CLOSED"), the house's usual
places and anything already on the poll are skipped; the receipt says why.

**Where:** a place named in the words ("ramen in Berlin") wins; else the
room's told city, the newest "we're in …" on the knows page (our house:
"we're in San Jose, CA", seeded by `seed:houseCity`); else no lookup.

**Under it:** `convex/tavily.ts`. Search (basic, yelp / tripadvisor /
opentable / eater) → extract of the Tripadvisor list when one came back →
code parses name, rating, reviews, CLOSED (`placesIn`) → Nemotron Lightning
picks by number and names the room fact it used → code keeps only names in
their source → `land` through Right of Way as one AI edit (a held poll makes
it retry). One 6 s cap. The option's `web` mark rides the edit op
(`lib/deck/edits.ts` `addOption`), so a waiting row keeps it when it lands.
Off without `TAVILY_API_KEY`, on any deployment outside `LANES`, past the
room's `tavilyRoomDay` limit. Receipt: the lookup's `aiWrites` row (kind
`lookup`, outcome `receipt`) and, for a poll, the ask's `deals` row (`web`).

**Drawer:** click `dev-readout` → `dev-context-lookup`, laid out as a
receipt: the line; asked / near (city · where from) / took (ms, per step) /
credits / picked by (+ the fact used); `kept · n`, each place with the row's
number, reviews, host and its page (`dev-context-lookup-kept`); `skipped ·
n` grouped by why, names struck; what landed. Shown on any live ask, an add included (done by code, no
model); mock mode has none.

**Drive:** lane states write real cards and lookups (a search credit each).
`ask*` leave a poll: delete it by its id (`harness:sweep`). `add*` add an
option to the house poll: `npx convex run tavily:sweepWeb
'{"widgetId":"<house poll>"}'` takes the web-found options off (only options
with a `web` mark). `rows` shoots a poll that already has web rows (no
write). The held version (two people) is `.context/tv1a/holder.mjs`: a
second seat holds the house poll while `add` runs, prints the ghost as it
fills, lets go.

**Takes (two phones, live, one lookup each):** `node .context/house/take.mjs
ramen --slug tavily` reseeds the house, Holly drags the dinner poll, Thomas
says "add ramen", it waits for `[data-ghost-changed] .poll-web` and lets go
1.2 s later (both phones + two-up at 24 fps). `take.mjs dinner --slug tavily`:
Holly asks "where should we eat Saturday", waits for three web rows, sweeps
the new poll by id; crop the poll from `holly.mp4` (`poll.json` has its box).
Receipt at 1440: `node .context/tv1c/receipt.mjs` (asks, opens
`dev-context-lookup`, clips it, sweeps the poll by id). A drag pauses the card's
animations (index.css); `poll-web.css` keeps `poll-web-fill` running under it,
so the holder sees her own row fill in too. An add's lookup shows in the
drawer the same way: `node .context/tv1d/receipt.mjs "add ramen to the dinner
poll" add` (the add lands on the house poll; reseed the house after).

**Code:** `convex/tavily.ts` · hooks in `convex/voiceBuild.ts`
(`noteCommitted`) and `convex/edits.ts` (`run`) · `convex/widgetData.ts`
(poll option `web`) · row `src/widgets/core.tsx` + `poll-web.css` · drawer
`src/components/LookupReceipt.tsx` + `lookup.css` · the ticking numeral
`src/components/LookupTick.tsx` (on the ticket in `RightOfWay.tsx`, on the
slip in `VoiceBuildLayer.tsx`) · slip text `src/live/useVoiceBuild.ts` (a
wait on `kind: "lookup"` shows the server's line).
