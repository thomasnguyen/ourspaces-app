# Accounts — a persistent you

Plan written 2026-09-21, not started. Companion to `docs/data-model-plan.md` §1
(guest or join, never a wall). That rule stands: everything below sits *behind*
the door, never in front of it.

## What exists today

- **Join = email + six-digit code** (`convex/otp.ts`, AgentMail sends it).
  Entry points: the gate's "keep this on your other devices" link and the
  keep step in `SpaceMaker.tsx`. No password, ever.
- **The account persists.** Convex Auth keeps the token in localStorage; the
  `users` row carries `email`. A joined person is the same `userId` on every
  browser they sign in on.
- **The profile does not.** Name, colour, emoji and look live in this tab's
  sessionStorage (`src/live/identity.ts`). On a new device a joined person
  comes back as a fresh random persona, and presence writes that name over
  their `members` rows. The join stamp says "same you"; it isn't yet.
- **No way to sign in that reads as sign in**, no sign out, no photo upload,
  no settings surface. The identity popover (`ClaimCard` variant `popover`,
  opened by tapping your own face in the header) is the closest thing.

## The shape

One rule: **when you're joined, the account is the source of truth for who
you are.** The tab identity becomes a cache of it.

| | Guest | Joined |
|---|---|---|
| Name / colour / emoji / look | tab sessionStorage, as today | `users` row, mirrored into the tab |
| Edit | gate, popover | gate, popover, settings sheet, `#/me` |
| New device | fresh persona | sign in → your profile lands before the gate draws |
| Photo | persona looks only | persona looks **or your own photo** (Convex storage) |
| Sign out | n/a | back to a fresh guest; the account is untouched |

## Data

`users` (Convex Auth's table) already has optional `name` and `image`. Reuse
them: `name` = display name, `image` = avatar url (persona png or a storage
url). Add `color` and `emoji` by overriding the table in `convex/schema.ts`:

```ts
users: defineTable({
  ...authTables.users.validator.fields,
  color: v.optional(v.string()),
  emoji: v.optional(v.string()),
}).index("email", ["email"]).index("phone", ["phone"]),
```

**Schema cap:** `convex/schema.ts` is 7,992 chars and truncates at 8,000.
Trim the header comment (lines 7–12) before adding a byte.

New functions in `convex/auth.ts`:

- `updateProfile` (mutation, `{name?, color?, emoji?, image?}`) — patches the
  caller's own row. Refuses if `isAnonymous` (guests stay local).
- `currentUser` grows `color`, `emoji`, `image`.
- `avatarUploadUrl` — or just reuse `photos.generateUploadUrl` +
  `photos.storageUrl`; they are already public and do exactly this.

## Client rules

`src/live/useAuthIdentity.ts` is the bridge, and it grows two directions:

- **Down (hydrate):** when `currentUser` resolves with `isAnonymous === false`
  and a `name`, call `updateIdentity` with the account's name/colour/emoji/
  image. Once per session. This must land before the gate draws, so the gate
  shows "you're back, ziggy" instead of the persona picker.
- **Up (mirror):** `updateIdentity` gains a debounced (≈400ms) call to
  `updateProfile` when the account is joined. Every existing edit surface
  (gate name field, look row, popover) becomes account-backed for free.
- **Join moment:** `JoinForm` "done" already reloads. Before the reload, call
  `updateProfile` with the tab identity so the profile is on the row the
  first time. (The reload then hydrates from it: same values, no flicker.)
- **Sign out:** `signOut()` from `useAuthActions`, clear the tab identity
  key, reload. The silent anonymous sign-in makes a new guest.

Precedence when the tab and the account disagree (user signed in on a device
with an old persona in sessionStorage): **account wins**, always.

## The four surfaces

Build in this order. Each step ships on its own.

### 0. Persistence (the guts) — do first

Everything above under Data + Client rules. Visible result: sign in on your
phone, arrive as yourself. `npm run build`, then check with two browser
profiles (the read-only harness can't do this one — it needs the OTP write).

### 1. A — your face is the button (popover grows a photo tile)

The header self-chip already opens the identity popover. Add to the look row
a ninth tile: a dashed circle with a small camera glyph, label **use my
photo**. Guests see it too — tapping it opens the join form first with the
reason *"a photo of you is worth keeping — join so it follows you."* Joined:
`<input type=file accept=image/* capture=user>` → client-side square crop +
downscale to 256px on a canvas → PUT to `generateUploadUrl` → `storageUrl` →
`updateIdentity({ avatarUrl })` (which mirrors up). The tile turns into the
photo with the lime selected ring; the persona looks stay one tap away.

Copy in the popover heading once joined: *"you're ziggy · saved to you@…"*.

### 2. The door knows you (gate copy + return state)

- Beside "keep this on your other devices" add **been here before? sign in**.
  Same `JoinForm`, reason line *"type the email you joined with."*
- Joined + hydrated: the gate's name field is prefilled, the picker collapses
  to your face only (the eight looks behind a *change look* link), the
  kicker reads **you're back**. Enter walks in as before.
- A joined person signing in on a second browser lands with a stale persona
  in sessionStorage for one tick; the hydrate rule overwrites it. No copy
  needed for that.

### 3. B — settings sheet behind a gear — **UI built 2026-09-21** (rail "you" tile, `SettingsSheet.tsx`, `LookRow.tsx`, `lib/avatarPhoto.ts`; photo upload + sign out wired; persistence still step 0)

A small round gear button in the header, right of the self-chip (same black
sticker material as the invite button). Opens a sheet (`SettingsSheet.tsx`,
right-anchored on desktop, bottom on phones) with four rows:

1. **you** — name field + your face (tap → photo picker from step 1).
2. **look** — the eight personas + your photo, same row component as the gate.
3. **account** — guest: the join form inline. Joined: the email, *"saved ✓"*.
4. **sign out** — joined only. Quiet text button, no confirm.

The sheet is the one place all of it lives together; the popover keeps its
job as the fast "who am I right now" card and links to the sheet with
*"more →"*.

### 4. C — `#/me`

A page, not a sheet: `src/pages/Me.tsx`, hash route `#/me`, added to
`routeFromHash` in `App.tsx`. Same four rows as the sheet, plus **your
spaces**: every space with a `members` row for this `userId` (`by_user`
index), as room cards that link to `#/space/<slug>`. Guests get the join form
and a line saying what the page will show once they're in. The gear (step 3)
on phones can open this page instead of a sheet if the sheet gets fiddly.

## Design notes

- Tokens only. Selected ring = `--color-lime`, chrome = black sticker pills,
  no new colours. The photo tile is the only dashed stroke in the app.
- Motion: sheet enters on the house glide (`--ease-glide`, `--dur-arrive`);
  the photo tile pops on `--ease-pop` when the upload lands, same as
  `claim-look-pop`.
- Copy is flat and first person. Never "account required". Sign out is one
  word.

## Risks

- **Schema cap** (above). Free space first.
- `signIn` swaps the token but the live client keeps the old one — `JoinForm`
  reloads for this reason. Sign out needs the same reload.
- Storage urls from `ctx.storage.getUrl` are stable; no expiry handling.
- Presence and `members` copy the profile per write; they will follow the
  account within one heartbeat, no backfill needed.

## Files

| Step | Touch |
|---|---|
| 0 | `convex/schema.ts`, `convex/auth.ts`, `src/live/identity.ts`, `src/live/useAuthIdentity.ts`, `src/live/useJoin.ts`, `src/components/JoinForm.tsx` |
| 1 | `src/components/ClaimCard.tsx`, new `src/components/PhotoTile.tsx`, `src/index.css` |
| 2 | `src/components/ClaimCard.tsx`, `src/index.css` |
| 3 | new `src/components/SettingsSheet.tsx`, `src/components/Canvas.tsx` (gear), `src/index.css` |
| 4 | new `src/pages/Me.tsx`, `src/App.tsx` (route), `convex/spaces.ts` (mine query, reuse the `by_user` read), `src/index.css` |
