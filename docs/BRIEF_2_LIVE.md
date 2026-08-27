# Brief 2 — make it live: identity, presence, votes, chat, promote

Unattended. Goal: **two windows, two people: named cursors roam, a vote in A
fills the bar in B, a chat message in A gets promoted into a note that appears
in B.** No Home grid, no auth, no AI, no email yet.

Read first: `AGENTS.md`, `convex/_generated/ai/guidelines.md`,
`docs/data-model-plan.md` §1, §4, §5, PRD §6, §7, §10, `docs/OVERNIGHT_BRIEF.md`
(what exists). Same rules as brief 1: port from the reference prototype at
`/Users/thomasnguyen/Desktop/ourspaces` for look and feel, rewrite everything
against this repo's Convex functions, no byte copies, one commit per step,
`npm run build` green before each commit, `npx convex dev` running throughout.

Reference map: identity gate → old `src/live/identity.ts`, `src/pages/Welcome.tsx`;
cursors → old `src/cursors/*`, `src/live/usePresence.ts`; chat → old
`src/components/GlobalChatPanel.tsx` (we make it a **widget**, not a panel);
poll/potluck interactions → old `src/widgets/core.tsx`; promote animation →
old `src/lib/entrance.ts`, `WidgetCard.tsx`.

## Steps

1. **Identity (no auth).** `src/lib/identity.ts`: on first load, a small
   sticker-style gate asks for a name and picks a color from the §10 palette;
   stored in `localStorage` as `{ userId: crypto.randomUUID(), name, color }`.
   `convex/members.ts`: `joinSpace(spaceId, userId, name, color)` upserts via
   `by_space_user`; `listMembers(spaceId)`. Join on load. Commit:
   `feat: identity gate and members`.
2. **Presence cursors.** `convex/presence.ts`: `updatePresence(spaceId, userId,
   x, y, name, color)` upsert; `listPresence(spaceId)` returns rows updated in
   the last 10 s; a cron every minute deletes rows older than 30 s
   (`convex/crons.ts`). Client: throttle pointer moves to ~60 ms in canvas
   coordinates; render other users' cursors as a colored arrow + name pill,
   eased with a CSS transition. Never render your own. Commit:
   `feat: live presence cursors`.
3. **Live votes + claims.** `convex/votes.ts`: `vote(widgetId, userId,
   optionId)` upserts one row per user (`by_widget_user`), `pollResults` returns
   counts + voter names + the caller's choice. `convex/widgets.ts`:
   `claimItem(widgetId, itemId, userId, name)` toggles `claimedBy/claimedName` in
   `data.items[]`. Poll bars animate width; claimed rows flip to "covered".
   Daily question: `answerDaily(widgetId, name, text)` appends to `data.answers`.
   Commit: `feat: live poll votes, potluck claims, daily answers`.
4. **Chat widget.** New widget `type: "chat"` rendered on the canvas (seed one
   in the crew space at the bottom-left, ~420×520). `convex/messages.ts`:
   `listMessages(spaceId, widgetId)`, `sendMessage(...)` with `authorName`/
   `authorColor`. Seed the messages from data-model-plan §6 including
   **"let's do 6pm at our place"**. Each message has a small **promote** button
   (sticker pill "→ canvas") on hover. Commit: `feat: chat widget`.
5. **Promote.** `promoteMessage(messageId)`: reads the message, inserts a
   `note` widget (`data: { text, authorName, promoted: true, rotation: ±2 }`)
   just outside the chat widget's right edge, and marks the message
   `promotedWidgetId`. Client: the new note pops in (scale 0.9→1 + slight
   rotation settle, ~250 ms, reduced-motion safe) on **every** window; the
   chat row shows "on the canvas". Commit: `feat: promote a message to the canvas`.
6. **Deploy + log.** `npx convex deploy`, re-run seed on prod if the schema/seed
   changed (`npx convex run seed:seedCrew --prod` — make seed add the chat
   widget/messages if missing rather than skipping the whole space). Verify the
   two-window flow on the live URL. Update `hackathon.md` following
   `.agents/skills/convex-hackathon-skill/SKILL.md` (Convex features now
   include crons and scheduled cleanup). Commit and push.

## Verify before you stop

Two browsers (one normal, one incognito) on the live URL, different names:
cursors visible both ways · vote in A → bar + face in B · claim in B → "covered"
in A · send "let's do 6pm at our place" in A → promote → note pops in B.

## Model split

Terra: Convex functions, presence, promote, deploy. Luna subagents: the Chat
widget UI, cursor component, identity gate UI — each given the reference file,
the props, the tokens, "same look, new props, no hex."
