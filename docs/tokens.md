# Design tokens

Mirror of the `@theme` block in `src/index.css` — the only place these are
defined. Use the token, never the raw value (motion included: the glide curve
used to be pasted 138 times).

```css
@theme {
  --color-paper: #211922;
  --color-paper-deep: #171119;
  --color-card: #fffaf7;
  --color-mat: #ddc8ac;
  --color-ink: #111114;
  --color-muted: #5f5055;
  --color-sticker: #0b0b0e;
  --color-lime: #c9ff3d;
  --color-rail: #111114;
  --color-crew: #7853ff;
  --color-couple: #e9369d;
  --color-fam: #3f70ff;
  --color-trip: #ff7c42;
  --color-league: #13b8a6;
  --color-buildroom: oklch(0.74 0.06 245);
  --color-buildroom-deep: oklch(0.35 0.07 250);
  --text-body: 1rem;
  --text-body--line-height: 1.5;
  --text-caption: 0.875rem;
  --text-caption--line-height: 1.4;
  --font-display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --radius-pill: 9999px;
  --ease-glide: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-pop: cubic-bezier(0.2, 0.9, 0.3, 1.18);
  --ease-snap: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-instant: 120ms;
  --dur-quick: 160ms;
  --dur-base: 220ms;
  --dur-arrive: 360ms;
  --dur-stage: 500ms;
  --dur-hero: 900ms;
}
```

- **Color** — `paper`/`paper-deep` are the near-black base, `card` the warm
  white object, `mat` the kraft frame floor, `sticker` the black pill, `lime`
  the one tiny pop. `crew` / `couple` / `fam` / `trip` / `league` are the loud
  per-space identity colors. `buildroom` is the build room's wall, a dusty
  denim felt (three oranges came before it; a saturated wall out-shouted the
  objects, so the room's orange is now its accent via `--space-accent`);
  `buildroom-deep` is the same hue at shadow depth — the torch theme mixes
  it with alpha for every object's shadow, so nothing on the felt casts
  neutral black.
- **Reading** — `text-body` is 16px / 1.5 for prose and inputs;
  `text-caption` is 14px / 1.4 for supporting text. Both use IBM Plex Sans.
  Body weight is 400; bylines use 500. Canvas previews account for camera scale.
- **Motion** — three curves, three jobs: `glide` is the default (hover, press,
  translate, opacity), `pop` is for things *arriving*, `snap` is for climax
  beats only. Durations run `instant` 120ms → `hero` 900ms. The house motion
  system (when each earns use, stagger, FLIP) is in
  `.claude/skills/eye-candy/SKILL.md`.
