import type { SpaceMember, Widget } from "./types";
import type { CheckInData, StandingsData } from "../lib/challenge";
import "./family.css";

/**
 * The family: a house of four, mid-week. Dev (dad, competitive before
 * coffee), Alex (mom, in Denver for work till Thursday), Casey (16, owes the
 * house a clean bathroom) and Mina (11, never misses a day, walks the dog).
 *
 * What's on: a push-up challenge with two days left, and it decides the
 * weekend: the saturday poll is stuck 2–2, kids against parents, and whoever
 * has the most push-ups at the reveal picks. Dev leads Casey by 26 and Casey
 * hasn't logged today.
 *
 * Every date is an offset from today, so the room is always on day five.
 */

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const weekdayFromNow = (days: number) => WEEKDAYS[(new Date().getDay() + days + 7) % 7];

/** The challenge started four days ago; the reveal is two mornings from now. */
const STARTED = -4;
const REVEAL = 2;

export const FAMILY_MEMBERS: SpaceMember[] = [
  { name: "Dev", color: "#ff7c42", online: true },
  { name: "Alex", color: "#e9369d", online: false },
  { name: "Casey", color: "#13b8a6", online: true },
  { name: "Mina", color: "#ffb02e", online: true },
];

const people = FAMILY_MEMBERS.map(({ name, color }) => ({ name, color }));

const pushUps: CheckInData = {
  title: "push-ups",
  kind: "number",
  unit: "push-ups",
  get start() {
    return isoDaysFromNow(STARTED);
  },
  days: 6,
  get revealAt() {
    return `${isoDaysFromNow(REVEAL)}T09:00`;
  },
  people,
  logs: {
    Dev: [30, 35, 40, 40, 40],
    Alex: [20, 22, 25, null, 24],
    Casey: [38, 41, 36, 44, null],
    Mina: [12, 14, 15, 17, 18],
  },
};

const standings: StandingsData = {
  title: "standings",
  source: "fam-checkin",
  stake: "most by the reveal picks saturday. last place takes the winner's chores.",
};

export const FAMILY_WIDGETS: Widget[] = [
  // ── the challenge: the centrepiece, on screen when the room opens ──
  {
    id: "fam-frame-challenge",
    type: "frame",
    x: 32,
    y: 48,
    w: 1266,
    h: 650,
    z: 0,
    data: {
      get title() {
        return `push-ups till ${weekdayFromNow(REVEAL)}`;
      },
      subtitle: "the four of us",
    },
  },
  {
    id: "fam-checkin",
    type: "checkIn",
    x: 56,
    y: 110,
    w: 600,
    h: 420,
    z: 4,
    rotate: -0.6,
    data: pushUps,
  },
  {
    id: "fam-standings",
    type: "standings",
    x: 690,
    y: 104,
    w: 372,
    h: 430,
    z: 4,
    rotate: 1,
    data: standings,
  },
  {
    id: "fam-signup",
    type: "rsvp",
    x: 1086,
    y: 96,
    w: 190,
    h: 250,
    z: 3,
    rotate: -1.5,
    data: {
      title: "who's in",
      responses: [
        { name: "Dev", status: "yes" },
        { name: "Casey", status: "yes" },
        { name: "Mina", status: "yes" },
        { name: "Alex", status: "yes" },
      ],
      waitingOn: [],
    },
  },
  {
    id: "fam-reveal",
    type: "countdown",
    x: 1090,
    y: 368,
    w: 182,
    h: 262,
    z: 3,
    rotate: 2,
    data: {
      get event() {
        return `the reveal · ${weekdayFromNow(REVEAL)} 9:00`;
      },
      get targetDate() {
        return isoDaysFromNow(REVEAL);
      },
      get startDate() {
        return isoDaysFromNow(STARTED);
      },
      tone: "butter",
      hyped: ["Dev", "Casey", "Mina"],
    },
  },
  {
    id: "fam-deal",
    type: "note",
    x: 56,
    y: 552,
    w: 400,
    h: 128,
    z: 2,
    rotate: -1,
    data: {
      kicker: "the deal",
      text: "log before bed or it didn't happen. knees count for mina. form judge is mom, by video.",
      author: "Dev",
      tone: "white",
    },
  },
  {
    id: "fam-quote",
    type: "quote",
    x: 486,
    y: 560,
    w: 236,
    h: 112,
    z: 3,
    rotate: 1.5,
    data: {
      text: "it's not a competition",
      author: "Dev, during the competition",
      week: "day 2",
    },
  },
  {
    id: "fam-sticker-five",
    type: "sticker",
    x: 900,
    y: 520,
    w: 150,
    h: 150,
    z: 12,
    rotate: -4,
    data: { stickerId: "crew-high-five" },
  },

  // ── who does what this week ──
  {
    id: "fam-frame-chores",
    type: "frame",
    x: 32,
    y: 744,
    w: 700,
    h: 640,
    z: 0,
    data: { title: "jobs this week", subtitle: "ticked = done" },
  },
  {
    id: "fam-chores",
    type: "potluck",
    x: 54,
    y: 804,
    w: 372,
    h: 200,
    z: 3,
    rotate: -0.8,
    data: {
      title: "chores this week",
      kicker: "casey's is 3 days late",
      tone: "butter",
      openCount: 2,
      items: [
        { name: "bins + recycling", by: "Dev", claimed: true },
        { name: "casey: bathroom", by: null, claimed: false },
        { name: "walk biscuit", by: "Mina", claimed: true },
        { name: "laundry mountain", by: null, claimed: false },
      ],
    },
  },
  {
    id: "fam-wheel",
    type: "wheel",
    x: 446,
    y: 790,
    w: 268,
    h: 330,
    z: 3,
    rotate: 1,
    data: {
      title: "who empties the dishwasher",
      tone: "violet",
      slices: [
        { id: "a", label: "dev" },
        { id: "b", label: "alex" },
        { id: "c", label: "casey" },
        { id: "d", label: "mina" },
        { id: "e", label: "biscuit" },
        { id: "f", label: "whoever asked" },
      ],
      spinNonce: 0,
      resultIndex: 2,
      spunBy: "Mina",
    },
  },
  {
    id: "fam-home",
    type: "availability",
    x: 54,
    y: 1022,
    w: 380,
    h: 196,
    z: 2,
    data: {
      title: "home for dinner",
      days: ["Tue", "Wed", "Thu", "Fri"],
      members: [
        { name: "Dev", slots: [true, true, true, true] },
        { name: "Alex", slots: [false, false, false, true] },
        { name: "Casey", slots: [true, false, true, true] },
        { name: "Mina", slots: [true, true, true, true] },
      ],
      best: "Fri",
      tone: "mint",
    },
  },
  {
    id: "fam-rule",
    type: "note",
    x: 452,
    y: 1136,
    w: 262,
    h: 150,
    z: 3,
    rotate: 2,
    data: {
      kicker: "house rule no. 1",
      text: "no screens till the dishwasher's empty",
      author: "Alex",
      tone: "warm",
    },
  },
  {
    id: "fam-allowance",
    type: "note",
    x: 54,
    y: 1236,
    w: 330,
    h: 132,
    z: 2,
    rotate: -1.5,
    data: {
      kicker: "allowance, friday",
      text: "casey $15, minus $3 till the bathroom's done. mina $10, plus $2 for the 7am walks.",
      author: "Dev",
      tone: "white",
    },
  },

  // ── what we're doing this weekend ──
  {
    id: "fam-frame-weekend",
    type: "frame",
    x: 756,
    y: 744,
    w: 542,
    h: 640,
    z: 0,
    data: { title: "this weekend", subtitle: "2–2. again." },
  },
  {
    id: "fam-poll-saturday",
    type: "poll",
    x: 776,
    y: 806,
    w: 250,
    h: 200,
    z: 4,
    rotate: -1.2,
    data: {
      question: "saturday?",
      tone: "sky",
      options: [
        { id: "a", label: "trampoline park", votes: 2, total: 4, voters: ["Casey", "Mina"] },
        { id: "b", label: "hike + pancakes", votes: 2, total: 4, voters: ["Dev", "Alex"] },
      ],
    },
  },
  {
    id: "fam-places",
    type: "linkShelf",
    x: 1042,
    y: 796,
    w: 240,
    h: 220,
    z: 3,
    rotate: 1,
    data: {
      title: "places we keep saying",
      tone: "butter",
      links: [
        { label: "lake loop, 5 mi (maps)", url: "maps.google.com", by: "Dev" },
        { label: "trampoline park (maps)", url: "maps.google.com", by: "Mina" },
        { label: "noodles by the library (maps)", url: "maps.google.com", by: "Alex" },
        { label: "the climbing wall (maps)", url: "maps.google.com", by: "Casey" },
      ],
    },
  },
  {
    id: "fam-bday",
    type: "countdown",
    x: 782,
    y: 1040,
    w: 182,
    h: 262,
    z: 3,
    rotate: -2,
    data: {
      event: "mina turns 12 🎂",
      get targetDate() {
        return isoDaysFromNow(11);
      },
      get startDate() {
        return isoDaysFromNow(-19);
      },
      tone: "blush",
      hyped: ["Mina", "Alex", "Dev"],
    },
  },
  {
    id: "fam-photo",
    type: "media",
    x: 984,
    y: 1050,
    w: 296,
    h: 218,
    z: 4,
    rotate: 2.2,
    data: {
      caption: "planning the lake. allegedly",
      date: "sun",
      src: "/photos/crew/camera-roll.jpg",
      thumbnailSrc: "/photos/thumbs/crew/camera-roll.jpg",
    },
  },
  {
    id: "fam-sticker-car",
    type: "sticker",
    x: 1120,
    y: 1240,
    w: 150,
    h: 132,
    z: 12,
    rotate: 4,
    data: { stickerId: "tahoe-car" },
  },

  // ── the fridge ──
  {
    id: "fam-fridge",
    type: "messageWall",
    x: 32,
    y: 1424,
    w: 800,
    h: 132,
    z: 3,
    data: {
      title: "fridge notes",
      messages: [
        { from: "Casey", text: "who moved my charger. i know it was one of you" },
        { from: "Dev", text: "bins go out THURSDAY. not friday. thursday" },
        { from: "Mina", text: "biscuit ate a sock. not mine" },
        { from: "Alex", text: "landed. hotel has a gym. coming for you, dev" },
      ],
    },
  },
  {
    id: "fam-away",
    type: "frame",
    x: 960,
    y: 1424,
    w: 338,
    h: 140,
    z: 1,
    data: { title: "alex is out till thursday", subtitle: "denver, for work" },
  },
  {
    id: "fam-sticker-biscuit",
    type: "sticker",
    x: 1010,
    y: 1438,
    w: 128,
    h: 130,
    z: 12,
    rotate: -5,
    data: { stickerId: "rio-socks" },
  },
];
