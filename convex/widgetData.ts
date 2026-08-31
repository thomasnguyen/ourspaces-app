import { v, type Infer } from "convex/values";

/**
 * Typed shapes for `widgets.data`, keyed by the widget's `type` field.
 * Covers the 12 core widget types with real structured data (reverse-
 * engineered from every producer: seed.ts, widgetDefaults.ts, inbox.ts,
 * firecrawl.ts, questions.ts, WidgetEditorPanel.tsx). The remaining ~19
 * lighter-weight widget types (frame, sticker, chat, media, wheel, etc.)
 * share the permissive record fallback below — a discriminated union arm
 * per type isn't worth it for widgets with no real backend logic.
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
const letterData = v.object({
  from: v.optional(v.string()),
  fromAddress: v.optional(v.string()),
  subject: v.optional(v.string()),
  text: v.optional(v.string()),
  receivedAt: v.optional(v.number()),
  sealed: v.optional(v.boolean()),
  unfiled: v.optional(v.boolean()),
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
    v.object({ who: v.string(), amount: v.number(), label: v.string() }),
  ),
});

const itineraryData = v.object({
  title: v.string(),
  days: v.array(v.object({ day: v.string(), plan: v.string() })),
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

const rsvpData = v.object({
  title: v.string(),
  responses: v.array(
    v.object({
      name: v.string(),
      status: v.union(v.literal("yes"), v.literal("maybe"), v.literal("no")),
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
  answers: v.array(
    v.object({
      name: v.string(),
      text: v.string(),
      reactions: v.optional(v.record(v.string(), v.array(v.string()))),
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

// The long tail (frame, sticker, chat, media, linkPile, wheel, playlist,
// availability, linkShelf, jokeRegistry, messageWall, quote, weather,
// sports, backendLive, dualClock, cozyColor, hotLinks, shipPost,
// roundtable, …) — no shared backend logic reads into these, so a fully
// typed arm buys nothing. linkPile's own `linkState` sub-map is keyed by
// dynamic ids and is a record even in its own right (src/lib/buildRoomFeed.ts).
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
