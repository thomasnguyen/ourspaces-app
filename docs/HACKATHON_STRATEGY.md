# All Gas hackathon — strategy & brainstorm

Working doc, started 2026-08-26. Rules: `HACKATHON_RULES.md`. Product spec:
`ourspaces-prd-v0.6.md` (pre-hack exploration — see "clean start" below).

## Team

- **Thomas** — builds. Codex as primary coding agent (OpenAI judges; Codex
  credits are a prize; `hackathon.md` log should show it).
- **Holly** — designer + on-camera presenter. Owns visual identity, the space
  templates/illustrations, the demo script, and the video. In the submission
  and the social post she is credited as designer, not "helper".

## The eligibility problem, handled honestly

The rule is "new apps started on or after Aug 25 12 PM PT" and the build log
backfills from git history. This repo predates the cutoff.

Plan: **fresh repo, fresh Convex project, fresh deployment, built from
scratch.** Treat this repo as what it actually is — a pre-hack design/UX
exploration with mock data and no backend (the PRD, `the-feel.md`, tokens,
Impeccable files). Reusing your own *ideas, design language, and learnings* is
normal; reusing the app is not. Concretely:

- New repo starts empty. No bulk "initial import" commit of this codebase — the
  history should read as a real build: schema → first widget → drag → presence
  → …, with SHAs the hackathon skill can log.
- Don't copy `src/` files over. Re-implement against the Convex schema from day
  one (the prototype was always slated to be rewired anyway). Design tokens and
  the PRD can be carried in as *docs*, and it's fine to say so in `hackathon.md`
  ("design exploration done before kickoff; code started Aug 26").
- Say the same thing in the video/README if it comes up. Judges reward
  honesty far more than they punish prep.

Bonus: rebuilding on Convex from the start naturally produces more "Convex
depth" than retrofitting the mock-data prototype would.

## Reposition for the judges

The scored criteria in one sentence: *an everyday app a real person would use
today, where Convex, OpenAI, Firecrawl and AgentMail each do real work, deployed
publicly, with a tight video and a social post.*

OurSpaces already nails "everyday app" (friend groups, not devs) and "Convex
depth" (live canvas, presence, votes). The gap is the sponsor stack — today
none of Firecrawl / AgentMail / OpenAI is in the pitch. Fix: make every
sponsor a **way things get onto the canvas**. The whole product thesis is
"group chats forget, spaces remember" — so the sponsors become the memory
inputs.

### Decision (2026-08-26): go deep on all four

Not "pick one sponsor beat" — Convex, Codex, Firecrawl and AgentMail each get
a real, visible, core job, and each gets its own beat in the video and its own
section in the README. Codex counts too: it is the primary coding agent, the
`hackathon.md` log shows it, and the README links to the Codex+Convex setup.

### Sponsor integration ideas (all shipping; ordered by video sequence)

1. **Every space has an inbox (AgentMail).** `mayas-bday@ourspaces.agentmail.to`.
   Forward the OpenTable confirmation, the Airbnb booking, the Evite, the
   Ticketmaster receipt → OpenAI extracts date/place/who → widgets appear on
   the canvas live (countdown, map/note, RSVP poll). On camera: Holly forwards
   an email on her phone, the canvas updates on the big screen. This is the
   AgentMail CEO's dream demo and it's genuinely useful.
   - Also outbound: the space emails a recap/digest ("this week in the crew:
     poll closed — tacos won") on a Convex scheduled function.
2. **Promote a link (Firecrawl).** Someone drops a restaurant / hike / Airbnb
   URL in chat. Promote it → Firecrawl scrapes → OpenAI turns it into a rich
   card (title, image, price, hours) or a poll option. Promote-a-message and
   promote-a-link become the same gesture. Firecrawl credits are free, so use
   it generously (link previews in chat too).
3. **OpenAI as the extractor, not a chatbot.** Structured outputs turning
   messy input (email, page, chat) into widget `data`. Plus small touches:
   daily question generator, "summarize the last 50 messages into a note."
   Keep it plain, no chatbot UI — chatbots read as copycat.
4. **Convex depth checklist:** reactive queries everywhere, presence with
   TTL via scheduled functions, `crons` for digests/countdowns, **components**
   (AgentMail component, Firecrawl component, maybe `@convex-dev/presence`),
   **Auth v2** instead of anonymous (judged: "auth"), AI Gateway for the
   OpenAI calls, file storage for scraped images. Each one is a bullet in the
   README with a link to the file.

### Narrative for the video (3 min, Holly presents)

1. (0:00) "Group chats forget." Scroll a chaotic iMessage thread. 10s.
2. (0:15) Show the crew space, lived-in, two windows, cursors. Convex liveness.
3. (0:45) Forward the dinner reservation email → countdown + RSVP appear on
   both screens. AgentMail + OpenAI + Convex in one beat.
4. (1:20) Drop a link in chat → promote → Firecrawl card lands on the canvas.
5. (1:50) The classic promote: "let's do 6pm at our place" → sticky note.
6. (2:20) Weekly digest email arrives. "Spaces remember." Live URL on screen.

### Positioning language

- "An everyday app for your people" — never say productivity, workspace,
  tool, or dashboard. Compare to group chats, not to Figma/Notion.
- One line: **"Turn your group chat into a place. Forward it an email, drop it
  a link, and it remembers for everyone — live."**

## Phasing

1. **Explore here first (now → fresh-repo start).** Keep this repo as the
   design/UX sandbox: feel out the inbox/link-promote flows with mock data,
   lock the visual language with Holly, script the video. No Convex wiring
   here.
2. **Fresh repo** once the flows are decided. Every day spent exploring is a
   day missing from the logged build history, so cap exploration at a few days.

## Deployment & submission

- Deploy the frontend on Convex hosting so the URL is `*.convex.site`.
- Public repo from day one; `hackathon.md` updated per session via `/hackathon`.
- Seed a demo space so judges land on something alive without inviting anyone
  (public "demo crew" that resets nightly via cron).
- Social post: short clip of the email-forward moment; tag @convex @OpenAI
  @firecrawl @agentmail; Holly and Thomas both post.

## Open questions

- Convex hosting + custom domain vs plain `convex.site` — is convex.site an
  actual hosting product now? Verify in docs before day 1.
- AgentMail inbound: webhook → Convex HTTP action, or the Convex component
  handles it? Check the component README.
- Auth v2 alpha risk: fall back to anonymous if it eats more than half a day.
- Team size isn't stated — confirm on Luma/Discord that a two-person team is
  fine and how to list Holly.

## Agent skills plan (fresh repo, day 1)

Skills are the cheapest lever for speed: they keep every agent session on the
demo path without re-explaining. Set up before the first commit:

1. **`convex-hackathon-skill`** (required) — paste the official setup prompt;
   run `/hackathon` at the end of every session so `hackathon.md` stays current.
2. **Convex plugin / skill** (required) — `docs.convex.dev/ai/overview#plugins`;
   gives the agent correct Convex API patterns (queries, mutations, crons,
   components, Auth v2) instead of stale training data.
3. **`ourspaces-hackathon`** (port from this repo) — demo-first rules, no
   tests, no gold-plating, concise replies. Keep it under 40 lines.
4. **Sponsor skills, one each:** `agentmail`, `firecrawl`, `openai-extract` —
   each a short SKILL.md with the component install, the 2–3 calls we use,
   env var names, and a link to the README section it must keep updated.
5. **`demo-script`** — the 3-minute beat list; the agent checks any feature
   against "which beat does this serve?"
6. **`impeccable`** stays for Holly's design passes.

Rules to bake into `AGENTS.md`: no tests ever; `npm run build` is the check;
verify visual/live work in the browser; replies ≤3 bullets.

Codex angle: put the same skills in `.codex/` / `AGENTS.md` so Codex sessions
(the logged coding agent) get identical context.
