# Brief 3 — port the whole prototype onto Convex

Run **after** `BRIEF_2_LIVE.md`. The reference prototype at
`/Users/thomasnguyen/Desktop/ourspaces` has far more than we've ported: a
landing page, Home grid + rail, multiple seeded spaces, ~25 widget types, a
widget picker, editor panels, a canvas navigator, an action dock, invite
routes, a photo-wall gallery. Bring **all of it** over, in this order, each
piece rewired to Convex (its data lived in `src/data/*.ts` mocks; here it
lives in the tables). Same rules: port the look and interactions, rewrite
against this repo's types and functions, no byte copies, one commit per
piece, build green, `hackathon.md` updated at the end of each session.

Reference map (old repo):
- Shell/pages: `src/App.tsx`, `src/pages/Welcome.tsx` (landing), `LiveSpace.tsx`
  (the space page — biggest file, read it fully), `Block.tsx`, `src/lib/routes.ts`
  (`#/join/<slug>` invite links), `src/lib/onboarding.ts`, `src/lib/sounds.ts`.
- Chrome: `src/components/Rail.tsx`, `ActionDock.tsx`, `CanvasNavigator.tsx`,
  `CanvasEdgePan.tsx`, `WidgetPicker.tsx`, `WidgetEditorPanel.tsx`,
  `SpaceEditorPanel.tsx`, `WelcomePill.tsx`, `FirstRunSticky.tsx`, `MemberFace.tsx`,
  `PhotoWallGallery.tsx`, `WidgetThreadDock.tsx` + `ThreadContent.tsx`
  (per-widget threads), `GhostCanvas.tsx` (home previews).
- Widgets: `src/widgets/core.tsx` (sticker, frame, countdown, poll, potluck,
  chat, note, media) and `extras.tsx` (wheel, dualClock, dailyQ, rsvp, decision,
  availability, photoWall, linkShelf, playlist, jokeRegistry, expenseSplit,
  itinerary, messageWall, quote, weather, sports). Defaults/labels:
  `src/lib/widgetDefaults.ts`, `widgetLabels.ts`, `widgetThreads.ts`.
- Data to seed: `src/data/spaces.ts` (all spaces + their widgets — 1300 lines,
  this is the content), `templates.ts`, `crew.ts`, `chat.ts`, `avatars.ts`,
  `stickers.ts`, `spaceThemes.ts`, `recap.ts`.

## Order (each = one or more commits)

1. **Widget types, all of them.** Extend `src/lib/widgets.ts` with every
   `data` shape in old `src/data/types.ts`. Port every renderer into
   `src/widgets/<Type>.tsx`; `WidgetCard` dispatches by type. Static render
   first; interactions in step 6. Luna subagents, one per widget.
2. **Seed every space.** `convex/seed.ts` becomes data-driven: a `seedAll`
   internal mutation that inserts every space from old `spaces.ts` (crew,
   couple, family, league, article club, etc. — whatever is there), its members,
   widgets, messages, and votes. Idempotent per space slug. Spaces get `slug`,
   `tagline`, `canvasW/H`, `type`, `color`, `icon`.
3. **Routing + Landing.** Hash routes: `#/` landing (old `Welcome.tsx`, one
   viewport, Get started → crew), `#/home`, `#/s/<slug>`, `#/join/<slug>`
   (invite link: joins the space with the local identity, then opens it).
4. **Home grid + Rail.** `listSpaces` returns preview payload + live member
   count; Home renders the bold color panels with `GhostCanvas` mini previews
   (real widgets, scaled); Rail is the floating dark panel with active ring.
5. **Space chrome.** `ActionDock` (add widget, home, map, invite link copy,
   space editor), `WidgetPicker` (creates via `createWidget` with
   `widgetDefaults`), `WidgetEditorPanel` (edits `data` via
   `updateWidgetData`, delete via new `deleteWidget`), `SpaceEditorPanel`
   (name/color/icon via `updateSpace`), `CanvasNavigator` minimap +
   `CanvasEdgePan`, `WelcomePill`/`FirstRunSticky` onboarding, `sounds`.
6. **Widget interactions on Convex.** Every widget's writes go through
   `updateWidgetData` or a dedicated mutation: rsvp status, decision picks,
   availability grid, link shelf add, playlist add, expense split, itinerary
   items, message wall posts, wheel spin result, photo wall (uploads via
   Convex **file storage** `generateUploadUrl` + `PhotoWallGallery`).
7. **Widget threads.** `WidgetThreadDock` + `ThreadContent`: messages with
   `widgetId` = that widget; promote works from threads too.
8. **Deploy, seed prod, verify every space renders, `/hackathon`, push.**

## Convex depth to surface (put each in README "Convex depth")

realtime queries · mutations · indexes · crons (presence cleanup) · scheduled
functions · file storage (photo wall) · static hosting component · presence.

## Don't

No auth yet, no AI, no email, no Firecrawl — those are briefs 4–5. Don't
"improve" the design; match the prototype. Don't add tests.
