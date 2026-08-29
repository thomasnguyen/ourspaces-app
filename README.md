# OurSpaces

> Group chats forget. Spaces remember.

Turn your group chat into a place. Forward it an email, drop it a link, and it
remembers for everyone — live.

Built for the [Convex All Gas Hackathon](https://www.convex.dev/hackathons/all-gas)
by Thomas Nguyen (build) and Holly (design).

**Live:** [necessary-cobra-892.convex.site](https://necessary-cobra-892.convex.site) · **Build log:** `hackathon.md`

## Stack

Convex · Vite + React + TypeScript · Tailwind v4 · OpenAI (via Convex AI
Gateway) · AgentMail · Firecrawl

## Convex depth

- **Components:** `@convex-dev/static-hosting`, `@agentmail/convex`,
  `@firecrawl/firecrawl-convex`
- **Schema & data:** tables + indexes for spaces, members, widgets, messages,
  votes, collaborative paint marks, presence, email events
- **Realtime:** live queries drive the canvas, presence cursors/gestures, and
  poll + cozy-color results — no hand-rolled sync
- **Functions:** queries, mutations, internal mutations, actions, HTTP actions
- **Scheduling:** crons (stale presence cleanup) + scheduled functions
- **Integrations:** AgentMail per-space inboxes (send/receive via HTTP
  webhook), Firecrawl turns pasted webpages into reactive rich-post widgets,
  OpenAI via Convex AI Gateway

## Run

```bash
npm install
npx convex dev        # once, to provision; writes .env.local
npm run dev           # frontend
npm run dev:backend   # convex dev
```
