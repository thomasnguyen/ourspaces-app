---
route: #/space/crew
ready: dock-voice-orb
testids: voice-shell voice-landed voice-found voice-found-pulse voice-found-spin voice-receipt dev-readout dev-readout-route dev-context-drawer dev-context-close dev-context-route dev-context-found claim-enter dock-voice-orb
states:
  room: ?enter=1
  ask: ?enter=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-shell | wait voice-landed | sleep 900
  hesitate: ?enter=1&voicePace=talk&voice=add a poll for … Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  tentative: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | sleep 1750
  gapand: ?enter=1&voicePace=talk&voice=make a checklist: chips, salsa and … drinks | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  gapdate: ?enter=1&voicePace=talk&voice=countdown to Holly's birthday on … November 14 | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  late: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday …600 dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 3500
  drawer: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 1500 | click dev-readout | wait dev-context-drawer | sleep 300
  mock: ?voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-landed | sleep 900
  shell: ?voice=add a poll for Saturday dinner&voiceHold=1 | click dock-voice-orb | wait voice-shell | sleep 2600
  mockdrawer: ?timing=1&voice=add a poll for Saturday dinner | click dock-voice-orb | wait voice-landed | sleep 1200 | click dev-readout | wait dev-context-drawer | sleep 300
  gate: | click claim-enter | wait dock-voice-orb | sleep 1200
  say: ?enter=1&timing=1&voicePace=talk&voice=add a poll for Saturday dinner | sleep 1400
  mocksay: ?voice=add a poll for Saturday dinner | sleep 600
  driving: ?enter=1&timing=1&voicePace=talk&voice=who's driving to Maya's | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  drivingdrawer: ?enter=1&timing=1&voicePace=talk&voice=who's driving to Maya's | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 1500 | click dev-readout | wait dev-context-drawer | sleep 300
  drivingsay: ?enter=1&timing=1&voicePace=talk&voice=who's driving to Maya's | sleep 1400
  cabin: ?enter=1&timing=1&voicePace=talk&voice=split the cabin, 640 | sleep 1200 | click dock-voice-orb | wait voice-landed | sleep 900
  already: ?enter=1&timing=1&voicePace=talk&voice=add a poll for cake flavor | sleep 1200 | click dock-voice-orb | wait voice-found | sleep 1600
  alreadysay: ?enter=1&timing=1&voicePace=talk&voice=add a poll for cake flavor | sleep 1400
  alreadydrawer: ?enter=1&timing=1&voicePace=talk&voice=add a poll for cake flavor | sleep 1200 | click dock-voice-orb | wait voice-found | sleep 1600 | click dev-readout | wait dev-context-found | sleep 300
  dishes: ?enter=1&timing=1&voicePace=talk&voice=who's on dishes tonight #/space/house | sleep 1200 | click dock-voice-orb | wait voice-found-spin | sleep 1600
  dishessay: ?enter=1&timing=1&voicePace=talk&voice=who's on dishes tonight #/space/house | sleep 1400
  dishesspin: ?enter=1&timing=1&voicePace=talk&voice=who's on dishes tonight #/space/house | sleep 1200 | click dock-voice-orb | wait voice-found-spin | sleep 900 | click voice-found-spin | sleep 2500
  mockalready: ?voice=add a poll for cake flavor | click dock-voice-orb | wait voice-found | sleep 1600
  mockalreadydrawer: ?timing=1&voice=add a poll for cake flavor | click dock-voice-orb | wait voice-found | sleep 1200 | click dev-readout | wait dev-context-found | sleep 300
take:
  ask: say real 30fps 165f | 3 click dock-voice-orb
  driving: drivingsay real 30fps 150f | 3 click dock-voice-orb
  already: alreadysay real 30fps 150f | 3 click dock-voice-orb
  dishes: dishessay real 30fps 150f | 3 click dock-voice-orb
---
# Voice build (say it → it builds)

**For a user:** tap the orb and say "add a poll for Saturday dinner". By
"poll" a real poll card is already on the board in your view, empty, in a
ring of your colour. While you're still talking it fills *tentatively*
(washed out): "add a poll" already brings a question and options, "…for
Saturday" updates them in place. You don't tap anything: a pause ends the
ask (shorter when your exact words already made a whole card; longer when
the sentence hangs on "for…", "and…", "the…", a comma; never short on a
trailing number). About 0.6 s after your last word the card goes final
(full colour, a settle), glides to a clear spot, the ring lets go and a slip
says `Thomas said it`. Everyone else has it ~0.25 s later. A word that lands
just after the pause (within 1.2 s) reopens the ask: the card already
written is corrected in place, never dealt twice. No card fits: "couldn't
place that" above the dock.

**Under it:** code guesses the card from the words (0 ms, `deck/guess.ts`).
Every new word that names a card (not hanging) goes to Nemotron at once as
a speculative `deal` that only returns cards (no card named: 4+ words
steady 200 ms); two in flight at most, the newest words wait for a slot,
six per ask. The newest call's answer fills the draft (only closed fields,
merged over the last answer, so unchanged fields stay put); answers for
older words than the one shown are ignored. Nothing is committed while you
talk. On the pause, the call for exactly those words is used (else one goes
out then); the moment its first card closes in the stream the card goes
final, `placeCards` picks the spot and `commit` writes it with that spot
in one insert (counter, activity stamp and log line follow in a scheduled
mutation). Extra cards in the answer follow in a second write. Usually 3–4
calls per ask.

**The room's brain (B2/D1b):** each call is routed by the room brief's
facts (`routeAsk` in `deck/promptV2.ts`, read from `roomBrief.inspect`).
Words that point at no room fact ("rsvp for game night Friday at 7") get the
fast Lightning fill, as above. Words that do ("who's driving to Maya's",
"split the cabin, 640") get the token prompt on Ultra with only those facts;
the answer's tokens (`@coming(who's coming)`) are resolved on the asker's
screen against the facts (`resolve.ts`), tentative fills too (a token left
unresolved shows as "…"), so "who's driving" lists exactly the four who said
yes and the cabin split is among the trip's four, paid by Jules. Alongside,
every new word asks Ultra for one letter (`voiceBuild.decide`): a sure pick
(≥ 0.8) sets the skeleton when the words named nothing (on the fast route it
also beats the keyword guess), and on the fast route it's passed to the fill
("deal one wheel card"), and the fill is asked again if the final answer
dealt another card. The skeleton holds: once it shows a card, a tentative
answer for another card moves it only when a second call agrees or the sure
decide does (the drawer lists the held ones); the final answer always wins.
"who's driving…", "whose turn…", "who's on dishes…" are wheel words for the
guess. After the model, code rules: a sign-up checklist ("who's bringing
what", packing) arrives with open slots unless the words hand the jobs out;
`@chores` is the chores the room already tracks (its dishes wheel, its
grocery run, the items of a chores list). A deleted (≤ 10 min) or relabelled
(≤ 30 min) dealt card writes `outcome` onto its `deals` row.

**Already here (B3):** say "add a poll for cake flavor" in the crew (the
"cake flavor?" poll is on the board) or "who's on dishes tonight" in the
house: nothing new is written. The skeleton and ring go, the camera glides
to the card that's already there (only as far as it takes to show it), a
ring in your colour pulses once around it (`voice-found-pulse`) and a slip
on it says "already here · Maya made it" (`voice-found`, `data-widget-ref`
= that widget). On a wheel the slip offers "spin it" (`voice-found-spin`,
clicks the wheel's own spin; never spun for you). How: code first
(`deck/existing.ts` `existingFor`): a widget of the kind the words name,
whose title's topic words are in the words and vice versa; "another",
"new", "next week"… never match. Only then does the decide also ask Ultra
"is a card already on the board that does what the request asks?" (yes/no,
same prefix, in parallel). At the pause the yes for the final words must
be ≥ 0.8 and code's match must still stand; else (or past 2 s) the card is
dealt as before. Mock: code's match alone, as a stand-in (no model). The
drawer's "already on the board?" section (`dev-context-found`) shows code's
check, the yes/no and why. Take recipe: `take voice-build:already` (or
`:dishes`, house) films say → glide → pulse → slip; two browsers on
`voice-build:already` show no new widget on either. Lane states don't
write here, nothing to sweep.

**Dev readout** (dev lane, or `?timing=1`; `?timing=0` hides it): a mono
line under the live strip (`dev-readout`): route (`dev-readout-route`: "room facts · Ultra" or "plain · Lightning") · last word → final card ms ·
tentative ms (negative = before the last word) · calls · late word · guess right/wrong; `voice-receipt` inside it carries `data-ms` =
last word → card complete on this screen. Click it (or a slip, in dev) for
the context drawer (`dev-context-drawer`, `dev-context-close`): words heard
with times, every call (final, tentative only, or ignored), every fill
with its time (tentative or final, which fields changed), late words and
what happened to the card, the code's
guess, the room context sent to the model (one `context` string), the raw
answer, cards after `applyCard` (rejects with the reason), why the spot,
stage times from the last word; and for B2: the decide calls (sent/back,
pick, confidence, the runners-up, first sure pick vs the pause, how the
skeleton moved), the route and why (`dev-context-route`), the exact facts
sent, every token with what it became and the room row it came from, every
rule that fired, and the calls and cost of the ask. Last 10 asks, older/newer. Mock: stand-in,
"not sent", no ms.

**Drive:** `?voice=<sentence>` scripts the ask; `&voicePace=talk` = ~180
wpm, each word lands when it ends, "…" = a 900 ms hesitation
(`&voicePause=`), "…600" a 600 ms one. `tentative` stops mid-sentence on
the washed-out fill; `gapand`/`gapdate`/`hesitate` are pauses the ask
must survive; `late` ends early, then "dinner" reopens it and corrects
the card in place. `driving`/`cabin` are the two context asks (brain
route; crew room facts); `drivingdrawer` opens their drawer; take
`driving` films it. Lane states write real widgets to the dev board (clear
them with `widgets:deleteWidget`). `shell` = mock skeleton held
(`&voiceHold=1`); `drawer`/`mockdrawer` open the drawer. `voice-landed`
carries `data-widget-ref` (draft id, then the synced id after commit).
`voice-shell` carries `data-phase` (`dealing` → `landing`). Marks:
`performance.mark("voice:*")`; the last ask's trace is `window.__voiceTrace`.

**Code:** `src/live/useVoiceBuild.ts` (session, guess, specs, settle,
commit, `withDrafts`) · `src/lib/deck/guess.ts` · `src/lib/voice.ts`
(pause detection, ready/late-word reopen, script) · `convex/voiceBuild.ts` (`deal`, `live`,
`commit`, `amend`, `noteCommitted`, `warm`; rows in `deals`, read with `npx convex run
voiceBuild:recent`) · `src/components/VoiceBuildLayer.tsx` (ring, slip,
readout, drawer) · styles `.voice-shell`, `voice-draft-`, `[data-voice-tentative]`, `.dev-readout`,
`.dev-context` in `src/index.css` · wired in `LiveSpace.tsx`, `App.tsx` (mock).

**Gotchas:** the skeleton is a local draft (`data-widget-id="voice-draft-…"`,
not clickable); WidgetCard renders it. A crowded view means it floats over
the board (`data-voice-draft="lifted"`) until placed; tentative fills carry
`data-voice-tentative` (a wash, not opacity: a floating draft must not show
the card under it). Speculative calls
cost tokens even when ignored.
