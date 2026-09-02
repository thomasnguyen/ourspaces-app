# Mail — email → canvas (AgentMail)

The spec + status doc for the mail system. Setup/keys/webhooks live in
`docs/firecrawl-agentmail-setup.md`; this file is what it does, why, and what's
left. Updated 2026-08-31.

## The idea

Every showcase space has its own real email address. Mail sent to it doesn't go
to an inbox UI — it **becomes objects on the canvas**, routed by a per-space
personality. Once a week the space writes back. AgentMail stops being an
integration checkbox and becomes the app's front door for the outside world.

| Space | Address | What mail becomes |
|---|---|---|
| the crew | `ourspaces@agentmail.to` | **AI-filed**: receipts → expense rows, bookings → itinerary days, else unfiled envelope |
| us two | `ustwo@agentmail.to` | a sealed kraft **letter** on the canvas — click to unfold |
| the build room | `buildroom@agentmail.to` | URLs drop into **the pile**, Firecrawl-enriched |

(`thecrew` is taken org-wide on agentmail.to and the free tier caps at 3
inboxes **shared across dev + prod**, so the crew rides the account's default
`ourspaces@` inbox.)

## The three demo cases

**1. The crew — the smart one.** The router doesn't classify in a vacuum: it
hands the model a live inventory of the canvas (expense splits with people +
totals, itineraries with days, frames, countdown dates) plus today's date, and
gets back one filing decision. Money about a **past** event finds that event's
tracker (a $42 Venmo receipt cleared Jules' exact seeded tahoe IOU); a booking
with **future** dates lands on the japan itinerary at the right day; a clear
receipt/booking with no matching widget **creates a real widget**; anything
ambiguous becomes a sealed *unfiled* envelope a human can open and file —
ambiguity is an interaction, not a wrong guess. Spam is discarded.

**2. Us two — the intimate one.** No AI. The email *is* the artifact: kraft
envelope with flap, stamp and wax seal, from/subject/date on the front, and the
full letter unfolds on cream paper when clicked. Long distance, but the letter
box is shared.

**3. The build room — the sponsor-chain one.** One email chains all three
sponsors: AgentMail webhook → URL extraction → the pile's existing `dropped`
flow → Firecrawl enrichment (HN links resolve through the Firebase API) →
Convex reactivity pops the ready card into the room. Sender shows as
"Name ✉".

**Plus: the weekly digest.** Friday 16:00 UTC (or `digest:sendNow`), each
mail-enabled space emails its week — AI-composed lowercase lines from the recap
snapshot — to **everyone who has ever emailed it**. Mailing a space subscribes
you to it; the space is a correspondent, not a database.

## Architecture (all shipped)

```
inbound  email → AgentMail → webhook (svix-verified, convex/http.ts)
         → components.agentMail.lib.ingestWebhook (dedup + inbound store)
         → emailEvents row w/ messageId/threadId (convex/agentmail.ts)
         → router (convex/inbox.ts): couple | buildroom | AI-file (default)
         → widget mutations → every open tab updates live
         → ackInbound: reply in-thread + label the message with the verdict
outbound digest cron (convex/crons.ts) → weeklyDigestWorkflow (durable,
         convex/digest.ts): recipients → recap snapshot → AI lines →
         components.agentMail send from the space's inbox — each step
         independently retried (@convex-dev/workflow); manual `sendNow`
         demo trigger keeps the simpler action-retrier `digestFor` path
```

- AgentMail is now a **real Convex component we authored** —
  `convex/components/agentMail/` (`components.agentMail`). The published
  `@agentmail/convex` 0.1.0 is broken (nested-workpool hang, no env schema —
  setup doc); ours has no nested workpool and takes the key as an arg. It owns
  the inbound-message store + webhook dedup and wraps create/send/reply/label.
  `convex/agentmail.ts` are the thin app wrappers, so the REST surface and
  the inbound store live behind one boundary instead of spread across app code.
- **The space now writes back on every inbound mail**, not just the weekly
  digest: `ackInbound` (convex/agentmail.ts) replies in-thread ("Logged $84
  from Sam on the expense tracker.", "Dropped 3 links into the pile.") and
  labels the message with the router's verdict (`receipt`/`booking`/`letter`/
  `links`/`spam`/`filed`) — mirroring AgentMail's own smart-labeling pattern.
- Both the Firecrawl scrape (buildroom links) and the AgentMail send retry
  transient failures with backoff (`@convex-dev/action-retrier`); the scrape
  is also cached by URL (`@convex-dev/action-cache`, 1h TTL) so a re-shared
  or re-scraped link skips the network round trip. AgentMail sends and the
  crew's structured-filing LLM calls are rate-limited
  (`@convex-dev/rate-limiter`) so a retry loop or bad actor can't burn the
  free-tier inbox quota or LLM budget.
- Schema: `emailEvents` gained `messageId`/`threadId` (optional — no backfill)
  so the router can reply/label; the component owns its own `events` +
  `inboundMessages` tables. Letters are a widget type; crew filings mutate
  existing widget `data`; buildroom rides the pile's `linkState`/`dropped`.
- UI: every mail-enabled space shows a black `✉ address` chip under its title
  (click copies). The crew grew a **japan trip** frame (future dates) opposite
  the past tahoe IOUs — the router's past-vs-future demo in one glance.

## Status

- [x] REST spine: create inbox / send / webhook verify (dev key + secret set)
- [x] Real inboxes bound (3/3 free-tier slots used)
- [x] All router paths verified: letter · receipt→IOU · booking→itinerary ·
      unfiled envelope · spam discard · link→pile+Firecrawl
- [x] Real end-to-end: buildroom's inbox → `ustwo@` → letter widget appeared;
      digest delivered to a real Gmail
- [x] Seeds + `seed:backfillMailDemo` run on dev; mock mode matches
- [x] **AgentMail is our own `components.agentMail`** (create/send/reply/label +
      inbound store + dedup). `npm run build` green.
- [x] **Reply-in-thread + labels on every inbound** (`ackInbound`). *Live
      round-trip not re-verified after the component swap — needs a real
      inbound email to confirm the reply + label land in the AgentMail console.*
- [ ] **Prod cutover** (before demo/submission): key on `--prod`, second
      webhook → `necessary-cobra-892`, bind addresses to prod space ids via
      `setSpaceInbox` (do NOT re-create inboxes). Steps in the setup doc.

## Goals still open (rough priority)

0. **The brain, visible (B1).** `routeSmart` already files. Add `because` —
   one lowercase sentence (names + the widget, no id) — and put it on the
   letter flap or a torn slip that lands with the filing. Catch-me-up becomes
   a dated strip *on the canvas* (tap a line → pan to the widget); reverse
   `src/data/recap.ts` "never writes to the canvas." Unfiled stays an envelope
   you open and file. Pitch: *the space has a brain. mail it something it
   would recognize.*
1. **Arrival choreography** — an emailed widget should *land* (envelope drop,
   house motion, sound) rather than reactive-pop into place. Split screen,
   send from a phone, watch it arrive. Tier 0/1 motion per eye-candy. The
   flap sentence from (0) is what you read when it lands.
2. **Prod cutover** (above) — cheap, do it near the demo-record date so dev
   testing doesn't spam the prod canvases.
3. **Shared letter opening** — `sealed` flips via `updateWidgetData` so both
   people see it open live (currently per-tab local state).
4. **Guardrail check before going public** — the inboxes are printed in the
   UI; the router already discards spam and defaults to unfiled, but eyeball
   the first day of strangers' mail (commons space plan, playbook §5).
5. **Firecrawl writes the board (B3).** A recipe URL → potluck slots; a
   booking → an itinerary day; an article → a card plus one question grounded
   in the canvas snapshot. Card-only is what we have now.
6. Nice-to-have: **inbound** reply-to-thread → a human's email reply lands in the
   widget's message thread (the *outbound* side — the space replying to the
   sender — now ships via `ackInbound`); expense widget shows the `lastEmail`
   receipt line it already stores.

- 2026-08-31: brain play decided — visible `because`, recap strip on canvas,
  meal-train frame, vision on prints, Firecrawl writes widgets. Goals 0 and 5
  above; do not grow the outbound "space is drafting" agent as the demo hero.
