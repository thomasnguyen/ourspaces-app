import type { Doc } from "../../convex/_generated/dataModel";

export type CountdownData = {
  targetDate: string;
  startDate?: string;
  event?: string;
  tone?: string;
  hyped?: string[];
};

export type PollData = {
  question: string;
  options: { id: string; label: string }[];
  tone?: string;
};

export type PotluckData = {
  title: string;
  items: { id: string; label: string; claimedBy?: string; claimedName?: string }[];
  tone?: string;
};

export type NoteData = {
  text: string;
  authorName?: string;
  promoted?: boolean;
  rotation?: number;
  tone?: string;
  kicker?: string;
};

export type DailyQData = {
  question: string;
  answers: { name: string; text: string; reactions?: Record<string, string[]> }[];
  waitingOn?: string[];
  tone?: string;
  streak?: number;
};

export type FrameData = { title: string };
export type ChatData = { title?: string };

export type WidgetByType = {
  countdown: CountdownData;
  poll: PollData;
  potluck: PotluckData;
  note: NoteData;
  dailyQuestion: DailyQData;
  frame: FrameData;
  chat: ChatData;
};

export type WidgetType = keyof WidgetByType;
export type Widget<T extends WidgetType = WidgetType> = T extends WidgetType ? Omit<Doc<"widgets">, "type" | "data"> & {
  type: T;
  data: WidgetByType[T];
} : never;
