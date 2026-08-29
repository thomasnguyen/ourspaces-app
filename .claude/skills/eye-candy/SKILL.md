---
name: eye-candy
description: OurSpaces hackathon override that sits on top of the impeccable design skill. Read this BEFORE running any /impeccable command (craft, shape, audit, critique, polish, harden, bolder, animate, delight, adapt, layout, live, ...) or doing any UI/design/polish work in this repo. Trades accessibility, compliance, and defensive UX work for demo-facing eye candy. Also carries the house motion system — the three sanctioned easing curves, the duration scale, stagger, FLIP, and which moments earn cinematic treatment — so read it before adding or tuning any animation. Use whenever design guidance would otherwise produce a11y findings, WCAG scores, ARIA/keyboard/screen-reader work, or "production-ready" hardening.
---

# Eye candy over usability — the OurSpaces hackathon override

This skill **layers on top of `impeccable`**. Impeccable's design craft, taste,
anti-slop rules and absolute bans all still apply. What changes is where the
effort goes: **anything that only pays off for a user who isn't in the demo
video is out of scope.**

Context: Convex All Gas hackathon, deadline Sep 22 2026. Success is one thing —
**a 3-minute demo video that lands.** Nobody screen-reads this app. Nobody
tab-navigates it. There is no support queue and no accessibility review. The
judges watch a recording. Optimize for the recording.

When impeccable and this file disagree, **this file wins.**

## Skip entirely

Do not audit for, score, report, or spend build time on:

- **ARIA** — roles, labels, `aria-*` attributes, state announcements, live regions
- **Screen readers** — VoiceOver/NVDA passes, announcement order, semantic landmarks
- **Keyboard** — tab order, keyboard traps, focus indicators / `:focus-visible`
  styling, keyboard-only paths, Esc-to-dismiss, keyboard shortcuts
- **Alt text** — on decorative art, generated boards, stickers, avatars, any of it
- **WCAG ratio math** — no 4.5:1 / 3:1 calculations, no AA/AAA grading
- **Touch targets** — the 44×44px minimum is not a rule here
- **Heading hierarchy** — h1→h3 skips are fine; nothing consumes the outline
- **Reduced-cognitive-load / plain-language compliance passes** beyond normal
  good copy
- **i18n, RTL, locale formatting** — English only, one locale
- **Prefers-contrast, forced-colors, high-contrast mode**

Do not add these as P0/P1/P2/P3 findings. Do not list them as "quick wins."
Do not add a "note that we skipped accessibility" caveat to every response —
say it once if directly relevant, then move on.

## Per-command overrides

| Impeccable command | Override |
|---|---|
| `audit` | **Drop category 1 (Accessibility) entirely.** Don't score it, don't put it in the summary table — omit the row. Also drop the touch-target check from Responsive. |
| `critique` | **Drop the "Sam" (accessibility-dependent user) persona** from every persona sweep. Drop keyboard-shortcut findings from "Alex". Keep the visual, hierarchy, emotional-fit, and delight dimensions — those are the whole point. |
| `polish` | Skip the a11y checklist block: alt text, tab order, ARIA/semantic HTML, touch targets, WCAG contrast checkboxes, focus indicators. Polish means **visual** polish: spacing rhythm, alignment, motion timing, color commitment, state transitions. |
| `harden` | **Skip "Accessibility Resilience" wholesale** (keyboard nav, screen reader, ARIA, alt text, axe/WAVE). Also skip i18n. Keep only: does the happy path break on camera? |
| `craft` | "Semantic first" and "Finished interaction quality" drop from requirements to nice-to-have. Never block shipping a component on them. State coverage that matters: default, hover, active, loading, empty — **not** disabled/focus-visible/error exhaustiveness. |
| `adapt` | No 44×44 enforcement. Mobile means: does it fit, does it look good, does it not overflow. Desktop is the demo surface — it wins any conflict. |
| `animate` | **Keep `prefers-reduced-motion`.** It's already wired in `src/index.css`, it's one media query, and choppy motion on a judge's machine is a camera problem. This is the one exception. |
| `bolder` `delight` `overdrive` `colorize` `layout` `typeset` `live` | No override needed — these are already the priority. Lean in harder. |

## Still do these — they're visual, not accessibility

Don't over-apply the override. These stay in scope because they make it look
**worse on camera**, which is the real bar:

- Text that is genuinely illegible against its background (washed-out gray on a
  loud identity color). Fix it by eye, not by ratio — if you have to compute a
  number to notice, it's fine.
- Text overflowing its container at any demo breakpoint
- Content flush against a border or viewport edge (cramped padding)
- Broken or placeholder images
- Line height so tight the lines collide

## Spend the freed budget here instead

Every hour not spent on ARIA goes to the things a viewer actually sees:

1. **Motion choreography** — entrances, pop-in, promote's arc from chat to
   canvas, stagger that fits what it reveals. Punchy, exponential ease-out.
2. **Identity color, committed** — every space wearing one loud color head to
   toe. Flat and full-strength, never a tint or a wash.
3. **Liveness made visible** — cursors, live vote ticks, presence, two-window
   sync. The pitch is that it's alive; make that unmissable.
4. **Signature moments** — the promote gesture, party mode, the paint canvas.
   These are the demo beats. They deserve disproportionate craft.
5. **Lived-in density** — real content, inside jokes, half-answered polls.
   Populate before you polish.
6. **Texture and depth** — sticker pills, layering, shadow, the MySpace/GeoCities
   ownership feeling. Personality over cleanliness.

## The house motion system

Measured from `src/index.css` (15.7k lines, 81 keyframes). This is what the app
already does — match it, don't invent a second dialect.

### Three curves, three jobs

| Name | Curve | Use for |
|---|---|---|
| **glide** | `cubic-bezier(0.16, 1, 0.3, 1)` | The default. 138 uses already. Every hover, press, translate, opacity move, drag settle. If you're unsure, it's this. |
| **pop** | `cubic-bezier(0.2, 0.9, 0.3, 1.18)` | Gentle overshoot. Things *arriving*: widget added, vote landing, sticker dropping, face joining. |
| **snap** | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Big overshoot. **Climax beats only** — promote landing, party mode, space open. Four moments in the whole app, not forty. |

### Duration scale

The codebase currently uses 17 ad-hoc values (120/140/150/160/180/190/200/220/
240/260/320/360/380/420/460/500/520ms). Collapse to six and stick to them:

| Step | Value | Use for |
|---|---|---|
| `instant` | 120ms | Press/tap feedback, active states |
| `quick` | 160ms | Hover, focus, color shifts — the workhorse |
| `base` | 220ms | State changes, toggles, panel content swaps |
| `arrive` | 360ms | An element entering the canvas |
| `stage` | 500ms | A section or overlay entering |
| `hero` | 900ms | Space open, title reveal. Once per screen, max. |

**Tokenize both.** The glide curve is hardcoded **138 times** in `index.css`.
AGENTS.md already says tokens live in `@theme` and raw values don't ship — that
applies to motion too. Add `--ease-glide` / `--ease-pop` / `--ease-snap` and
`--dur-instant` … `--dur-hero` to the `@theme` block and use them. Retrofit
opportunistically (files you're already touching), not as a big-bang refactor.

### Override: overshoot is allowed here

Impeccable bans bounce and elastic globally. **That ban does not apply to this
project** — bounded overshoot is the brand ("bold, playful, alive"). The guard
rails that replace it:

- Overshoot y ≤ **1.2** for routine arrivals; y ≤ **1.56** for climax beats only
- **Never on exits.** Things leave on `glide`, always. Overshoot on the way out
  reads as a bug.
- **Never on hover.** Hover fires hundreds of times; overshoot gets nauseating.
- **Never on anything looping.** One overshoot per beat.
- Still banned: `animate-bounce`, elastic/wobble/jiggle keyframes, springs that
  visibly oscillate more than once.

The sanctioned curves are whitelisted in `.impeccable/config.json`, so the
detector won't flag them. Any *new* overshoot value will still trip
`bounce-easing` — that's intentional; add it to the whitelist deliberately or
use one of the three.

## Where the motion budget goes

Not everything gets choreographed. Motion everywhere reads as noise, and noise
is the opposite of eye candy.

- **Tier 0 — cinematic, hand-tuned, worth hours.** Promote (chat → canvas),
  party mode, space open. These are the demo beats. Frame-by-frame them.
- **Tier 1 — choreographed, worth an hour.** Widget added, vote landing, note
  arriving, cursor joining, radio play. Visible in the pan.
- **Tier 2 — house default, worth five minutes.** Hover, press, focus. Use
  `glide` + `quick` and move on.
- **Tier 3 — none.** Settings, forms, admin, anything off-camera. Instant is fine.

## Techniques that would upgrade this app specifically

Ranked by how much they'd improve the video, and none of them are in the
codebase yet:

1. **FLIP the promote gesture.** This is the single biggest available win. Right
   now promote can only cross-fade; it should *physically travel* — measure the
   chat bubble with `getBoundingClientRect()`, measure the landed note, animate
   the delta with WAAPI (`el.animate([...], {easing, duration})`) so the message
   arcs across the canvas and lands with a `snap`. The climax deserves a real
   trajectory, not an opacity swap.
2. **Squash-and-stretch on landing.** Two extra keyframes on the promote/widget
   arrival: `scale(1.08, 0.92)` at impact → `scale(1)` on `snap`. Cheap; reads
   as craft.
3. **Stagger with `--i`, not hardcoded delays.** `index.css` hardcodes
   `animation-delay: 240ms / 290ms / 340ms`. Set `style={{'--i': i}}` and use
   `animation-delay: calc(var(--i) * 40ms)` — the stagger then survives adding a
   sixth widget.
4. **`@starting-style` + `transition-behavior: allow-discrete`.** Entrance
   animations for popovers/dialogs/`display:none` elements with zero JS.
   Baseline in every browser that will run the demo.
5. **View Transitions API** for space → space navigation. One
   `document.startViewTransition()` turns a jump cut into a morph.
6. **On-brand motion materials.** `filter: blur()`, `clip-path` / `mask` wipes,
   `scale`, `rotate`, `filter: saturate()` on party mode.
   **Not gradients, glows, or neon halos** — DESIGN.md bans those and this skill
   does not override that ban. Loud flat color is the identity; keep it flat.
7. **Motion on the identity color.** Each space owns a color — let it *act*.
   Color-shift the whole canvas on party mode, pulse the rail on a live vote.

Two constraints that survive: never animate layout properties (width, height,
padding, margin — use transform, or `grid-template-rows` for height), and never
gate content visibility on a class-triggered transition (it never fires in
headless renderers and the section ships blank).

## Definition of done is a video, not a page

Success is a 3-minute recording, so verify like a recording:

- **Record it and scrub.** Screenshots don't show jank. Use `/run-ourspaces` to
  drive it, then watch the capture frame by frame.
- **Watch it at 1× with no narration.** If the beat doesn't read without someone
  explaining it, the motion isn't doing the work yet.
- **Check the first 200ms.** Judges form the impression before the first
  sentence lands. Space open is the most valuable animation in the app.
- **Two windows side by side.** Liveness only reads when you can see both.
- **Nothing important animates in from off-screen at the edge of frame** — the
  crop will eat it.

## Escape hatch

If the human **explicitly asks** for accessibility work ("make this
keyboard-navigable", "add alt text", "check contrast"), do it fully and well.
This override is a default, not a refusal.

## Related

- `PRODUCT.md` § Accessibility & Inclusion — the same rule, where impeccable's
  `context.mjs` is guaranteed to print it every run
- `AGENTS.md` — hackathon rules (no tests, demo path over edge cases)
- `.impeccable/config.json` — the matching detector rule suppressions
