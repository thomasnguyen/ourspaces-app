# Firecrawl + AgentMail setup

You only need **API keys on the Convex deployment** (not `.env.local`).

- Firecrawl → pasted URLs become web-post cards (`convex/firecrawl.ts`, Convex component)
- AgentMail → each space gets an inbox (`convex/agentmail.ts`, **plain REST — see below**)

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

---

## AgentMail

**We do NOT use `@agentmail/convex` anymore.** Version 0.1.0 has a real bug:
its component actions (`createInbox`, send, …) never resolve through
`ctx.runAction` from app code (its nested workpool subcomponents break the
reference), and its `convex.config` declares no `env` schema so the API key
needed a hand-patch in `node_modules`. Removed 2026-08-30; `convex/agentmail.ts`
now calls the REST API (`https://api.agentmail.to/v0`) directly and
`convex/http.ts` verifies the svix webhook by hand. Nothing to reinstall.

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

### Status as of 2026-08-30 (evening)

**Working (verified on dev via self-signed webhook posts):**

- Full inbound pipeline: signed webhook → `emailEvents` → per-space router.
  Letter landed in us two; a fake Venmo receipt cleared Jules' exact $42 tahoe
  IOU on the crew board (AI routing); an emailed HN link dropped into the build
  room pile and came back Firecrawl-enriched.
- Weekly digest (`convex/digest.ts`, Friday-16:00-UTC cron + `digest:sendNow`)
  composes correctly and reaches the AgentMail send call.

**Blocked on ONE thing — the API key is too scoped.** The current
`AGENTMAIL_API_KEY` (dev) gets `403 missing_permission` on even `inbox_read`,
and a key cannot mint a stronger key. A human must create an
unrestricted/org-scoped key in the console, then run step 2 + 4 above. The dev
spaces currently carry `test-*` inbox stubs so the pipeline could be tested;
clear them first (step 4).

---

## Prod

Repeat the same `npx convex env set … --prod` for every key. Env vars are per-deployment.

Then point AgentMail’s webhook at the **prod** site URL (`https://necessary-cobra-892.convex.site/api/agentmail/webhook`).

---

## Do not

- Do not put these keys in `.env.local` — that file is only `CONVEX_DEPLOYMENT` / `VITE_CONVEX_URL`.
- Do not use the generic AgentMail webhook path `/agentmail/webhook` without `/api`. This app’s HTTP prefix is `/api` (`convex/convex.config.ts`).
- Do not commit keys.
