# Overnight brief — build steps 1–2 (Convex canvas)

Read `AGENTS.md`, `docs/data-model-plan.md` (§0–§7), PRD §6, §10, §11 first.
Work unattended. Stop when done or blocked; leave a note in `hackathon.md`.

## Deliver, in order, one commit each

1. **Schema.** `convex/schema.ts` exactly per data-model-plan §2: spaces,
   members, widgets, messages, votes, presence. Indexes as listed.
   `npx convex dev --once` pushes clean.
2. **Functions.** `convex/spaces.ts` (listSpaces, createSpace),
   `convex/widgets.ts` (listWidgets, createWidget, moveWidget, resizeWidget,
   updateWidgetData). Validators on every arg.
3. **Seed.** `convex/seed.ts` internal mutation that creates the hero crew
   space from data-model-plan §6: inside-joke note, summer poll, daily question,
   "Maya's bday" frame with countdown, cake poll, potluck. Idempotent.
   Run it.
4. **Shell.** `src/main.tsx` ConvexProvider; `src/App.tsx` loads the first
   space and renders `Canvas`. Tailwind v4 with the `@theme` tokens from
   `docs/tokens.md` in `src/index.css`. Plus Jakarta Sans via Google Fonts.
5. **Canvas.** Bounded board anchored top-left (grows down/right only, min
   2400×1600). Widgets absolutely positioned from `x,y,w,h,z`. One component
   per type in `src/widgets/` (note, poll, countdown, potluck, daily question,
   frame, chat placeholder) — static render of `data` is enough tonight.
   Style per §10: identity color, sticker pills, rounded-card, no gradients.
6. **Drag + resize.** Pointer-based, optimistic local position during drag,
   `moveWidget` / `resizeWidget` on release. Frame moves its contained widgets
   (compute containment on drag start). Bring-to-front on pointer down.
7. **Deploy.** `npm run build` green → `npm i @convex-dev/static-hosting`,
   `npx @convex-dev/static-hosting setup`, follow its printed steps →
   `npx convex deploy` → verify `https://<deployment>.convex.site` loads →
   URL in README. Final commit. `/hackathon`.

## Done means

Two browser windows on the deployed URL show the crew space; drag a widget in
one, it moves in the other. Nothing else is in scope tonight — no presence,
no chat, no auth, no AI. If step 6 is shaky, ship steps 1–5 deployed.

## Reference + model split

- Pre-hack design prototype at `/Users/thomasnguyen/Desktop/ourspaces` (mock
  data, no backend). **Read it for look and structure; port, don't copy.**
  Every file lands rewritten against the new Convex types and `data` shapes —
  no byte-identical copies, no old authorship.
- **You (Terra):** schema, functions, seed, App shell, canvas + drag/resize,
  deploy, commits.
- **Luna subagents, one per file, in parallel:** port each widget component
  (`src/widgets/*`) and `index.css` from the prototype. Prompt them with the
  old file path, the new `data` type from `docs/data-model-plan.md` §3, and:
  "same look, new props, no new features." Review before committing.

## Constraints

- Use `convex` ≥ 1.17, `convex-helpers`. No state library, no animation
  framework, no drag library (pointer events are fine).
- Don't read secrets. Don't add tests. Don't touch `docs/` except
  `hackathon.md`.
