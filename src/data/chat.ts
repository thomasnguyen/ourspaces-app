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


export const BUILD_ROOM_GLOBAL: ChatThread = {
  widgetId: "global",
  label: "everyone",
  messages: [
    { id: "br-g1", from: "Maya", text: "still working through the weekend backlog, dropping the good ones as i go", time: "12m" },
    { id: "br-g2", from: "Alex", text: "the latency one is going straight to hot", time: "8m" },
    { id: "br-g3", from: "Jordan", text: "someone keep the figma multiplayer takeaway before it scrolls", time: "4m" },
    {
      id: "br-g4",
      from: "Sam",
      text: "rule: dual-write before you backfill. never a big-bang cutover.",
      time: "now",
      promotable: true,
    },
  ],
};

/** Link discussion rides `<pile>::link:<id>` — the seeder remaps the base id. */
const LINK_THREAD = (
  linkId: string,
  label: string,
  messages: [string, string][],
): ChatThread => ({
  widgetId: `br-pile::link:${linkId}`,
  label,
  messages: messages.map(([from, text], index) => ({
    id: `${linkId}-r${index + 1}`,
    from,
    text,
    time: `${(messages.length - index) * 7}m`,
  })),
});

export const BUILD_ROOM_WIDGET_THREADS: Record<string, ChatThread> = {
  "br-table": {
    widgetId: "br-table",
    label: "how did you break into tech?",
    messages: [
      { id: "br-t1", from: "Marco", text: "bootcamp, then two years of contract work nobody wanted", time: "2h" },
      { id: "br-t2", from: "Riley", text: "support → QA → eng. the support years are still the most useful thing I did", time: "1h" },
      { id: "br-t3", from: "Priya", text: "physics phd, wrote enough simulation code that it counted", time: "48m" },
      { id: "br-t4", from: "Alex", text: "i built in public and shipped small things consistently. people noticed.", time: "22m" },
      { id: "br-t5", from: "Marco", text: "contributed to open source. those PRs got me my first interview.", time: "9m" },
    ],
  },
  "br-ship-1": {
    widgetId: "br-ship-1",
    label: "perf dashboard v2",
    messages: [
      { id: "br-s1a", from: "Sam", text: "1.4s → 90ms is absurd, what did the rollup cost you", time: "3h" },
      { id: "br-s1b", from: "Priya", text: "one cron and about 40 lines. should have done it in january", time: "2h" },
    ],
  },
  "br-ship-2": {
    widgetId: "br-ship-2",
    label: "search revamp",
    messages: [
      { id: "br-s2a", from: "Maya", text: "recency should outrank relevance for anything under a week old imo", time: "5h" },
      { id: "br-s2b", from: "Riley", text: "disagree — a stale exact match still beats a fresh fuzzy one", time: "4h" },
      { id: "br-s2c", from: "Jordan", text: "ok so it's a weight, not a switch. i'll ship both behind a flag", time: "3h" },
    ],
  },
  "br-ship-3": {
    widgetId: "br-ship-3",
    label: "v2.3.0 shipped",
    messages: [
      { id: "br-s3a", from: "Alex", text: "six days of dual write and nobody noticed. that's the win", time: "1d" },
    ],
  },
  ...Object.fromEntries(
    [
      LINK_THREAD("bl-1", "building effective agents", [
        ["Alex", "the workflow/agent split is the whole post. we've been calling a for-loop an agent for months"],
        ["Maya", "our enrichment job is a workflow and it should stay one"],
        ["Sam", "agreed. the only place i'd hand over control is retry strategy"],
      ]),
      LINK_THREAD("bl-3", "online migrations at scale", [
        ["Sam", "this is the exact shape for the events table change"],
        ["Priya", "dual write doubles the write bill for a week though"],
        ["Sam", "a week of double writes is cheaper than one bad cutover"],
      ]),
      LINK_THREAD("bl-4", "you might not need an effect", [
        ["Jordan", "we have at least four effects that are just derived state"],
        ["Riley", "the presence one is the worst offender"],
      ]),
      LINK_THREAD("bl-11", "appropriate uses for sqlite", [
        ["Marco", "genuinely think the metrics service could be sqlite"],
        ["Priya", "it could. the reason it isn't is that we wanted a second reader"],
      ]),
      LINK_THREAD("bl-12", "strong consistency models", [
        ["Maya", "printing the lattice and taping it to the wall"],
        ["Alex", "we assume linearizable in the vote path and we absolutely do not have it"],
      ]),
      LINK_THREAD("bl-17", "react 19", [
        ["Jordan", "compiler removes ~80% of our memo review comments"],
        ["Riley", "waiting one more minor. the ecosystem isn't there"],
        ["Maya", "i'd upgrade the canvas first, it's the most memo-heavy thing we own"],
      ]),
      LINK_THREAD("bl-19", "computer latency 1977-2017", [
        ["Alex", "this reframed the whole perf conversation for me"],
        ["Sam", "p99 is lying to us. felt latency is the only number a demo shows"],
        ["Marco", "the canvas drag is the one that feels bad"],
      ]),
      LINK_THREAD("bl-23", "the grug brained developer", [
        ["Marco", "complexity demon"],
        ["Riley", "our biggest one is the adapter layer nobody can explain"],
        ["Jordan", "i'll delete it if two people say delete it"],
      ]),
      LINK_THREAD("bl-29", "simon willison on llms", [
        ["Priya", "the injection posts are why the extractor can't call a mutation"],
        ["Maya", "correct and we should keep it that way"],
      ]),
      LINK_THREAD("bl-32", "designing data-intensive applications", [
        ["Jordan", "chapter 5 settles the read replica thing"],
        ["Marco", "i have never gotten past chapter 5"],
        ["Priya", "nobody has. chapter 5 is the whole book"],
      ]),
      LINK_THREAD("bl-34", "how figma's multiplayer works", [
        ["Maya", "last-writer-wins per property is enough for us"],
        ["Alex", "full crdt buys correctness we genuinely do not need"],
        ["Jordan", "keeping this one"],
      ]),
      LINK_THREAD("bl-41", "don't call yourself a programmer", [
        ["Marco", "aged unreasonably well for 2011"],
        ["Riley", "the 'you solve business problems' line is what got me leveled"],
      ]),
    ].map((thread) => [thread.widgetId, thread]),
  ),
};

export function getThreadsForSpace(spaceId: string) {
  if (spaceId === "buildroom") return BUILD_ROOM_WIDGET_THREADS;
  if (spaceId === "league") return LEAGUE_WIDGET_THREADS;
  if (spaceId === "couple" || spaceId === "house") return {};
  return CREW_WIDGET_THREADS;
}

export function getGlobalThread(spaceId: string) {
  if (spaceId === "buildroom") return BUILD_ROOM_GLOBAL;
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
