# UI sounds

Soft, tactile interface cues — not game SFX, not sci‑fi whooshes. Think paper,
sticky notes, and a quiet room: clicks, little pops, a quiet tap when the
camera moves. Sounds should feel **present but easy to ignore**.

## Vibe (read this before picking new sounds)

**Do**

- Short (roughly **0.1–0.25s** after trimming)
- Mono, low volume, tail fade
- Organic / physical: clicks, soft pops, typewriter, bubble, light paper
- Clicks and soft pops for focus — zoom in/out uses the same `tap` as UI chrome

**Don’t**

- Futuristic, cinematic, or “trailer” whooshes
- Long sweeps, impacts, magic spells, ghostly passes
- A separate zoom-*out* sound — both directions use `tap` today
- Loud or punchy cues that compete with chat / content
- A JS audio library unless we outgrow this (today: native `HTMLAudioElement` +
  MP3 in `src/lib/sounds.ts`)

**Symmetric zoom (current choice)**

| Direction | Sound | Why |
|-----------|-------|-----|
| Zoom **in** (frame / widget focus) | `tap` | Same soft click as other UI chrome |
| Zoom **out** (back, home, escape) | `tap` | Same cue — leaving focus is just another tap |

We tried whooshes, chimes, interface clicks, and heavier switch taps — the soft
typewriter click (`tap`) works best for both directions.

## Inventory

All from [Mixkit](https://mixkit.co/free-sound-effects/) under the
[Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree)
(commercial + personal, no attribution required).

| File | Mixkit name | ID | Used for |
|------|-------------|-----|----------|
| `tap.mp3` | Typewriter soft click | 1125 | Taps, toggles, navigation, zoom in/out, leaving focus |
| `place.mp3` | Plastic bubble click | 1124 | Placing / saving / adding something to the canvas |
| `promote.mp3` | Explainer video pops whoosh light pop | 3005 | Promoting chat → widget (special moment) |

Playback volumes live in `src/lib/sounds.ts` (`SOUND_VOLUMES`). Rough guide:
`promote` (~0.52), `place` (~0.42), `tap` quietest (~0.34). Tweak in `SOUND_VOLUMES` if cues feel too quiet or hot.

## When to use which sound

| User action | Sound | Notes |
|-------------|-------|-------|
| Rail, picker, chat/AI toggle, edit, thread open (mobile) | `tap` | Default “I touched UI chrome” |
| Leave frame/widget focus, home, back | `tap` | Same soft click as zoom in |
| Focus frame title ↗ | `tap` | |
| Focus widget thread (desktop) | `tap` | |
| Add widget, first-run sticky, save space | `place` | Something landed on the canvas |
| Promote message to widget | `promote` | Rare, slightly more celebratory |
| Sound toggle turned back on | `tap` | Confirmation only |

If a new action doesn’t clearly fit: **default to `tap`**. Only add a new sound
when the moment is distinct and repeated.

## Adding a new sound

1. **Pick on Mixkit** — browse [interface](https://mixkit.co/free-sound-effects/interface/)
   or [zoom](https://mixkit.co/free-sound-effects/zoom/). Preview several; avoid
   anything that feels sci‑fi or cinematic.
2. **Note the ID** — preview URLs look like
   `https://assets.mixkit.co/active_storage/sfx/{id}/{id}-preview.mp3`
3. **Process** — trim, mono, fade, compress volume (match siblings):

```bash
curl -sL "https://assets.mixkit.co/active_storage/sfx/2619/2619-preview.mp3" -o /tmp/source.mp3

ffmpeg -y -i /tmp/source.mp3 \
  -ss 0 -t 0.20 \
  -af "volume=0.32,afade=t=out:st=0.15:d=0.05" \
  -ac 1 -ar 44100 -b:a 96k \
  public/sounds/your-name.mp3
```

Tweak `-ss`, `-t`, and `volume=` until it feels like `tap.mp3` / `place.mp3`
(~2–4 KB, under ~0.25s).

4. **Wire up** in `src/lib/sounds.ts`:
   - Add to `UiSound` union
   - Add path in `SOUND_FILES`
   - Set `SOUND_VOLUMES` (start ~0.22–0.30, play in app, adjust)
5. **Call** `playSound("yourName")` at the interaction site (usually `App.tsx`).
6. **Document** the new row in the inventory table above (name, Mixkit ID, when
   to use).

## Code

- Module: `src/lib/sounds.ts`
- Toggle: Action dock → persisted in `localStorage` (`ourspaces:sound-enabled`)
- Preload: `preloadSounds()` on app mount
- No overlapping library — `playSound` clones cached `Audio` nodes so rapid taps
  work

## Mixkit categories that usually fit

- [Interface](https://mixkit.co/free-sound-effects/interface/) — clicks, chimes, software UI
- [Click](https://mixkit.co/free-sound-effects/click/) — subtle buttons
- [Zoom](https://mixkit.co/free-sound-effects/zoom/) — **only** “UI zoom in / interface classic zoom” style

## Mixkit categories to skip

- High-tech / sci‑fi / cinematic whoosh
- “Futuristic zoom move”, “quick zoom impact”, “ghostly whoosh”
- Anything over ~0.5s before trimming
