import type { Space, SpaceMeta, Widget } from "./types";

export type { Widget, Space, SpaceMeta, WidgetType } from "./types";

/** Local YYYY-MM-DD offset from today — keeps seeded countdowns evergreen. */
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const CREW_MEMBERS = [
  { name: "Maya", color: "#7c5cff", online: true },
  { name: "Jules", color: "#e63da8", online: true },
  { name: "Sam", color: "#3d6eff", online: true },
  { name: "Rio", color: "#ff7a3d", online: false },
  { name: "Kenji", color: "#13b8a6", online: true },
  { name: "Ash", color: "#c6f750", online: false },
];

export const CREW_WIDGETS: Widget[] = [
  // ── movable decor ──
  {
    id: "sticker-glad",
    type: "sticker",
    x: 258,
    y: 104,
    w: 116,
    h: 156,
    z: 12,
    rotate: -5,
    data: { stickerId: "glad-ur-here" },
  },
  {
    id: "sticker-since",
    type: "sticker",
    x: 1390,
    y: 492,
    w: 105,
    h: 160,
    z: 12,
    rotate: 4,
    data: { stickerId: "since-19" },
  },
  {
    id: "sticker-double-smile",
    type: "sticker",
    x: 1004,
    y: 840,
    w: 129,
    h: 160,
    z: 12,
    rotate: -4,
    data: { stickerId: "double-smile" },
  },

  // ── left column: memory ──
  {
    id: "media",
    type: "media",
    x: 32,
    y: 48,
    w: 300,
    h: 220,
    z: 4,
    rotate: -2,
    data: {
      caption: "friday at maya's",
      date: "jun 14",
      src: "/photos/crew/friday-at-mayas.jpg",
      thumbnailSrc: "/photos/thumbs/crew/friday-at-mayas.jpg",
    },
  },
  {
    id: "photo-wall",
    type: "photoWall",
    x: 32,
    y: 292,
    w: 300,
    h: 200,
    z: 4,
    data: {
      title: "recent memories",
      tone: "blush",
      photos: [
        {
          caption: "roof dusk",
          date: "aug 29",
          rotate: 2,
          by: "Jules",
          src: "/photos/crew/roof-dusk.jpg",
          thumbnailSrc: "/photos/thumbs/crew/roof-dusk.jpg",
          focus: "center 52%",
        },
        {
          caption: "paint night",
          date: "jul 20",
          rotate: -5,
          by: "Ash",
          src: "/photos/crew/paint-night.jpg",
          thumbnailSrc: "/photos/thumbs/crew/paint-night.jpg",
          focus: "center 50%",
        },
        {
          caption: "friday at maya's",
          date: "jun 14",
          rotate: 4,
          by: "Maya",
          src: "/photos/crew/friday-at-mayas.jpg",
          thumbnailSrc: "/photos/thumbs/crew/friday-at-mayas.jpg",
          focus: "center 45%",
        },
        {
          caption: "pizza night",
          date: "fri",
          rotate: -3,
          by: "Jules",
          src: "/photos/crew/pizza-night.jpg",
          thumbnailSrc: "/photos/thumbs/crew/pizza-night.jpg",
          focus: "center 48%",
        },
        {
          caption: "rio in socks",
          date: "mar 2",
          rotate: -5,
          by: "Ash",
          src: "/photos/crew/rio-socks.jpg",
          thumbnailSrc: "/photos/thumbs/crew/rio-socks.jpg",
          focus: "center 35%",
        },
        {
          caption: "tahoe sunrise",
          date: "feb 18",
          rotate: 4,
          by: "Kenji",
          src: "/photos/crew/tahoe-sunrise.jpg",
          thumbnailSrc: "/photos/thumbs/crew/tahoe-sunrise.jpg",
          focus: "center 65%",
        },
        {
          caption: "things we left behind",
          date: "sun",
          rotate: -1,
          by: "Maya",
          src: "/photos/crew/camera-roll.jpg",
          thumbnailSrc: "/photos/thumbs/crew/camera-roll.jpg",
          focus: "center 50%",
        },
      ],
    },
  },
  {
    id: "note-joke",
    type: "note",
    x: 32,
    y: 516,
    w: 280,
    h: 160,
    z: 2,
    rotate: -2,
    data: {
      text: "remember when rio got locked out in socks",
      author: "Ash",
      tone: "warm",
    },
  },
  {
    id: "joke-registry",
    type: "jokeRegistry",
    x: 32,
    y: 700,
    w: 300,
    h: 148,
    z: 2,
    data: {
      title: "inside joke hall of fame",
      jokes: [
        { text: "rio in socks incident", votes: 12 },
        { text: "sam's 6pm energy", votes: 8 },
        { text: "kenji's tahoe voice", votes: 6 },
      ],
    },
  },

  // ── center: birthday frame ──
  // Collage physics: staggered tops, hand-placed tilts, deliberate overlaps
  // (poll over countdown, notes tucked under the rsvp) so the party corner
  // reads pinned-up, not dashboard. z tells the layering story.
  {
    id: "frame-bday",
    type: "frame",
    x: 352,
    y: 48,
    w: 688,
    h: 560,
    z: 0,
    data: { title: "Maya's bday", subtitle: "party HQ", deco: "party" },
  },
  {
    id: "countdown",
    type: "countdown",
    x: 372,
    y: 106,
    w: 186,
    h: 262,
    z: 2,
    rotate: -1.8,
    data: {
      event: "maya's bday 🎂",
      targetDate: isoDaysFromNow(7),
      startDate: isoDaysFromNow(-5),
      hyped: ["Maya", "Jules", "Sam", "Kenji"],
    },
  },
  {
    id: "poll-cake",
    type: "poll",
    x: 546,
    y: 122,
    w: 244,
    h: 234,
    z: 4,
    rotate: 1.3,
    data: {
      question: "cake flavor?",
      options: [
        { id: "a", label: "matcha", votes: 3, total: 5, voters: ["Maya", "Jules", "Sam"] },
        { id: "b", label: "chocolate", votes: 1, total: 5, voters: ["Kenji"] },
        { id: "c", label: "tres leches", votes: 1, total: 5, voters: ["Rio"] },
      ],
      waitingOn: ["Ash"],
    },
  },
  {
    id: "rsvp",
    type: "rsvp",
    x: 814,
    y: 90,
    w: 196,
    h: 250,
    z: 3,
    rotate: -1.2,
    data: {
      title: "who's coming",
      responses: [
        { name: "Maya", status: "yes" },
        { name: "Jules", status: "yes" },
        { name: "Sam", status: "yes" },
        { name: "Kenji", status: "yes" },
        { name: "Ash", status: "no" },
      ],
      waitingOn: ["Rio"],
      waitingNote: "might be late, save me cake",
    },
  },
  {
    id: "potluck",
    type: "potluck",
    x: 378,
    y: 372,
    w: 392,
    h: 158,
    z: 2,
    rotate: 0.9,
    data: {
      title: "who's bringing what",
      kicker: "party prep",
      tone: "violet",
      openCount: 2,
      items: [
        { name: "balloons", by: "Jules", claimed: true },
        { name: "playlist", by: null, claimed: false },
        { name: "sparkling water", by: "Sam", claimed: true },
        { name: "candles", by: null, claimed: false },
      ],
    },
  },
  {
    id: "message-wall",
    type: "messageWall",
    x: 806,
    y: 354,
    w: 234,
    h: 248,
    z: 2,
    data: {
      title: "birthday messages",
      messages: [
        { from: "Jules", text: "happy almost-bday queen 👑" },
        { from: "Kenji", text: "can't wait to celebrate u" },
        { from: "Ash", text: "matcha cake or riot" },
      ],
    },
  },
  {
    id: "sticker-bday-cake",
    type: "sticker",
    x: 708,
    y: 10,
    w: 122,
    h: 126,
    z: 12,
    rotate: 4,
    data: { stickerId: "maya-cake" },
  },

  // ── right column: live (chat lives in the global drawer) ──
  {
    id: "daily-q",
    type: "dailyQ",
    x: 1064,
    y: 48,
    w: 290,
    h: 238,
    z: 3,
    data: {
      question: "what's your current comfort show?",
      tone: "butter",
      streak: 12,
      waitingOn: ["Ash", "Kenji"],
      answers: [
        { name: "Maya", text: "the bear", reactions: { "😂": ["Jules"] } },
        { name: "Jules", text: "survivor (again)" },
        { name: "Sam", text: "avatar" },
      ],
      history: [
        {
          day: "yesterday",
          question: "most likely to text their ex?",
          topAnswer: { name: "Sam", text: "ash. not even a debate" },
          count: 6,
        },
        {
          day: "tuesday",
          question: "song of the summer so far?",
          topAnswer: { name: "Rio", text: "espresso, obviously" },
          count: 5,
        },
      ],
    },
  },
  {
    id: "link-shelf",
    type: "linkShelf",
    x: 1064,
    y: 344,
    w: 290,
    h: 145,
    z: 3,
    data: {
      title: "saved links",
      tone: "violet",
      links: [
        { label: "matcha cake recipe", url: "bonappetit.com", by: "Maya" },
        { label: "sam's place (maps)", url: "maps.google.com", by: "Sam" },
        { label: "party playlist", url: "open.spotify.com", by: "Jules" },
      ],
    },
  },
  {
    id: "playlist",
    type: "playlist",
    x: 1064,
    y: 513,
    w: 290,
    h: 176,
    z: 3,
    rotate: -1,
    data: {
      title: "now playing",
      stationId: "indiepop",
      playedBy: "Jules",
      playing: false,
      vibes: ["Maya", "Sam", "Kenji"],
    },
  },

  // ── far right ──
  {
    id: "quote",
    type: "quote",
    x: 1378,
    y: 48,
    w: 220,
    h: 110,
    z: 3,
    rotate: 1.5,
    data: {
      text: "we don't cancel, we reschedule emotionally",
      author: "Jules",
      week: "week 29",
    },
  },
  {
    id: "weather",
    type: "weather",
    x: 1378,
    y: 182,
    w: 220,
    h: 115,
    z: 3,
    data: {
      event: "party day",
      date: "jul 26",
      temp: 74,
      condition: "sunny",
      note: "perfect for the backyard",
    },
  },
  {
    id: "expense-split",
    type: "expenseSplit",
    x: 1378,
    y: 314,
    w: 240,
    h: 200,
    z: 3,
    rotate: 1,
    data: {
      title: "tahoe trip IOUs",
      total: 847,
      splits: [
        { name: "Maya", owes: 0, paid: 320 },
        { name: "Jules", owes: 42, paid: 0 },
        { name: "Sam", owes: 18, paid: 180 },
        { name: "Kenji", owes: 0, paid: 347 },
      ],
    },
  },

  // ── bottom row: planning ──
  {
    id: "note-summer",
    type: "note",
    x: 352,
    y: 640,
    w: 260,
    h: 125,
    z: 2,
    data: {
      text: "summer shortlist: portland / joshua tree / nowhere",
      author: "Kenji",
      tone: "white",
      kicker: "summer maybe?",
    },
  },
  {
    id: "frame-japan",
    type: "frame",
    x: 952,
    y: 700,
    w: 430,
    h: 272,
    z: 1,
    data: {
      title: "japan trip",
      subtitle: "email bookings to thecrew@ ✉",
    },
  },
  {
    id: "itinerary",
    type: "itinerary",
    x: 986,
    y: 748,
    w: 300,
    h: 200,
    z: 2,
    rotate: 1,
    data: {
      title: "japan · nov 6–14",
      days: [
        { day: "nov 6", plan: "land HND · ramen night" },
        { day: "nov 8", plan: "kyoto day trip" },
        { day: "nov 11", plan: "??? — forward a booking" },
      ],
    },
  },
  {
    id: "availability",
    type: "availability",
    x: 352,
    y: 845,
    w: 470,
    h: 186,
    z: 2,
    data: {
      title: "when can we all meet?",
      days: ["Fri", "Sat", "Sun"],
      members: [
        { name: "Maya", slots: [true, false, true] },
        { name: "Jules", slots: [true, true, false] },
        { name: "Sam", slots: [false, true, true] },
        { name: "Kenji", slots: [true, true, true] },
      ],
      best: "Sat",
      tone: "sky",
    },
  },
];

export const LEAGUE_WIDGETS: Widget[] = [
  {
    id: "frame-game",
    type: "frame",
    x: 56,
    y: 48,
    w: 700,
    h: 346,
    z: 0,
    data: { title: "game day", subtitle: "kickoff 1:25 · wings at sam's" },
  },
  {
    id: "sports",
    type: "sports",
    x: 92,
    y: 100,
    w: 628,
    h: 250,
    z: 2,
    data: {
      sport: "nfl",
      home: { team: "49ers", score: 24, color: "#aa0000" },
      away: { team: "Seahawks", score: 21, color: "#002244" },
      quarter: "Q4",
      clock: "2:34",
      status: "live",
    },
  },
  {
    id: "pizza-poll",
    type: "poll",
    x: 56,
    y: 434,
    w: 280,
    h: 220,
    z: 3,
    data: {
      question: "pizza order?",
      tone: "mint",
      options: [
        { id: "a", label: "pepperoni", votes: 2, total: 4, voters: ["Sam", "Kenji"] },
        { id: "b", label: "veggie", votes: 1, total: 4, voters: ["Jules"] },
        { id: "c", label: "half & half", votes: 1, total: 4, voters: ["Maya"] },
      ],
    },
  },
  {
    id: "league-quote",
    type: "quote",
    x: 366,
    y: 434,
    w: 240,
    h: 120,
    z: 3,
    data: {
      text: "fantasy is just friendship with spreadsheets",
      author: "Kenji",
      week: "week 29",
    },
  },
  {
    id: "league-daily",
    type: "dailyQ",
    x: 636,
    y: 434,
    w: 260,
    h: 180,
    z: 3,
    data: {
      question: "bold take: who's winning the league?",
      tone: "mint",
      streak: 4,
      youAnswered: true,
      waitingOn: ["Jules"],
      answers: [
        { name: "Sam", text: "me, obviously", reactions: { "😂": ["Kenji", "Rio"] } },
        { name: "Kenji", text: "statistically jules" },
      ],
      history: [
        {
          day: "yesterday",
          question: "worst trade of the season?",
          topAnswer: { name: "Jules", text: "sam's entire draft" },
          count: 5,
        },
      ],
    },
  },
  {
    id: "league-wheel",
    type: "wheel",
    x: 920,
    y: 48,
    w: 280,
    h: 330,
    z: 3,
    data: {
      title: "loser's punishment",
      tone: "mint",
      slices: [
        { id: "a", label: "rival jersey" },
        { id: "b", label: "wings next wk" },
        { id: "c", label: "post the L" },
        { id: "d", label: "5k saturday" },
        { id: "e", label: "cleanup duty" },
        { id: "f", label: "loser speech" },
      ],
      spinNonce: 0,
      resultIndex: 2,
      spunBy: "Kenji",
    },
  },
  {
    id: "league-wall",
    type: "messageWall",
    x: 56,
    y: 690,
    w: 840,
    h: 130,
    z: 3,
    data: {
      title: "trash talk",
      messages: [
        { from: "Sam", text: "scoreboard says i'm right" },
        { from: "Kenji", text: "refs and jules are both blind" },
        { from: "Jules", text: "screenshot this for next week" },
        { from: "Maya", text: "i'm just here for the pizza" },
      ],
    },
  },
];

const COUPLE_MEMBERS = [
  { name: "ren", color: "#e9369d", online: true },
  { name: "sky", color: "#7c5cff", online: true },
];

const HOUSE_MEMBERS = [
  { name: "noor", color: "#ffb02e", online: true },
  { name: "theo", color: "#3f70ff", online: false },
  { name: "gigi", color: "#e9369d", online: true },
  { name: "marco", color: "#13b8a6", online: false },
];

export const COUPLE_WIDGETS: Widget[] = [
  {
    id: "us-countdown",
    type: "countdown",
    x: 48,
    y: 52,
    w: 180,
    h: 250,
    z: 2,
    rotate: -2,
    data: {
      event: "half-year ♥",
      targetDate: isoDaysFromNow(142),
      startDate: isoDaysFromNow(-10),
      hyped: ["ren", "sky"],
    },
  },
  {
    id: "us-sfo",
    type: "countdown",
    x: 48,
    y: 316,
    w: 180,
    h: 250,
    z: 2,
    rotate: 2,
    data: {
      event: "SFO ✈",
      targetDate: isoDaysFromNow(47),
      startDate: isoDaysFromNow(-30),
      hyped: ["ren", "sky"],
    },
  },
  {
    id: "us-playlist",
    type: "playlist",
    x: 268,
    y: 52,
    w: 300,
    h: 176,
    z: 3,
    data: {
      title: "songs for the flight",
      stationId: "lush",
      playedBy: "sky",
      playing: false,
      vibes: ["ren"],
    },
  },
  {
    id: "us-media",
    type: "media",
    x: 268,
    y: 238,
    w: 340,
    h: 230,
    z: 3,
    data: { caption: "last visit, last day", date: "march", src: "/photos/couple/last-visit.jpg", thumbnailSrc: "/photos/thumbs/couple/last-visit.jpg" },
  },
  {
    id: "us-color",
    type: "cozyColor",
    x: 630,
    y: 52,
    w: 560,
    h: 500,
    z: 4,
    data: {
      title: "same moon, both windows",
      src: "/assets/cozy-color-same-moon.png",
    },
  },
  {
    id: "us-note",
    type: "note",
    x: 650,
    y: 600,
    w: 280,
    h: 160,
    z: 2,
    rotate: 2,
    data: {
      text: "airport pickup: i'm holding the embarrassing sign",
      author: "ren",
      tone: "warm",
      kicker: "SFO plan",
    },
  },
  {
    id: "us-quote",
    type: "quote",
    x: 956,
    y: 602,
    w: 250,
    h: 132,
    z: 3,
    rotate: -2,
    data: {
      text: "same moon, both windows",
      author: "ren",
      week: "always",
    },
  },
  {
    id: "us-clocks",
    type: "dualClock",
    x: 268,
    y: 476,
    w: 340,
    h: 150,
    z: 3,
    data: {
      title: "an ocean apart",
      left: { label: "sky", tz: "America/Los_Angeles" },
      right: { label: "ren", tz: "Asia/Seoul" },
    },
  },
  {
    id: "us-letter",
    type: "letter",
    x: 64,
    y: 626,
    w: 250,
    h: 168,
    z: 20,
    rotate: -2,
    data: {
      from: "ren",
      subject: "day 49",
      text: "hey you,\n\nI walked past the bakery on Sokcho street and it smelled like that morning we got lost. 47 days now. I keep counting.\n\nMail one back: ustwo@agentmail.to — it lands right here.\n\nlove, ren",
      receivedAt: Date.now() - 2 * 86_400_000,
      sealed: true,
    },
  },
  {
    id: "us-sticker",
    type: "sticker",
    x: 1032,
    y: 754,
    w: 129,
    h: 160,
    z: 12,
    rotate: -4,
    data: { stickerId: "double-smile" },
  },
];

export const HOUSE_WIDGETS: Widget[] = [
  {
    id: "house-wheel",
    type: "wheel",
    x: 48,
    y: 64,
    w: 280,
    h: 330,
    z: 3,
    data: {
      title: "who does dishes",
      tone: "butter",
      slices: [
        { id: "a", label: "noor" },
        { id: "b", label: "theo" },
        { id: "c", label: "gigi" },
        { id: "d", label: "marco" },
        { id: "e", label: "order in" },
        { id: "f", label: "skip week" },
      ],
      spinNonce: 0,
      resultIndex: 1,
      spunBy: "gigi",
    },
  },
  {
    id: "house-rent",
    type: "expenseSplit",
    x: 368,
    y: 64,
    w: 300,
    h: 205,
    z: 3,
    data: {
      title: "rent · $2,850",
      total: 2850,
      splits: [
        { name: "noor", paid: 950, owes: 0 },
        { name: "theo", paid: 700, owes: 0 },
        { name: "gigi", paid: 0, owes: 712 },
        { name: "marco", paid: 0, owes: 488 },
      ],
    },
  },
  {
    id: "house-groceries",
    type: "potluck",
    x: 700,
    y: 64,
    w: 460,
    h: 190,
    z: 3,
    data: {
      title: "grocery run · saturday",
      kicker: "house errands",
      tone: "mint",
      openCount: 2,
      items: [
        { name: "oat milk", by: "noor", claimed: true },
        { name: "eggs", by: null, claimed: false },
        { name: "hot sauce", by: "marco", claimed: true },
        { name: "paper towels", by: null, claimed: false },
      ],
    },
  },
  {
    id: "house-wifi",
    type: "quote",
    x: 368,
    y: 286,
    w: 280,
    h: 130,
    z: 3,
    rotate: -2,
    data: {
      text: "wifi: TheHouse5G — pw is on the fridge",
      author: "taped up since move-in",
      week: "forever",
    },
  },
  {
    id: "house-fridge",
    type: "messageWall",
    x: 48,
    y: 470,
    w: 760,
    h: 130,
    z: 3,
    data: {
      title: "fridge notes",
      messages: [
        { from: "gigi", text: "WHO ate my leftovers. i had PLANS" },
        { from: "theo", text: "the dishwasher is CLEAN btw" },
        { from: "marco", text: "rent due friday 🙏" },
        { from: "noor", text: "watered your plant. you're welcome" },
      ],
    },
  },
  {
    id: "house-sticker",
    type: "sticker",
    x: 880,
    y: 452,
    w: 139,
    h: 160,
    z: 12,
    rotate: -3,
    data: { stickerId: "ours" },
  },
];


const BUILD_ROOM_MEMBERS = [
  { name: "Maya", color: "#7c5cff", online: true },
  { name: "Sam", color: "#3d6eff", online: true },
  { name: "Alex", color: "#ff7c42", online: true },
  { name: "Jordan", color: "#13b8a6", online: true },
  { name: "Priya", color: "#e9369d", online: false },
  { name: "Marco", color: "#ffb02e", online: true },
  { name: "Riley", color: "#c9ff3d", online: false },
];

/** "may 5" style, but evergreen — ship posts shouldn't rot. */
function shortDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
}

/* Five outlined frames on a 1640×1080 canvas: the pile fills the left column,
   hot now / keepers / roundtable stack down the right, shipping wall sits
   under the pile. Matches the approved concept. */
export const BUILD_ROOM_WIDGETS: Widget[] = [
  {
    id: "br-frame-pile",
    type: "frame",
    x: 48,
    y: 64,
    w: 760,
    h: 420,
    z: 0,
    data: { title: "the pile", subtitle: "everything anyone dropped", deco: "outline" },
  },
  {
    id: "br-pile",
    type: "linkPile",
    x: 88,
    y: 148,
    w: 680,
    h: 300,
    z: 8,
    data: { title: "the pile", cta: "open reading room" },
  },
  {
    id: "br-frame-hot",
    type: "frame",
    x: 850,
    y: 48,
    w: 700,
    h: 400,
    z: 0,
    data: { title: "hot now", subtitle: "what the room is actually reading", deco: "outline" },
  },
  {
    id: "br-hot",
    type: "hotLinks",
    x: 886,
    y: 112,
    w: 628,
    h: 300,
    z: 8,
    data: { title: "hot now", limit: 3 },
  },
  {
    id: "br-frame-keepers",
    type: "frame",
    x: 850,
    y: 470,
    w: 700,
    h: 210,
    z: 0,
    data: { title: "keepers", subtitle: "what we actually learned", deco: "outline" },
  },
  {
    id: "br-keeper-1",
    type: "note",
    x: 886,
    y: 512,
    w: 320,
    h: 150,
    z: 8,
    rotate: -1.2,
    data: {
      kicker: "rule of thumb",
      title: "dual-write before you backfill",
      text: "four phases, never a big-bang cutover: dual write, backfill, dual read, drop.",
      author: "Maya",
      tone: "white",
      pin: true,
    },
  },
  {
    id: "br-keeper-2",
    type: "note",
    x: 1222,
    y: 512,
    w: 320,
    h: 150,
    z: 8,
    rotate: 1.4,
    data: {
      kicker: "mental model",
      title: "sqlite until the network says no",
      text: "postgres is usually a network decision, not a data one.",
      author: "Sam",
      tone: "white",
      pin: true,
    },
  },
  {
    id: "br-frame-ship",
    type: "frame",
    x: 48,
    y: 570,
    w: 760,
    h: 380,
    z: 0,
    data: { title: "shipping wall", subtitle: "show the thing", deco: "outline" },
  },
  {
    id: "br-ship-1",
    type: "shipPost",
    x: 84,
    y: 632,
    w: 222,
    h: 282,
    z: 8,
    rotate: -1.4,
    data: {
      title: "perf dashboard v2",
      by: "priya",
      date: shortDaysAgo(4),
      imageUrl: "/photos/hackathon/demo-day.jpg",
      body: "Rebuilt the latency panel on the new rollup table. p95 query went 1.4s → 90ms, and the whole page now paints before the spinner would have shown.\n\nStill rough: the date picker resets on refresh.",
    },
  },
  {
    id: "br-ship-2",
    type: "shipPost",
    x: 328,
    y: 626,
    w: 222,
    h: 282,
    z: 8,
    rotate: 0.9,
    data: {
      title: "search revamp",
      by: "jordan",
      date: shortDaysAgo(5),
      imageUrl: "/photos/hackathon/hack-weekend.jpg",
      feedbackWanted: true,
      body: "Ripped out the LIKE query and put a real index behind it. Typo tolerance is in, ranking is not.\n\nWould love a second opinion on whether recency should outrank relevance here.",
    },
  },
  {
    id: "br-ship-3",
    type: "shipPost",
    x: 572,
    y: 634,
    w: 222,
    h: 282,
    z: 8,
    rotate: -0.8,
    data: {
      title: "v2.3.0 shipped",
      by: "sam",
      date: shortDaysAgo(6),
      imageUrl: "/photos/hackathon/shipped-v01.jpg",
      body: "Migration ran clean on the first try, which has never happened before.\n\nDual-write was on for six days and the backfill took forty minutes.",
    },
  },
  {
    id: "br-frame-table",
    type: "frame",
    x: 850,
    y: 705,
    w: 700,
    h: 310,
    z: 0,
    data: { title: "roundtable", subtitle: "the long threads", deco: "outline" },
  },
  {
    id: "br-table",
    type: "roundtable",
    x: 886,
    y: 752,
    w: 628,
    h: 250,
    z: 8,
    data: {
      category: "career",
      title: "how did you break into tech?",
      body: "nobody's answered yet. go first.",
    },
  },
];

export const SPACES: SpaceMeta[] = [
  {
    id: "buildroom",
    name: "the build room",
    color: "#ff7c42",
    icon: "</>",
    canvasSize: { width: 1640, height: 1080 },
    activity: true,
    kind: "ongoing",
    tagline: "drop it, argue it, keep it",
    preview: "47 links · 3 hot",
    showcase: "dev guild · links, ships, roundtables",
    inboxAddress: "buildroom@agentmail.to",
  },
  {
    id: "crew",
    name: "the crew",
    color: "#e9369d",
    icon: "✦",
    activity: false,
    kind: "ongoing",
    tagline: "your people, in one place",
    preview: "daily q · 3 answered",
    showcase: "birthday HQ · plans, polls, memories",
    inboxAddress: "thecrew@agentmail.to",
  },
  {
    id: "couple",
    name: "us two",
    color: "#e63da8",
    icon: "♥",
    canvasSize: { width: 1260, height: 980 },
    activity: true,
    kind: "ongoing",
    tagline: "an ocean apart",
    preview: "47 days to SFO",
    showcase: "long distance · clocks, countdowns, color together",
    inboxAddress: "ustwo@agentmail.to",
  },
  {
    id: "house",
    name: "the house",
    color: "#ffb02e",
    icon: "⌂",
    canvasSize: { width: 1240, height: 860 },
    activity: true,
    kind: "ongoing",
    tagline: "four names on one lease",
    preview: "chore wheel · rent split",
    showcase: "roommate HQ · chores, rent, fridge notes",
  },
  {
    id: "league",
    name: "game day",
    color: "#13b8a6",
    icon: "◎",
    activity: true,
    kind: "ongoing",
    canvasSize: { width: 1240, height: 900 },
    tagline: "sunday is sacred",
    preview: "punishment wheel armed",
    showcase: "game day · scores, wheel, trash talk",
  },
];

export const SPACES_BY_ID: Record<string, Space> = {
  buildroom: {
    ...SPACES[0],
    members: BUILD_ROOM_MEMBERS,
    widgets: BUILD_ROOM_WIDGETS,
  },
  crew: {
    ...SPACES[1],
    members: CREW_MEMBERS,
    widgets: CREW_WIDGETS,
  },
  couple: {
    ...SPACES[2],
    members: COUPLE_MEMBERS,
    widgets: COUPLE_WIDGETS,
  },
  house: {
    ...SPACES[3],
    members: HOUSE_MEMBERS,
    widgets: HOUSE_WIDGETS,
  },
  league: {
    ...SPACES[4],
    members: CREW_MEMBERS,
    widgets: LEAGUE_WIDGETS,
  },
};

export const SPACE_CURSORS: Record<
  string,
  { name: string; color: string; x: number; y: number }[]
> = {
  buildroom: [
    { name: "Alex", color: "#ff7c42", x: 1180, y: 250 },
    { name: "Marco", color: "#ffb02e", x: 300, y: 700 },
    { name: "Jordan", color: "#13b8a6", x: 960, y: 640 },
  ],
  crew: [
    { name: "Jules", color: "#e63da8", x: 792, y: 430 },
    { name: "Sam", color: "#3d6eff", x: 1096, y: 578 },
    { name: "Maya", color: "#7c5cff", x: 468, y: 298 },
  ],
  league: [
    { name: "Sam", color: "#3d6eff", x: 940, y: 320 },
    { name: "Kenji", color: "#13b8a6", x: 440, y: 700 },
    { name: "Jules", color: "#e63da8", x: 800, y: 140 },
  ],
  couple: [
    { name: "ren", color: "#e9369d", x: 446, y: 300 },
    { name: "sky", color: "#7c5cff", x: 780, y: 410 },
  ],
  house: [
    { name: "gigi", color: "#e9369d", x: 210, y: 250 },
    { name: "noor", color: "#ffb02e", x: 820, y: 180 },
    { name: "theo", color: "#3f70ff", x: 520, y: 540 },
  ],
};

export function canvasSizeFor(id: string): { width: number; height: number } {
  return (
    SPACES_BY_ID[id]?.canvasSize ??
    (id === "league"
      ? { width: 1240, height: 900 }
      : { width: 1640, height: 1080 })
  );
}

/** @deprecated use SPACES_BY_ID.crew */
export const CREW = SPACES_BY_ID.crew;

/** @deprecated use SPACES_BY_ID.crew.widgets */
export const WIDGETS = CREW_WIDGETS;

export function getSpace(id: string): Space {
  return SPACES_BY_ID[id] ?? SPACES_BY_ID.crew;
}

export function getWidgets(id: string): Widget[] {
  return getSpace(id).widgets;
}

export const DECISION_WIDGET: Widget = {
  id: "decision-promoted",
  type: "decision",
  x: 1064,
  y: 620,
  w: 290,
  h: 155,
  z: 25,
  data: {
    title: "decision made",
    detail: "6pm · Sam's place",
    author: "Sam",
    source: "promoted from chat",
    tone: "lime",
  },
};
