# Feature map (user point of view)

One file per feature: a header `drive.mjs` parses, then a ~1 KB body. Drive
any state with `drive go <feature>:<state>`; `drive check` proves every test
id named here exists in `src/`.

**Clean takes: add `?timing=0`.** It hides every dev readout (the thin
strip at the bottom, its drawer, the beats table). `?timing=1` = the thin
strip + drawer (the default on the dev lane); `?timing=table` = the strip
plus the wide beats table over the stage.

| feature | room | states |
|---|---|---|
| [voice-orb](voice-orb.md) | crew dock | idle · open · quiet · loud · working · dock-listening (+ `-knot`) |
| [voice-stage](voice-stage.md) | crew | poll · countdown · checklist · split · where · nokey · open · words · type · mid · complete · closing · landed · ask · ask-offer · room · already-found · already-landed · live · livefacts · livealready · livehesitate (lane) |
| [wheel](wheel.md) | house | idle · spinning · landed |
| [voice-verbs](voice-verbs.md) | crew | answer · answer-card · dontknow · recap · mine · refuse · tie · go · room · game · edit · drawer · liveanswer · liveask · liverecap · livego · livedrawer (lane) |
| [voice-edits](voice-edits.md) | crew | mock · mockboard · mockrefuse · mocktentative · mockdrawer · ramen · time · undo · refuse (lane) |
| [recap](recap.md) | crew dock | closed · open · landed |
| [dock](dock.md) | crew dock | idle · sound · recap |
| [deck](deck.md) | crew board | one · four · eight · beside |
| [your-turn](your-turn.md) | crew dock (✦ key + recap panel) | badge · rio · ash · guest · mid · next · more · house · couple · rail · live (lane) |
| [voice-build](voice-build.md) | crew (lane) | room · ask · hesitate · drawer · mock · shell · mockdrawer · gate · say |
| [games](games.md) | crew, house, couple | idle · start · invited · ticket · rail · lobby · round · answered · reveal (-b, -c) · awards · late · knows · house · couple |
| [most-likely-to](most-likely-to.md) | crew, house, couple | round · reveal · split · awards · house · two · two-match |
| [scoreboard](scoreboard.md) | crew, house | locked · open · after · house |
| [jigsaw](jigsaw.md) | crew | start · playing · ghost · late · last · done (+ takes: start · work · yield · nod · reach · hold · finish) |
| [hot-seat](hot-seat.md) | crew, house, couple | lobby · round · reveal · slider · done · keepsake · seat-* (Maya's view) · other · house · two (+ takes: reveal · seat, and -phone) |
| [room-brain](room-brain.md) | crew, house, couple, family | door · open · visit · forget · told · empty · live |
| [family](family.md) | the family | board · logged · final · knows |
| [check-in](check-in.md) | family board | open · logging · logged · mina · final |
| [standings](standings.md) | family board | locked · open · unlocked · final |
| [right-of-way](right-of-way.md) | crew | held · ghost · land · knows (mock, scripted holder) · liveknows (lane) + the two-browser take |
| [asks](asks.md) | crew | poll · poll-second · poll-answered · delegated · countdown · countdown-offer · countdown-when · split · challenge · walkaway · unfinished · letgo |
| [flows](flows.md) | crew | dinner · dinner-stage · hangout · cabin · potluck · cut (mock stand-ins; live via the two-browser harness) |

## Header format

```
---
route: #/space/crew              default hash route
ready: <testid>                  go waits for this to be visible
testids: a b c                   every test id the feature owns
states:                          first state is the default
  <name>: ?a=b #/space/x | click <id> | wait <id> | type <id> <text> | sleep <ms>
take:                            reserved for the take recipe
---
```

A state's head is URL params (before the hash; `?mock=1` is added for you)
and/or a route override. Steps run after `ready`. `css:<selector>` stands in
where the app has no test id yet; `drive check` lists those.
