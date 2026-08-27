# Overnight brief — build steps 1–2: the Convex canvas

You are working unattended in `ourspaces-app`. Goal by morning: **two browser
windows on a public convex.site URL show the crew space; drag a widget in one,
it moves in the other.** Nothing else is in scope — no presence, no chat, no
auth, no AI, no Home grid.

Read first: `AGENTS.md`, `docs/data-model-plan.md` §0–§7, PRD
(`docs/ourspaces-prd-v0.6.md`) §6 (hero space), §10 (design), §11 (architecture),
`docs/tokens.md`, `DESIGN.md`. Then skim the reference prototype (below).

## Reference prototype — port, don't copy

Path: `/Users/thomasnguyen/Desktop/ourspaces` (a pre-hack design prototype:
mock data, partial Convex). Use it for **look, layout, and interaction feel**.
Every file you create is written fresh against this repo's types and Convex
functions — no byte-identical copies, no `cp`. What to look at, per step:

| Need | Look at |
| --- | --- |
| Widget `data` shapes | `docs/data-model-plan.md` §3 (truth), old `src/data/types.ts` |
| Seed content (names, jokes, poll options) | old `src/data/crew.ts`, `src/data/spaces.ts`, `src/data/chat.ts` |
| Canvas board + drag/resize | old `src/components/Canvas.tsx`, `WidgetCard.tsx` |
| Widget renderers | old `src/widgets/core.tsx` (note, poll, countdown, potluck, frame), `extras.tsx` (daily question only) |
| Sticker pills, card styling | old `src/index.css`, `DESIGN.md` |

Ignore in the prototype: rail, Home, navigator, chat panel, editors, cursors,
photo wall, pages, `src/live/*`. Those come later.

## Step 0 — cloud dev deployment (5 min)

`.env.local` currently points at a **local** deployment (`local:…`,
`127.0.0.1:3210`). Switch to cloud so deploy works: run
`npx convex dev --configure=existing --team thomas-nguyen-dc6ea --project ourspaces-app`
and choose a cloud dev deployment; confirm `VITE_CONVEX_URL` becomes
`https://….convex.cloud`. Never commit `.env.local`. Keep `npx convex dev`
running in the background for the rest of the session.

## Steps — one commit each, `npm run build` green before every commit

1. **Schema** — `convex/schema.ts` per data-model-plan §2: `spaces`, `members`,
   `widgets`, `messages`, `votes`, `presence`, with the listed indexes
   (`by_space`, `by_space_user`, `by_widget`, …). `widgets.data` is `v.any()`.
   Commit: `feat: convex schema`.
2. **Types** — `src/lib/widgets.ts`: the discriminated union from
   data-model-plan §3 (`CountdownData`, `PollData`, `PotluckData`, `NoteData`,
   `DailyQData`, `FrameData`), plus `WidgetType` and a `Widget` type derived from
   `Doc<"widgets">`. Commit: `feat: widget data types`.
3. **Functions** — `convex/spaces.ts`: `listSpaces`, `getSpace`, `createSpace`.
   `convex/widgets.ts`: `listWidgets(spaceId)`, `createWidget`, `moveWidget(id,x,y)`,
   `resizeWidget(id,w,h)`, `bringToFront(id)`, `updateWidgetData(id,data)`.
   `convex/votes.ts`: `pollResults(widgetId)` (read-only for now). `v` validators
   on every arg; use `_generated/server` `query`/`mutation`. Commit:
   `feat: space and widget functions`.
4. **Seed** — `convex/seed.ts` `internalMutation` `seedCrew`, idempotent (skip if
   a space named "the crew" exists). Creates per data-model-plan §6: the crew
   space (violet, `ongoing`), 6 members with distinct colors, evergreen widgets
   (inside-joke note, "where are we going this summer" poll with seeded votes,
   daily question), and a **"Maya's bday" frame** containing a countdown (target
   ~5 days out), cake poll (seeded votes), potluck (one item claimed). Positions
   must fit inside the frame bounds. Run it:
   `npx convex run seed:seedCrew`. Commit: `feat: seed the crew space`.
5. **Shell** — `src/App.tsx` loads the first space via `useQuery(api.spaces.listSpaces)`
   and renders `<Canvas spaceId>`; empty state if none. Commit: `feat: app shell`.
6. **Canvas + widgets** — `src/components/Canvas.tsx`: bounded board anchored
   top-left, min 2400×1600, grows to fit the farthest widget + margin, scrolls
   natively. Widgets absolutely positioned from `x,y,w,h,z`. `src/widgets/`:
   one file per type — `Note`, `Poll`, `Countdown` (client-side tick), `Potluck`,
   `DailyQuestion`, `Frame` (titled rounded rect drawn *behind* its widgets,
   lowest z). `WidgetCard.tsx` picks the renderer by `type`. Style strictly per
   §10 / tokens: flat identity colors, black sticker pills, `rounded-card`, no
   gradients, Plus Jakarta Sans. Commit: `feat: canvas renders the crew space`.
7. **Drag + resize** — pointer events, no library. Optimistic local position
   during drag, `moveWidget` on pointer up; resize handle bottom-right →
   `resizeWidget`. Pointer down → `bringToFront`. Dragging a frame moves the
   widgets whose centers are inside it (compute set on drag start). Clamp to
   x,y ≥ 0. Respect `prefers-reduced-motion` for any transitions. Commit:
   `feat: drag and resize commit to convex`.
8. **Deploy** — `npm i @convex-dev/static-hosting`, then
   `npx @convex-dev/static-hosting setup` and follow what it prints (app
   registration in `convex/convex.config.ts`, build/deploy script). Then
   `npx convex deploy` (creates the prod deployment) and run the seed on prod:
   `npx convex run seed:seedCrew --prod`. Open the printed
   `https://<deployment>.convex.site` URL and verify the crew renders. Put the
   URL in `README.md` under **Live**. Commit: `feat: deploy to convex.site`.
9. **Log** — run `/hackathon` so `hackathon.md` records tonight's steps. Commit.

## Verify before you stop

- Two tabs of the deployed URL: drag in one → moves in the other within ~100 ms.
- Resize, frame move-together, bring-to-front all work.
- Reload → positions persist.
- `npm run build` is green; no console errors on load.
If step 7 is shaky, ship steps 1–6 deployed and say so in `hackathon.md`.

## Model split (Codex)

- **You (Terra):** everything above except the widget renderers.
- **Luna subagents, one per widget file:** step 6's `Note`, `Poll`, `Countdown`,
  `Potluck`, `DailyQuestion`, `Frame`. Give each: the old file section to
  reference, the new `data` type from `src/lib/widgets.ts`, the tokens, and
  "same look, new props, no new features, no hex colors." Review each file
  before committing.

## Constraints

- React 19, Vite, Tailwind v4 (tokens already in `src/index.css`). Deps allowed:
  `convex`, `convex-helpers`, `@convex-dev/static-hosting`. No state library,
  no animation framework, no drag library.
- No tests. No a11y audit. No refactors. Don't touch `docs/` except
  `hackathon.md`. Never read or print `.env.local` contents.
- Conventional commit messages, one per step. Don't push force. Push at the end.
- If blocked (auth prompt, deploy error you can't fix in 15 min), stop, write
  what happened in `hackathon.md`, and leave the repo building.
