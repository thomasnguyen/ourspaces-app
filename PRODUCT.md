# Product

<!-- Strategic context for AI design commands (impeccable). The visual source of
     truth stays src/index.css @theme + CLAUDE.md §10 / PRD §10; this mirrors it. -->

## Register

brand

## Users

Friend groups — close crews, long-distance couples, families, trip squads,
rec-league teams, and interest crews (a dev group swapping links, an article
club) — mostly Gen Z and young adults who already live in a group chat. The context is
social, not professional: they're planning or living through an occasion (a
birthday, a trip, a weekly hang) together, on phones and laptops, often at the
same time. The job to be done: stop losing the plans, polls, and inside jokes to
the scroll — turn the chaos of a group chat into one shared place that
*remembers*, and that feels like theirs.

What they should feel: belonging and delight. "This is *our* space." It should
read as alive (people are here right now), lived-in (it has history), and a
little playful — never like work.

## Product Purpose

OurSpaces turns a group chat into a living, shared canvas. A friend group
composes a "space" out of live widgets — countdown, poll, potluck, chat, note —
and everything is real time: shared cursors drift across the canvas, votes land
live, and a **promote** gesture rescues a chat message onto the canvas as a
sticky note that stays put. Discord meets Figma, but for your people instead of
your work.

The tagline is the whole thesis: **group chats forget. spaces remember.**
Persistence + presence is the pitch.

Layered on top is the rallying cry: **make social media fun again.** The
MySpace/GeoCities nostalgia isn't for feeds — it's for *owning a page you could
decorate*. The rallying cry is the vibe and the hook, the tagline is the job,
and personalization (every space wearing its own loud color and clutter) is the
proof, shown rather than said. The demo opens on this: a flash-cut montage of
the old web, a hard cut to one sterile gray feed, and the line "the web used to
be ours. then it got boring."

The second story is **group chats that don't die** — each feature answers one of
the three reasons chats go quiet. Nothing to talk about → daily question /
topics. Nothing to do together → the collab paint canvas, the playlist sticker,
party mode. Nothing accumulates → photo wall, promoted notes, the archive.

The three demo verticals are the same canvas wearing three skins — friend group
(hero), long-distance couple (paint canvas, the realtime flex), dev group
(Firecrawl link cards, Hacker News as a bedroom wall) — which is itself the
personalization claim on camera.

This is a **Convex hackathon MVP**. Success is singular: **win the hackathon with
a demo that lands in 3 minutes.** Every decision answers one question — does it
make the demo video land harder? Liveness, design, and the wow factor beat
feature breadth; one polished vertical beats a shallow feature reel.

**Hackathon tradeoffs:** production-grade concerns (accessibility audits,
exhaustive error handling, security, i18n, test coverage) are explicitly
deprioritized. Invest in what reads on camera — bold identity, punchy motion,
liveness, the promote climax — not in invisible infrastructure.

## Brand Personality

Three words: **bold, playful, alive.**

Voice is Gen Z social — warm, casual, confident, sentence case everywhere (never
corporate, never shouty Title Case). The interface has a point of view and isn't
afraid of color or personality. It should read as a social app you'd *want* on
your home screen, not a tool you're made to use.

A note on register: OurSpaces is functionally an app, but it is documented as a
**brand** surface on purpose. Its design intent is brand-level expression — loud
identity color, bold type, choreographed pop-in motion — and treating it as a
restrained "product" surface would flatten exactly the personality the pitch
depends on. Borrow product-grade discipline where it helps (real empty states,
consistent component vocabulary), but the default lane is loud.

## Anti-references

- **Productivity tools.** Must NOT look like Notion, Linear, Slack, Trello, or
  Asana, or any dashboard/admin surface. No enterprise chrome, no gray-on-gray,
  no "the tool disappears into the task." Here the tool has personality.
- **Generic SaaS / startup-landing minimalism.** No safe, beige, average
  layouts. Safe = invisible.
- **AI slop.** No purple→blue gradients, no glassmorphism, no
  card-grids-on-card-grids, no generic-default look. A viewer should ask "how was
  this made?", not "which AI made this?"
- **Cheap-reading effects.** No gradients, no glows, no neon halos. Color is flat
  and full-strength or it's neutral — never a tint or a wash.

## Design Principles

1. **Liveness is the pitch.** Everything reads as real time — presence, live
   votes, instant promote, two-window sync. Lean on Convex reactivity; never
   hand-roll what the platform gives free.
2. **One polished vertical beats a feature reel.** Depth and polish over breadth.
   The crew + "Maya's bday" demo done flawlessly beats ten half-built widgets.
3. **Color is identity.** Every space owns one loud color and wears it head to
   toe. The canvas is personal and opinionated, never neutral.
4. **The canvas is primary.** Chat is just one widget on the board, not a
   privileged sidebar. Promote — chat message → sticky note — is the signature
   gesture and the demo's climax.
5. **Lived-in over empty.** The hero space looks like real people use it: an
   inside-joke note, a half-answered poll, a daily question. Populate before you
   polish. Corollary — **props, not features**: the playlist is now a real
   SomaFM room radio (play/join, not licensed tracks); photo wall and link
   shelf stay set dressing the camera pans past. Real engineering goes only to
   demo-beat widgets (daily question, paint, Firecrawl link card) plus that
   radio if it's in the shot.
6. **If it won't show on camera in 3 minutes, it's low priority.** Optimize
   relentlessly for the demo.

## Accessibility & Inclusion

**Explicitly out of scope. This is the highest-priority instruction in this
file — it overrides impeccable's own defaults wherever they conflict.**

**MANDATORY:** before producing any design output — any `craft`, `shape`,
`audit`, `critique`, `polish`, `harden`, `bolder`, `animate`, `adapt`, `layout`,
`live` run, or any freeform UI work — **read
`.claude/skills/eye-candy/SKILL.md`**. It is the hackathon override layer that
sits on top of impeccable: what to skip, per-command overrides, and where the
freed budget goes instead.

The short version: do not audit for, score, report, or build ARIA, screen-reader
support, keyboard navigation, focus indicators, alt text, WCAG contrast ratios,
44px touch targets, heading-level order, or i18n. Do not raise them as findings.
Omit the Accessibility category from `audit`; drop the accessibility persona from
`critique`; skip the a11y checklist in `polish` and Accessibility Resilience in
`harden`.

Two things stay, because they are *visual* failures, not compliance ones: text
that is genuinely illegible on camera, and `prefers-reduced-motion` (already
wired in `src/index.css`, one media query, and juddering motion ruins the video).

This is a 3-minute demo judged from a recording. Eye candy beats usability here:
spend the effort on motion, identity color, liveness, and the promote climax. If
the human explicitly asks for accessibility work, do it fully — this is a
default, not a refusal.
