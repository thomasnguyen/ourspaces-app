# OurSpaces, product requirements document

*Convex hackathon build · v0.7, the build spec (filename kept from v0.6; v0.7 adds the positioning layer, the montage cold open, the paint widget, and the props-vs-features scope note)*

**Objective: win the hackathon.** Every decision below answers one question. Does it make the 3 minute video land harder? If it won't show up on camera in those three minutes, it's low priority.

**Technical decisions: least friction wins.** When the choice is *how* to build something, a library, an auth method, a data shape, take whatever reaches a working demo fastest, not what's most correct, scalable, or future-proof. Anonymous auth over real accounts. The platform default over a custom abstraction. Inline state over a new table. The moment a decision turns into research, pick the boring option and keep moving. We're optimizing a 3 minute video, not a codebase anyone has to maintain.

**One-liner:** group chats forget. spaces remember.

**Rallying cry (the emotional layer):** *make social media fun again.* The MySpace/GeoCities nostalgia isn't about feeds — it's about **owning a page you could decorate**. Nobody parses "social media" as a category anymore; it just means "the fun internet." The two lines stack: the rallying cry is the vibe and the hook, the one-liner is the job-to-be-done, and personalization — every space wearing its own loud color and its own clutter — is the *proof* of the claim, shown rather than said.

**Why group chats die (and what answers each):** nothing to talk about → daily question / topics. Nothing to do together → paint, playlist sticker, party mode. Nothing accumulates → photo wall, promoted notes, the archive. This is the pitch as a story, not a feature list.

---

## 1. Summary

OurSpaces turns a group chat into a living, shared canvas. A friend group composes a "space" out of live widgets (a countdown, a poll, a potluck signup, a chat, a daily question) and everything is real time. You see each other's cursors, votes land live, and anything said in chat can be promoted onto the canvas where it stays put.

Think Discord meets Figma, but for your people instead of your work.

## 2. Problem

A group chat is a tyranny of the timeline. The date, the decision, the poll result, who's bringing dessert, all of it scrolls away and gets re-litigated every week. There's no shared place where the important stuff lives. Spatial tools like Figma and Miro solve persistence and co-presence, but they're built for work, not for friends.

There's a second, emotional problem underneath: the web used to be *ours* — decorated, weird, personal — and it flattened into identical gray feeds. The nostalgia people carry for MySpace and GeoCities isn't for the feed; it's for ownership. That's the wound the cold open pokes and the product answers.

## 3. Thesis

Linear chat is ephemeral. A space is persistent. Chat is where things are born and forgotten. The canvas is where they're kept. The **promote** gesture is the bridge, the way you rescue something from the timeline before it scrolls away. The differentiator is not "newer." It's that your group's stuff finally has a place. Persistence plus presence is the entire pitch.

## 4. Core concepts

- **Space.** A shared canvas for an occasion or relationship. Has an identity (color, icon, name) and a lifecycle (ongoing or event).
- **Widget.** A module on the canvas (countdown, poll, potluck, chat, note). Composable, live, freely placed and resized.
- **Frame.** A titled container on the canvas that groups related widgets into one zone. The birthday cluster lives in a frame, the evergreen stuff sits loose around it. Not a content widget, just a labeled boundary. The answer to "give an event its own area" without leaving the canvas.
- **Presence.** Who's here now, each with a color. Live cursors drift across the space.
- **Promote.** Drag a chat message out of the chat widget and drop it on the canvas, where it sticks as a persistent widget. The drag *is* the gesture — on camera it reads as rescuing the message from the timeline before it scrolls away.
- **Template.** A starter space pre-populated with the right widgets for a use case.
- **Home.** The zoomed-out gallery of all your spaces, each shown as a live preview card. (The site's front door is a separate one-viewport landing page — see `docs/landing-page.md`.)
- **Rail.** A persistent left rail for one-click switching between spaces.

Chat is a widget, not a privileged sidebar.

## 5. App structure: shell vs space

Two surfaces. The *inside* of a space (the canvas) and the *between* (moving across spaces).

### 5.1 The space canvas (inside)

A space is a **bounded board anchored at the top left**, not an infinite plane. It grows down and to the right as you add things, but never up or left. The top left corner is a permanent home, so you can't get lost. Scroll back to the corner and everything is exactly where it started. Widgets drag and resize freely within the board. A "back to top" control reframes instantly.

### 5.2 The shell (between)

- **Rail.** Always visible left rail, one click per space. Shows presence (who's in each space now) as live dots, so you navigate toward where your people are gathered. Floats as a detached rounded panel, see §10.
- **Home.** The zoomed-out gallery. Every space is a *live preview card* showing real state: today's question answered, the countdown ticking, the match score moving, who's active. Not a name and an unread badge, the actual living state. The part no group chat can copy.

### 5.3 Space lifecycle

- **Ongoing.** Evergreen relationships (couple, family, friend group). Pinned. This is the crew, a long-standing group chat given a place, not scoped to any single occasion.
- **Events.** Time-bound (birthday, trip, party). Sorted by soonest, each carrying its countdown. An event can live two ways. As its own space (a card in the gallery, for example a trip), or as a **frame on an ongoing space's canvas**. The crew's birthday is a frame, kept attached to the crew rather than split off into a separate space. Frame, not a sub-space you click into (see §17).
- **Past.** When an event ends it settles into Past as a keepsake (photos, notes) you can revisit. The archive is a feature, not a graveyard.

## 6. Hero experience (the demo, locked)

The hero is **the crew**, an evergreen friend-group space that's visibly been lived in: a running note of inside jokes, a half-answered "where are we going this summer" poll, a daily question. Not scoped to one occasion. It's the long-standing group chat, finally given a place.

The current event lives right on that canvas as a **"Maya's bday" frame**: countdown, cake poll, and potluck, grouped in one zone. Five or six of the crew are in the space (more people means more cursors means louder multiplayer, which is exactly what reads on camera). Two open it side by side. Cursors roam, the countdown ticks, the cake poll's bars move as votes land, someone grabs "balloons" in the potluck. Then the money shot. A chat message, "let's do 6pm at our place," gets dragged out of chat onto the canvas, where AI reads its intent and lands it as a clean note that appears on both canvases instantly.

Why the crew and not a one-off birthday space: persistence is the pitch, and it lands hardest on a space with history to forget, not one created yesterday for a party. The evergreen texture sells lived-in by just being there, so don't demo it, let the camera see it. The active seconds stay on the birthday frame, where the state moves. Friend group leads because it maximizes visible liveness, the one thing Convex makes easy and judges reward.

## 7. Scope, feature ranking (do all, in this order)

Ranked by hackathon value, which is demo wow plus Convex relevance plus buildability plus "why does this need to exist?" We're building all of it. The ranking is also the **cut order**. If time runs short, cut from the bottom.

| # | Feature | Why it's worth having |
|---|---|---|
| 1 | Live shared canvas / space | The whole thesis. Group chats are timelines, OurSpaces is a place. Everything else supports this. |
| 2 | Live cursors / presence | Instant "oh, this is alive." Screams Convex realtime immediately. |
| 3 | Draggable + resizable widgets | Makes it feel like a real spatial app, not cards on a page. The visual magic. |
| 4 | Poll widget | Best simple demo of realtime state. Vote in one window, watch it update in another. |
| 5 | Potluck / claim widget | More useful than a poll, solves a real group-chat problem, live. Great for the event demo. |
| 6 | Countdown / event widget | Anchors the space around a purpose. A birthday, trip, or game night feels real once there's a date. |
| 7 | Chat as a widget | Worth having, but kept minimal. Chat is one object in the space, the canvas stays primary. |
| 8 | Promote chat → canvas | The strongest storytelling move. Something important gets rescued from the chat and made persistent. Proves "group chats forget, spaces remember." |
| 9 | Space templates | Show flexibility without building 20 things. Birthday, Couple, Friend Group, Game Night prefill different widgets. |
| 10 | Media widget (image / embed) | The MySpace emotional flavor. Keep it simple, an image card or embedded video, no media infra. |

**Tiers (cut from the bottom):**

- **Must-have:** canvas, presence, draggable and resizable widgets, poll, potluck, countdown, templates, **and promote-to-canvas.** Promote ranks #8 but it's the demo's climax and the one moment that proves the thesis on camera, so it earns must-have despite the rank. The chat widget under it can stay bare-bones, just enough messages to promote one.
- **Nice-to-have:** a fuller chat widget, media widget, the **paint widget** (carries the couple-space cameo, the purest realtime flex on camera; if cut, the cameo falls back to countdown + daily question + photo wall), the **frame** (the visual tier is nearly free, so build it, move-together containment is the cuttable part).
- **Only if time:** video chat, music or radio, games, live sports.
- **AI layer (see §11.1):** Smart Promote is the **P1** AI feature — it rides on must-have promote, and if a Claude call ever fails the message still lands as a plain note. Catch-me-up is **P2** (nice-to-have); the AI daily-question is **P3** (first AI feature to cut). Core ships with or without these.

Auth stays anonymous. No settings, search, or notifications. None of it shows in the video.

## 8. Widgets

Each one has to feel alive, with state that moves on its own or across users.
The full per-space inventory (what each demo space has today and what it still
needs) lives in `docs/spaces-and-widgets.md`.

- **Countdown.** Ticks to the event. Self-live.
- **Poll.** Vote, bars fill, counts update live across users.
- **Potluck.** Claim items, who's bringing what, live.
- **Chat.** Message stream, each message promotable to a note.
- **Note.** Freeform sticky, the canonical "promoted" artifact.
- **Frame** *(container, not live).* A titled boundary that groups widgets into a zone. The birthday cluster (countdown, poll, potluck) lives in a "Maya's bday" frame, evergreen widgets sit loose around it. Gives an event its own area on the one canvas with no navigation. Build the **visual tier first**, a labeled rounded rect rendered behind the widgets. Grouping is purely visual and the camera read is 90% there. **Move-together** (drag the frame, contents follow, where "inside" means widget bounds within frame bounds) is the nicer upgrade and the cuttable part. If cut, the demo doesn't notice.
- **Paint** *(the couple-space beat).* A small shared pixel/color canvas two people doodle on together — both cursors painting the same cells in real time. The purest possible Convex-realtime flex, and the long-distance answer to "something to *do* together." Keep it tiny: a fixed grid, a handful of colors, one `updateWidgetData`-style mutation per stroke. No brushes, no layers, no undo.
- **Live sports** *(P3 stretch).* A score that updates on its own, the most visually alive thing on screen, and on-brand for a friend group.

**Props, not features (set dressing).** The playlist (a Spotify embed styled as a sticker — never a real player, licensing and sync are a tarpit), photo wall, link shelf, joke registry, quote, and media widgets exist to make canvases read *lived-in*, per §6. The camera pans past them; it never stops for them. Same rule for party coordination: countdown + poll + potluck reframed as "party mode" is the answer — don't build a new coordination system. Real engineering effort goes only to the demo-beat widgets: daily question, paint, and the Firecrawl link card.

## 9. Platforms

- **Desktop / tablet.** Full compose on the anchored board: drag, resize, arrange. This is where the demo is shot.
- **Mobile (P3, last).** Read and interact only. The same board at a single column width, predetermined grid order per template. Because the board is already a top-left-anchored column that grows downward, mobile is that same design narrowed, not a separate one. First thing cut if time runs short.

## 10. Design and visual language

The look is locked. It reads as a Gen Z social app, not a productivity tool. Bold, saturated, chunky, high contrast, a little playful. The reference is the current wave of social apps (live rooms, messaging, profiles) that lean on heavy type, flat color, and sticker chrome. Polish is part of the pitch. It has to look designed, not hacked.

**Base is near-black.** Dark is settled, not up for debate. It makes the color pop and the live elements glow on camera.

**Color is identity, and it's loud.** Every space owns a saturated color, and that color is the whole card, not a tint and not a glow. The home gallery is a grid of bold color panels. Solid flat color reads as designed. Glows and gradients read as cheap, so we don't use them. This replaces the earlier instinct to keep color as a small accent.

**Sticker pills carry the chrome.** Black rounded pills with white text hold labels, chips, and buttons: the section tags, the "you online" chip, the "new space" affordance. A slight rotation on a pill or two for personality. This is where the playfulness lives, so the type can stay clean.

**Lime is the one pop.** A single bright lime green, used tiny and rarely: the brand mark, a status dot, the "+". Never as a panel.

**The rail floats.** Not a flush sidebar. A detached rounded dark panel sitting in from the edge, holding the space tiles in their own colors. The active tile gets a white ring. Hover lifts it. Black pill tooltips name each space.

**The gallery is the hero, not a headline.** The greeting stays small so the wall of color leads. The crew leads by width, not by holding more stuff. A "new space" tile sits at the end of the events row.

**Motion is punchy, not glowy.** Cards lift on hover with a soft shadow in their own color, and pop in with a slight scale and stagger on load. Reduced motion is respected.

This applies to the shell first (rail plus home). The same language carries inside a space. The canvas is the dark base, widgets are the color panels and sticker chrome, presence and promote get the lime and the pills.

**Tokens (starting values, tune in build):**

```
base bg        #0B0B0D     near-black app background
rail / dark    #151517     floating rail, "new space" card
ink            #FFFFFF      primary text on dark and on color
lime           #C6F750     the single pop, used tiny
sticker black  #0A0A0B      pills, tooltips, chips

per-space color (the card IS the color):
  crew         #7C5CFF     violet
  couple       #E63DA8     magenta
  fam          #3D6EFF     blue
  trip         #FF7A3D     orange
  league       #13B8A6     teal

type           Plus Jakarta Sans, one family
               800 names + headers, 700 numbers, 500-600 body
               sentence case everywhere, no second display face, no mono

radii          cards 26, tiles 15, pills full
hover          lift 4px + soft shadow in the card's own color
```

## 11. Architecture (Convex)

Convex is the point. Its reactive queries make the "everything is live" feel almost free: widget state in reactive tables, cursors through ephemeral presence. The shell reuses the same plumbing, no new infrastructure.

**Stack:** Convex for the reactive backend (the star), Vite, React, TypeScript, Tailwind v4, shadcn/ui. Auth is **Convex Auth's Anonymous provider**, the bare-minimum path with no real accounts. The table-by-table data model and the frontend state plan live in `docs/data-model-plan.md`.

**Data model (sketch):**

```
spaces    { _id, name, type, icon, color, createdAt, lastActivityAt, archivedAt? }
          // type: 'ongoing' | 'event'   (event spaces also carry eventAt)
members   { spaceId, userId, name, color, lastSeen }
widgets   { spaceId, type, x, y, w, h, z, data, createdBy, createdAt }
messages  { spaceId, widgetId, userId, text, createdAt }
votes     { widgetId, userId, optionId }        // poll, one per user
presence  { spaceId, userId, x, y, updatedAt }  // ephemeral, TTL'd; powers "who's here now"
```

`widgets.data` is type-specific: countdown target, poll options, potluck items, note text. A **frame** is just a widget with `type: 'frame'` and `data: { title }`. No new table, no parent refs, and `createWidget` / `moveWidget` already cover it. Move-together is a frontend concern (compute which widgets fall inside the frame's bounds on drag start), not a schema one.

**Key functions:**

- *Queries (reactive):* `listSpaces()` (preview payload plus live member count, feeds Home and rail) · `listWidgets(spaceId)` (drives the canvas) · `listMessages(widgetId)` · `listPresence(spaceId)` · `pollResults(widgetId)`.
- *Mutations:* `createSpace` · `joinSpace` · `archiveSpace` · `createWidget` · `moveWidget` · `resizeWidget` · `updateWidgetData` · `sendMessage` · `promoteMessage` (reads a message, inserts a note widget, the signature gesture) · `vote` · `claimItem`.
- *Presence:* `updatePresence(x, y)` throttled (~50 to 80ms), a scheduled function clears stale rows. Consider the Convex presence component.

**Frontend:** Vite plus React plus TypeScript, styled with Tailwind v4 and shadcn/ui against the tokens in §10. The shell renders Home and rail from `listSpaces`. A space renders the anchored board from `listWidgets` plus `listPresence`. Widgets render by `type`. Drag updates local state and commits `moveWidget` on drop (optimistic). Cursors render from the presence query.

### 11.1 AI layer (Convex actions → OpenAI via AI Gateway)

Each AI feature is a Convex `action` that calls Claude server-side (Anthropic SDK) and then **writes the result into a reactive table**, so the output syncs to every open window for free, exactly like everything else. That table write is the point: AI that returns text to one client wastes the platform; AI that writes a widget everyone sees live is on-brand. Use **Claude Haiku 4.5** (fast, ~$1 / $5 per 1M tokens) with **structured output** to force a valid widget shape. API keys live only in the action, never the client. Cut order P1 → P3:

- **Smart Promote (P1).** When a dragged chat message lands on the canvas, the action sends it to Claude, which picks the widget type and fills it — "let's vote on cake" → a poll, "6pm friday" → a countdown, otherwise a note. Drag-to-note already works without AI, so a slow or failed call falls back to a plain note. Makes the climax feel intelligent, not just sticky.
- **Catch me up (P2).** A recap action reads the space's recent changes (votes, claims, new widgets, messages) and returns a short "while you were gone…" summary — the literal payoff of "spaces remember."
- **AI daily-question (P3).** A Convex cron runs the action on a schedule to write a fresh, on-brand daily-question widget, so the space feels alive even when no one's around.

### 11.2 Convex requirements (All Gas hackathon — judged as "Convex depth")

Each item is a README bullet with a link to the file that implements it.

| Primitive | Where it does core work |
| --- | --- |
| Reactive queries / mutations | Every widget, cursor, vote, message. Two windows, one mutation. |
| **Auth v2** | Real sign-in + invite-link join. Fallback to anonymous if it costs > ½ day. |
| **Presence component** | Cursors and "who's here." |
| **Crons** | Countdown ticks, T-2-day reminders, nightly demo-space reset, page re-scrape. |
| **Scheduled functions** | "Send after the poll closes"; stale presence cleanup. |
| **HTTP actions** | AgentMail inbound + reply webhooks, Firecrawl callbacks → mutations. |
| **File storage** | Promoted photos, scraped venue images. |
| **AI Gateway** | All OpenAI calls go through it. |
| **Components** | AgentMail component, Firecrawl component, presence, **Workflow** (draft → approve → send → parse replies as one durable workflow). |
| Search (stretch) | Full-text / vector: "what did we decide about the cabin?" |

Hosting: deploy the frontend so the public URL is `*.convex.site`.

### 11.3 Sponsor stack (see `HACKATHON_STRATEGY.md`)

- **OpenAI** — Codex is the coding agent (logged in `hackathon.md`). The model is the *extractor and decider* via structured outputs, never a chatbot. §11.1 calls move from Claude to OpenAI via the AI Gateway.
- **AgentMail** — every space has an inbox identity. Inbound (forward a confirmation → widgets), outbound (the space decides who/when/what and sends), replies mutate the canvas. Email-only members.
- **Firecrawl** — promote-a-link → rich card / poll option; article spaces summarize + ask questions; page-watch on a cron.

### 11.4 The space agent (AgentMail) — "the group chat that follows up"

Every space has an email identity (`mayas-bday@ourspaces.agentmail.to`). It is
not a mailbox; it is the space **acting for the group**. Smart means four
things, each visible on camera:

**1. Right people.** Recipients are computed from canvas state, never "everyone":
- Event-day invite → everyone who voted *yes* (+ *maybe* gets a softer "still in?").
- Nudge → only people who haven't voted / claimed in N days.
- Logistics ("parking's tight, bring a chair") → only attendees.
- Potluck reminder → only claimers, each with *their* item.
- Email-only members (grandma, the friend not on the app) are first-class recipients.

**2. Right time.** Triggers, not schedules:
- Poll closes / date gets locked → "It's official."
- T-2 days → reminder. Morning-of → "today, 6pm, 12 Elm."
- New info lands on the canvas after an invite went out (address changed, time
  moved) → delta email to the people who already got the old one.
- Tickets/page changed (Firecrawl watch) → "tickets are on sale."
- Day after → recap with promoted photos/notes. Quiet spaces get nothing.

**3. Right content.** OpenAI writes plain, personal copy from structured state:
name, their RSVP, their item, venue details (from the scraped card), directions.
Reply-to is the space, so answers come back.

**4. Learns from replies.** Inbound replies are parsed into mutations:
"can't make it" flips RSVP · "I'll bring dessert instead" swaps the potluck row ·
"what time?" gets an auto-answer from the countdown · a photo attachment lands on
the photo wall · "stop emailing me" mutes that member. The canvas updates live
on every screen — this is the two-way beat.

**Legibility.** Big sends surface as a **"Space is drafting"** sticker card on
the canvas: *"Emailing 4 people who said yes — why: date locked"*, draft
preview, one **Send** button. Reminders and nudges auto-send; an activity log
widget shows sent / opened / replied.

**Pipeline (Convex Workflow component):** trigger → `decide` (OpenAI structured
output: `{send, recipients[], reason, subject, body}`) → approval card or
auto → AgentMail send → replies via HTTP action → `parseReply` → mutation.

## 12. What wins this

Ranked to how this hackathon scores, heaviest first: **polish → novelty → Convex depth → usefulness.** Build and pitch in that order.

- **Polish (1st).** It has to look designed, not hacked — the §10 language is the edge. Most entries look like prototypes; this shouldn't.
- **Novelty (2nd).** Drag-to-promote plus the AI that turns the message into the right widget — a move no group chat or canvas tool makes. The "wow."
- **Convex depth (3rd).** Two-window live sync, presence, and live votes show Convex at its best, and it comes nearly free — so leading with polish and novelty doesn't cost it.
- **Usefulness (4th).** It solves a real group-chat problem (the timeline forgets), but we lead with feel, not utility.
- **Submission (required):** a deployed URL, a public repo, and a video of 3 minutes or less showing the app **and** the Convex dashboard data live. Judges may not watch past 3:00.

## 13. Demo, shot-by-shot script (3:00 or less)

One product, three skins — the same canvas wearing three crews' colors *is* the
personalization claim, shown not said. Hero = **the crew**. Beat = **article
club** (the dev group). Story hook = **the couple** (Thomas + Holly's own
space). Holly presents.

- **0:00 to 0:08 · nostalgia montage.** Rapid ~0.5s flash cuts of the old web: a GeoCities page with a tiled background, an "UNDER CONSTRUCTION" GIF, a glitter cursor trail, a Winamp skin, a MySpace Top 8, a hit counter — slightly degraded so it reads "old web" instantly. Hard cut to the present: one sterile gray infinite feed. Hold the silence a beat — the stillness after the chaos is the joke. Line lands over the gray frame: **"the web used to be ours. then it got boring."** (Assets: gifcities.org — the Internet Archive's searchable GeoCities GIF index — plus Wayback Machine page captures. An hour of asset-hunting, not a build task.)
- **0:08 to 0:20 · smash cut, alive.** Full-color crew space, two windows side by side, cursors flying. Vote in A, bars move in B. Caption: "everything here is live, and shared."
- **0:20 to 0:30 · the hook.** Holly: "Group chats forget. We built this for us first." 5s cameo of the couple space — countdown to next visit, daily question, and the two of them **painting the same pixel canvas from two windows**. Then Home grid: crew, couple, article club — all alive, each in its own loud color.
- **0:30 to 0:55 · the crew plans Maya's bday.** Claim a potluck item, ghost votes land, named cursors roam, drag a card. "Louder multiplayer."
- **0:55 to 1:20 · promote.** "let's do 6pm at our place" → drag onto canvas → AI lands it as a note on both screens. Let it breathe.
- **1:20 to 2:05 · the space follows up (AgentMail + OpenAI + Convex).** Date locks → "Space is drafting" card: *emailing 4 people who said yes*. Holly hits Send. Phone on camera buzzes with a personal email ("you're on guac"). Grandma replies "can't make it" — her RSVP flips live on both screens. "It emails the right people, and listens back."
- **2:05 to 2:35 · article club (Firecrawl + OpenAI).** Drop a link in the club space → summary card + two questions appear → someone answers in window B. "Any link becomes something to talk about."
- **2:35 to 2:50 · prove it's real.** Convex dashboard, tables updating live. Live URL on screen.
- **2:50 to 3:00 · close.** "Turn your group chat into a place. It remembers for everyone — live." Beat, then the callback: "the fun web is back." Name. Out.

## 14. Build order

Mirrors the priority ladder. Stop and ship the moment the clock forces it. The cut order protects you.

1. Convex schema plus a hardcoded crew space rendering widgets from `listWidgets` (no drag).
2. Free drag and resize on the anchored board, committing to Convex. Now it's multiplayer. **[P0 reached]**
3. Presence cursors with names.
4. Live widgets: poll votes, potluck claims, chat messages.
5. Promote from chat to canvas. **[P1 reached, you can win from here]**
6. Brand polish pass on the single space against the §10 language, including the **frame** (a titled rounded rect behind the birthday cluster, grouping is visual only, nearly free). Add move-together only if the core above is solid.
7. Templates plus Home gallery plus rail with live previews. **[P2, the closer]**
8. Live-sports widget. **[P3 stretch]**
9. Mobile read-only feed. **[P3, cut first if short]**
10. Record the demo to the script above.

**AI layer** (built on top of the core; see §11.1, cut order P1 → P3):
- After step 5 — **Smart Promote (P1):** the dragged message goes through a Convex action to Claude, which picks the widget type; plain-note fallback if the call fails.
- After the core is solid — **Catch me up (P2):** an on-demand recap of the space's recent changes.
- Only if time — **AI daily-question (P3):** a Convex cron writes a fresh question widget. First AI feature to cut.

## 15. Success criteria

- It looks designed, not hacked — polish reads in the first five seconds (the heaviest-weighted criterion, §12).
- The promote → AI-widget moment lands as the clear "wow."
- The two-window live sync is real and obvious — two genuine browser windows, never staged.
- One polished, legible vertical, not a shallow feature reel.
- Convex visibly doing what it's best at, on camera.

## 16. Open questions / later

- **Name.** OurSpaces for the hackathon (the MySpace echo does free positioning work). Hearth, Commons, or Plot if it continues.
- **Event archiving.** Auto-archive an event space on its date, or manually.
- **Chat.** One chat widget per space, or many.
- **Nested spaces.** A space you click into that holds its own widgets (an event space inside the crew). Rejected for the hackathon. It's net-new build the flat model doesn't support, and it's routing, not realtime. It earns nothing on camera, hides half the canvas during the sync shots, and competes with the two-window moment for attention. The **frame** widget gives the "event has its own area" feel with no navigation. Revisit only if OurSpaces continues.
