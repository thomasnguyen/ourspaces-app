/**
 * "catch me up" — the one thing a canvas structurally cannot show you.
 *
 * You can see the board's current state by looking at it. What you can't see
 * is how it got there: that matcha overtook chocolate, that Jules claimed
 * balloons yesterday. Change over time is invisible at any canvas size, so
 * that — and only that — is what this answers.
 *
 * It never writes to the canvas. It reports, and points at where things moved.
 * Live mode reads the cached row from convex/recap.ts. ↻ regenerates on
 * demand. The daily cron is paused until closer to the hackathon deadline.
 * Follow-up chat rides the `recap` message thread. Mock mode keeps the
 * scripted lines.
 */

export type RecapLine = {
  text: string;
  /** Widget the change happened on — ringed on the canvas as the line lands. */
  widgetId?: string;
  /** Said in chat and never rescued onto the board. Click to go find it. */
  messageId?: string;
};

/** Shared follow-up thread — rides `messages.widgetId`, hidden from global chat. */
export const RECAP_THREAD_ID = "recap";

export type RecapTurn = {
  id: string;
  from: string;
  fromColor?: string;
  fromEmoji?: string;
  fromAvatarUrl?: string;
  text: string;
  isRecap: boolean;
};

export const RECAP_SINCE = "since friday";

/** Models sometimes echo Convex ids into the sentence. Never show those. */
export function cleanRecapText(text: string) {
  return text
    .replace(/\s*\(([a-z0-9]{16,})\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const RECAP_LINES: RecapLine[] = [
  {
    text: "Jules claimed balloons, so two items are still open",
    widgetId: "potluck",
  },
  {
    text: "matcha pulled ahead of chocolate, 3 to 1",
    widgetId: "poll-cake",
  },
  {
    text: "Sam said 6pm at their place, and it's still only in chat",
    messageId: "g3",
  },
];

/** How the reveal is paced — the sequence is what makes it feel considered. */
export const RECAP_THINKING_MS = 900;
export const RECAP_LINE_MS = 300;
export const RECAP_STREAM_MS = 16;
export const RECAP_STREAM_CHARS = 2;
