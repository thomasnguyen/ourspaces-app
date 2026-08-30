export type ChatMessage = {
  id: string;
  from: string;
  fromColor?: string;
  fromEmoji?: string;
  fromAvatarUrl?: string;
  text: string;
  time: string;
  promotable?: boolean;
  /** System lines ("● you're in") land in the stream without an author row. */
  kind?: "system";
};

export type ChatThread = {
  widgetId: string;
  label: string;
  messages: ChatMessage[];
  /** Something you haven't seen — the chip shows its count. Read chips collapse to a dot. */
  unread?: boolean;
};

export const GLOBAL_THREAD: ChatThread = {
  widgetId: "global",
  label: "everyone",
  messages: [
    { id: "g1", from: "Maya", text: "ok wait cake poll is open", time: "2m" },
    { id: "g2", from: "Jules", text: "claiming balloons !!", time: "1m" },
    {
      id: "g3",
      from: "Sam",
      text: "let's do 6pm at our place",
      time: "now",
      promotable: true,
    },
  ],
};

export const LEAGUE_GLOBAL: ChatThread = {
  widgetId: "global",
  label: "everyone",
  messages: [
    { id: "l1", from: "Sam", text: "TOUCHDOWN!!!", time: "now" },
    { id: "l2", from: "Kenji", text: "refs are blind lol", time: "now" },
    { id: "l3", from: "Jules", text: "NO WAY", time: "1m" },
    { id: "l4", from: "Maya", text: "who's ordering pizza", time: "2m" },
    { id: "l5", from: "Kenji", text: "loser spins the wheel. rules are rules", time: "now" },
  ],
};

export const COUPLE_GLOBAL: ChatThread = {
  widgetId: "global",
  label: "everyone",
  messages: [
    { id: "u1", from: "ren", text: "reservation is locked for friday 🫶", time: "now" },
    { id: "u2", from: "sky", text: "playlist is dangerously good", time: "2m" },
  ],
};

export const HOUSE_GLOBAL: ChatThread = {
  widgetId: "global",
  label: "everyone",
  messages: [
    { id: "h1", from: "gigi", text: "we're OUT of toilet paper", time: "now", promotable: true },
    { id: "h2", from: "marco", text: "not it", time: "2m" },
    { id: "h3", from: "theo", text: "whoever spins dishes buys it", time: "4m" },
    { id: "h4", from: "noor", text: "the wheel has spoken before. it will speak again", time: "6m" },
  ],
};

export const CREW_WIDGET_THREADS: Record<string, ChatThread> = {
  "poll-cake": {
    widgetId: "poll-cake",
    label: "cake flavor?",
    unread: true,
    messages: [
      { id: "p1", from: "Maya", text: "matcha or riot", time: "5m" },
      { id: "p2", from: "Ash", text: "tres leches voters assemble", time: "3m" },
      { id: "p3", from: "Jules", text: "i changed my vote lol", time: "1m" },
    ],
  },
  countdown: {
    widgetId: "countdown",
    label: "7 days left",
    messages: [
      { id: "c1", from: "Kenji", text: "that's a saturday right", time: "1h" },
      { id: "c2", from: "Sam", text: "yep perfect for backyard", time: "45m" },
    ],
  },
  potluck: {
    widgetId: "potluck",
    label: "who's bringing what",
    messages: [
      { id: "f1", from: "Jules", text: "i got balloons", time: "2m" },
      { id: "f2", from: "Maya", text: "someone claim playlist pls", time: "1m" },
    ],
  },
  rsvp: {
    widgetId: "rsvp",
    label: "who's coming",
    unread: true,
    messages: [
      { id: "r1", from: "Rio", text: "might be late, save me cake", time: "20m" },
      { id: "r2", from: "Maya", text: "4 in already!!", time: "10m" },
    ],
  },
  "daily-q": {
    widgetId: "daily-q",
    label: "comfort show",
    messages: [
      { id: "d1", from: "Maya", text: "the bear s3 hits different", time: "today" },
      { id: "d2", from: "Jules", text: "survivor is comfort actually", time: "today" },
    ],
  },
  media: {
    widgetId: "media",
    label: "friday at maya's",
    messages: [
      { id: "m1", from: "Ash", text: "we look so young here", time: "jun 15" },
    ],
  },
};

export const LEAGUE_WIDGET_THREADS: Record<string, ChatThread> = {
  sports: {
    widgetId: "sports",
    label: "49ers vs seahawks",
    messages: [
      { id: "s1", from: "Sam", text: "LETS GOOOO", time: "now" },
      { id: "s2", from: "Kenji", text: "that pass was insane", time: "now" },
    ],
  },
  "pizza-poll": {
    widgetId: "pizza-poll",
    label: "pizza order?",
    messages: [
      { id: "z1", from: "Maya", text: "half pepperoni half veggie", time: "3m" },
      { id: "z2", from: "Jules", text: "veggie voters rise up", time: "2m" },
    ],
  },
};

export function getThreadsForSpace(spaceId: string) {
  if (spaceId === "league") return LEAGUE_WIDGET_THREADS;
  if (spaceId === "couple" || spaceId === "house") return {};
  return CREW_WIDGET_THREADS;
}

export function getGlobalThread(spaceId: string) {
  if (spaceId === "league") return LEAGUE_GLOBAL;
  if (spaceId === "couple") return COUPLE_GLOBAL;
  if (spaceId === "house") return HOUSE_GLOBAL;
  return GLOBAL_THREAD;
}

export function getThread(spaceId: string, widgetId: string): ChatThread {
  if (widgetId === "global") return getGlobalThread(spaceId);
  const threads = getThreadsForSpace(spaceId);
  return (
    threads[widgetId] ?? {
      widgetId,
      label: widgetId,
      messages: [],
    }
  );
}

export function getCommentCount(spaceId: string, widgetId: string): number {
  return getThread(spaceId, widgetId).messages.length;
}
