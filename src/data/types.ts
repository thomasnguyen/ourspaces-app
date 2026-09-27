/** Shared widget + space types for the look prototype. */

export type WidgetType =
  | "frame"
  | "sticker"
  | "countdown"
  | "poll"
  | "potluck"
  | "chat"
  | "note"
  | "media"
  | "dailyQ"
  | "rsvp"
  | "decision"
  | "availability"
  | "photoWall"
  | "linkCard"
  | "linkShelf"
  | "playlist"
  | "jokeRegistry"
  | "expenseSplit"
  | "itinerary"
  | "messageWall"
  | "quote"
  | "weather"
  | "sports"
  | "backendLive"
  | "wheel"
  | "dualClock"
  | "cozyColor"
  | "linkPile"
  | "hotLinks"
  | "shipPost"
  | "roundtable"
  | "letter";

export type Widget = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotate?: number;
  data: Record<string, unknown>;
};

export type LinkCardScrape = {
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
  author: string;
  publishedAt: string;
  discussionUrl: string;
  points: number;
  commentCount: number;
};

export type SpaceMember = {
  name: string;
  color: string;
  online: boolean;
};

export type SpaceMeta = {
  id: string;
  name: string;
  color: string;
  icon: string;
  canvasSize?: { width: number; height: number };
  activity: boolean;
  kind: "ongoing" | "event";
  tagline: string;
  preview?: string;
  showcase?: string;
  visitorCount?: number;
  /** The space's own AgentMail address — email in, widgets out. */
  inboxAddress?: string;
};

export type Space = SpaceMeta & {
  members: SpaceMember[];
  widgets: Widget[];
};

export type WidgetTemplate = {
  type: WidgetType;
  label: string;
  emoji: string;
  /** Still renders + shows in the widget lab, but hidden from the add-widget picker. */
  pickerHidden?: boolean;
};

export type SpaceTemplate = {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  widgets: WidgetTemplate[];
};
