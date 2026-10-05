# Feature map (user point of view)

One file per feature: a header `drive.mjs` parses, then a ~1 KB body. Drive
any state with `drive go <feature>:<state>`; `drive check` proves every test
id named here exists in `src/`.

| feature | room | states |
|---|---|---|
| [voice-orb](voice-orb.md) | crew dock | idle · listening · working |
| [wheel](wheel.md) | house | idle · spinning · landed |
| [recap](recap.md) | crew dock | closed · open · landed |

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
