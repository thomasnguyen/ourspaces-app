# Firecrawl + AgentMail setup

This repo already installs and registers both Convex components. You only need **API keys on the Convex deployment** (not `.env.local`).

- Firecrawl → pasted URLs become web-post cards (`convex/firecrawl.ts`)
- AgentMail → each space gets an inbox (`convex/agentmail.ts`)

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

1. Open the [AgentMail Console](https://console.agentmail.to), sign up / log in.
2. Left sidebar → **API Keys** → **Create New API Key**. Copy it immediately (shown once). It starts with `am_`.
3. Put it on Convex:

```bash
npx convex env set AGENTMAIL_API_KEY am_your_key
```

4. Register the inbound webhook (required for mail to hit the canvas).

   Console → **Webhooks** → **Create Webhook**, or CLI:

```bash
npx convex env get CONVEX_SITE_URL   # or copy from the Convex dashboard
# URL must include /api — this app serves HTTP actions under /api

agentmail webhooks create \
  --url https://<deployment>.convex.site/api/agentmail/webhook \
  --event-types message.received
```

   Subscribe at least to `message.received`. Copy the signing secret (`whsec_…`) from the new webhook (or `agentmail webhooks get --webhook-id <id>`).

5. Put the secret on Convex (required for `handleWebhook`):

```bash
npx convex env set AGENTMAIL_WEBHOOK_SECRET whsec_your_secret
```

6. Confirm: call `ensureInbox` for a space, then send mail to that `@agentmail.to` address. A row should land in `emailEvents`.

Free tier (no card): 3 inboxes, 3,000 emails/month. Custom domains need a paid plan; default is `@agentmail.to`.

---

## Prod

Repeat the same `npx convex env set … --prod` for every key. Env vars are per-deployment.

Then point AgentMail’s webhook at the **prod** site URL (`https://necessary-cobra-892.convex.site/api/agentmail/webhook`).

---

## Do not

- Do not put these keys in `.env.local` — that file is only `CONVEX_DEPLOYMENT` / `VITE_CONVEX_URL`.
- Do not use the generic AgentMail webhook path `/agentmail/webhook` without `/api`. This app’s HTTP prefix is `/api` (`convex/convex.config.ts`).
- Do not commit keys.
