# .impeccable

Config for the `impeccable` design skill, layered with the hackathon override in
`.claude/skills/eye-candy/SKILL.md`.

`config.json` suppresses the detector rules that are pure accessibility /
readability-compliance checks — they don't show on camera, so they're noise for a
3-minute demo:

`skipped-heading` · `justified-text` · `all-caps-body` · `wide-tracking` ·
`tiny-text` · `line-length`

Deliberately still **on**, because these are visual failures a viewer would see:

`low-contrast` · `gray-on-color` · `text-overflow` · `cramped-padding` ·
`tight-leading` · `broken-image` · `body-text-viewport-edge`

`critique/` holds `/impeccable critique` snapshots (the `polish` command reads
the latest one as its backlog).

## Sanctioned overshoot curves

Impeccable bans bounce/elastic easing globally; OurSpaces overrides that
(bounded overshoot is the brand). `config.json` whitelists exactly two curves
against the `bounce-easing` rule:

- `cubic-bezier(0.2, 0.9, 0.3, 1.18)` — **pop**, for arrivals
- `cubic-bezier(0.34, 1.56, 0.64, 1)` — **snap**, for climax beats only

Any other overshoot value still trips the rule on purpose — `index.css` has
ad-hoc 1.35 / 1.5 / 1.6 variants that should collapse onto these two. The
default `cubic-bezier(0.16, 1, 0.3, 1)` (**glide**) never trips it.

Full motion system in `.claude/skills/eye-candy/SKILL.md`.
