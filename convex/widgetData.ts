import { v, type Infer } from "convex/values";

/**
 * Typed shapes for `widgets.data`, keyed by the widget's `type` field.
 * Reverse-engineered from every producer (seed.ts, widgetDefaults.ts,
 * inbox.ts, firecrawl.ts, questions.ts, WidgetEditorPanel.tsx) and
 * cross-checked against the live shape of every widget on the deployment.
 *
 * The 12 core types with backend logic come first; the lighter-weight
 * "long tail" types follow. Every type in `src/data/types.ts` has an arm, and
 * every producer payload validates against one — nothing we ship reaches the
 * permissive record at the end of the union. See the note above
 * `fallbackData` for the two reasons it is still there.
 */

const pollData = v.object({
  question: v.string(),
  options: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      votes: v.number(),
      total: v.number(),
      voters: v.optional(v.array(v.string())),
    }),
  ),
  waitingOn: v.optional(v.array(v.string())),
  tone: v.optional(v.string()),
});

const noteData = v.object({
  text: v.string(),
  author: v.optional(v.string()),
  tone: v.optional(v.string()),
  kicker: v.optional(v.string()),
  title: v.optional(v.string()),
  pin: v.optional(v.boolean()),
  remembered: v.optional(v.boolean()),
  promoted: v.optional(v.boolean()),
});

// Doubles as the "decision made" card promoted from a chat message
// (convex/messages.ts promoteMessage) — promotedFromMessageId dedupes it.
const decisionData = v.object({
  title: v.optional(v.string()),
  detail: v.optional(v.string()),
  author: v.optional(v.string()),
  source: v.optional(v.string()),
  tone: v.optional(v.string()),
  promotedFromMessageId: v.optional(v.id("messages")),
});

const countdownData = v.object({
  event: v.optional(v.string()),
  targetDate: v.optional(v.string()),
  startDate: v.optional(v.string()),
  hyped: v.optional(v.array(v.string())),
  tone: v.optional(v.string()),
});

// Matches firecrawl.ts's scrape payload plus the savedBy/savedAt/questions
// fields the app layers on before persisting.
const linkCardData = v.object({
  url: v.string(),
  title: v.string(),
  description: v.string(),
  imageUrl: v.string(),
  siteName: v.string(),
  author: v.string(),
  publishedAt: v.string(),
  savedBy: v.string(),
  savedAt: v.number(),
  discussionUrl: v.optional(v.string()),
  points: v.optional(v.number()),
  commentCount: v.optional(v.number()),
  questions: v.optional(v.array(v.object({ id: v.string(), text: v.string() }))),
});

// Mail-sourced letters set fromAddress + unfiled; seeded ones don't.
// `because` is the router's one-line reason, shown on the flap (B1).
const letterData = v.object({
  from: v.optional(v.string()),
  fromAddress: v.optional(v.string()),
  subject: v.optional(v.string()),
  text: v.optional(v.string()),
  receivedAt: v.optional(v.number()),
  sealed: v.optional(v.boolean()),
  unfiled: v.optional(v.boolean()),
  because: v.optional(v.string()),
});

const photoWallData = v.object({
  title: v.optional(v.string()),
  tone: v.optional(v.string()),
  photos: v.array(
    v.object({
      caption: v.string(),
      date: v.string(),
      rotate: v.number(),
      by: v.optional(v.string()),
      focus: v.optional(v.string()),
      src: v.optional(v.string()),
      thumbnailSrc: v.optional(v.string()),
      // Set only by convex/photos.ts addPhoto (uploaded prints, not seeds).
      id: v.optional(v.id("_storage")),
      addedAt: v.optional(v.number()),
    }),
  ),
});

const expenseSplitData = v.object({
  title: v.string(),
  total: v.number(),
  splits: v.array(v.object({ name: v.string(), owes: v.number(), paid: v.number() })),
  kicker: v.optional(v.string()),
  lastEmail: v.optional(
    v.object({
      who: v.string(),
      amount: v.number(),
      label: v.string(),
      because: v.optional(v.string()),
    }),
  ),
});

const itineraryData = v.object({
  title: v.string(),
  days: v.array(v.object({ day: v.string(), plan: v.string() })),
  lastEmail: v.optional(
    v.object({ day: v.string(), plan: v.string(), because: v.optional(v.string()) }),
  ),
});

// claimItem (convex/widgets.ts) toggles claimed/by/byUserId per item.
const potluckData = v.object({
  title: v.string(),
  kicker: v.optional(v.string()),
  tone: v.optional(v.string()),
  items: v.array(
    v.object({
      name: v.string(),
      claimed: v.boolean(),
      by: v.optional(v.union(v.string(), v.null())),
      byUserId: v.optional(v.string()),
    }),
  ),
  openCount: v.optional(v.number()),
});

// One row per person, keyed by `userId` — an RSVP is "who said yes", so a
// second browser has to be a second row, not an overwrite. Seeded rows have
// no userId and read as everybody else (LiveSpace.tsx).
const rsvpData = v.object({
  title: v.string(),
  responses: v.array(
    v.object({
      name: v.string(),
      status: v.union(v.literal("yes"), v.literal("maybe"), v.literal("no")),
      userId: v.optional(v.string()),
    }),
  ),
  waitingOn: v.optional(v.array(v.string())),
  waitingNote: v.optional(v.string()),
  tone: v.optional(v.string()),
});

const dailyQData = v.object({
  question: v.string(),
  tone: v.optional(v.string()),
  streak: v.optional(v.number()),
  youAnswered: v.optional(v.boolean()),
  waitingOn: v.optional(v.array(v.string())),
  // Same rule as rsvp: one answer per identity, so `userId` is the key and a
  // second browser is a second person. `reactions` stays the seeded emoji →
  // names tally; live reactions go in `reactedBy` (userId → emoji) so one
  // person can only hold one reaction per answer. The two are folded together
  // for render in LiveSpace.tsx.
  answers: v.array(
    v.object({
      name: v.string(),
      text: v.string(),
      userId: v.optional(v.string()),
      reactions: v.optional(v.record(v.string(), v.array(v.string()))),
      reactedBy: v.optional(v.record(v.string(), v.string())),
    }),
  ),
  history: v.optional(
    v.array(
      v.object({
        day: v.string(),
        question: v.string(),
        topAnswer: v.object({ name: v.string(), text: v.string() }),
        count: v.number(),
      }),
    ),
  ),
});


// ---------------------------------------------------------------------------
// Long tail — light widgets with no shared backend logic. Typed anyway so the
// union describes what we actually ship. Only fields present on every live
// instance are required; the rest are optional.
// ---------------------------------------------------------------------------

const frameData = v.object({
  title: v.string(),
  subtitle: v.string(),
  deco: v.optional(v.string()),
});

const stickerData = v.object({ stickerId: v.string() });

// Seeded prints carry both paths; a fresh "photo" added from the picker is
// caption + date only until someone points it at an image.
const mediaData = v.object({
  caption: v.string(),
  date: v.string(),
  src: v.optional(v.string()),
  thumbnailSrc: v.optional(v.string()),
});

const availabilityData = v.object({
  title: v.string(),
  tone: v.string(),
  best: v.string(),
  days: v.array(v.string()),
  members: v.array(
    v.object({ name: v.string(), slots: v.array(v.boolean()) }),
  ),
});

const linkShelfData = v.object({
  title: v.string(),
  tone: v.string(),
  links: v.array(
    v.object({ label: v.string(), url: v.string(), by: v.string() }),
  ),
});

// `tone` is absent on the seeded rows but written by both the picker's fresh
// payload and the editor panel — optional, not missing.
const playlistData = v.object({
  title: v.string(),
  stationId: v.string(),
  playing: v.boolean(),
  playedBy: v.string(),
  vibes: v.array(v.string()),
  tone: v.optional(v.string()),
});

const jokeRegistryData = v.object({
  title: v.string(),
  jokes: v.array(v.object({ text: v.string(), votes: v.number() })),
});

const messageWallData = v.object({
  title: v.string(),
  messages: v.array(v.object({ from: v.string(), text: v.string() })),
});

// The prototype chat card. Real chat lives in the `messages` table; this holds
// only the canned transcript the card renders before it is wired to a thread.
const chatData = v.object({
  messages: v.array(
    v.object({
      from: v.string(),
      text: v.string(),
      time: v.optional(v.string()),
      promotable: v.optional(v.boolean()),
    }),
  ),
});

// Counts are overwritten from live queries on render (Canvas.tsx); the stored
// copy is just the placeholder the widget is born with.
const backendLiveData = v.object({
  counts: v.array(v.object({ label: v.string(), value: v.number() })),
});

const quoteData = v.object({
  text: v.string(),
  author: v.string(),
  week: v.string(),
});

const weatherData = v.object({
  event: v.string(),
  date: v.string(),
  temp: v.number(),
  condition: v.string(),
  note: v.string(),
});

const sportsTeam = v.object({
  team: v.string(),
  score: v.number(),
  color: v.string(),
});

const sportsData = v.object({
  sport: v.string(),
  status: v.string(),
  clock: v.string(),
  quarter: v.string(),
  home: sportsTeam,
  away: sportsTeam,
});

const wheelData = v.object({
  title: v.string(),
  tone: v.string(),
  slices: v.array(v.object({ id: v.string(), label: v.string() })),
  resultIndex: v.number(),
  spinNonce: v.number(),
  spunBy: v.string(),
});

const dualClockFace = v.object({ label: v.string(), tz: v.string() });

const dualClockData = v.object({
  title: v.string(),
  left: dualClockFace,
  right: dualClockFace,
});

const cozyColorData = v.object({ title: v.string(), src: v.string() });

// One link dropped into the reading pile — by inbound mail (convex/inbox.ts)
// or by hand in the reading room. Exported so inbox.ts validates against the
// same shape it writes, instead of keeping a second copy.
export const droppedLinkValidator = v.object({
  id: v.string(),
  url: v.string(),
  domain: v.string(),
  title: v.string(),
  description: v.string(),
  imageUrl: v.string(),
  kind: v.string(),
  whyItMatters: v.string(),
  questions: v.array(v.object({ id: v.string(), text: v.string() })),
  status: v.string(),
  batchKey: v.string(),
  droppedBy: v.string(),
  droppedByName: v.string(),
  droppedAt: v.number(),
  voters: v.array(v.string()),
});

// The partial written back once a scrape resolves (or fails).
export const droppedLinkPatchValidator = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  domain: v.optional(v.string()),
  whyItMatters: v.optional(v.string()),
  questions: v.optional(
    v.array(v.object({ id: v.string(), text: v.string() })),
  ),
  status: v.optional(v.string()),
});

// hotLinks renders from the reading-room feed. linkPile owns the rows: the
// `dropped` array plus `linkState`, a per-link UI map keyed by dynamic link
// id (src/lib/buildRoomFeed.ts), which is a record by nature.
const linkPileData = v.object({
  title: v.string(),
  cta: v.string(),
  dropped: v.optional(v.array(droppedLinkValidator)),
  linkState: v.optional(v.record(v.string(), v.any())),
});

const hotLinksData = v.object({ title: v.string(), limit: v.number() });

const shipPostData = v.object({
  title: v.string(),
  body: v.string(),
  by: v.string(),
  date: v.string(),
  imageUrl: v.string(),
  feedbackWanted: v.optional(v.boolean()),
});

const roundtableData = v.object({
  title: v.string(),
  body: v.string(),
  category: v.string(),
});

// Last resort. Nothing we ship lands here: all 32 types in src/data/types.ts
// have an arm above, and every producer payload (seed, picker defaults, editor
// panel, inbox, firecrawl) was replayed against the typed arms alone and
// passed. It stays for the two cases the arms can't cover:
//   1. `widgets.updateWidgetData` and `questions.setQuestions` patch a widget
//      by id without checking its `type`, so a shape can drift off-arm.
//   2. Rows written to prod before this union landed can't be inspected from
//      dev, and a row that fails validation blocks the deploy, not just the
//      write.
// Verify prod's widget shapes, then delete this arm and its union entry.
const fallbackData = v.record(v.string(), v.any());

export const widgetDataValidator = v.union(
  pollData,
  noteData,
  decisionData,
  countdownData,
  linkCardData,
  letterData,
  photoWallData,
  expenseSplitData,
  itineraryData,
  potluckData,
  rsvpData,
  dailyQData,
  frameData,
  stickerData,
  mediaData,
  availabilityData,
  linkShelfData,
  playlistData,
  jokeRegistryData,
  messageWallData,
  chatData,
  backendLiveData,
  quoteData,
  weatherData,
  sportsData,
  wheelData,
  dualClockData,
  cozyColorData,
  linkPileData,
  hotLinksData,
  shipPostData,
  roundtableData,
  fallbackData,
);

// Per-type TS shapes for call sites that read/write one widget type's data
// generically (the sibling `type` field isn't a literal tag inside `data`,
// so TS can't narrow the union just from a `widget.type === "..."` check —
// cast through these at the point the code already knows the type by
// convention).
export type PollData = Infer<typeof pollData>;
export type NoteData = Infer<typeof noteData>;
export type DecisionData = Infer<typeof decisionData>;
export type CountdownData = Infer<typeof countdownData>;
export type LinkCardData = Infer<typeof linkCardData>;
export type LetterData = Infer<typeof letterData>;
export type PhotoWallData = Infer<typeof photoWallData>;
export type ExpenseSplitData = Infer<typeof expenseSplitData>;
export type ItineraryData = Infer<typeof itineraryData>;
export type PotluckData = Infer<typeof potluckData>;
export type RsvpData = Infer<typeof rsvpData>;
export type DailyQData = Infer<typeof dailyQData>;
export type FallbackWidgetData = Infer<typeof fallbackData>;
export type WidgetData = Infer<typeof widgetDataValidator>;
