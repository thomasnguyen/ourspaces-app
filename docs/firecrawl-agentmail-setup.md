# Firecrawl + AgentMail setup

You only need **API keys on the Convex deployment** (not `.env.local`).

- Firecrawl → pasted URLs become web-post cards (`convex/firecrawl.ts`, Convex component)
- AgentMail → each space gets an inbox (`convex/agentmail.ts` → our own
  `components.agentMail` component — **see below**)

Verified 2026-08-29 against:

- [Firecrawl dashboard](https://docs.firecrawl.dev/dashboard) · [API keys](https://www.firecrawl.dev/app/api-keys) · [Convex component README](https://github.com/firecrawl/firecrawl-convex)
- [AgentMail quickstart](https://www.agentmail.to/docs/quickstart) · [API keys](https://www.agentmail.to/docs/knowledge-base/getting-api-key) · [webhooks](https://www.agentmail.to/docs/webhooks-overview) · [Convex component README](https://github.com/agentmail-to/convex)
- [Convex env vars](https://docs.convex.dev/production/environment-variables)

Set keys on **dev** by default. Add `--prod` for production.

---

## Firecrawl

1. Create a free account at [firecrawl.dev](https://www.firecrawl.dev/).
2. Dashboard → **API Keys** → create a key. It starts with `fc-`.
3. Put it on Convex (required — the Convex component is not keyless):

```bash
npx convex env set FIRECRAWL_API_KEY fc-your-key
```

4. Optional, only if you start durable crawls: Dashboard → **Settings → Advanced** → copy the webhook signing secret, then:

```bash
npx convex env set FIRECRAWL_WEBHOOK_SECRET whsec-your-secret
```

Web-post scrape (`scrapeLink`) does **not** need the webhook secret. This app mounts Firecrawl’s webhook at:

`https://<deployment>.convex.site/api/firecrawl/webhook`

5. Confirm: add a web post on a live space, paste `https://firecrawl.dev`. You should get a title/summary (and a cover or the paper fallback).

### Credits — 20,000 applied 2026-09-12

Hackathon coupon `CONVEXALLGAS` (from the Luma registration email) redeemed on
the Firecrawl account → **20,000 credits**, on top of the free plan's 1,000/cycle.
The Billing header tile only shows the free cycle (`778 of 1,000`); the coupon
balance lives on the **usage page**. Applying the coupon does not change the
key, so `FIRECRAWL_API_KEY` stays as-is.

Practical effect: stop rationing Firecrawl. Durable crawls, screenshot covers,
and `searchTopic` are all affordable for the rest of the build and the demo.

---

## AgentMail

**We use our OWN AgentMail component, not `@agentmail/convex`.** The published
`@agentmail/convex` 0.1.0 has a real bug: its component actions (`createInbox`,
send, …) never resolve through `ctx.runAction` (its nested workpool
subcomponents break the reference), and its `convex.config` declares no `env`
schema so the API key needed a hand-patch in `node_modules`. It was removed
2026-08-30 and there's no fixed version.

Instead, `convex/components/agentMail/` is a first-party local component that
wraps the REST API (`createInbox`, `sendMessage`, `replyToMessage`, `addLabels`,
`ingestWebhook`, `listInbound`) and owns the inbound-message store + webhook
dedup. It deliberately has **no nested workpool** (that was the 0.1.0 hang) and
takes the API key/secret **as args** from the app (components can't read
`process.env`). `convex/agentmail.ts` are the thin app wrappers; `convex/http.ts`
verifies the svix webhook and hands the body to `components.agentMail.lib.ingestWebhook`.

Setup:

1. [AgentMail Console](https://console.agentmail.to) → **API Keys** → create an
   **unrestricted / org-scoped** key (a scoped key without `inbox_read` /
   `inbox_create` / `message_send` breaks everything — this bit us, see status).
2. `npx convex env set AGENTMAIL_API_KEY am_your_key`
3. Webhook (Console → **Webhooks → Create**): `message.received` →
   `https://<deployment>.convex.site/api/agentmail/webhook` (the `/api` prefix is
   required). Then `npx convex env set AGENTMAIL_WEBHOOK_SECRET whsec_…`.
4. Create the three showcase inboxes:

```bash
npx convex run agentmail:clearStubInboxes        # only if test-* stubs were set
npx convex run agentmail:ensureShowcaseInboxes   # crew→thecrew@ couple→ustwo@ buildroom→buildroom@
```

5. Confirm: mail one of the addresses. `emailEvents` gets a row and the router
   (`convex/inbox.ts`) mutates the canvas: couple → letter widget, buildroom →
   link pile drop + Firecrawl enrich, crew → AI files it (expense/itinerary/
   create/unfiled envelope).

Free tier (no card): 3 inboxes, 3,000 emails/month — exactly our three spaces.

### Status as of 2026-08-30 (night) — LIVE on dev

- Unrestricted key + fresh webhook secret set on **dev** (`dusty-condor-648`).
  Webhook `ep_3Ietya3ktQeby8N6rBz64dAu0Ry`: `message.received` →
  `https://dusty-condor-648.convex.site/api/agentmail/webhook`.
- Real inboxes bound: crew → **ourspaces@agentmail.to**, couple →
  **ustwo@agentmail.to**, buildroom → **buildroom@agentmail.to**.
- **Verified with real mail:** buildroom's inbox sent to ustwo@ → delivered →
  webhook → letter widget appeared in us two. `digest:sendNow` delivered the
  crew digest to a real Gmail. (Router behaviors — receipt→IOU, booking→japan
  itinerary, link→pile+Firecrawl, unfiled envelope — verified earlier via
  signed webhook posts; same code path.)

**Gotchas learned:**

- The 3-inbox free-tier cap is **per org, shared by dev and prod**. `thecrew`
  as a username is taken org-wide on agentmail.to, so the crew rides the
  account's default `ourspaces@` inbox.
- Creating a webhook via API returns the `whsec_…` secret in the response —
  no console needed with an unrestricted key.

**Prod cutover — DONE 2026-09-13.** `necessary-cobra-892` is now the only
deployment that matters:

- All 9 env vars set on prod (copied from dev via `npx convex env list >
  file` → `npx convex env set --force --prod < file`; `SITE_URL` rewritten to
  the prod origin, `AGENTMAIL_WEBHOOK_SECRET` set from the new webhook).
- Prod webhook `ep_3JHatnLPRNLD5GrC1spksFlx5Yz` → `message.received` →
  `https://necessary-cobra-892.convex.site/api/agentmail/webhook`. Verified
  mounted: an unsigned POST returns `401 bad signature`.
- **The dev webhook was deleted.** Two webhooks meant every inbound email
  filed onto the dev board AND the prod board. Dev is retired, so mail now
  lands once. To bring it back: POST to `/v0/webhooks` and set the returned
  `whsec_` on dev.
- Inbox bindings did **not** need `setSpaceInbox` — `inboxId`/`inboxAddress`
  live on the `spaces` doc, so they rode across in the snapshot import.

## Prod

Repeat the same `npx convex env set … --prod` for every key. Env vars are per-deployment.

Then point AgentMail’s webhook at the **prod** site URL (`https://necessary-cobra-892.convex.site/api/agentmail/webhook`).

---

## Do not

- Do not put these keys in `.env.local` — that file is only `CONVEX_DEPLOYMENT` / `VITE_CONVEX_URL`.
- Do not use the generic AgentMail webhook path `/agentmail/webhook` without `/api`. This app’s HTTP prefix is `/api` (`convex/convex.config.ts`).
- Do not commit keys.
