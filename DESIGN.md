---
name: OurSpaces
description: group chats forget. spaces remember.
colors:
  base: "#0b0b0d"
  rail: "#151517"
  sticker: "#0a0a0b"
  ink: "#ffffff"
  lime: "#c6f750"
  crew: "#7c5cff"
  couple: "#e63da8"
  fam: "#3d6eff"
  trip: "#ff7a3d"
  league: "#13b8a6"
typography:
  name:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 800
    fontSize: "clamp(1.25rem, 1rem + 1.4vw, 2rem)"
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  number:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 700
    fontSize: "clamp(2rem, 1.2rem + 3vw, 3.5rem)"
    lineHeight: 1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "1rem"
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 600
    fontSize: "0.8125rem"
    lineHeight: 1.2
rounded:
  pill: "9999px"
  tile: "15px"
  card: "26px"
components:
  space-card:
    backgroundColor: "{colors.crew}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  sticker-pill:
    backgroundColor: "{colors.sticker}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  widget-card:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "16px"
  rail-panel:
    backgroundColor: "{colors.rail}"
    rounded: "{rounded.card}"
    padding: "12px"
---

# Design System: OurSpaces

> **Hackathon context:** This is a Convex hackathon MVP, not a production app.
> Design priority is **wow on camera** — bold identity, punchy motion, liveness.
> Accessibility audits, production-grade polish, and edge-case UI are explicitly
> deprioritized. If a choice trades demo impact for correctness, pick demo impact.

## 1. Overview

**Creative North Star: "The Lived-In Sticker Wall."**

OurSpaces is a near-black room with loud color panels pinned to it like posters
and stickers. Each space is a slab of one saturated color, edge to edge; the
chrome — labels, chips, buttons — rides on black rounded "sticker pills," a few
tilted a degree or two for personality. It should feel like a friend group's
shared wall: bold, a little playful, and unmistakably *theirs*. The signature
moment is **promote** — a chat message peeled off the feed and stuck to the
canvas as a note that everyone sees appear at once.

This system explicitly rejects the productivity-tool aesthetic (Notion, Linear,
Slack, dashboards) and the AI-slop defaults that flood the internet: purple→blue
gradients, glassmorphism, card-grids-on-card-grids, neon glows. Dark here is
*settled*, not moody; color is *identity*, not decoration. Restraint is not the
goal — committed, high-contrast boldness is. If it could be mistaken for an admin
panel, it's wrong.

**Key Characteristics:**
- Near-black base (#0b0b0d); dark is the settled stage, color is the star.
- Loud, saturated identity color — the card *is* the color, flat, full-strength.
- Sticker-pill chrome: black rounded pills, white text, a slight rotation on one
  or two.
- Lime as the single rare pop (brand mark, status dot, the `+`).
- Flat at rest; punchy, own-color lift on hover. No gradients, no glows.
- Two typefaces and no more (Bricolage Grotesque for display, IBM Plex
  Sans for text), sentence case everywhere, weight for
  hierarchy.

## 2. Colors

The palette is loud and identity-first: a color is either full-strength or it's a
neutral — there is no in-between tint.

### Primary — Space identity colors
Each space owns exactly one of these, and wears it across its whole card and
chrome. They are peers, not a hierarchy.
- **Crew Violet** (#7c5cff): the evergreen friend-group space — the hero.
- **Couple Magenta** (#e63da8): two-person spaces.
- **Fam Blue** (#3d6eff): family spaces.
- **Trip Orange** (#ff7a3d): trip / event spaces.
- **League Teal** (#13b8a6): rec-league / recurring-group spaces.

The build room uses `--color-buildroom` for its wall: a dusty denim felt
(`torch` preset — the id survived three oranges and a color change). The
room's identity color is still orange, but it lives on the objects, not the
wall: the tape, the pushpins, the kept count, the vote arrows and the rail
tile all take `--space-accent`, so the loud color is rare and the black slabs
and white paper do the talking. The wall is a tonal system, not one flat fill:
the five zone frames are panels one step deeper in the wall's own hue, every
object's shadow is `--color-buildroom-deep` at half alpha (never neutral
black, which goes gray on blue), and the canvas grid is a pegboard (dark hole,
light rim). Kind pills keep crew violet; magenta stays out of it.

### Secondary — The one pop
- **Lime** (#c6f750): the brand mark, the live status dot, the `+` to add. Used
  tiny and rare, on a handful of elements per screen. **Never fills a panel.**

### Neutral
- **Near-black Base** (#0b0b0d): the app background — the wall behind everything.
- **Rail / Widget Dark** (#151517): the floating rail and on-canvas widget tiles;
  one step up from the base.
- **Sticker Black** (#0a0a0b): pills, chips, buttons, tooltips — the chrome.
- **Ink White** (#ffffff): all text, on dark and on color alike.

### Named Rules
**The Color-Is-Identity Rule.** Every space owns one saturated color and that
color is the *whole* card — flat, not a tint, not a glow. Home is a grid of solid
color panels, not tinted cards on a gray page.

**The Lime Rule.** Lime is the one pop, tiny and rare: brand mark, status dot,
the `+`. It never fills a panel and never becomes a space identity color. Its
scarcity is the point.

**The No-Cheap-Light Rule.** No gradients, no glows, no glassmorphism, no
neon halos, no purple→blue washes. Color is flat and saturated or it is neutral.

## 3. Typography

**Display Font:** Bricolage Grotesque · **Body / Label Font:** IBM Plex Sans
(both with `ui-sans-serif,
system-ui, sans-serif` fallback).

**Character:** Bricolage gives names and numbers their chunky personality.
IBM Plex Sans keeps sentences open and easy to read. Use regular weight for
prose, with emphasis reserved for titles and names; no serif or mono.

### Hierarchy
- **Name** (800, `clamp(1.25rem, 1rem + 1.4vw, 2rem)`, 1.1): space names, widget
  titles, section headers. The loud voice.
- **Number** (700, `clamp(2rem, 1.2rem + 3vw, 3.5rem)`, 1): countdown digits,
  vote tallies, claim counts — numbers feel solid and proud.
- **Body** (400, `--text-body` / 1rem, 1.5): messages, descriptions, forms,
  letters and recaps. Generous reading surfaces use 18px / 1.55. Compact
  widget previews use 14px, with larger source sizes on scaled canvases.
  Keep prose to ~65–75ch and make the container fit the copy.
- **Caption** (500, `--text-caption` / 0.875rem, 1.4): bylines and helper text.
- **Label** (600, 0.8125rem, 1.2): text inside sticker pills — chips, buttons,
  status.

### Named Rules
**The Two-Family Rule.** `--font-display` (Bricolage Grotesque) for names and
numbers, `--font-sans` (IBM Plex Sans) for everything you read. Nothing else —
no third face, no mono,
ever. If two weights can do it, two weights do it.

**The Sentence-Case Rule.** Sentence case everywhere — names, headers, buttons,
labels, empty states. Never Title Case, never ALL CAPS (even on pill labels).

## 4. Elevation

The system is **flat by default.** Surfaces are solid color blocks at rest — no
resting shadow, no decorative borders, no inner highlights. Depth appears only as
a *response to interaction*: on hover, a card lifts and casts a soft shadow tinted
in its own color, so it reads like a physical sticker you could peel off the wall.
There is no ambient elevation and no glow.

### Shadow Vocabulary
- **Hover lift** (`transform: translateY(-4px); box-shadow: 0 14px 30px -10px
  <card-color, ~45% alpha>`): the only shadow in the system. The blur is soft and
  the color is the card's own — never neutral gray, never a tight dark drop.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow is a *verb*, not
a texture — it appears on hover/active and disappears otherwise.

**The Own-Color-Shadow Rule.** Lift shadows are tinted the card's own color. A
neutral-gray drop shadow or a tight 2014-style dark blur is forbidden. Audit
test: if the shadow looks like a gray rectangle slid down-right, it's wrong.

## 5. Components

### Cards / Containers
- **Space card** — the hero unit on Home and the rail. The entire card is the
  space's saturated color (flat, full-strength). Corner radius 26px
  (`rounded-card`), white ink, the name set in 800. Flat at rest; on hover, lifts
  4px with its own-color shadow.
- **Widget card** — a live module on the canvas (poll, potluck, countdown, note,
  chat). Dark tile (#151517), radius 15px (`rounded-tile`), white ink, title in
  800. The color comes from its *contents* and its space, not the tile.

### Chips / Pills (the chrome)
- **Sticker pill** — black (#0a0a0b) rounded-full pill, white label in 600,
  sentence case. This is the entire vocabulary for labels, chips, tooltips, and
  **buttons** — buttons are sticker pills. Give one or two a slight rotation
  (−2° to +3°) for personality; not all of them, and never the whole row.

### The `+` / Brand mark
- The only lime surfaces. Tiny: the `+` affordance to add a space or widget, the
  live status dot, the brand mark. High-contrast lime on near-black. Never a
  panel, never more than a few per screen.

### Navigation — the rail
- The rail **floats**: a detached, rounded-card dark panel (#151517) inset from
  the left edge, never flush. Space tiles stack vertically; the **active tile
  gets a white ring**, hover lifts. It reads as a separate object hovering over
  the wall, not a docked sidebar.

### Frame (signature container)
- A **frame** is a titled zone grouping widgets on the canvas (e.g. "Maya's
  bday"). Visual-only first: a labelled boundary with a sticker-pill title in the
  corner. It is just a widget (`type: "frame"`), not a privileged container.

### Promote → Note (signature interaction)
- **Promote** turns a chat message into a persistent sticky-note widget. The note
  **pops in** (slight scale + fade, with stagger when several land) on the canvas
  and appears on every connected window at once. This is the climax — it must feel
  instant and obviously live.

### Motion
Punchy, not glowy. Hover lifts 4px; cards pop in with a slight scale and a short
stagger; transitions are quick and physical. No fade-on-scroll, no orchestrated
page-load choreography for its own sake. All motion **respects
`prefers-reduced-motion`** (collapses to near-instant).

Motion is tokenized in `src/index.css` `@theme` — three curves (`--ease-glide`
the default, `--ease-pop` for things arriving, `--ease-snap` for climax beats
only) and six durations (`--dur-instant` 120ms → `--dur-hero` 900ms). Use the
token, never the raw curve. Full list: `docs/tokens.md`; when each earns use:
`.claude/skills/eye-candy/SKILL.md` § The house motion system.

## 6. Do's and Don'ts

### Do:
- **Do** make the card *be* the color — flat, saturated, edge to edge.
- **Do** use only the two type tokens, sentence case, with weight (800 / 700 / 500)
  carrying hierarchy.
- **Do** keep lime tiny and rare — brand mark, status dot, the `+`.
- **Do** put all labels, chips, and buttons on black sticker pills; tilt one or
  two slightly.
- **Do** keep surfaces flat at rest and lift 4px with the card's *own-color*
  shadow on hover.
- **Do** let the canvas be primary — chat is one widget, not a sidebar.
- **Do** honor `prefers-reduced-motion`.
- **Do** ship a real, lived-in empty state — never "nothing here."

### Don't:
- **Don't** use gradients, glows, glassmorphism, or neon halos — they read cheap.
- **Don't** tint: no 10%-opacity color washes. Full-strength or neutral.
- **Don't** look like a productivity tool — no Notion / Linear / Slack /
  dashboard chrome, no gray-on-gray.
- **Don't** add a second font family or any monospace.
- **Don't** use Title Case or ALL CAPS, even on pill labels.
- **Don't** use neutral-gray or tight 2014-style dark drop shadows.
- **Don't** fill a panel with lime.
- **Don't** nest cards inside cards inside cards.
- **Don't** ship AI-slop tells: purple→blue gradients, bounce easing, or colored
  side-tab border stripes.
