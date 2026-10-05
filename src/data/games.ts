import type { Award, GamePrompt } from "../lib/games/types";

/**
 * MOCK FIXTURES for games (`?mock=1`, no backend). The prompts are written by
 * hand, and only from facts on each room's "what this space knows" page
 * (`data/roomKnows.ts`): every prompt carries the `fact` key it came from. In
 * a live room code would pick the facts and the model would only word them.
 *
 * `lean` is how the simulated players tend to vote, so a reveal reads like
 * people who know each other. It never leaves this file.
 */

export type MockPrompt = GamePrompt & { lean: Record<string, number> };

const p = (id: string, text: string, award: string, glyph: string, fact: string, from: string, lean: Record<string, number>): MockPrompt => ({ id, text, award, glyph, fact, from, lean });

export type RoomGames = {
  /** "most likely to", or the two-person twist */
  name: string;
  /** who starts it when the viewer is the invitee */
  starter: string;
  /** prompt sets; a rematch deals the next one */
  sets: MockPrompt[][];
  /** this week before today's game: points, and stickers already won */
  seed: Record<string, number>;
  seedAwards: Array<Pick<Award, "to" | "title" | "glyph" | "prompt" | "tone">>;
  /** the scoreboard's reveal / reset */
  resets: string;
};

export const ROOM_GAMES: Record<string, RoomGames> = {
  crew: {
    name: "most likely to",
    starter: "Maya",
    sets: [
      [
        p("crew-sams", "pick sam's place again", "sam's place regular", "🍜", "places", "sam's place is ahead, 4 of 6", { Sam: 6, Kenji: 2, Maya: 1 }),
        p("crew-balloons", "forget the balloons", "balloon duty", "🎈", "claims:Sam", "from who's bringing what", { Jules: 5, Rio: 3, Ash: 1 }),
        p("crew-bill", "cover the bill and never mention it", "quiet tab", "🧾", "payer:Jules", "jules covered the most last time", { Jules: 4, Maya: 3, Sam: 1 }),
        p("crew-rsvp", "answer “who's coming” the morning of", "morning-of rsvp", "⏰", "rsvp:who's coming", "rio hasn't answered", { Rio: 7, Ash: 2 }),
        p("crew-monday", "suggest a monday anyway", "monday menace", "📅", "told:seed-mondays", "kenji said: we never do mondays", { Ash: 4, Rio: 3, Kenji: 2, Maya: 1 }),
      ],
      [
        p("crew-matcha", "vote matcha for everything", "matcha lobby", "🍵", "poll:cake flavor?", "matcha is ahead, 3 of 5", { Maya: 4, Kenji: 3, Ash: 1 }),
        p("crew-water", "claim the sparkling water again", "sparkling water rep", "🫧", "claims:Sam", "sam takes things on", { Sam: 7, Kenji: 1 }),
        p("crew-poll", "start a poll about the poll", "poll starter", "📊", "made:1", "maya asked for the friday dinner poll", { Maya: 6, Sam: 2, Rio: 1 }),
        p("crew-away", "be out the week of the party", "out of office", "🧳", "away:Jules", "jules is away", { Jules: 6, Ash: 2 }),
        p("crew-saturday", "say “saturday?” before anyone asks", "saturday person", "🪩", "day:Saturday", "saturday is our usual day", { Kenji: 4, Sam: 3, Maya: 2 }),
      ],
    ],
    seed: { Sam: 6, Maya: 5, Kenji: 5, Ash: 4, Rio: 3, Jules: 2 },
    seedAwards: [
      { to: "Kenji", title: "no mondays", glyph: "🚫", prompt: "most likely to veto a monday", tone: 4 },
      { to: "Maya", title: "birthday week", glyph: "🎂", prompt: "most likely to count the days out loud", tone: 1 },
    ],
    resets: "sun 9:00",
  },
  house: {
    name: "most likely to",
    starter: "gigi",
    sets: [
      [
        p("house-dishes", "“soak” the dishes till sunday", "the soaker", "🫧", "wheel:who does dishes", "the wheel last landed on theo", { theo: 5, marco: 2, gigi: 1 }),
        p("house-oat", "buy oat milk before anyone asks", "oat milk fairy", "🥛", "claims:noor", "noor takes things on", { noor: 7, gigi: 1 }),
        p("house-hot", "put hot sauce on it", "hot sauce on it", "🌶️", "claims:marco", "marco claimed the hot sauce", { marco: 7, theo: 1 }),
        p("house-rent", "front the rent and say “whenever”", "whenever", "🏠", "payer:noor", "noor covered the most last time", { noor: 4, gigi: 3 }),
        p("house-wheel", "miss the spin and still land on it", "wheel magnet", "🎡", "away:theo", "theo is away, back sunday", { theo: 7, marco: 1 }),
      ],
      [
        p("house-vacuum", "vacuum at an unreasonable hour", "night vacuum", "🧹", "claims:noor", "noor claimed the vacuum", { noor: 5, gigi: 2 }),
        p("house-fridge", "leave a note on the fridge about the fridge", "fridge notes", "📝", "words", "fridge, paper: words we use a lot", { gigi: 5, noor: 2, marco: 1 }),
        p("house-bath", "claim the bathroom and mean it", "bathroom boss", "🛁", "claims:marco", "marco claimed the bathroom", { marco: 6, gigi: 1 }),
        p("house-sunday", "be back sunday with laundry", "back sunday", "🧺", "away:theo", "theo is away, back sunday", { theo: 7 }),
        p("house-paper", "notice we're out of paper towels first", "paper towel radar", "🧻", "words", "paper: a word we use a lot", { gigi: 4, noor: 3, marco: 1 }),
      ],
    ],
    seed: { noor: 5, gigi: 4, marco: 4, theo: 2 },
    seedAwards: [{ to: "theo", title: "dishes, again", glyph: "🍽️", prompt: "most likely to be picked by the wheel", tone: 2 }],
    resets: "sun 9:00",
  },
  couple: {
    /* two people can't out-vote anyone: you each pick, and a match is the win */
    name: "more likely to",
    starter: "ren",
    sets: [
      [
        p("us-sleep", "fall asleep on the saturday call", "out by minute ten", "😴", "day:Saturday", "saturday is our usual day", { ren: 3, sky: 1 }),
        p("us-zones", "get the time difference wrong", "it's WHAT time there", "🕰️", "zones", "los angeles and seoul", { sky: 3, ren: 1 }),
        p("us-sfo", "be at SFO two hours early", "gate B, 6am", "🛫", "date:SFO ✈", "9 days to SFO", { ren: 4, sky: 1 }),
        p("us-same", "say “same” first", "same", "🫶", "words", "same: a word we use a lot", { sky: 3, ren: 2 }),
        p("us-half", "remember the half-year without the countdown", "keeps the date", "📆", "date:half-year ♥", "the half-year countdown", { ren: 3, sky: 2 }),
      ],
    ],
    seed: { ren: 3, sky: 3 },
    seedAwards: [],
    resets: "sat, after the call",
  },
};

export const hasGames = (room: string) => Boolean(ROOM_GAMES[room]);

/** Where the games corner sits on each mock board: the scoreboard, and the
    game card beside it once someone starts one. */
export const GAME_SPOTS: Record<string, { board: { x: number; y: number }; card: { x: number; y: number } }> = {
  crew: { board: { x: 1660, y: 48 }, card: { x: 1996, y: 48 } },
  house: { board: { x: 1216, y: 64 }, card: { x: 1552, y: 64 } },
  couple: { board: { x: 1236, y: 52 }, card: { x: 1572, y: 52 } },
};
