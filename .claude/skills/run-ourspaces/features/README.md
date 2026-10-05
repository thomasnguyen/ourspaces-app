# Feature map (user point of view)

One file per feature: a header `drive.mjs` parses, then a ~1 KB body. Drive
any state with `drive go <feature>:<state>`; `drive check` proves every test
id named here exists in `src/`.

| feature | room | states |
|---|---|---|
| [voice-orb](voice-orb.md) | crew dock | idle · open · quiet · loud · working · dock-listening (+ `-knot`) |
| [voice-stage](voice-stage.md) | crew | poll · countdown · checklist · split · where · nokey · open · words · type · mid · complete · closing · landed · ask · ask-offer · room · already-found · already-landed |
| [wheel](wheel.md) | house | idle · spinning · landed |
| [recap](recap.md) | crew dock | closed · open · landed |
| [dock](dock.md) | crew dock | idle · sound · recap |
| [deck](deck.md) | crew board | one · four · eight · beside |
| [voice-build](voice-build.md) | crew (lane) | room · ask · hesitate · drawer · mock · shell · mockdrawer · gate · say |
| [room-brain](room-brain.md) | crew, house, couple | door · open · visit · forget · told · empty · live |

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
