/**
 * "catch me up" — the one thing a canvas structurally cannot show you.
 *
 * You can see the board's current state by looking at it. What you can't see
 * is how it got there: that matcha overtook chocolate, that Jules claimed
 * balloons yesterday. Change over time is invisible at any canvas size, so
 * that — and only that — is what this answers.
 *
 * It never writes to the canvas. It reports, and points at where things moved.
 * Scripted for the look prototype; no model behind it.
 */

export type RecapLine = {
  text: string;
  /** Widget the change happened on — ringed on the canvas as the line lands. */
  widgetId?: string;
  /** Said in chat and never rescued onto the board. Click to go find it. */
  messageId?: string;
};

export const RECAP_SINCE = "since friday";

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
