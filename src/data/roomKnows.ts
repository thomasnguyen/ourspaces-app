import type { Forgot, KnowLine, RoomKnows, Told } from "../lib/roomKnows";

/**
 * MOCK FIXTURES for "what this space knows" (`?mock=1`, no backend): what
 * `convex/roomBrief.ts` `knows` returns for the three demo rooms, written out
 * by hand against the mock boards in `spaces.ts` (the `src` ids are those
 * widgets). Live rooms never read this file. Corrections made in mock mode
 * stay on the screen that made them.
 */

const line = (section: KnowLine["section"], key: string, text: string, why: string, src: string[], more: Partial<KnowLine> = {}): KnowLine => ({ key, section, text, why, src, ...more });

const FIXTURES: Record<string, Omit<RoomKnows, "told" | "forgot" | "at">> = {
  crew: {
    room: "the crew",
    people: [
      { name: "Maya", color: "#7c5cff" },
      { name: "Jules", color: "#e63da8", away: true },
      { name: "Sam", color: "#3d6eff" },
      { name: "Rio", color: "#ff7a3d" },
      { name: "Kenji", color: "#13b8a6" },
      { name: "Ash", color: "#c6f750" },
    ],
    lines: [
      line("who", "away:Jules", "Jules is away", 'the board says "jules is out this week"', []),
      line("soon", "date:maya's bday 🎂", "days to maya's bday 🎂", "Sun Oct 11, from the countdown", ["countdown"], { n: 6 }),
      line("decided", "poll:cake flavor?", "cake flavor: matcha is ahead, 3 of 5", "from the poll, 5 votes in", ["poll-cake"]),
      line("decided", "poll:where we ate last sat?", "where we ate last sat: sam's place is ahead, 4 of 6", "from the poll, 6 votes in", ["poll-last-sat"]),
      line("decided", "poll:cook or takeout?", "cook or takeout: cook is ahead, 4 of 6", "from the poll, 6 votes in", ["poll-cook-or-out"]),
      line("decided", "rsvp:who's coming", "who's coming: Maya, Jules, Sam and Kenji are in · Ash can't · Rio hasn't answered", "from the rsvp", ["rsvp"]),
      line("decided", "split:tahoe trip IOUs", "tahoe trip IOUs: 2,104 split between Maya, Jules, Sam and Kenji", "from the split", ["expense-split"]),
      line("habits", "day:Saturday", "Saturday is our usual day", 'said in 3 places: poll "where we ate last sat?", availability "when can we all meet?" best + 1 more', ["poll-last-sat", "availability"]),
      line("habits", "payer:Jules", "Jules covered the most last time", 'from the split "tahoe trip IOUs"', ["expense-split"]),
      line("habits", "places", "our places: sam's place, tacos on 4th, ramen on 3rd", '3 saved links, and sam\'s place is ahead in "where we ate last sat?" 4 of 6', ["poll-last-sat", "link-shelf"]),
      line("habits", "claims:Sam", "Sam takes things on: sparkling water, veggie bowls", "2 claims on the lists", ["potluck"]),
      line("habits", "lowercase", "we write titles in lowercase", "22 of 23 card titles", []),
      line("habits", "words", "words we use a lot: cake, matcha, balloons, bday, party, place", "each one in 2 or more places", []),
      line("made", "made:1", 'poll "friday dinner?"', 'Maya said "add a poll for friday dinner" · Sat Oct 3', ["poll-fri-ramen"], { status: "kept" }),
      line("made", "made:2", '"plan a surprise for Maya"', "a spoken ask · Fri Oct 2", [], { status: "removed" }),
    ],
  },
  couple: {
    room: "us two",
    people: [
      { name: "ren", color: "#e9369d" },
      { name: "sky", color: "#7c5cff" },
    ],
    lines: [
      line("who", "zones", "sky is on Los Angeles time, ren is on Seoul time", "from the clocks card", ["us-clocks"]),
      line("soon", "date:SFO ✈", "days to SFO ✈", "Tue Oct 13, from the countdown", ["us-sfo"], { n: 9 }),
      line("soon", "date:half-year ♥", "days to half-year ♥", "Sat Jan 16, from the countdown", ["us-countdown"], { n: 104 }),
      line("habits", "day:Saturday", "Saturday is our usual day", 'said in 2 places: note "our call", availability "our usual call days" best', ["us-call-times", "us-usual-days"]),
      line("habits", "lowercase", "we write titles in lowercase", "7 of 9 card titles", []),
      line("habits", "words", "words we use a lot: call, same, sfo", "each one in 2 or more places", []),
    ],
  },
  family: {
    room: "the family",
    people: [
      { name: "Dev", color: "#ff7c42" },
      { name: "Alex", color: "#e9369d", away: true },
      { name: "Casey", color: "#13b8a6" },
      { name: "Mina", color: "#ffb02e" },
    ],
    lines: [
      line("who", "away:Alex", "Alex is away, back thursday", 'the board says "alex is out till thursday"', ["fam-away"]),
      line("soon", "date:the reveal", "days to the reveal", "9:00, from the countdown", ["fam-reveal"], { n: 2 }),
      line("soon", "date:mina turns 12 🎂", "days to mina turns 12 🎂", "from the countdown", ["fam-bday"], { n: 11 }),
      line("decided", "poll:saturday?", "saturday: trampoline park and hike + pancakes are level, 2 of 4 each", "from the poll, 4 votes in", ["fam-poll-saturday"]),
      line("decided", "rsvp:who's in", "who's in: Dev, Casey, Mina and Alex are in", "from the rsvp", ["fam-signup"]),
      line("decided", "wheel:who empties the dishwasher", "who empties the dishwasher: last landed on casey", "from the wheel's last spin", ["fam-wheel"]),
      line("habits", "day:Friday", "Friday is our usual day", 'said in 2 places: availability "home for dinner" best, note "allowance, friday"', ["fam-home", "fam-allowance"]),
      line("habits", "places", "our places: lake loop, trampoline park, noodles by the library, the climbing wall", "4 saved links, and trampoline park is in the saturday poll", ["fam-places", "fam-poll-saturday"]),
      line("habits", "claims:Dev", "Dev takes things on: bins + recycling", "1 claim on the lists, and 5 check-ins in a row", ["fam-chores", "fam-checkin"]),
      line("habits", "claims:Mina", "Mina takes things on: walk biscuit", "1 claim on the lists, and 5 check-ins in a row", ["fam-chores", "fam-checkin"]),
      line("habits", "lowercase", "we write titles in lowercase", "14 of 14 card titles", []),
      line("habits", "words", "words we use a lot: bathroom, biscuit, dishwasher, friday, push-ups, saturday", "each one in 2 or more places", []),
      line("made", "made:1", 'the push-up challenge: "who\'s in", "push-ups", "standings", "the reveal"', 'Dev said "set up a push-up challenge for the four of us" · 4 days ago', ["fam-signup", "fam-checkin", "fam-standings", "fam-reveal"], { status: "kept" }),
      line("made", "made:2", 'wheel "who cleans the bathroom"', 'Casey said "spin for who cleans the bathroom" · 2 days ago', [], { status: "removed" }),
    ],
  },
  house: {
    room: "the house",
    people: [
      { name: "noor", color: "#ffb02e" },
      { name: "theo", color: "#3f70ff", away: true },
      { name: "gigi", color: "#e9369d" },
      { name: "marco", color: "#13b8a6" },
    ],
    lines: [
      line("who", "away:theo", "theo is away, back sunday", 'the board says "theo is out this week"', ["house-away"]),
      line("decided", "split:rent · $2,850", "rent · $2,850: split between noor, theo, gigi and marco", "from the split", ["house-rent"]),
      line("decided", "wheel:who does dishes", "who does dishes: last landed on theo", "from the wheel's last spin", ["house-wheel"]),
      line("habits", "payer:noor", "noor covered the most last time", 'from the split "rent · $2,850"', ["house-rent"]),
      line("habits", "claims:noor", "noor takes things on: oat milk, vacuum", "2 claims on the lists", ["house-groceries", "house-chores"]),
      line("habits", "claims:marco", "marco takes things on: hot sauce, bathroom", "2 claims on the lists", ["house-groceries", "house-chores"]),
      line("habits", "lowercase", "we write titles in lowercase", "7 of 7 card titles", []),
      line("habits", "words", "words we use a lot: dishes, fridge, house, paper, rent", "each one in 2 or more places", []),
    ],
  },
};

/* What the demo crew has already had to say about its own page: one thing
   told, one thing crossed out, so the first look shows people are in charge. */
const SAID: Record<string, { told: Told[]; forgot: Forgot[] }> = {
  family: {
    told: [{ id: "seed-biscuit", text: "biscuit is the dog. he does not do chores", by: "Mina", color: "#ffb02e", at: 1 }],
    forgot: [],
  },
  crew: {
    told: [{ id: "seed-mondays", text: "we never do mondays", by: "Kenji", color: "#13b8a6", at: 1 }],
    forgot: [{ key: "words", text: "words we use a lot: cake, matcha, balloons, bday, party, place", by: "Rio", color: "#ff7a3d", at: 1 }],
  },
};

/** The fixture page for a mock room; a room without one gets the empty state. */
export function mockRoomKnows(slug: string, roomName: string): RoomKnows {
  const f = FIXTURES[slug];
  return { room: f?.room ?? roomName, at: 0, people: f?.people ?? [], lines: f?.lines ?? [], told: SAID[slug]?.told ?? [], forgot: SAID[slug]?.forgot ?? [] };
}
