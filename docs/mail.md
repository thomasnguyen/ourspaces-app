# Mail — email → canvas (AgentMail)

The spec + status doc for the mail system. Setup/keys/webhooks live in
`docs/firecrawl-agentmail-setup.md`; this file is what it does, why, and what's
left. Updated 2026-08-30.

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
inbound  email → AgentMail → webhook (svix-verified by hand, convex/http.ts)
         → emailEvents row (convex/agentmail.ts)
         → router (convex/inbox.ts): couple | buildroom | AI-file (default)
         → widget mutations → every open tab updates live
outbound digest cron (convex/crons.ts) → recap snapshot → AI lines
         → REST send from the space's inbox (convex/digest.ts)
```

- `@agentmail/convex` is **gone** (its component actions never resolve;
  documented in the setup doc). Everything is ~3 plain REST calls we own.
- No schema change beyond `emailEvents.body`. Letters are a new widget type;
  crew filings mutate existing widget `data`; buildroom rides the pile's
  existing `linkState`/`dropped` contract.
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
- [ ] **Prod cutover** (before demo/submission): key on `--prod`, second
      webhook → `necessary-cobra-892`, bind addresses to prod space ids via
      `setSpaceInbox` (do NOT re-create inboxes). Steps in the setup doc.

## Goals still open (rough priority)

1. **Arrival choreography** — an emailed widget should *land* (envelope drop,
   house motion, sound) rather than reactive-pop into place. This is the demo
   money shot: split screen, send from a phone, watch it arrive. Tier 0/1
   motion per eye-candy.
2. **Prod cutover** (above) — cheap, do it near the demo-record date so dev
   testing doesn't spam the prod canvases.
3. **Shared letter opening** — `sealed` flips via `updateWidgetData` so both
   people see it open live (currently per-tab local state).
4. **Guardrail check before going public** — the inboxes are printed in the
   UI; the router already discards spam and defaults to unfiled, but eyeball
   the first day of strangers' mail (commons space plan, playbook §5).
5. **What to show, and in what order** — kept with the rest of the demo
   planning in the local playbook (`.context/`), not here.
6. Nice-to-have: reply-to-thread → the reply lands in the widget's message
   thread; expense widget shows the `lastEmail` receipt line it already stores.

## Log

- 2026-08-30: planned in chat (3 cases + digest), built, verified on dev with
  signed webhook posts, then unblocked with an unrestricted key and verified
  with real mail. Commits `653453b` → `8c42502`.
