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

- **Components:** `@convex-dev/static-hosting`, `@firecrawl/firecrawl-convex`
  (AgentMail is called over plain REST from `convex/agentmail.ts` — its
  component's actions don't resolve through `ctx.runAction`)
- **Schema & data:** tables + indexes for spaces, members, widgets, messages,
  votes, collaborative paint marks, recaps, presence, email events
- **Realtime:** live queries drive the canvas, presence cursors/gestures, and
  poll + cozy-color results — no hand-rolled sync
- **Functions:** queries, mutations, internal mutations, actions, HTTP actions
  (svix-verified inbound-mail webhook)
- **Scheduling:** crons (stale-presence sweep every minute, Friday weekly
  digest) + scheduled functions
- **File storage:** photo-wall uploads become prints with notes on the back
- **Integrations:** AgentMail gives every space a real inbox — inbound mail is
  routed onto the canvas (sealed letter, link into the reading pile + Firecrawl
  enrich, or an AI-filed expense row / itinerary day); Firecrawl turns pasted
  webpages into reactive rich-post widgets; OpenAI-class models via a
  Cloudflare AI proxy, with the OpenAI API as fallback

## Run

```bash
npm install
npx convex dev        # once, to provision; writes .env.local
npm run dev           # frontend
npm run dev:backend   # convex dev
```
