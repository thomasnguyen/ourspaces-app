# Mail arrival — the envelope that thinks out loud

Spec, not built. Written 2026-09-13. Sibling of the link arrival in the build
room (`docs/todos.md` "Link arrival narrates itself"); same idea at the other
entrance. Mail system itself: `docs/mail.md` (goals 0 + 1 are this doc).

## Why this is the big one

Email is where all three sponsors do work in one beat: AgentMail catches it,
Firecrawl reads an attached PDF, OpenAI decides what it is, Convex puts it on
everyone's screen. And it is the only beat where the product goes **silent**
while the interesting thing happens. Today the sheet shows nothing between the
webhook and the filing mutation — email transit, a Firecrawl parse, a model
call — and then a row appears. The link arrival proved the fix: the object
narrates the wait in plain words, clocked off real state, so latency becomes
the show instead of dead air.

## What a person sees

Holly forwards the cake receipt to `ourspaces@agentmail.to` from her phone.
On the laptop:

1. **It lands.** A kraft envelope drops onto the space next to the address
   sticker — squash, settle, `place` sound. Under it, a slip with a caret:
   `✉ from holly · just now` then `opening it ▍`.
2. **It reads.** The slip ticks: `reading it` (`reading the pdf` if one came
   attached). Three step dots under the sender, done = ink, live = lime, a
   scan line across the envelope. Past 7s: `slow one — still reading`.
3. **It decides.** The verdict stamps down like the link kind does —
   `RECEIPT` — and the slip prints the reason: the router's `because`
   sentence, e.g. `it's the receipt for maya's cake, $84 from holly`.
4. **It files.** `filing it → expenses`. The envelope flies to the expense
   sheet (the takeaway-note flight), the sheet takes a lime wash, the new row
   prints in and the because-slip unfolds on the flap. `place`.
5. **It writes back.** When the reply has gone out, a small tick on the
   sheet's slip: `↩ told holly`. Fades after a few seconds. On her phone,
   the real reply lands in the same thread.

About six seconds live. Nothing here is faked: every tick is a Convex state
change on the `emailEvents` row, so the slip cannot say something the backend
didn't do.

## Stages, and the state that drives them

| Stage | Set by | Where it's written today | Delta |
|---|---|---|---|
| arrived | `agentmail.onMessageReceived` inserts the event | `emailEvents.createdAt` | none — clock the first ticks off `createdAt`, like `droppedAt` does for links |
| reading | `inbox.processInbound` starts; `parseAttachments` if any | nothing | optional `readingAt` — or narrate by clock; the slip only *holds* on this stage |
| decided + filed | `applyExpense` / `applyItinerary` / `addLetter` / `routeBuildRoom` | `widgetId` + `because` patched on the event | add `label` (the ack verdict: receipt · booking · letter · links · unfiled · spam) patched in the same mutation, so the stamp has a word |
| replied | `ackInbound` after reply + label | nothing | add `repliedAt` patched when the ack returns |

Schema delta: `label?: string`, `repliedAt?: number`, `readingAt?: number` —
all optional, no backfill, same pattern as `messageId`/`because`. Patch
points: the four filing mutations and `ackInbound`'s caller in
`processInbound`.

Timing rule, copied from the link arrival: the first stages run on a timed
narration off `createdAt` (0.0s from · 0.7s opening · 1.6s reading), the slip
**holds on "reading" until `because`/`widgetId` land**, then decided → filed
play in sequence, and the reply tick waits for `repliedAt`. Every duration
multiplies by `--arrival-slow` so the camera can slow it.

## The client piece

`src/components/MailArrival.tsx`, mounted in every mail-enabled space:

- Subscribes to inbound `emailEvents` for the space (`by_space`, newest
  first, `direction: "in"`), keeps the ones younger than ~60s or not yet
  replied. One envelope per event, at the mail slot beside the address
  sticker; a second arrival stacks with the letter drift (`addLetter` already
  does base + per-letter jitter).
- Landing: the house squash-and-stretch on `--ease-snap`, `place`.
- The slip: the "BUILD ROOM — ARRIVAL CHOREOGRAPHY" CSS at the end of
  `index.css` already has the caret, the step dots, the scan line, the stamp
  and the print-in. Reuse the classes; don't fork them.
- Filed: FLIP the envelope from its rect to the target widget's rect
  (`flyWidgetIn` in `src/lib/flipLanding.ts` is the takeaway flight; the
  envelope version is the same move with a shrink), wash the widget, let the
  existing `BecauseSlip` on the widget carry the reason from there.
- The slip vanishes when the flight lands. For **unfiled**, nothing flies:
  the envelope *is* the letter widget (`addLetter` with `unfiled: true`) and
  the slip ends on `not sure what this is — open me`.
- **spam**: the envelope stays sealed for a beat, `spam — tossed it`, then
  slides off the space. The failure case is a beat, not a blank.

## The other two mouths, same component

- **us two.** The envelope that lands *is* the letter widget. Same landing,
  slip reads `✉ from thomas · a letter` → `sealed it onto the space`. Then
  goal 3 from `docs/mail.md`: `open` moves from `useState` in `LetterWidget`
  to `updateWidgetData`, so Holly opening it on the phone opens it on the
  laptop. Last piece of per-tab state in the app.
- **the build room.** Slip: `3 links inside → the pile`, envelope flies to
  the pile, then each link runs the link arrival it already has. One
  vocabulary at both doors.

## Copy — plain, lowercase, no vendor names on the object

| Kind | reading | decided | filed |
|---|---|---|---|
| receipt | `reading it` / `reading the pdf` | `RECEIPT` + because | `filing it → expenses` |
| booking | same | `BOOKING` + because | `filing it → the japan trip` |
| letter (us two) | `a letter` | — | `sealed it onto the space` |
| links (build room) | `reading it` | `3 LINKS` | `→ the pile` |
| unfiled | `reading it` | `NOT SURE` | `open me` |
| spam | `reading it` | `SPAM` | `tossed it` |

The because sentence is the router's, already lowercase and id-free
(`cleanBecause`). The slip never explains the pipeline; the sponsor names are
said out loud in the video and pop as pills in the edit.

## Lab route: `#/mail`

Like `#/arrival`: the real crew space over fixtures with a lab pill —
`receipt` · `booking` · `letter` · `unfiled` · `spam` · `¼ speed` · `replay` ·
`clear`. Fixtures drive the same stage clock with a fake `because` and a fake
`repliedAt` after ~1.2s. Mock helpers next to `lib/mockArrival.ts`. **Never on
camera**; the take is shot live on the crew.

## The take reset

Each take is a real email, so each take leaves a row, an event and a reply.
`seed:shootReset` (or a preset on `seed:demo`): delete the take's
`emailEvents` + the expense row it appended, restore the potluck to one open
slot and the cake poll to 4–1, clear the recap cache. Mind the limits: replies
are rate-limited to **10/hour per space** and the free tier has 3 inboxes
shared across dev and prod — do the prod cutover (`docs/mail.md` status)
before shoot week, and rehearse on dev.

## On camera (the beat is 0:30–0:48 in the shooting script)

- The transit gap is an edit cut: she sends, cut to the laptop, the envelope
  lands. Nobody waits for email delivery on screen.
- Two seconds of "reading" is the drama; don't slow it past 1.5×.
- One second of the AgentMail console after the tick: the thread with its
  `receipt` label and the reply. Their product proving ours did the work.
- If the receipt is a PDF, the slip shows `reading the pdf` and all four names
  are on screen in one beat; the voice line stays at three.

## Build order (about a day)

1. Schema + patch points: `label`, `repliedAt`, `readingAt` — 1h.
2. `MailArrival` + the slip on the arrival CSS + the stage clock — 3h.
3. Flight to the widget, wash, reply tick — 2h.
4. `#/mail` lab + fixtures — 1h.
5. Shared letter open (goal 3) — 1h.
6. `seed:shootReset` — 30m.

Verify live on dev with one real receipt, one PDF receipt, one letter to
`ustwo@`, one URL to `buildroom@`; confirm the label and the reply in the
AgentMail console. Then `npm run build`, and list the new mutations in the
README's Convex depth section only if they add a real surface.
