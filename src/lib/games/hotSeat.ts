/**
 * The hot seat: "how well do you know maya". Five questions about one person,
 * every one built by code from something the room already knows. Pure: no
 * React, no clock of its own, nothing simulated.
 *
 *   seatFacts(room, name)   typed facts about one person, each with its key on
 *                           "what this space knows" and the card it came from
 *   askFrom(fact, …)        one fact → one question: the right answer is the
 *                           fact, the wrong ones are the room's own options
 *   WORD                    the wording, one template per fact kind (the only
 *                           step a model will take over, see the note there)
 *   seatPicks(room)         who the space offers for the seat, and why
 *   dealSeat(room, about)   the rounds of a game (two people = one each)
 *
 * Kind, not prying: shared costs are never read, and anything that names a
 * body, money owed or who likes whom is dropped (`PRYING`).
 */
import type { KnowLine } from "../roomKnows";
import type { Award, Game, GameAnswer, GamePerson, GameRound, HotQuestion, SeatReaction } from "./types";

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown): Data[] => (Array.isArray(v) ? (v as Data[]) : []);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const low = (s: string) => s.trim().toLowerCase();
/** a title without its emoji: "maya's bday 🎂" → "maya's bday" */
const plain = (s: string) => s.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").replace(/\s+/g, " ").trim();
const mentions = (text: string, name: string) => new RegExp(`(^|[^a-z])${low(name).replace(/[^a-z0-9]/g, "")}('s)?([^a-z]|$)`).test(low(text));
const PRYING = /\b(ex|crush|kiss\w*|dating|owes?|owed|debt|iou|weigh\w*|diet|body|bod)\b/i;
const isKind = (...texts: string[]) => !texts.some((t) => PRYING.test(t));
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/* ---------- the room, as the game reads it ---------- */

/** A card row: what a live room would read from `widgets` + `widgetData`. */
export type SeatCard = { id: string; type: string; x: number; y: number; w: number; h: number; data: Data };

/**
 * What the question maker takes. `lines` / `forgot` are exactly what the
 * knows page reads (`RoomKnows`); `cards` are the rows those lines were built
 * from, because a line holds the group's summary ("matcha is ahead, 3 of 5")
 * and a question about one person needs their row in it (who voted what).
 */
export type SeatRoom = {
  people: Array<GamePerson & { away?: boolean }>;
  lines: KnowLine[];
  forgot: Array<{ key: string }>;
  cards: SeatCard[];
  /** YYYY-MM-DD */
  today: string;
  /** this week's stickers and points, for choosing the seat */
  awards: Array<{ to: string }>;
  points: Record<string, number>;
};

type Base = { key: string; card?: string; from: string };
export type SeatFact = Base &
  (
    | { kind: "lead"; subject: string; leader: string; options: string[] }
    | { kind: "said"; question: string; text: string; others: string[] }
    | { kind: "vote"; title: string; pick: string; options: string[]; asked: boolean }
    | { kind: "free"; title: string; days: string[]; can: boolean[] }
    | { kind: "claim"; title: string; item: string; others: string[] }
    | { kind: "wrote"; title: string; text: string; others: string[] }
    | { kind: "count"; items: string[]; of: number }
    | { kind: "back"; day: string; days: string[] }
    | { kind: "clock"; city: string; tz: string }
    | { kind: "date"; title: string; days: number }
  );

/** The order a game asks in; a second fact of a kind waits for a second pass. */
const ORDER: SeatFact["kind"][] = ["lead", "said", "vote", "free", "claim", "wrote", "back", "clock", "count", "date"];

function placesOf(room: SeatRoom): string[] {
  const line = room.lines.find((l) => l.key === "places");
  return line ? line.text.replace(/^[^:]*:\s*/, "").split(/,\s*/).filter(Boolean) : [];
}

/** Everything the room knows about one person that is fair to ask. */
export function seatFacts(room: SeatRoom, name: string): SeatFact[] {
  const out: SeatFact[] = [];
  const gone = new Set(room.forgot.map((f) => f.key));
  const of = (type: string) => room.cards.filter((c) => c.type === type);
  const places = placesOf(room);
  const today = Date.parse(room.today);

  /* a poll pinned inside a frame that names them is about their day */
  const frames = of("frame").filter((f) => mentions(str(f.data.title), name));
  const inside = (c: SeatCard) => frames.some((f) => c.x + c.w / 2 > f.x && c.x + c.w / 2 < f.x + f.w && c.y + c.h / 2 > f.y && c.y + c.h / 2 < f.y + f.h);
  const leadCards = new Set<string>();
  for (const c of of("poll")) {
    const title = plain(str(c.data.question));
    const options = arr(c.data.options);
    const sorted = [...options].sort((a, b) => Number(b.votes) - Number(a.votes));
    const votes = options.reduce((n, o) => n + (Number(o.votes) || 0), 0);
    if (!inside(c) || options.length < 2 || !(Number(sorted[0].votes) > Number(sorted[1].votes))) continue;
    const subject = low(title).split(/[^a-z0-9']+/)[0];
    leadCards.add(c.id);
    out.push({ kind: "lead", key: `poll:${title}`, card: c.id, subject, leader: str(sorted[0].label), options: options.map((o) => str(o.label)), from: `from the ${subject} poll · ${Number(sorted[0].votes)} of ${votes}` });
  }

  for (const c of of("dailyQ")) {
    const answers = arr(c.data.answers);
    const mine = answers.find((a) => same(str(a.name), name));
    if (!mine) continue;
    out.push({ kind: "said", key: `question:${plain(str(c.data.question))}`, card: c.id, question: str(c.data.question), text: str(mine.text), others: answers.filter((a) => a !== mine).map((a) => str(a.text)), from: `from today's question · ${low(name)} answered` });
  }

  for (const c of of("poll")) {
    if (leadCards.has(c.id)) continue;
    const title = plain(str(c.data.question));
    const options = arr(c.data.options);
    const mine = options.find((o) => (o.voters as string[] | undefined)?.some((v) => same(v, name)));
    if (!mine) continue;
    const labels = options.map((o) => str(o.label));
    /* a poll about our places can borrow the other places as wrong answers */
    const more = labels.some((l) => places.some((p) => same(p, l))) ? places : [];
    const asked = room.lines.some((l) => l.section === "made" && l.status !== "removed" && low(l.text).includes(low(title)) && low(l.why).startsWith(`${low(name)} said`));
    out.push({ kind: "vote", key: `poll:${title}`, card: c.id, title, pick: str(mine.label), options: [...labels, ...more], asked, from: `from the poll “${title}”${asked ? ` · ${low(name)} asked for it` : ""}` });
  }

  for (const c of of("availability")) {
    const mine = arr(c.data.members).find((m) => same(str(m.name), name));
    const days = (c.data.days as string[] | undefined) ?? [];
    if (!mine || days.length < 2) continue;
    out.push({ kind: "free", key: `days:${plain(str(c.data.title))}`, card: c.id, title: plain(str(c.data.title)), days, can: (mine.slots as boolean[]).map(Boolean), from: `from “${plain(str(c.data.title))}”` });
  }

  for (const c of of("potluck")) {
    const items = arr(c.data.items);
    const mine = items.find((i) => same(str(i.by), name));
    if (!mine) continue;
    const title = plain(str(c.data.title));
    out.push({ kind: "claim", key: `claims:${name}`, card: c.id, title, item: str(mine.name), others: items.filter((i) => i !== mine).map((i) => str(i.name)), from: `from “${title}” · ${low(name)} claimed it` });
  }

  for (const c of of("messageWall")) {
    const notes = arr(c.data.messages);
    const mine = notes.find((n) => same(str(n.from), name));
    if (!mine || notes.length < 3) continue;
    const title = plain(str(c.data.title));
    out.push({ kind: "wrote", key: `wall:${title}`, card: c.id, title, text: str(mine.text), others: notes.filter((n) => n !== mine).map((n) => str(n.text)), from: `from “${title}”` });
  }

  /* the habit line itself: "noor takes things on: oat milk, vacuum" */
  const habit = room.lines.find((l) => same(l.key, `claims:${name}`));
  const taken = habit ? habit.text.replace(/^[^:]*:\s*/, "").split(/,\s*/).filter(Boolean) : [];
  const listed = of("potluck").reduce((n, c) => n + arr(c.data.items).length, 0);
  if (habit && taken.length > 0 && listed > taken.length) out.push({ kind: "count", key: habit.key, card: habit.src[0], items: taken, of: listed, from: `from the lists · ${taken.join(", ")}` });

  const away = room.lines.find((l) => same(l.key, `away:${name}`));
  const back = away && /back (\w+day)/i.exec(away.text)?.[1];
  if (away && back) {
    /* wrong days are other days the board itself mentions */
    const said = new Set<string>();
    for (const c of room.cards) for (const day of DAYS) if (low(JSON.stringify(c.data)).includes(day)) said.add(day);
    out.push({ kind: "back", key: away.key, card: away.src[0], day: low(back), days: [...said], from: `from the board · “${low(away.text)}”` });
  }

  for (const c of of("dualClock")) {
    for (const side of [c.data.left, c.data.right] as Data[]) {
      if (!side || !same(str(side.label), name)) continue;
      const city = low(str(side.tz).split("/").pop() ?? "").replace(/_/g, " ");
      out.push({ kind: "clock", key: "zones", card: c.id, city, tz: str(side.tz), from: `from the clocks card · ${city} time` });
    }
  }

  for (const c of of("countdown")) {
    const title = str(c.data.event);
    const date = str(c.data.targetDate);
    /* theirs if it names them; in a room of two, a day you're both counting to is each of yours */
    const theirs = mentions(title, name) || (room.people.length === 2 && (c.data.hyped as string[] | undefined)?.some((h) => same(h, name)));
    if (!theirs || !date) continue;
    const days = Math.round((Date.parse(date) - today) / 86_400_000);
    if (days < 0) continue;
    const when = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toLowerCase().replace(",", "");
    out.push({ kind: "date", key: `date:${title}`, card: c.id, title, days, from: `from the countdown · ${when}` });
  }

  return out.filter((fact) => !gone.has(fact.key) && isKind(...Object.values(fact).filter((v): v is string => typeof v === "string")));
}

/* ---------- the wording ---------- */

/**
 * One template per fact kind. This is the only step a model takes over in a
 * live room: it gets the fact and the name and returns one line; the options,
 * the right answer and the fact line stay code's. Swap `WORD[kind]` for the
 * model call and nothing else moves.
 */
export const WORD: { [K in SeatFact["kind"]]: (fact: Extract<SeatFact, { kind: K }>, name: string) => string } = {
  lead: (f, n) => `what's ${n}'s ${f.subject} going to be?`,
  said: (f, n) => (/\byour?\b/i.test(f.question) ? low(f.question).replace(/\byour\b/g, `${n}'s`).replace(/\byou\b/g, n) : `“${low(f.question)}” what did ${n} say?`),
  vote: (f, n) => `what did ${n} vote on “${f.title}”`,
  free: (f, n) => {
    const no = f.can.filter((c) => !c).length;
    if (no === 1) return `which day can't ${n} make?`;
    if (f.can.length - no === 1) return `which one day can ${n} make?`;
    return `how many of ${f.days.map(low).join(", ").replace(/, ([^,]*)$/, " and $1")} can ${n} make?`;
  },
  claim: (f, n) => `what did ${n} take on “${f.title}”?`,
  wrote: (f, n) => `which one on “${f.title}” is ${n}'s?`,
  back: (_f, n) => `when is ${n} back?`,
  count: (f, n) => `how many of the ${f.of} things on the lists has ${n} taken on?`,
  clock: (_f, n) => `what time is it for ${n} right now?`,
  date: (f) => `how many days till ${low(f.title)}?`,
};

function shuffled<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One fact → one question, or nothing if the room has no wrong answer to offer. */
export function askFrom(fact: SeatFact, about: string, rand: () => number, now: number): HotQuestion | null {
  const n = low(about);
  const base = { id: `${fact.kind}:${fact.card ?? fact.key}:${n}`, about, fact: { key: fact.key, kind: fact.kind, card: fact.card, from: fact.from } };
  const text = (WORD[fact.kind] as (f: SeatFact, name: string) => string)(fact, n);
  const choice = (right: string, wrongs: string[]): HotQuestion | null => {
    const seen = new Set([low(right)]);
    const wrong = wrongs.filter((w) => w && !seen.has(low(w)) && seen.add(low(w))).slice(0, 3);
    return wrong.length ? { ...base, text, form: "choice", options: shuffled([right, ...wrong], rand), right } : null;
  };
  const number = (right: number, max: number, unit: string, clock = false): HotQuestion => ({ ...base, text, form: "number", options: [], right: String(right), range: { min: 0, max, unit, clock } });
  switch (fact.kind) {
    case "lead":
      return choice(fact.leader, fact.options);
    case "said":
      return choice(fact.text, fact.others);
    case "vote":
      return choice(fact.pick, fact.options);
    case "claim":
      return choice(fact.item, fact.others);
    case "wrote":
      return choice(fact.text, fact.others);
    case "back":
      return choice(fact.day, fact.days);
    case "free": {
      const no = fact.can.filter((c) => !c).length;
      if (no === 1) return choice(fact.days[fact.can.indexOf(false)], fact.days);
      if (fact.can.length - no === 1) return choice(fact.days[fact.can.indexOf(true)], fact.days);
      return number(fact.can.length - no, fact.days.length, "days");
    }
    case "count":
      return number(fact.items.length, fact.of, "things");
    case "clock": {
      const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: fact.tz }).format(now)) % 24;
      return number(hour, 23, "", true);
    }
    case "date":
      /* the slider's far end is well past the answer, on a round number */
      return number(fact.days, fact.days <= 8 ? 14 : Math.ceil((fact.days * 1.6) / 10) * 10, "days");
  }
}

export const MAX_ASKS = 5;

/** Every question the room can ask about one person, in playing order: one
    per fact kind first, then seconds; one per card; sliders last. */
export function questionsFor(room: SeatRoom, about: string, rand: () => number, now: number): HotQuestion[] {
  const facts = seatFacts(room, about).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || Number(b.kind === "vote" && b.asked) - Number(a.kind === "vote" && a.asked));
  const passes: HotQuestion[][] = [[], []];
  const cards = new Set<string>();
  const seen: Record<string, number> = {};
  for (const fact of facts) {
    const nth = seen[fact.kind] ?? 0;
    if (nth > 1 || (fact.card && cards.has(fact.card))) continue;
    const ask = askFrom(fact, about, rand, now);
    if (!ask) continue;
    seen[fact.kind] = nth + 1;
    if (fact.card) cards.add(fact.card);
    passes[nth].push(ask);
  }
  return passes.flat();
}

const sliderLast = (asks: HotQuestion[]) => [...asks.filter((a) => a.form === "choice"), ...asks.filter((a) => a.form === "number")];

/* ---------- who's in the seat ---------- */

export type SeatPick = GamePerson & {
  /** why the space offers them, if it has a reason */
  why?: string;
  /** how many questions it could ask about them */
  known: number;
  away?: boolean;
};

/**
 * Who could sit, best offer first. The reasons, in order: a birthday inside
 * two weeks · just back from being away (a `back:<name>` line) · the most
 * award stickers this week · top of the board. Someone away can't sit: the
 * seat reacts, so they have to be here.
 */
export function seatPicks(room: SeatRoom, rand: () => number, now: number): SeatPick[] {
  const here = room.people.filter((p) => !p.away);
  const stickers = (name: string) => room.awards.filter((a) => same(a.to, name)).length;
  const most = Math.max(0, ...here.map((p) => stickers(p.name)));
  const top = [...here].sort((a, b) => (room.points[b.name] ?? 0) - (room.points[a.name] ?? 0))[0];
  const picks = room.people.map((person): SeatPick & { rank: number } => {
    const facts = seatFacts(room, person.name);
    const bday = facts.find((f) => f.kind === "date" && /b-?day|birthday|turns/i.test(f.title) && f.days <= 14);
    const known = questionsFor(room, person.name, rand, now).length;
    const base = { name: person.name, color: person.color, known, away: person.away };
    if (person.away) return { ...base, rank: 9 };
    if (bday && bday.kind === "date") return { ...base, why: bday.days === 0 ? "it's their birthday" : `birthday in ${bday.days} day${bday.days === 1 ? "" : "s"}`, rank: 0 };
    if (room.lines.some((l) => same(l.key, `back:${person.name}`))) return { ...base, why: "just back from being away", rank: 1 };
    if (most > 0 && stickers(person.name) === most) return { ...base, why: `most stickers this week · ${most}`, rank: 2 };
    if (top && same(top.name, person.name)) return { ...base, why: "top of the board this week", rank: 3 };
    return { ...base, rank: 5 };
  });
  /* a reason only counts if there's something to ask */
  return picks.sort((a, b) => Number(b.known > 1) - Number(a.known > 1) || a.rank - b.rank || b.known - a.known).map(({ rank: _rank, ...pick }) => pick);
}

/* ---------- the game ---------- */

export const SEAT_REACTIONS: Array<{ kind: SeatReaction; label: string; glyph: string }> = [
  { kind: "ha", label: "ha", glyph: "😆" },
  { kind: "wrong", label: "wrong", glyph: "🙅" },
  { kind: "who-told-you", label: "who told you", glyph: "🤨" },
];

export const seatName = (about: string[]) => (about.length === 2 ? "how well do you know each other" : `how well do you know ${low(about[0])}`);

/** The rounds: one question each; a room of two gets one each per round, about the other. */
export function dealSeat(room: SeatRoom, about: string[], rand: () => number, now: number): { asks: HotQuestion[][]; known: number } {
  if (about.length === 2) {
    const [a, b] = about.map((name) => questionsFor(room, name, rand, now));
    const n = Math.min(a.length, b.length, MAX_ASKS);
    /* pair them by kind where both have one, so a round reads as one question asked twice */
    const pairs: HotQuestion[][] = [];
    const left = [...b];
    for (const qa of a.slice(0, n)) {
      const at = Math.max(0, left.findIndex((qb) => qb.fact.kind === qa.fact.kind));
      pairs.push([qa, left.splice(at, 1)[0]]);
    }
    const sorted = [...pairs.filter((p) => p.every((q) => q.form === "choice")), ...pairs.filter((p) => p.some((q) => q.form === "number"))];
    return { asks: sorted, known: Math.min(a.length, b.length) };
  }
  const all = questionsFor(room, about[0], rand, now);
  return { asks: sliderLast(all.slice(0, MAX_ASKS)).map((q) => [q]), known: all.length };
}

/** The question this person answers in a round: the one that isn't about them. */
export const askFor = (round: GameRound, name: string): HotQuestion | undefined => round.asks?.find((ask) => !same(ask.about, name));
/** The question a person reacts to: the one that is. */
export const askAbout = (round: GameRound, name: string): HotQuestion | undefined => round.asks?.find((ask) => same(ask.about, name));

/** How far a number answer is from right (hours wrap round the clock). */
export function distance(ask: HotQuestion, pick: string): number {
  const d = Math.abs(Number(pick) - Number(ask.right));
  return ask.range?.clock ? Math.min(d, 24 - d) : d;
}

/** Who got a round: the right option, or the closest number (ties share). */
export function seatWinners(round: GameRound): string[] {
  const rows = round.answers.flatMap((a) => {
    const ask = askFor(round, a.by);
    return ask ? [{ a, ask }] : [];
  });
  const numbers = rows.filter((r) => r.ask.form === "number");
  const best = Math.min(...numbers.map((r) => distance(r.ask, r.a.pick)));
  return rows.filter((r) => (r.ask.form === "choice" ? same(r.a.pick, r.ask.right) : distance(r.ask, r.a.pick) === best)).map((r) => r.a.by);
}

export type SeatRank = GamePerson & { points: number; of: number };

/** The end: guessers by points; a tie goes to whoever was nearer on the sliders, then quicker. */
export function seatRanking(game: Game): SeatRank[] {
  const played = game.rounds.filter((r) => r.revealedAt !== undefined);
  const mine = (name: string) => played.flatMap((r) => r.answers.filter((a) => same(a.by, name)).map((a) => ({ r, a })));
  const off = (name: string) => mine(name).reduce((n, { r, a }) => { const ask = askFor(r, name); return n + (ask?.form === "number" ? distance(ask, a.pick) : 0); }, 0);
  const speed = (name: string) => mine(name).reduce((n, { r, a }) => n + (a.at - ((r.endsAt ?? a.at) - 14_000)), 0);
  return game.players
    .filter((p) => game.rounds.some((r) => askFor(r, p.name)))
    .map((p) => ({ name: p.name, color: p.color, points: played.filter((r) => r.winners.some((w) => same(w, p.name))).length, of: played.length }))
    .sort((a, b) => b.points - a.points || off(a.name) - off(b.name) || speed(a.name) - speed(b.name));
}

/** What a finished game hands out: one for knowing them best, a kind one for last. */
export function seatAwards(game: Game): Award[] {
  if (game.phase !== "done" || !game.seat?.length) return [];
  const rows = seatRanking(game);
  const at = game.rounds[game.rounds.length - 1]?.revealedAt ?? game.startedAt;
  const make = (to: string, title: string, glyph: string, tone: number): Award => ({ id: `${game.id}:seat:${to}:${tone}`, room: game.room, gameId: game.id, to, title, glyph, prompt: game.name, tone, at });
  if (rows.length === 0 || rows[0].points === 0) return [];
  if (game.seat.length === 2) {
    if (rows[1] && rows[1].points === rows[0].points) return rows.slice(0, 2).map((r) => make(r.name, "two of a kind", "🫶", 1));
    const other = game.seat.find((p) => !same(p.name, rows[0].name));
    return [make(rows[0].name, `knows ${low(other?.name ?? "you")} by heart`, "🫶", 1)];
  }
  const who = low(game.seat[0].name);
  const out = [make(rows[0].name, `knows ${who} best`, "🔮", 3)];
  const last = rows[rows.length - 1];
  if (rows.length > 2 && last.points < rows[0].points) out.push(make(last.name, `has met ${who}`, "👋", 4));
  return out;
}

/** What stays on the board: the questions, the right answers and the reactions. */
export type Keepsake = {
  gameId: string;
  room: string;
  title: string;
  seat: GamePerson[];
  why?: string;
  at: number;
  rows: Array<{ ask: HotQuestion; got: number; of: number; reaction?: SeatReaction }>;
  best?: SeatRank;
};

export function keepsakeOf(game: Game): Keepsake | undefined {
  if (game.kind !== "hot-seat" || game.phase !== "done" || !game.seat) return undefined;
  const rows = game.rounds
    .filter((r) => r.revealedAt !== undefined)
    .flatMap((r) => (r.asks ?? []).map((ask) => ({ ask, got: r.answers.filter((a: GameAnswer) => r.winners.some((w) => same(w, a.by)) && askFor(r, a.by) === ask).length, of: r.answers.filter((a) => askFor(r, a.by) === ask).length, reaction: r.reactions?.find((x) => same(x.by, ask.about))?.kind })));
  return { gameId: game.id, room: game.room, title: game.seat.length === 2 ? "how well we know each other" : `how well we know ${low(game.seat[0].name)}`, seat: game.seat, why: game.seatWhy, at: game.startedAt, rows, best: seatRanking(game)[0] };
}
