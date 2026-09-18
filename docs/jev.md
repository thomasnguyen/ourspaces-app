# The decision model — Jev in front, OpenAI behind

How an inbound email (and later, a spoken sentence) gets turned into a
decision about the live canvas. Companion to `docs/mail.md` (the pipe) and
`docs/mail-arrival.md` (what a person sees). Read §9 of
`docs/architecture.md` first — this doc is a delta on it.

## Why this exists

`routeSmart` currently makes one `completeJson` call that does five jobs:
pick an action, pick a widget, pick a kind, pull the amounts and dates out,
and write the `because` sentence. Three of those are multiple choice. Two
are writing. Asking one model to do both means the multiple-choice half
inherits the writing half's latency, and — the real problem — the widget id
comes back as a **string the model typed**.

`inboxRouting.ts` hands that string to `applyExpense` unvalidated.
`inbox.ts` defensively nulls it when the type or space is wrong, and then
**silently creates a new tracker**. So a fumbled id is not an error, it is a
duplicate widget on the canvas. That is the bug this change removes.

The split:

| job | who | why |
|---|---|---|
| which action, which widget, which kind | **Jev** | closed set, known at call time |
| the amounts, the dates, the sentence | **OpenAI** | open-ended; Jev cannot emit values or prose |

**Jev does not replace OpenAI. It sits in front of it.** Both stay.

## What Jev is, in one paragraph

A System One model: natural-language state in, typed answers plus calibrated
probabilities out. It never generates text. Three question types — `Choice`
(one of up to 255 options), `Score` (a position on a 2–10 level scale),
`Noul` (the probability that a yes/no question is yes). Every question is
evaluated in parallel against the same state, so a tenth question costs
tokens but almost no time. 70–500ms, 64K context, input metered and output
free. `POST https://api.typesafe.ai/v1/systemone`.

The two properties this codebase is buying:

1. **The options are enumerated before the call**, so the router cannot pick
   a widget that is not on the board.
2. **Every answer carries a calibrated confidence**, so "the router never
   guesses loudly" (`architecture.md` §7) stops being a prompt instruction
   and becomes a threshold.

What it does **not** buy: better accuracy. Jev benches mid-tier. It is
faster and typed, not smarter. Do not claim otherwise in the README.

## Speculative prompting — ask everything, read what you need

The pattern that makes this worth doing rather than a like-for-like swap.

Because questions run in parallel and output is unmetered, the cost of
asking a question you might not need is ~0ms and ~0¢. So the router asks
**every** question the branch might want, in one call, and the code reads
only the ones the action makes relevant. Questions about locks come back as
noise when the email was about a receipt; nothing reads them.

One call, one state, these questions:

```
action        Choice  expense | itinerary | create | unfiled | discard
expenseTarget Choice  <live expenseSplit lines> | none
itinTarget    Choice  <live itinerary lines> | none
kind          Choice  expenseSplit | itinerary
isPast        Noul    "is the money or event here about something that already happened?"
isCompound    Noul    "does this contain more than one separate thing to file?"
needsHuman    Noul    "would a person want to look at this themselves?"
```

`expenseTarget` and `itinTarget` are asked **both times, always** — the code
reads whichever one `action` made relevant. That is the whole trick.

`isPast` is the test `architecture.md` calls "what makes the demo legible":
money about a past trip goes to that trip's tracker, a booking with future
dates goes to the itinerary. It was a prompt bullet; now it is a number.

### Building the option lists

**Do not pass raw Convex ids as choice options.** Jev matches on the option
text semantically. Pass the readable inventory line and keep an index → id
map on our side:

```
"tahoe trip · jules, maya, sam · $420"   → widgets[2]._id
"japan · nov 7-14"                       → widgets[5]._id
"none"                                   → ""
```

`widgetInventory()` in `inboxRouting.ts` already builds exactly these lines.
Reuse it verbatim, split per type, cap at 255 (unreachable in practice).

## The confidence gate

```ts
const UNFILED_FLOOR = 0.7;   // tune on real mail, see Build order step 5
if (answers.action.confidence < UNFILED_FLOOR) action = "unfiled";
```

Below the line, nothing is filed: the email lands as a sealed envelope on
the canvas and a person opens it. This is the existing `unfiled` path, now
triggered by a number instead of by the model volunteering that it is
unsure. Self-reported LLM confidence is uncalibrated; this is the one thing
Jev gives us that a prompt cannot.

TypeSafe's own docs say calibration must be verified on your own data. So
0.7 is a starting guess, not a finding. Step 5 replaces it with a measured
one.

## The compound case

Today the router picks one thing and drops the rest. An email that says
"here's my half, and I booked the cabin for nov 7" files the receipt and
loses the booking.

`isCompound` fixes it with the smart-home pattern:

```
Jev       isCompound = 0.98
OpenAI    split into discrete items  →  ["here's my half", "booked the cabin nov 7"]
Jev ×2    route each, in parallel
```

Two extra round trips only on the emails that need them, detected in the
same 150ms call that was already happening. Ship this **after** the single
case is green — it is the first thing to cut if time runs out.

## Two writes, not one

Today `label`, `because` and `widgetId` land in a single patch inside
`applyExpense` / `applyItinerary` / `addLetter`. Splitting the call means
splitting the patch, and that is what makes the arrival better rather than
just faster:

| when | write | what the canvas does |
|---|---|---|
| after Jev (~150ms) | `markEvent({ label, widgetId, confidence })` | the verdict stamps, the FLIP target is known |
| after OpenAI (~2s) | `applyExpense` / `applyItinerary` as today | the row prints, the because-slip unfolds |

**Verdict first, reason second.** `MailArrival.tsx` already falls back to
`copy?.decided` when `because` is missing, so this degrades correctly from
day one.

Make the `label` patch in `applyExpense` / `applyItinerary` idempotent —
both writes now set it and the second must not fight the first.

## Latency, honestly

| | now | after |
|---|---|---|
| the decide call | ~3–5s (estimated, never measured) | ~150ms |
| the visible arrival | ~6s | ~2.5s |

The arrival is **not** 20× faster, because the webhook, the Firecrawl
attachment parse and the embedding echo check are all still in the path.
The model was one slice. Step 0 of the build order measures the current
number so the before/after in the submission is measured, not guessed.

`MAIL_SLOW_AFTER_MS` (`slow one — still reading`, 7s) stops firing for the
decide step. Leave it in — attachment parsing can still be slow.

## Files

| file | change |
|---|---|
| `convex/jev.ts` | **new** — `jevTarget()` + `decide()`, mirrors `chatTarget()`/`completeJson()`; `null` on unconfigured or any non-ok |
| `convex/inboxRouting.ts` | `routeSmart` splits into `decideRoute` (Jev) + `extractFields` (OpenAI); today's function survives as `routeSmartLLM` |
| `convex/inbox.ts` | `markEvent` call after the Jev phase; `label` patch idempotent in the two apply mutations |
| `convex/schema.ts` | `emailEvents.confidence: v.optional(v.number())` — optional, no backfill, same as `because`/`label` |
| `convex/work.ts` callers | `decide` done line carries the verdict + confidence; new `write` step for the sentence |
| `src/lib/mailArrival.ts` | `confidence?: number` on `MailArrivalEvent`; `MAIL_VERDICT_FLOOR_MS` |
| `src/components/MailArrival.tsx` | stamp reads `RECEIPT · 94%`; a gated envelope says `not sure enough — 41%` |
| `#/mail` lab fixtures | a confidence field, so the lab and live cannot drift |

## The fallback is the whole safety story

`convex/ai.ts` already has the discipline: `chatTarget()` returns `null` when
unconfigured and **every caller degrades to canned output rather than
erroring**. `convex/jev.ts` copies it exactly.

```
jevTarget() === null   → routeSmartLLM (today's behaviour, unchanged)
decide() returned null → routeSmartLLM
confidence < floor     → unfiled, the existing sealed envelope
```

This is what lets steps 1–4 ship before the API key exists. Pull the key and
the app still runs, just less smart — same as it does today with OpenAI.

## Narration

`work.ts`'s one rule: a row is written where the work actually happened,
never on a timer. The split creates two real boundaries where there was
one, so both earn a line:

```
decide  running   working out where holly's mail goes
decide  done      receipt — 94% sure
write   running   writing the reason
write   done      it's the receipt for maya's cake, $84 from holly
```

## Build order — about a day

0. **Measure the current decide latency.** A probe alongside
   `.context/live-perf/`, three runs against the existing `completeJson`
   path. 20 min. Do this first or the before/after number is a guess.
1. `convex/jev.ts` + the schema field + env plumbing. 1h.
2. `decideRoute` / `extractFields` split, with `routeSmartLLM` as fallback.
   Speculative prompting from the start — the extra questions are free. 2h.
3. Two writes + the work lines. 1h.
4. Client: confidence on the stamp, the verdict floor, lab fixture. 1.5h.
5. Live verify against a real inbox; **tune `UNFILED_FLOOR` on real mail**.
   1h.
6. Docs (`architecture.md` §7 + §9, `mail-arrival.md` stages,
   `code-map.md`, README "Convex depth"), `npm run build`, deploy. 30 min.

Steps 1–4 ship with no key and no behaviour change. Only step 5 needs the
key.

## Later: the same function, spoken

Voice is this router with a different input. Email text in, or a
transcribed sentence in; both ask "which thing on this board, and what
should happen to it," against the same live inventory.

```
webkitSpeechRecognition  (built into Chrome — no vendor, no key, no audio pipeline)
  → text
  → the same decideRoute, with the canvas inventory as the option set
  → widgets move
```

Nothing replies. **It is a voice cursor, not a voice assistant** — you reach
onto the canvas with your voice and the room changes. That keeps it on the
right side of the no-chatbot rule in `AGENTS.md`.

The compound path is what makes it worth filming: one sentence, several
widgets. *"I'm in for saturday, I'll bring the cake, and jules still owes me
forty"* → RSVP, potluck slot, expense row, three places on the board, one
breath.

Roughly 4h **on top of** a landed router. Do not start it before step 5 is
green.

## Open

- **No `JEV_API_KEY` anywhere.** Early access is waitlist-only. Steps 1–4 do
  not need it; step 5 does.
- **`MAIL_VERDICT_FLOOR_MS` is undecided.** The stamp must not beat the
  envelope settling. 900ms keeps the choreography and lands the arrival at
  ~2.5s, but that re-times shots 8–11 of the demo video (0:30–0:56) and
  means a reshoot of the mail beat. Holding the floor at the current ~2.5s
  preserves the shot list and lets Jev show up only as the number on the
  stamp. **Unanswered — ask before step 4.**
- `UNFILED_FLOOR` is a guess until step 5.
