# Firecrawl + AgentMail — what we actually use

Plain-English tour of every sponsor surface in the app: what it does, where you
**see** it in a demo, and which file owns it. Readable with no code open.

Keys, webhook URLs and setup live in `docs/firecrawl-agentmail-setup.md`.
The mail system's design and open goals live in `docs/mail.md`.
Updated 2026-09-12.

---

## The one-line version

- **Firecrawl** turns anything on the web — a link, a topic, a whole site, an
  emailed PDF — into clean text the canvas can hold. **5 surfaces in use.**
- **AgentMail** gives every space a real email address, so the outside world
  can put things on the canvas by writing to it. **6 surfaces in use, plus
  it's what signs you in.**

They also chain: one email can travel through both.

---

# Firecrawl

## 1. Scrape — a link becomes a card

**What it does:** one URL → title, description, cover image, site name, author,
date.

**Where you see it:** paste a link into a web-post widget, or into the build
room's pile. A grey placeholder appears, then fills in with a real card.

**File:** `convex/firecrawl.ts` → `scrapeLink`

**What's good about ours:**

- **Structured extraction, not scraping-then-regex.** We ask for four formats
  at once — `markdown`, `summary`, `images`, and a **JSON format with a prompt**
  ("return exactly: title, description, imageUrl, siteName, author,
  publishedAt"). That JSON request is Firecrawl doing the extraction, so we
  never parse HTML ourselves.
- **Falls back in a chain, never to nothing.** Title tries: extracted JSON →
  page metadata → HN story title → the bare domain. Description tries:
  extracted → Firecrawl's summary → meta description → first lines of
  markdown → a written fallback line. A card is never blank.
- **Hacker News links resolve properly.** An `news.ycombinator.com/item?id=…`
  link points at a *comments page*, not an article. We ask the HN Firebase API
  what story it is, scrape **the article it links to**, and keep the discussion
  metadata (points, comment count, submitter). Ask HN text posts have no
  article, so those scrape HN itself and the submitter becomes the author.
- **Cached for an hour** (`@convex-dev/action-cache`). The same link re-shared
  into another space, or mail-dropped after someone already saved it, costs
  zero credits and zero wait.
- **Retried with backoff** (`@convex-dev/action-retrier`, max 2 failures). A
  network blip doesn't lose the save.

Those two wrappers are invisible to callers — `scrapeLink` still behaves like a
plain function that returns a card.

## 2. Search — a topic becomes a pile of cards

**What it does:** a search phrase → up to 8 web results, already cleaned, shaped
exactly like the link cards the pile renders.

**Where you see it:** the build room — type a topic instead of a URL and the
room fills with things to read.

**File:** `convex/firecrawl.ts` → `searchTopic`

This is a genuinely different Firecrawl surface from scrape — search-then-clean
in one call, not "search elsewhere, then scrape each result."

The `limit` is clamped to 1–20 because it's caller-supplied and Firecrawl bills
per credit.

## 3. Crawl — a whole site, streaming in live

**What it does:** point at a site, get up to 50 pages, durably, in the
background.

**Where you see it:** the crawl strip. Pages appear **as Firecrawl finds them** —
a live counter, a growing list, each page keepable into the pile.

**Files:** `convex/firecrawl.ts` → `crawlSite`, `getCrawlStatus`,
`listCrawlPages` · `src/components/CrawlStrip.tsx`

**Why this one is the showpiece:** pages land in the Firecrawl component's own
Convex tables, and the UI *subscribes* to those tables. We never copy pages into
a widget document, never poll, and never write refresh logic. Convex's
reactivity means a second person watching the same space sees the same pages
arrive at the same moment.

That's the demo nobody else has: **a crawl with two people watching it.**

## 4. Parse — an emailed document becomes text

**What it does:** a PDF, DOCX, XLSX, CSV or TXT → markdown.

**Where you see it:** email a receipt PDF to a space. The body can say nothing
but "see attached" and the amount still lands on the right expense tracker.

**File:** `convex/firecrawl.ts` → `parseDocument`, `isParseable`

**How it works:** Firecrawl's dedicated `/parse` endpoint wants a multipart file
upload, but `/scrape` **detects the file type and parses it identically** when
you already have a public URL. AgentMail hands us a short-lived `download_url`
per attachment, so we always have a URL — which means this is a scrape with a
`parsers: [{type:"pdf", mode:"auto", maxPages:10}]` option attached, and the
document is never staged in Convex file storage.

**Guards, because parsing costs credits:** inline parts (signature logos, quoted
images) skipped, 10MB cap, documents only, 3 per email. Every failure is soft —
it returns `""` and the router reads the email body exactly as it did before.
An attachment must never cost us the email.

## 5. Stale-link refresh — cards that don't rot

**What it does:** link cards older than 7 days get re-scraped, **5 at a time**.

**Where you see it:** nowhere, which is the point. Old cards quietly stay
accurate.

**File:** `convex/batch.ts` (cron: Fridays 17:00 UTC)

Uses `@convex-dev/batch-worker` so a hundred stale links don't become a hundred
simultaneous Firecrawl calls. The cron enqueues; the worker drains in bounded
batches and resumes from a cursor if a run is interrupted.

## Firecrawl scoreboard

| Surface | Us | Note |
|---|---|---|
| Scrape | ✅ | + JSON extraction, cached, retried, HN-aware |
| Search | ✅ | build room topic search |
| Crawl | ✅ | durable, streaming, reactive |
| Parse | ✅ | emailed documents |
| Extract (standalone `/extract`) | ➖ | we do JSON-on-scrape instead, same result |
| **Map** | ❌ | discover every URL without scraping — `map()` **is** on our client, one call away |
| **Interact** | ❌ | click/fill on a live page. One of their three headline features |
| **Agent** | ❌ | autonomous gathering |
| Browser Sandbox | ❌ | |
| Change tracking | ❌ | the field is in our validator, we never read it |

---

# AgentMail

## 1. Inboxes — every space has a real address

**What it does:** a space owns an actual email address strangers can write to.

**Where you see it:** the black `✉ address` chip under a space's title. Click to
copy.

**File:** `convex/agentmail.ts` → `ensureInbox`, `ensureShowcaseInboxes`

| Space | Address | What mail becomes |
|---|---|---|
| the crew | `ourspaces@agentmail.to` | AI-filed: receipts → expense rows, bookings → itinerary days |
| us two | `ustwo@agentmail.to` | a sealed kraft letter you click to unfold |
| the build room | `buildroom@agentmail.to` | URLs drop into the pile, Firecrawl-enriched |

Creation is **idempotent** and **internal-only**. Inboxes are the scarcest
resource in the app — the free tier caps at **3 per org, shared across dev and
prod** — so this was deliberately locked down after being a public wrapper that
let any caller create one.

(`thecrew` was already taken org-wide, so the crew rides the account's default
`ourspaces@` inbox.)

## 2. Webhooks — mail arriving, safely

**What it does:** AgentMail POSTs us every inbound message.

**File:** `convex/http.ts` → `/api/agentmail/webhook`

**Done properly, which is the part worth showing:**

- **Signature-verified.** Standard-webhooks/svix HMAC: we sign
  `${id}.${timestamp}.${body}` with the secret and compare against the `v1,`
  signatures. An unsigned POST gets a 401.
- **Deduped.** AgentMail can redeliver. The component records `event_id` and
  returns `isNew: false` on a repeat, so an email is never filed twice.
- **The component owns the store.** Dedup and the inbound-message table live in
  `convex/components/agentMail/`, not scattered through app code.

## 3. Send — the space writes back

**What it does:** outbound mail from a space's own address.

**Where you see it:** Friday 16:00 UTC, every mail-enabled space emails its week
to **everyone who has ever emailed it**. Mailing a space subscribes you to it.

**Files:** `convex/agentmail.ts` → `sendEmail` · `convex/digest.ts`

The digest is a **durable workflow** (`@convex-dev/workflow`): recipients →
canvas snapshot → AI-composed lines → send. Each step retries independently and
the whole thing survives a server restart mid-run. A plain action would lose all
progress and start over.

Rate-limited to 10/hour per space so a retry loop can't burn the free tier.

## 4. Reply in-thread — it answers you

**What it does:** every inbound email gets a reply, in the same thread.

**Where you see it:** email the crew a receipt, get back *"Logged $242 from Jules
for tahoe cabin on the expense tracker. Read tahoe-cabin-receipt.pdf."*

**File:** `convex/agentmail.ts` → `ackInbound`

Naming the file back to you is the tell that the space actually opened it.

Deliberately **best-effort**: if the reply fails, we swallow it. The email was
already filed onto the canvas, and a mail hiccup must not undo a committed
write.

## 5. Labels — the verdict, written back

**What it does:** the router's decision becomes a label on the message in
AgentMail.

**Where you see it:** the AgentMail console — inbound mail sorted into
`receipt` / `booking` / `letter` / `links` / `spam` / `filed` / `otp`.

**File:** `convex/agentmail.ts` → `ackInbound`

This mirrors AgentMail's own smart-labeling pattern, and it means their console
shows what our app decided without us building a dashboard.

## 6. Attachments — documents are readable

**What it does:** attached PDFs become text the router can file on.

**File:** `convex/agentmail.ts` → `parseAttachments`

The chain:

```
attachment metadata → AgentMail download_url → Firecrawl parse → text on the
event → the router reads it alongside the body
```

**The robustness bit:** if the webhook payload carries `attachments`, we use it.
If the key is **absent entirely** (a webhook shape that doesn't send them), we
re-fetch the message rather than assume the email had none. An **empty array**
means it genuinely had none and costs no call. That distinction is the whole
fallback.

## 7. Sign-in codes — AgentMail is our auth

**This is the one people don't expect.** There is no separate email provider in
this app. When you join OurSpaces, the six-digit code is sent **through
AgentMail**, from `ourspaces@agentmail.to`.

**Where you see it:** the claim card. Type an address, get a code, type it back,
you're in. No password, ever.

**File:** `convex/otp.ts` → `EmailOtp` · `convex/auth.ts`

**Why it's a good story, not just a shortcut:**

- **No new credential.** The integration the spaces already use does one more
  real job.
- **It must not create a fourth inbox.** The free tier caps at 3 and all three
  are spoken for, so OTP rides the account-level inbox deliberately.
- **Six digits from the CSPRNG**, 10-minute expiry (the library default is an
  hour, which is a long time for a six-digit number to stay live).
- **Rate-limited on the destination address**, not the caller — 2 in a burst,
  refilling 3/hour. Anonymous sign-in is free and unlimited so an attacker
  controls their own userId; the resource worth protecting is the *victim's
  inbox*. This makes mailbombing dull.
- **Guests upgrade, they don't fork.** Sign in as a guest, then join, and the
  email is patched onto the *same* user row — votes, name, colour and
  memberships all survive because the id never changed.
- **A requested code is a claim, not a fact.** Step 1 mints a throwaway stub
  rather than touching the guest, so nobody can type a stranger's address, never
  read the code, and still weld that address onto their own account.

## AgentMail scoreboard

| Surface | Us | Note |
|---|---|---|
| Inboxes | ✅ | 3 showcase spaces, idempotent, internal-only |
| Webhooks | ✅ | svix-verified + deduped |
| Send | ✅ | weekly digest via durable workflow |
| Reply in-thread | ✅ | every inbound gets an answer |
| Labels | ✅ | router verdict written back |
| Attachments | ✅ | + Firecrawl parse |
| **Auth / OTP** | ✅ | the whole sign-in path rides it |
| Threads | ⚠️ | we store `threadId` and reply in-thread, but never call the threads API |
| **Drafts** | ❌ | human-in-the-loop review before send — closest fit to our "unfiled envelope" idea |
| Custom domains | ❌ | we're on `agentmail.to` |
| Search | ❌ | |
| WebSockets | ❌ | we use webhooks, which is the right call for a Convex backend |
| Pods / scoped keys | ❌ | |
| Metrics | ❌ | |
| Lists (allow/blocklists) | ❌ | |

---

## The chains — where the two meet

**One email, both sponsors, three times over.**

**A. Emailed link → the build room pile**

```
email to buildroom@ → webhook (verified, deduped) → URLs pulled from the body
→ placeholder cards appear instantly → Firecrawl scrape fills each one in
→ Convex reactivity pops the finished card onto every open screen
→ AgentMail replies "Dropped 3 links into the build room pile."
```

**B. Emailed receipt → the right expense tracker**

```
email to ourspaces@ with a PDF → webhook → AgentMail download_url
→ Firecrawl parses the PDF → the model reads the document + a live inventory
of the canvas → finds the EXISTING tahoe tracker → $242 onto Jules
→ the canvas says "jules covered his cabin share"
→ AgentMail replies naming the file it read, and labels the message `receipt`
```

Verified on dev: that same email, before attachments shipped, dead-ended with no
widget and no explanation.

**C. Joining the app**

```
type your address → AgentMail sends a six-digit code from ourspaces@
→ type it back → your guest identity is upgraded in place, nothing lost
```

---

## What we chose not to build

Worth being able to say out loud, because "we didn't get to it" and "we decided
against it" sound very different:

- **Firecrawl Map** — `map()` is on our client already. It would make the crawl
  strip less of a black box (show the URL list, *then* crawl). Cheap. We ran out
  of demo, not ability.
- **Firecrawl Interact / Agent** — genuinely out of scope. Nothing in a shared
  canvas wants to fill in a form on someone else's website.
- **AgentMail Drafts** — the best remaining idea. `docs/mail.md` already frames
  ambiguity as an interaction ("a sealed envelope a human opens and files"). A
  draft reply a human approves is that same idea one step further.
- **AgentMail WebSockets** — webhooks are correct here. A Convex HTTP action is
  already push-driven; a socket would add a connection to babysit for nothing.
- **Custom domains** — `@agentmail.to` in the UI is a *feature* at a hackathon.
  People recognise it.
