# OurSpaces — data model & state plan

> Backend spine and hero live wiring are implemented; CRUD and block convergence remain. Companion to PRD §11.
> The current vertical slice covers one seeded crew space, reactive widgets,
> messages, votes, named presence, and promote-to-note.

**Guiding rule (PRD intro): least friction.** Convex *is* our state, so there's
no Redux, no Zustand, no client cache to design. Server state comes from reactive
queries; UI-only state lives in React. Anonymous auth, inline data, platform
defaults. Anywhere this doc says "table" or "type," assume the smallest version
that survives the 3-minute demo.

---

## 0. Decisions locked (so we stop thinking about them)

| Question | Call | Why |
|---|---|---|
| Auth | Convex Auth (`@convex-dev/auth`), **guest or join** | Guest = Anonymous (silent, current claim-a-name) — **built 2026-09-12**. Join is still a slot: the library has no passkey provider (see §1). Never a login wall. |
| Global state lib | **None.** Convex queries + React `useState`/`useRef` | The platform already gives reactive shared state for free. |
| `userId` column type | **`v.string()`** (store the auth id's string form) | Lets us seed fake crew with `"seed:maya"` ids without minting real `users` rows. `v.id("users")` is the post-hackathon hardening. |
| Poll tallies | Separate **`votes`** table, aggregated in a query | One-vote-per-user via index; bars recompute live for free. |
| Potluck claims | **Inline** in `widgets.data.items[]` | No new table; claim = patch `data`. Concurrent-claim races are an accepted cut. |
| Frame grouping | **Visual-only widget** (`type: "frame"`); move-together is frontend + cuttable | PRD §8. No parent refs, no schema. |
| Display names/colors on rows | **Denormalized** onto messages, claims, notes | Chat and potluck render with zero client-side joins. |
| Avatar URLs | **Optional denormalized strings** on members, presence, and messages | A chosen visitor face survives name edits and renders live across windows. |

---

## 1. Auth — guest or join (never a wall)

Decided 2026-08-31. Identity is worth having, but a login wall would kill the
one thing that makes the app work: **you can always walk in.**

Two modes, one person:

| | **Guest** (default, demo path) | **Join** |
|---|---|---|
| Who | Anyone who opens a space | Someone who wants to come back as themselves |
| Auth | Convex Auth **Anonymous** — silent `signIn("anonymous")` on first load | Convex Auth **Passkey** (one tap, no email form). Google only if passkeys flake on the demo machine. Never email+password. |
| UI | Existing claim card: name, color, face, **just visiting** | Same card, second CTA: **join**. Name/face already picked travel with you. |
| `userId` | Anonymous `users` id (replaces today's `crypto.randomUUID()` in sessionStorage) | Real `users` id. Same `members` row — upgrade, don't fork. |
| What they can do | Everything on showcase spaces: vote, claim, paint, mail-in still works | Same, plus they persist across browsers/devices. Creating a *new* space can require join later; not required for the tape. |

**Hard rules**

- The canvas is never behind a sign-in screen. Guest is a complete product.
- Seeded people (`seed:maya`, etc.) stay fake ids. They never authenticate.
- Showcase spaces stay world-writable for guests. No ACL theater for the hack.
- Join is "I'm this person," not "unlock the app."
- If Convex Auth v2 is usable without burning a day, use it (the hackathon
  page asked people to try it). Else `@convex-dev/auth` Anonymous + Passkey.
- Account linking: guest → join keeps votes, presence color, claimed name.
  If linking is gnarly, join mints a new id and we copy the `members` patch
  — but try linking first.
- Human-readable name/color/emoji stay on `members`, not on `users`.

**Claim card copy (gate variant)**

```
you're walking into the crew
[name] [face] [color]
[ just visiting ]   [ join ]
```

`just visiting` dismisses the gate (today's path). `join` runs passkey, then
dismisses. Popover (already in) can grow a "join so you come back" link;
don't nag.

**Gate as built (2026-09-15).** `components/ClaimCard.tsx` variant `gate`:
the room is named at the top for every entry (roster faces + the presence
component's live count), the name field is loud and pre-selected on desktop,
and colour + face + placeholder name are one tap (`PERSONAS` in
`live/identity.ts`; a typed name survives a look change). Your own cursor
rides the pointer over the blurred room while the gate is up
(`components/GateCursor.tsx`; phones get it parked in the card). Enter walks
in: the card collapses into the cursor tip (WAAPI, glide, 440ms), the scrim
lifts from 120ms off the canvas that was there all along, the header enters
at 200ms (`enterRoom` in `pages/LiveSpace.tsx`). "keep this on your other devices"
is still the quiet second CTA under the way in.

**As built (2026-09-12).** Guest works end to end: silent anonymous sign-in,
server-validated token, identity stable across reloads. Wiring:

| Piece | Where |
|---|---|
| `convexAuth({ providers: [Anonymous] })` + `currentUser` | `convex/auth.ts` |
| `...authTables` | `convex/schema.ts` |
| OIDC provider Convex validates against | `convex/auth.config.ts` |
| Discovery documents at the site root | `convex/components/authWellKnown/` |
| `ConvexAuthProvider` | `src/main.tsx` |
| Silent sign-in + identity adoption | `src/live/useAuthIdentity.ts` |

Keys: `JWT_PRIVATE_KEY` + `JWKS` generated headlessly with `jose` and set via
`npx convex env set "NAME=value"`. **Never run the interactive
`npx @convex-dev/auth` wizard — it hangs headless.**

**Two traps this cost real time on; don't re-derive them.**

1. *The discovery documents must be served from the root of `convex.site`.*
   `convex.config.ts` mounts our own router under `httpPrefix: "/api"` so the
   static site can own `/`, so `auth.addHttpRoutes(http)` puts
   `/.well-known/jwks.json` at `/api/.well-known/jwks.json` — while Convex
   still fetches it from the root, where static hosting answers with the SPA's
   `index.html`. Auth then fails with **no error anywhere**. Fix: a tiny local
   component, `convex/components/authWellKnown/`, mounted at
   `httpPrefix: "/.well-known"`. Component prefixes are absolute from the root,
   unlike the app router's.
2. *`customJwt` cannot be used as the escape hatch.* It takes an explicit
   `jwks` URL, so it looks like it dodges trap 1 — but it rejects these tokens
   with `InvalidAuthHeader: JWT may be missing a 'kid' (key ID) header`.
   Convex Auth signs with a bare `{ alg: "RS256" }` header and no key id.
   The stock `{ domain, applicationID }` pair tolerates that; `customJwt`
   does not.

**One client-side gotcha, verified the hard way.** After `signIn` succeeds,
Convex Auth writes the new token to localStorage but the live
`ConvexReactClient` keeps using the old one: 40s after joining, `currentUser`
still answered as the guest and `createSpace` still refused. So
`src/components/JoinForm.tsx` **reloads the page** on "keep going". Heavy-
handed, and correct — the reload re-reads the token and everything downstream
just works. Don't replace it with a longer wait; waiting was the thing that
didn't work.

**Ownership is real as of 2026-09-12 (phase 1 of guest→join).** Three
functions derive identity server-side via `requireUserId` /
`requireRegisteredUserId` (`convex/auth.ts`): `spaces.createSpace` (registered
only, stamps `ownerId` from the session), `spaces.renameSpace` and
`spaces.deleteSpace` (both via `requireOwner`). `spaces.ownerId` is optional and
**unset on every seeded showcase space** — "no owner" reads as "nobody renames
or deletes this from the client", which is what we want.

Everything else still takes `userId` from the client and that is deliberate,
not debt: forging it lets you do what you could already do honestly, because
every space is world-writable (§1), and the seeded crew (`seed:maya`) must keep
writing rows no auth identity can produce (§0). Identity is decorative
everywhere it was already decorative, and load-bearing in exactly the three
places that make an ownership claim.

**Join is an emailed six-digit code, built 2026-09-12.** Not passkey:
`@convex-dev/auth@0.0.95` ships no WebAuthn provider, and Auth.js's passkey
provider needs adapter hooks this library doesn't implement. Not Google
either — that needs a Google Cloud client id/secret. The code path needs no
new credential at all: `convex/otp.ts` wires `Email({ sendVerificationRequest })`
and sends through the AgentMail integration the spaces already use.

- Sends from `ourspaces@agentmail.to`. **Never create a fourth inbox** — the
  free tier caps at three PER ORG and all three are spoken for.
- Rate-limited on the *destination address* (`otpSend`), not the caller:
  anonymous sign-in is free so an attacker owns their userId, but the
  victim's inbox is the resource worth protecting.
- Keep the provider's default `authorize`. It requires the same email at step
  two, which is what makes six digits safe; `authorize: undefined` is the
  magic-link shape and would make them guessable.

**Joining does not fork the person, and needs no data migration.**
`callbacks.createOrUpdateUser` runs inside the `auth:store` mutation, which
carries the *caller's* identity — so `getAuthUserId` there is the anonymous
guest who is registering. We patch the email onto their existing row and
return the same id; the library re-points `authAccounts` at it. Verified:
`userId` is byte-identical before and after, so votes, name, colour and
memberships keep working untouched. That is §1's "upgrade, don't fork" with
zero rows rewritten.

Two traps inside that callback:

1. **Link only at `type: "verification"`, never at `type: "email"`.** The user
   row is created when the code is *sent*, before the address is proven. Link
   at step one and anyone could type a stranger's address, never read the
   code, and still have welded that address onto their own account.
2. **The non-OTP branch is load-bearing.** Supplying the callback means owning
   *all* user creation, including the silent guest path. Get that branch wrong
   and nobody can walk in at all. Re-test guest sign-in after every change.

**Seed vs live** — unchanged: seeded crew = `"seed:maya"` strings; the visitor
is a real auth id joined as a `members` row on first visit.

Build after brain-play B1 (don't let auth break the inbound demo). Guest path
must still work if Join is half-broken — that's the rollback.

---

> **As built (2026-08-31).** This file is the *plan*; `convex/schema.ts` is the
> truth, and it drifted deliberately. Live today: **spaces** (+ `slug`,
> `canvasW/H`, `tagline`, `inboxId`/`inboxAddress`, `askThreadId` [agent
> component thread for `recap.ask`], `ragIndexedAt` [rag reindex staleness],
> indexed `by_slug` / `by_inbox`) · **emailEvents** (+ optional `messageId`/
> `threadId` — AgentMail ids so the router can reply in-thread + label) ·
> **members** ·
> **widgets** (+ `rotate`; `data` is a typed discriminated union — 12 real
> shapes + a permissive fallback, not `v.any()` — see `convex/widgetData.ts`)
> · **messages** (real cursor pagination + a full-text search index) ·
> **votes** · **paintMarks** · **recaps** · **presence** (the hand-rolled
> canvas cursor/gesture table — a *second*, component-backed presence system
> in `convex/roomPresence.ts` tracks room occupancy separately, see
> `docs/code-map.md`) · **linkRefreshQueue** (batch-worker's stale-linkCard
> queue). All functions carry `returns:` validators. 16 real Convex
> components are wired with genuine jobs (migrations, aggregate ×2,
> sharded-counter, rate-limiter, action-retrier, action-cache, workpool,
> workflow, batch-worker, agent, rag, persistent-text-streaming, presence,
> plus firecrawl/static-hosting) — plus our own first-party **agentMail**
> component (`convex/components/agentMail/`, owns inbound store + dedup, wraps
> the AgentMail REST API) since the published `@agentmail/convex` 0.1.0 is
> broken. See `hackathon.md`'s usage-map table for the full list with hashes.
> Identity is still **local + claimed** (`src/live/identity.ts` session UUID) —
> no `authTables` yet. Guest-or-join (this §1) is decided, not wired. The AI
> layer runs on a Cloudflare `ai-proxy` (gpt-oss-120b) with OpenAI as fallback
> for chat; `rag`'s embeddings are real-OpenAI-only (`text-embedding-3-small`)
> since the proxy has no `/v1/embeddings` route.

## 2. Convex tables (backend)

PRD §11's sketch is the spine. Below is that spine plus the refinements this doc
locks in (🔸 = addition/change vs. the §11 sketch). `convex/schema.ts` already
has the un-annotated version; this is the target.

```
…authTables                                  // 🔸 Convex Auth: users, authSessions, …

spaces    { name, type: 'ongoing'|'event', icon, color,
            createdAt, lastActivityAt, eventAt?, archivedAt? }

members   { spaceId, userId: string, name, color, lastSeen }
            index by_space [spaceId]
            // userId: real auth id (live user) OR "seed:*" (crew)

widgets   { spaceId, type, x, y, w, h, z, data: any, createdBy: string, createdAt }
            index by_space [spaceId]
            // data is type-specific — see §3

messages  { spaceId, widgetId, userId: string, text, createdAt,
            authorName, authorColor, authorAvatarUrl? } // 🔸 denormalized for zero-join chat render
            index by_widget [widgetId]

votes     { widgetId, userId: string, optionId }
            index by_widget [widgetId]
            index by_widget_user [widgetId, userId]   // enforce one vote per user

presence  { spaceId, userId: string, x, y, updatedAt,
            name, color, avatarUrl? }        // 🔸 denormalized so cursors render with no join
            index by_space [spaceId]
            // ephemeral; a scheduled fn deletes rows older than ~10s
```

That's it — six app tables on top of `authTables`. No table for claims, no table
for frames, no join tables.

---

## 3. `widgets.data` shapes (the part worth nailing)

> **Superseded (2026-08-31).** The backend *does* now validate `data` — see
> `convex/widgetData.ts` for the real, shipped discriminated union (12 typed
> shapes + a permissive fallback for the rest, reverse-engineered from every
> actual producer) and the "As built" note above. The plan below is kept for
> the original per-type field reasoning; treat `widgetData.ts` as the source
> of truth for exact fields, not this section.

Backend keeps `data: v.any()` (least friction — no per-type validators). The
frontend gives it teeth with a discriminated union keyed by `widget.type`. This
union is the single most useful thing to write first; everything renders off it.

```ts
// src/lib/widgets.ts (planned)
type CountdownData = { targetDate: string;                          // YYYY-MM-DD; client ticks hrs/min/sec live
                       startDate?: string;                          // day-strip origin (crossed-off days)
                       event?: string;                              // sticker pill: "maya's bday 🎂"
                       tone?: string;                               // loud flat card color, violet default
                       hyped?: string[] };                          // member names for the hype face stack
type PollOption    = { id: string; label: string };
type PollData      = { question: string; options: PollOption[];    // counts come from `votes`, not here
                       tone?: string };                             // card color: blush | butter | mint | sky | violet
type PotluckItem   = { id: string; label: string; claimedBy?: string; claimedName?: string };
type PotluckData   = { title: string; items: PotluckItem[]; tone?: string };
type NoteData      = { text: string; authorName?: string; promoted?: boolean; rotation?: number; tone?: string; kicker?: string };
type PhotoWallPhoto = { caption: string; date: string; rotate: number; by?: string; focus?: string; src?: string };
type PhotoWallData = { title?: string; tone?: string; photos: PhotoWallPhoto[] };
type DailyAnswer   = { name: string; text: string; reactions?: Record<string, string[]> }; // emoji -> reactor names
type DailyQData    = { question: string; answers: DailyAnswer[];
                       waitingOn?: string[]; tone?: string;          // same tone palette as polls
                       streak?: number;                              // group streak, days in a row answered
                       history?: { day: string; question: string;    // the flip-stack behind today's card
                                   topAnswer: { name: string; text: string }; count: number }[] };
// Answers stay scribbled out client-side until the viewer posts theirs (youAnswered /
// local answer state). A real build gates this server-side: the query returns answer
// *authors* to everyone but answer *text* only once the caller has answered.
type RsvpResponse  = { name: string; status: "yes" | "maybe" | "no" };
type RsvpData      = { title: string; responses: RsvpResponse[];    // tier-2; respond is client-local for now
                       waitingOn?: string[]; tone?: string };       // headcount = yes-count, derived
type DecisionData  = { title: string; detail?: string; author?: string; source?: string; tone?: string };
type AvailabilityMember = { name: string; slots: boolean[] };
type AvailabilityData = { title: string; days: string[]; members: AvailabilityMember[];
                          best?: string; tone?: string };
type ShelfLink = { label: string; url: string; by?: string; contributor?: string };
type LinkShelfData = { title: string; links: ShelfLink[]; tone?: string };
type LinkCardData = { url: string; title: string; description: string; imageUrl?: string;
                      siteName: string; author?: string; publishedAt?: string;
                      savedBy?: string; savedAt: number };
type PlaylistData = { title: string; stationId?: string; playedBy?: string;
                      playing?: boolean; vibes?: string[]; tone?: string;
                      song?: string; artist?: string; pickedBy?: string };
type ChatData      = { title?: string };                            // messages live in `messages`
type FrameData     = { title: string };
type SportsData    = { league: string; home: string; away: string;  // P3 stretch
                       homeScore: number; awayScore: number; clock?: string };
type WheelSlice    = { id: string; label: string };
type WheelData     = { title: string; slices: WheelSlice[]; tone?: string;
                       spinNonce?: number; resultIndex?: number; spunBy?: string };
type DualClockPlace = { label: string; tz: string };
type DualClockData = { title: string; left: DualClockPlace; right: DualClockPlace };
// Media widgets can point at a room-specific image; old rows fall back to the
// crew snapshot. Photo-wall entries use the same optional src field.
type MediaData     = { caption: string; date: string; src?: string };

// One row, narrowed by `type`:
type WidgetByType = {
  countdown: CountdownData; poll: PollData; potluck: PotluckData;
  note: NoteData; chat: ChatData; frame: FrameData; rsvp: RsvpData; photoWall: PhotoWallData; sports: SportsData;
  decision: DecisionData; availability: AvailabilityData; linkCard: LinkCardData;
  linkShelf: LinkShelfData; playlist: PlaylistData;
  wheel: WheelData; dualClock: DualClockData;
};
type WidgetType = keyof WidgetByType;
type Widget<T extends WidgetType = WidgetType> =
  Doc<"widgets"> & { type: T; data: WidgetByType[T] };
```

Render path: `switch (widget.type)` → one component per case in `src/widgets/`,
each typed to its own `data`. A `note` with `promoted: true` is exactly what the
**promote** gesture inserts — same widget type, different birth.

---

## 4. Key functions (maps to PRD §11)

| Kind | Function | Notes |
|---|---|---|
| query | `listSpaces()` | Home + rail. Returns each space + live member count + a thin preview payload. |
| query | `listWidgets(spaceId)` | Drives the canvas. Step 1 target. |
| query | `listMessages(widgetId)` | Chat stream; rows already carry `authorName`/`authorColor`. |
| query | `listPresence(spaceId)` | Cursors; rows carry `name`/`color`. |
| query | `pollResults(widgetId)` | `{ [optionId]: { count, voterNames } }` + the caller's current `optionId`. Voter names render as faces on the bars; members with no vote row render as the "waiting on" footer. |
| mutation | `createSpace`, `joinSpace`, `archiveSpace` | `joinSpace` upserts the live user's `members` row. |
| mutation | `createWidget`, `moveWidget`, `resizeWidget`, `updateWidgetData` | Drag/resize commit here. |
| mutation | `sendMessage`, `promoteMessage` | `promoteMessage` reads a message, inserts a `note` widget — the money shot. |
| mutation | `vote`, `claimItem` | `vote` upserts via `by_widget_user`; `claimItem` patches `data.items[]`. |
| presence | `updatePresence(x, y)` | Throttled ~60ms; scheduled fn clears stale rows. |

---

## 5. Frontend data structures & flow

**Two kinds of state, kept apart:**

- **Server state** — read with `useQuery`, written with `useMutation`. Never
  copied into local state "to be safe"; the query *is* the source of truth and it
  re-renders on every change (that's the live feel).
- **UI-only state** — never touches Convex:

  ```ts
  // ephemeral, per-window, React-local
  dragging:    { widgetId, dx, dy } | null   // live offset while a drag is in flight
  selectedId:  Id<"widgets"> | null
  frameGroup:  Set<Id<"widgets">>            // computed on drag-start of a frame (move-together)
  cursorRef:   useRef<{ x, y, lastSent }>    // for presence throttle
  boardScroll: ref to the board for the "back to top" reframe
  ```

**Optimistic drag (so widgets don't snap back):** while dragging, apply `dx/dy`
as a local CSS transform; on `mouseup`, fire `moveWidget`. Simplest version
commits only on drop. If a widget visibly snaps back before the server echo,
upgrade that one mutation to `useMutation(api.widgets.moveWidget).withOptimisticUpdate(...)`.

**Presence throttle:** one `mousemove` handler on the board writes through a ref;
flush `updatePresence(x, y)` at most every ~60ms. Cursors render straight from
`listPresence` (which already carries name + color).

**Identity helper:** a `useMe()` hook → the live user's `members` row for the
active space (name + color), used to attribute votes, messages, claims, and the
local cursor.

**Suggested files:**
```
src/lib/widgets.ts     WidgetData union + the render switch
src/lib/useMe.ts        current-member hook
src/lib/usePresence.ts  throttled cursor write + read
src/widgets/*.tsx       one component per widget type
src/components/         Canvas (board frame), Rail, Home — the shell
```

---

## 6. Seed data — what build step 1 needs (PRD §6 hero)

A `seed` mutation (or a `convex/seed.ts` internal mutation) inserts the crew so
the canvas has something to render before any of the live machinery exists:

- **Crew space** — `type: "ongoing"`, violet, "the crew."
- **5–6 members** — `"seed:*"` ids, distinct colors (PRD §6: more cursors = louder).
- **Loose evergreen widgets** (lived-in texture, never demoed, just *there*):
  inside-jokes **note**, half-answered "where are we going this summer" **poll**
  (with some seeded `votes`), a daily-question **poll**.
- **"Maya's bday" frame** — a `frame` widget, with three widgets positioned
  inside its bounds: a **countdown** (targetAt ≈ a few days out), a **cake poll**
  (seeded votes so bars are mid-fill), and a **potluck** (one item pre-claimed).
- **A chat widget** holding a few seeded messages, including the one we'll
  promote on camera: "let's do 6pm at our place."

Step 1 stops at: schema + `listWidgets` + render-by-type, no drag. The seed makes
that visible immediately.

---

## 7. Delta vs. current `convex/schema.ts`

The existing schema is already close. To reach this plan:
1. Add `...authTables` (after `npm i @convex-dev/auth`).
2. `messages`: add `authorName`, `authorColor`.
3. `presence`: add `name`, `color`.
4. Keep all `userId`/`createdBy` as `v.string()` (no change — confirms the call).

Everything else (spaces, members, widgets, votes, indexes) stays as written.

---

## 8. AI layer (see PRD §11.1)

Three features, one shape: a Convex **action** in `convex/ai.ts` calls Claude (Anthropic SDK, **Haiku 4.5**, structured output) and **inserts/patches a widget** — it never returns straight to the client, so results sync live like any other table write. Adds one dep (`@anthropic-ai/sdk`) + `ANTHROPIC_API_KEY` in the Convex env. No schema changes — these produce ordinary widgets.

- **Smart Promote (P1):** drag-drop calls `promoteSmart(message)` → Claude returns `{ type, data }` → insert that widget. Falls back to a plain `note` on error/timeout; plain `promoteMessage` stays as the non-AI path.
- **Catch me up (P2):** `recap(spaceId)` reads recent rows → returns a short summary (rendered in a note/panel).
- **Daily question (P3):** a cron calls `dailyQuestion(spaceId)` → inserts/updates a `poll` or `note`.

## 9. Cut lines (if time runs short, drop from the bottom)

- **AI daily-question (P3)** → first AI feature to cut; Catch-me-up next; keep Smart Promote.
- Frame **move-together** → keep frame visual-only.
- Potluck claim **races** → last-write-wins, don't guard.
- Poll optimistic UI → let the query echo do it; a ~100ms bar lag is invisible.
- `sports` widget + its `SportsData` → P3, cut first.
