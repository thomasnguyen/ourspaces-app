---
name: ourspaces-hackathon
description: Use when working on OurSpaces — a Convex hackathon MVP. Reminds agents that this is a demo-first build where design, liveness, and the wow factor beat production-grade concerns like accessibility audits, exhaustive error handling, and test coverage. Applies to all frontend, backend, and design work in this repo.
version: 1.0.0
---

# OurSpaces — hackathon context

This repo is a **Convex hackathon MVP** built to win with a 3-minute demo video.

## What matters

- **Demo path:** two windows → live sync → shared cursors → promote a chat message
  onto the canvas instantly.
- **Design & wow:** bold identity color, punchy motion, liveness, the promote
  payoff. Judges decide in the first 15 seconds of product footage.
- **Convex reactivity:** persistence + presence is the pitch. Don't hand-roll
  what the platform gives free.

## What does NOT matter (unless explicitly asked)

- Accessibility audits, WCAG, screen-reader completeness, keyboard-nav
  gold-plating (basic `prefers-reduced-motion` is already wired)
- Tests, exhaustive error handling, security hardening, observability
- Edge cases the demo won't hit, refactors for maintainability, i18n

## Tradeoff rule

If a choice trades **demo impact** for **production readiness**, pick demo
impact every time. A gorgeous promote animation that works 9/10 times beats a
boring one that works 10/10.

## Key docs

- `AGENTS.md` — agent instructions
- `CLAUDE.md` — full build context, stack, design language
- `PRODUCT.md` — product register for design commands (impeccable)
- `DESIGN.md` — visual system
- `docs/ourspaces-prd-v0.6.md` — product spec
