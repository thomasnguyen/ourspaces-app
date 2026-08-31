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
  per-space identity colors.
- **Motion** — three curves, three jobs: `glide` is the default (hover, press,
  translate, opacity), `pop` is for things *arriving*, `snap` is for climax
  beats only. Durations run `instant` 120ms → `hero` 900ms. The house motion
  system (when each earns use, stagger, FLIP) is in
  `.claude/skills/eye-candy/SKILL.md`.
