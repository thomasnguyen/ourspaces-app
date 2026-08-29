---
name: eye-candy
description: OurSpaces hackathon override that sits on top of the impeccable design skill. Read this BEFORE running any /impeccable command (craft, shape, audit, critique, polish, harden, bolder, animate, delight, adapt, layout, live, ...) or doing any UI/design/polish work in this repo. Trades accessibility, compliance, and defensive UX work for demo-facing eye candy — motion, identity color, liveness, wow. Use whenever design guidance would otherwise produce a11y findings, WCAG scores, ARIA/keyboard/screen-reader work, or "production-ready" hardening.
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

## Escape hatch

If the human **explicitly asks** for accessibility work ("make this
keyboard-navigable", "add alt text", "check contrast"), do it fully and well.
This override is a default, not a refusal.

## Related

- `PRODUCT.md` § Accessibility & Inclusion — the same rule, where impeccable's
  `context.mjs` is guaranteed to print it every run
- `AGENTS.md` — hackathon rules (no tests, demo path over edge cases)
- `.impeccable/config.json` — the matching detector rule suppressions
