# PLAN — All Gas hackathon (owned by the PM agent)

Deadline **Sep 22, 12:00 PM PT**. Today: Aug 26. 27 days.
Thomas: ~2 h/weekday, ~6 h weekend days, Holly joins Sep 12 for presentation.
Budget: **~30 h before Sep 2**, 0 h Sep 2–5, **~52 h Sep 6–21**. ≈ 82 h total.

## Calendar

| Phase | Dates | Hours | Goal |
| --- | --- | --- | --- |
| **Explore** (this repo) | Wed 26–Thu 27 | 4 | Mock the drafting card + reply→RSVP flip only. Screenshot, decide, stop. |
| **Core rebuild** (fresh repo) | Fri 28 (6) · Sat 29 (10) · Sun 30 (6) | 22 | Schema, canvas, drag, presence, live widgets, promote, **deployed to convex.site by Sun night**. Codex from commit 1. |
| **Space agent** | Mon 31–Tue Sep 1 | 4 | AgentMail inbox + outbound send working end to end (rough). First social post: live URL + clip. |
| Gap | Sep 2–5 | 0 | Site stays live. Nothing breaks. |
| **Sponsors deep** | Sun 6 (6) · Sep 7–11 (10) | 16 | Reply→mutation, drafting card polish, article club (Firecrawl), Home grid + couple space, seed + nightly reset. |
| **Present** | Sep 12–20 | ~34 | Holly joins. Polish, README hero, shoot video Sep 13–14, cut by Sep 17, daily social. |
| **Submit** | Sep 21 | 2 | Submit. Sep 22 morning = buffer. |

## Build order (cut from the bottom)

1. Schema + crew space from `listWidgets`, drag/resize, anon auth. Deploy. — Fri 28
2. Presence cursors, live poll/potluck/chat. — Sat 29
3. Promote (drag → AI → widget). **[can win from here]** — Sat 29/Sun 30
4. Space agent: inbox identity, decide → drafting card → AgentMail send. — Sep 1
5. Reply → mutation; Auth v2 attempt (½ day cap). — Sep 6
6. Article club: Firecrawl → summary + questions widget. — Sep 8
7. Home grid + couple template, seeded demo, nightly reset cron. — Sep 11
7. Stretch: page-watch cron, photo attachments, search.

## Social plan (judged: "social proof")

- **Sep 1 + Sep 6–11:** 2–3 posts total once the URL is live — a 10s clip of one live moment. Tag @convex @OpenAI @firecrawl @agentmail. Holly posts design process (before/after, tokens, stickers). Engage judges' posts, reply in Convex Discord.
- **Sep 12–22 (hard push):** daily. Rotate: feature clip · "built with Codex" thread · Holly design thread · "the space emailed grandma" story · launch post with the video (Sep 18) · final "submitted" post (Sep 21). Both accounts, X + LinkedIn. Ask friends to comment, not just like.
- Rule: every post has a moving image and a live URL.

## Decision log

- Aug 26 — convex.site hosting. Crew = hero, article club = beat, couple = hook. All four sponsors deep. Fresh repo, no bulk import.

## Risks / cuts

- Auth v2 alpha eats a day → anonymous. Article club slips → 15s cameo. Video overruns → cut dashboard shot to 8s.

## Status (updated each session)

- Aug 26: docs + plan done. Schedule locked. Next: 4 h of exploration mocks, fresh repo Fri 28.
