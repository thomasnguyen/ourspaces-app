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
