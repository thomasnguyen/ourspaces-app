import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import * as rooms from "./tables/rooms";
import * as mail from "./tables/mail";
import * as voice from "./tables/voice";
import * as row from "./tables/rightOfWay";
import * as games from "./tables/games";

// The whole data model at a glance; each table's fields and indexes live in
// convex/tables/<area>.ts. Shape rationale: docs/data-model-plan.md §11.
export default defineSchema({
  ...authTables, // Convex Auth's sessions, accounts and codes (convex/auth.ts)

  // the room
  users: rooms.users, // a person: auth fields plus the colour and emoji that follow them (docs/accounts.md)
  waitlist: rooms.waitlist, // emails from the landing page
  spaces: rooms.spaces, // a room: name, colour, slug, its inbox
  members: rooms.members, // who is in which room, by name and colour
  widgets: rooms.widgets, // the cards on the board, data validated per type (widgetData.ts)
  messages: rooms.messages, // chat, room-wide or on a card
  votes: rooms.votes, // one row per person per poll
  paintMarks: rooms.paintMarks, // strokes on a paint card
  presence: rooms.presence, // live cursors, and who holds a drag
  baselines: rooms.baselines, // what #/admin resets a room to

  // what comes in
  emailEvents: mail.emailEvents, // mail in and out of the room's inbox
  work: mail.work, // the steps a mail or link took, as they happen
  recaps: mail.recaps, // "what moved", daily and asked
  askStreams: mail.askStreams, // a streamed answer's question
  linkRefreshQueue: mail.linkRefreshQueue, // link cards waiting for a fresh scrape

  // voice
  deals: voice.deals, // a voice ask's receipt
  links: voice.links, // one card feeds another (flows)
  briefs: voice.briefs, // the room brief a voice ask reads

  // Right of Way
  aiWrites: row.aiWrites, // every AI write through the one door, with its verdict
  leases: row.leases, // who is holding what, right now
  pending: row.pending, // a write waiting on someone's hand (the ghost)
  choiceVotes: row.choiceVotes, // a write that would override people's choices, put to those people

  // games
  games: games.games, // a game in a room and its phase
  gamePlayers: games.gamePlayers, // who joined it
  gameRounds: games.gameRounds, // each round's prompt and reveal
  gameAnswers: games.gameAnswers, // each pick, held back until the reveal
  awards: games.awards, // stickers a round gave out
  puzzlePieces: games.puzzlePieces, // where each jigsaw piece is
});
