import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { Challenge, RoomFacts } from "../src/lib/deck/resolve";
import { rank, readCheckIn, readStandings, revealDate } from "../src/lib/challenge";
import { applyCorrections, listNames, TOLD_CHARS, TOLD_MAX, type Forgot, type KnowLine, type RoomKnows, type Told } from "../src/lib/roomKnows";

/**
 * The room brief (path-to-win §3 "The room has a brain"): a few short lines a
 * voice ask carries so the model fills cards the way this group would. Built
 * by code from rows the room already has, never by a model, and stored in
 * `briefs` so the ask reads one small document instead of the board.
 *
 * Every line traces to rows: the group is the seeded cast (or, in a real
 * room, everyone who wrote, voted or made something), the board is widget
 * titles, and a habit needs two separate sources (two widgets, a widget and a
 * message, …) before it is said. The counts behind each habit go in `facts`.
 * Names and board text only; no emails, no ids, nothing from mail.
 *
 * Fresh by cron (`refreshActive`, every 10 min: rooms with activity since
 * their brief, and every room once a day for its dates), or `refresh`
 * directly after a write that matters. `getBrief` is what the ask reads;
 * `inspect` is the public, read-only view with a source note per line.
 */

/** Nemotron reads this text at ~2.7 chars a token (quotes, dates, emoji;
 * measured as prompt_tokens with and without it in nebius/eval/brief):
 * 640 chars ≈ 237 tokens, under the 250 the brief may never pass. */
const MAX_CHARS = 640;
const MIN_EVIDENCE = 2;

/** The deck's name for each widget type, so the brief speaks the model's words. */
const CARD_NAME: Record<string, string> = {
  poll: "poll",
  potluck: "checklist",
  countdown: "countdown",
  rsvp: "rsvp",
  wheel: "wheel",
  note: "note",
  dailyQ: "question",
  availability: "availability",
  expenseSplit: "split",
  itinerary: "itinerary",
  messageWall: "messages",
  jokeRegistry: "jokes",
  quote: "quote",
  decision: "decision",
  dualClock: "clocks",
  photoWall: "photos",
  playlist: "radio",
  linkShelf: "links",
  linkCard: "link",
  frame: "section",
};

/** Not the group's words: live feeds, outside mail, decoration. */
const SKIP_TYPES = new Set(["letter", "sticker", "weather", "sports", "backendLive", "chat", "cozyColor"]);

/** Keys whose strings are the group's own words. Everything else (names,
 * urls, tones, scraped text, the AI's "because") is skipped when counting. */
const WORD_KEYS = new Set([
  "title", "subtitle", "question", "label", "name", "text", "event", "plan", "caption", "detail", "kicker", "options", "items", "slices", "answers", "messages", "jokes", "links", "days", "history", "topAnswer",
]);

const STOP = new Set(
  `the a an and or but of to in on at for with from by is are was were be been it its this that these those i you he she we they me my our your his her their them us
  so if then than too very just not no yes ok okay pls please lol omg yep yeah really actually again still also even more most some any all each every one two
  what who whom whose when where why how which do does did done have has had will would can could should may might must get got go going gonna make made let lets
  about after before into over under out up down off here there now new old good great best nice cool fun day days week weeks today tonight tomorrow time times
  thing things stuff someone something anyone everyone people group board poll list note card question open claim claimed claiming vote voted voters option options
  who's what's it's i'm let's don't can't won't that's there's you're we're they're i've we've i'll we'll`.split(/\s+/),
);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_RE = /\b(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)s?\b/gi;
const DAY_OF: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_WORDS = new Set("sun sunday mon monday tue tues tuesday wed wednesday thu thur thurs thursday fri friday sat saturday".split(" ").flatMap((d) => [d, `${d}s`]));
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b|\b(noon|midnight)\b/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

type Fact = { kind: string; what: string; n: number; from: string[] };
/** One line of the brief and the rows behind it ("votes 5 · widgets rsvp"). */
type BriefLine = { text: string; src: string };
/** The page's noticed half: the cast with colours, and a line per fact with its cards. */
type Noticed = Pick<RoomKnows, "people" | "lines">;
export type Brief = { text: string; facts: Fact[]; lines: BriefLine[]; room: RoomFacts; knows: Noticed };
/** What a `briefs` row's `facts` JSON holds. `told` and `forgot` are people's corrections and outlive every rebuild. */
type Stored = { lines?: BriefLine[]; facts?: Fact[]; room?: RoomFacts; knows?: Noticed; told?: Told[]; forgot?: Forgot[] };

type Data = Record<string, unknown>;
const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function titleOf(w: Doc<"widgets">): string {
  const d = w.data as Data;
  const t = str(d.title) || str(d.question) || str(d.event) || str(d.kicker) || str(d.caption) || str(d.label) || str(d.text);
  return clip(t.replace(/\s+/g, " "), 30);
}

/** Every string under a word key, walked through arrays and objects. */
function wordsOf(x: unknown, out: string[], key = "title"): string[] {
  if (typeof x === "string") {
    // A bare string under "days" is an availability card's offered day, not a pick.
    if (WORD_KEYS.has(key) && key !== "days") out.push(x);
  } else if (Array.isArray(x)) {
    for (const y of x) wordsOf(y, out, key);
  } else if (x && typeof x === "object") {
    for (const [k, y] of Object.entries(x)) if (WORD_KEYS.has(k)) wordsOf(y, out, k);
  }
  return out;
}

/** Adds one source's distinct hits to a tally: a word said twice in one note counts once. */
function tally(map: Map<string, Set<string>>, hits: Iterable<string>, source: string) {
  for (const h of new Set(hits)) {
    if (!map.has(h)) map.set(h, new Set());
    map.get(h)!.add(source);
  }
}

function counted(map: Map<string, Set<string>>, kind: string): Fact[] {
  return [...map.entries()]
    .filter(([, s]) => s.size >= MIN_EVIDENCE)
    .map(([what, s]) => ({ kind, what, n: s.size, from: [...s].slice(0, 6) }))
    .sort((a, b) => b.n - a.n || a.what.localeCompare(b.what));
}

export async function buildBrief(ctx: QueryCtx, spaceId: Id<"spaces">, now = Date.now()): Promise<Brief | null> {
  const space = await ctx.db.get(spaceId);
  if (!space) return null;
  const [roster, widgets, recent, deals] = await Promise.all([
    ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(500),
    ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(300),
    ctx.db.query("messages").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(300),
    ctx.db.query("deals").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).order("desc").take(200),
  ]);
  /* Cards a voice ask dealt are the model's words, not the group's: they stay
     on the board list but never count toward a habit, or the brief would feed
     the model its own guesses back. Votes and claims on them still count. */
  const dealt = new Set<string>();
  for (const d of deals) {
    try {
      for (const c of (JSON.parse(d.run) as { cards?: { widgetId?: string }[] }).cards ?? []) if (c.widgetId) dealt.add(c.widgetId);
    } catch {
      // a malformed receipt only means one fewer card to leave out
    }
  }
  const polls = widgets.filter((w) => w.type === "poll").slice(0, 20);
  const pollVotes = await Promise.all(
    polls.map((p) => ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", p._id)).take(200)),
  );

  /* Who's in the group. Demo rooms are public and every anonymous visitor
     writes a members row (the crew: 6 friends, ~90 drive-bys), so the same
     rule as the inbox split: a seeded cast IS the group. A real room has no
     cast; there the group is whoever wrote, voted or made something, and
     only if nobody has, the 12 most recently seen. */
  const did = new Map<string, number>();
  const bump = (userId: string) => did.set(userId, (did.get(userId) ?? 0) + 1);
  for (const m of recent) if (m.widgetId !== "recap") bump(m.userId);
  for (const vs of pollVotes) for (const vote of vs) bump(vote.userId);
  for (const w of widgets) bump(w.createdBy);
  const seeded = roster.filter((m) => m.userId.startsWith("seed:"));
  // a made room's roster is only people who had its link: all of them are the group from the moment they walk in
  let cast = seeded.length ? seeded : space.ownerId ? [...roster] : roster.filter((m) => did.has(m.userId));
  if (!cast.length) cast = [...roster].sort((a, b) => b.lastSeen - a.lastSeen);
  const castIds = new Set(cast.map((m) => m.userId));
  const names: string[] = [];
  for (const m of [...cast].sort((a, b) => (did.get(b.userId) ?? 0) - (did.get(a.userId) ?? 0))) {
    if (!names.some((n) => n.toLowerCase() === m.name.toLowerCase())) names.push(m.name);
  }
  const group = names.slice(0, 12);
  const isName = new Set(group.map((n) => n.toLowerCase()));

  /* The group's board: what the cast made (in a public demo room, a
     visitor's or a test harness's cards aren't the group's). Dealt cards are
     the model's words, so they never count toward a habit. */
  const own = widgets.filter(
    (w) => !SKIP_TYPES.has(w.type) && w.createdBy !== "mail" && (w.createdBy.startsWith("seed") || castIds.has(w.createdBy)),
  );
  const said = own.filter((w) => !dealt.has(w._id));
  /* A habit's source back to its card, for the page's camera. */
  const srcWid = new Map<string, string>();
  const sources: { id: string; text: string }[] = [
    ...said.map((w) => {
      const id = `${CARD_NAME[w.type] ?? w.type} "${titleOf(w)}"`;
      srcWid.set(id, w._id);
      return { id, text: wordsOf(w.data, []).join(" · ") };
    }),
    ...recent
      .filter((m) => m.widgetId !== "recap" && castIds.has(m.userId))
      .map((m) => ({ id: `${m.authorName}: "${clip(m.text, 40)}"`, text: m.text })),
  ];
  const groupMessages = sources.length - said.length;

  const terms = new Map<string, Set<string>>();
  const days = new Map<string, Set<string>>();
  const times = new Map<string, Set<string>>();
  let emoji = 0;
  for (const s of sources) {
    const lower = s.text.toLowerCase();
    tally(days, [...lower.matchAll(DAY_RE)].map((m) => WEEKDAYS[DAY_OF[m[1].slice(0, 3)]]), s.id);
    tally(
      times,
      [...lower.matchAll(TIME_RE)].map((m) => m[4] ?? `${Number(m[1])}${m[2] && m[2] !== "00" ? `:${m[2]}` : ""}${m[3]}`),
      s.id,
    );
    if (EMOJI_RE.test(s.text)) emoji++;
    const words = lower
      .replace(/['’]s\b/g, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 3 && !/^\d/.test(t) && !STOP.has(t) && !isName.has(t) && !DAY_WORDS.has(t));
    tally(terms, words, s.id);
  }
  // A day the group settled on counts too: an availability card's best day.
  for (const w of said) {
    const best = str((w.data as Data).best).toLowerCase().slice(0, 3);
    if (w.type === "availability" && best in DAY_OF) {
      srcWid.set(`availability "${titleOf(w)}" best`, w._id);
      tally(days, [WEEKDAYS[DAY_OF[best]]], `availability "${titleOf(w)}" best`);
    }
  }

  /* Today, in the room's first clock zone if it keeps clocks, else UTC. */
  const zones: { label: string; tz: string }[] = [];
  for (const w of own.filter((w) => w.type === "dualClock")) {
    const d = w.data as { left?: { label?: string; tz?: string }; right?: { label?: string; tz?: string } };
    for (const side of [d.left, d.right]) if (side?.tz) zones.push({ label: side.label ?? "", tz: side.tz });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zones[0]?.tz ?? "UTC" }).format(new Date(now));
  const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
  const dow = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()].slice(0, 3);
  const t0 = dayNo(today);

  /* Dated things, with the arithmetic done here so the model never does it. */
  const dated: string[] = [];
  const countdowns = own
    .filter((w) => w.type === "countdown" && /^\d{4}-\d{2}-\d{2}$/.test(str((w.data as Data).targetDate)))
    .map((w) => ({ title: titleOf(w), date: str((w.data as Data).targetDate) }))
    .filter((c) => dayNo(c.date) - t0 >= -45)
    .sort((a, b) => dayNo(a.date) - dayNo(b.date));
  for (const c of countdowns.slice(0, 3)) {
    const left = dayNo(c.date) - t0;
    if (left < 0) dated.push(`${c.title} was ${dow(c.date)} ${c.date} (${-left} days ago)`);
    else if (left === 0) dated.push(`${c.title} is today`);
    else dated.push(`${c.title} ${dow(c.date)} ${c.date}, in ${left} days${left > 2 ? ` (2 days before = ${isoOf(dayNo(c.date) - 2)})` : ""}`);
  }
  const toSat = (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7 || 7;
  dated.push(`this weekend = Sat ${isoOf(t0 + toSat)}, Sun ${isoOf(t0 + toSat + 1)}`);

  /* Who's away: a cast name next to "out" / "away" / "traveling" on the board. */
  const away = new Map<string, string>();
  const awayWid = new Map<string, string>();
  for (const w of own) {
    const d = w.data as Data;
    for (const s of [str(d.title), str(d.subtitle), str(d.text), str(d.kicker)]) {
      for (const n of group) {
        const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s| is)? (?:out|away|traveling|travelling|sick|gone)\\b`, "i");
        if (re.test(s) && !away.has(n)) {
          away.set(n, clip(s, 30));
          awayWid.set(n, w._id);
        }
      }
    }
  }

  /* Live polls (leader from the votes table) and RSVPs. */
  const live: string[] = [];
  const pollFacts: Fact[] = [];
  const pollRows: RoomFacts["polls"] = [];
  polls.forEach((p, i) => {
    if (!own.includes(p)) return;
    const options = ((p.data as Data).options as { id: string; label: string }[] | undefined) ?? [];
    const per = new Map<string, number>();
    for (const vote of pollVotes[i]) per.set(vote.optionId, (per.get(vote.optionId) ?? 0) + 1);
    const total = pollVotes[i].length;
    const [topId, top] = [...per.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    const tied = [...per.values()].filter((n) => n === top).length > 1;
    const label = options.find((o) => o.id === topId)?.label;
    pollRows.push({ title: titleOf(p), options: options.map((o) => o.label), leader: total && label && !tied ? label : null, lead: top, votes: total });
    if (!total || !label) return;
    live.push(`"${titleOf(p)}": ${tied ? "tied" : `${label} leads ${top} of ${total}`}`);
    pollFacts.push({ kind: "poll", what: `${titleOf(p)} → ${tied ? "tied" : label}`, n: total, from: [`${total} votes`] });
  });
  let rsvpRows = 0;
  const rsvps: RoomFacts["rsvps"] = [];
  for (const w of own.filter((w) => w.type === "rsvp")) {
    const d = w.data as { responses?: { name?: string; status?: string }[]; waitingOn?: string[] };
    const rs = d.responses ?? [];
    if (!rs.length) continue;
    rsvpRows += rs.length;
    const of = (s: string) => rs.filter((r) => r.status === s && r.name).map((r) => r.name);
    const parts = [`yes ${of("yes").join(", ") || "nobody"}`];
    if (of("no").length) parts.push(`no ${of("no").join(", ")}`);
    if (of("maybe").length) parts.push(`maybe ${of("maybe").join(", ")}`);
    if (d.waitingOn?.length) parts.push(`no answer yet ${d.waitingOn.join(", ")}`);
    rsvps.push({ title: titleOf(w), yes: of("yes") as string[], no: of("no") as string[], maybe: of("maybe") as string[], waiting: d.waitingOn ?? [] });
    live.push(`"${titleOf(w)}": ${parts.join("; ")}`);
  }

  /* Who paid and who claimed before. */
  const before: string[] = [];
  const splits = own.filter((w) => w.type === "expenseSplit");
  for (const w of splits.slice(0, 2)) {
    const ss = ((w.data as Data).splits as { name: string; paid?: number }[] | undefined) ?? [];
    const payer = [...ss].sort((a, b) => (b.paid ?? 0) - (a.paid ?? 0))[0];
    if (payer?.paid) before.push(`"${titleOf(w)}": ${payer.name} paid most (${payer.paid} of ${(w.data as Data).total}); on it ${ss.map((s) => s.name).join(", ")}`);
  }
  const claims = new Map<string, string[]>();
  const claimWid = new Map<string, Set<string>>();
  let claimRows = 0;
  for (const w of own.filter((w) => w.type === "potluck")) {
    for (const it of ((w.data as Data).items as { name?: string; by?: string | null; claimed?: boolean }[] | undefined) ?? []) {
      const by = str(it.by);
      if (!it.claimed || !by) continue;
      claimRows++;
      if (!claims.has(by)) claims.set(by, []);
      if (!claimWid.has(by)) claimWid.set(by, new Set());
      claimWid.get(by)!.add(w._id);
      claims.get(by)!.push(clip(str(it.name).replace(/^\p{L}+day\s*·\s*/iu, ""), 20));
    }
  }
  if ([...claims.values()].some((items) => items.length >= MIN_EVIDENCE)) before.push(`claimed: ${[...claims].filter(([, items]) => items.length >= MIN_EVIDENCE).map(([who, items]) => `${who} ${items.join(" + ")}`).join(", ")}`);
  let lastSpin = "";
  for (const w of own.filter((w) => w.type === "wheel")) {
    const d = w.data as { slices?: { label: string }[]; resultIndex?: number; spinNonce?: number; spunBy?: string };
    const hit = d.slices?.[d.resultIndex ?? -1]?.label;
    if (hit) lastSpin = `"${titleOf(w)}" last landed on ${hit}`;
  }
  if (lastSpin) before.push(lastSpin);

  /* How they title things. */
  const titles = said.map(titleOf).filter((t) => /\p{L}/u.test(t));
  const lowerTitles = titles.filter((t) => /^[^\p{L}]*\p{Ll}/u.test(t)).length;
  const style: string[] = [];
  if (titles.length >= 4 && lowerTitles / titles.length >= 0.7) style.push("titles lowercase");
  if (titles.length >= 4 && lowerTitles / titles.length <= 0.3) style.push("titles Capitalized");
  if (emoji >= MIN_EVIDENCE) style.push("emoji now and then");

  const dayFacts = counted(days, "day");
  const timeFacts = counted(times, "time");
  const termFacts = counted(terms, "word").slice(0, 6);
  const lead = (fs: Fact[]) => (fs.length && (fs.length === 1 || fs[0].n > fs[1].n) ? [fs[0]] : []);
  const habits = [
    ...lead(dayFacts).map((f) => `day they pick ${f.what} (${f.n}×)`),
    ...lead(timeFacts).map((f) => `time they meet ${f.what} (${f.n}×)`),
  ];

  /* The board by title, deck cards first. Named as already there: in the
     first A/B a bare board list read as part of the ask and got re-dealt. */
  const order = Object.keys(CARD_NAME);
  const board = said
    .filter((w) => CARD_NAME[w.type] && w.type !== "frame" && titleOf(w))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || b.createdAt - a.createdAt)
    .map((w) => `${CARD_NAME[w.type]} "${titleOf(w)}"`);

  /* Running challenges: every check-in on the board (its numbers are people's own logs, whoever dealt the card). */
  const checkIns = widgets.filter((w) => w.type === "checkIn").sort((a, b) => b.createdAt - a.createdAt).slice(0, 2);
  const challenges: Challenge[] = checkIns.map((w) => {
    const data = readCheckIn(w.data as Record<string, unknown>);
    const i = t0 - dayNo(data.start);
    const day = Math.max(0, Math.min(i, data.days - 1));
    const rows = rank(data, day);
    const live = i >= 0 && i < data.days;
    const logged = live ? data.people.filter((p) => data.logs[p.name]?.[i] != null).map((p) => p.name) : [];
    const rd = revealDate(data);
    const revealIso = data.revealAt?.slice(0, 10) ?? null;
    const stand = widgets.find((s) => s.type === "standings" && readStandings(s.data as Record<string, unknown>).source === w._id);
    return {
      title: data.title,
      unit: data.unit,
      day: day + 1,
      days: data.days,
      reveal: rd && revealIso ? `${dow(revealIso)} ${rd.getHours()}:${String(rd.getMinutes()).padStart(2, "0")}` : null,
      revealIn: revealIso ? dayNo(revealIso) - t0 : null,
      people: data.people.map((p) => p.name),
      logged,
      waiting: live ? data.people.map((p) => p.name).filter((n) => !logged.includes(n)) : [],
      totals: rows.map((r) => ({ name: r.name, total: r.total, streak: r.streak, perfect: r.perfect })),
      stake: stand ? (readStandings(stand.data as Record<string, unknown>).stake ?? null) : null,
    };
  });
  const challengeWid = new Map(checkIns.map((w, k) => [challenges[k].title, [String(w._id), ...widgets.filter((s) => s.type === "standings" && readStandings(s.data as Record<string, unknown>).source === w._id).map((s) => String(s._id))]]));
  /* Assemble: each line with the rows behind it, most useful first. */
  type Line = { text: string; src: string; keep: number };
  const ruleNote = seeded.length ? "the seeded cast" : cast === roster ? "most recently seen" : "everyone who wrote, voted or made something";
  const all: Line[] = [
    {
      text: `Background, not the ask (their board, today ${dow(today)} ${today}): adds no cards; use only to fill names, dates, options; invent nothing.`,
      src: "code",
      keep: 0,
    },
    { text: `${space.name} (${space.type === "event" ? "one event" : "ongoing"}) · people: ${group.join(", ")}`, src: `spaces 1 · members ${group.length} of ${roster.length} rows (${ruleNote})`, keep: 0 },
    ...(away.size ? [{ text: `away: ${[...away].map(([n, s]) => `${n} ("${s}")`).join(", ")}`, src: `widgets ${away.size}`, keep: 1 }] : []),
    { text: `dates: ${dated.join("; ")}`, src: `widgets ${countdowns.length} countdowns · code`, keep: 1 },
    ...challenges.map((c) => ({
      text: `challenge "${c.title}": day ${c.day} of ${c.days}${c.reveal ? `, reveal ${c.reveal}` : ""} · ${c.totals.map((t) => `${t.name} ${t.total}`).join(", ")}${c.logged.length ? ` · logged today ${c.logged.join(", ")}` : ""}${c.waiting.length ? ` · not yet ${c.waiting.join(", ")}` : ""}${c.stake ? ` · stake: ${c.stake}` : ""}`,
      src: "widgets checkIn + standings",
      keep: 1,
    })),
    ...(live.length ? [{ text: `votes so far: ${live.join(" · ")}`, src: `votes ${pollVotes.flat().length} · widgets ${rsvpRows ? "rsvp" : ""}`.trim(), keep: 1 }] : []),
    ...(zones.length ? [{ text: `clocks: ${zones.map((z) => `${z.label} ${z.tz}`).join(", ")}`, src: `widgets ${zones.length / 2} clocks`, keep: 1 }] : []),
    ...(before.length ? [{ text: `before: ${before.join("; ")}`, src: `widgets ${splits.length} splits, ${claimRows} claims`, keep: 2 }] : []),
    ...(board.length ? [{ text: `on the board already (don't re-add): ${board.join(", ")}`, src: `widgets ${board.length} of ${widgets.length}`, keep: 3 }] : []),
    ...(habits.length ? [{ text: `habits: ${habits.join("; ")}`, src: `widgets + messages ${said.length + groupMessages}, each 2+ sources`, keep: 4 }] : []),
    ...(termFacts.length ? [{ text: `words they use: ${termFacts.map((f) => f.what).join(", ")}`, src: `widgets + messages, each 2+ sources`, keep: 5 }] : []),
    ...(style.length ? [{ text: `style: ${style.join("; ")}`, src: `widgets ${titles.length} titles`, keep: 5 }] : []),
  ];
  // Over the cap: shorten the board list, then drop the least useful lines.
  const size = (ls: Line[]) => ls.reduce((n, l) => n + l.text.length + 1, 0);
  let lines = all;
  const boardLine = lines.find((l) => l.text.startsWith("on the board already"));
  while (boardLine && size(lines) > MAX_CHARS && board.length > 3) {
    board.pop();
    boardLine.text = `on the board already (don't re-add): ${board.join(", ")}`;
  }
  for (let k = 5; k > 0 && size(lines) > MAX_CHARS; k--) lines = lines.filter((l) => l.keep < k);
  lines = lines.map((l) => ({ ...l, text: clip(l.text, 260) }));
  const text = lines.map((l) => l.text).join("\n");

  const facts: Fact[] = [
    { kind: "group", what: ruleNote, n: group.length, from: [`${roster.length} member rows`] },
    ...pollFacts, ...dayFacts, ...timeFacts, ...termFacts,
  ];
  const room = { ...factsOf({ name: space.name, today, t0, group, away, rsvps, polls: pollRows, own, zones, said, dayNo }), ...(challenges.length ? { challenges } : {}) };

  /* The same facts as a page for the people in the room ("what this space
     knows", src/lib/roomKnows.ts): one plain line per fact, the cards it came
     from, and a key a person can cross it out by. Nothing here the brief
     above doesn't already rest on. */
  const wid = (type: string, title: string) => own.filter((w) => w.type === type && titleOf(w) === title).map((w) => String(w._id));
  const bare = (t: string) => t.replace(/[?:]\s*$/, "");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayOf = (iso: string) => `${dow(iso)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  const know: KnowLine[] = [];
  for (const [n, why] of away) {
    // "back sunday" on the same card is the until-when.
    const sub = str((own.find((w) => w._id === awayWid.get(n))?.data as Data | undefined)?.subtitle);
    const till = /\b(till|until)\s+(\w+)/i.exec(why)?.slice(1).join(" ");
    know.push({ key: `away:${n}`, section: "who", text: `${n} is away${till ? ` ${till.toLowerCase()}` : /^back\b/i.test(sub) ? `, ${clip(sub, 24)}` : ""}`, why: `the board says "${why}"`, src: [awayWid.get(n) ?? ""].filter(Boolean) });
  }
  if (room.clocks.length >= 2) {
    const where = (tz: string) => (tz.split("/").pop() ?? tz).replace(/_/g, " ");
    know.push({
      key: "zones",
      section: "who",
      text: room.clocks.slice(0, 2).map((c) => `${c.label} is on ${where(c.tz)} time`).join(", "),
      why: "from the clocks card",
      src: own.filter((w) => w.type === "dualClock").map((w) => String(w._id)),
    });
  }
  for (const d of room.dates) {
    if (d.days < -45) continue;
    const base = { key: `date:${d.title}`, section: "soon" as const, why: `${dayOf(d.date)}, from the countdown`, src: wid("countdown", d.title) };
    if (d.days > 0) know.push({ ...base, text: `${d.days === 1 ? "day" : "days"} to ${d.title}`, n: d.days });
    else if (d.days === 0) know.push({ ...base, text: `${d.title} is today` });
    else know.push({ ...base, text: `${d.title} was ${-d.days} ${d.days === -1 ? "day" : "days"} ago` });
  }
  for (const c of challenges) {
    const src = challengeWid.get(c.title) ?? [];
    const [first, second] = c.totals;
    const bare2 = (n: string) => n.toLowerCase();
    // the reveal has its own countdown on the board already (the recipe deals one): said once
    const counted = room.dates.some((d) => d.days === c.revealIn);
    if (!counted && c.revealIn !== null && c.revealIn >= 0 && c.reveal) know.push({ key: `reveal:${c.title}`, section: "soon", text: c.revealIn === 0 ? `the ${c.title} reveal is today, ${c.reveal.split(" ")[1]}` : `${c.revealIn === 1 ? "day" : "days"} to the ${c.title} reveal`, why: `${c.reveal.toLowerCase()}, from the check-in`, src, ...(c.revealIn > 0 ? { n: c.revealIn } : {}) });
    know.push({ key: `in:${c.title}`, section: "decided", text: `in the ${c.title}: ${listNames(c.people.map(bare2))}`, why: `day ${c.day} of ${c.days}, from the check-in`, src });
    if (c.waiting.length && c.logged.length) know.push({ key: `today:${c.title}`, section: "decided", text: `${listNames(c.waiting.map(bare2))} ${c.waiting.length === 1 ? "hasn't" : "haven't"} logged ${c.title} today`, why: `${c.logged.length} of ${c.people.length} logged today`, src });
    if (first && second && first.total > 0) know.push({ key: `lead:${c.title}`, section: "decided", text: `${c.title}: ${bare2(first.name)} leads with ${first.total}, ${bare2(second.name)} is ${first.total - second.total} behind`, why: `totals after day ${c.day}`, src });
    if (c.stake) know.push({ key: `stake:${c.title}`, section: "decided", text: `the deal: ${c.stake.replace(/\.$/, "")}`, why: "from the standings", src });
    for (const t of c.totals) if (t.perfect && t.streak >= 3) know.push({ key: `streak:${c.title}:${t.name}`, section: "habits", text: `${bare2(t.name)} hasn't missed a day of ${c.title}`, why: `${t.streak} for ${t.streak}`, src, n: t.streak });
  }
  for (const l of room.lists) {
    if (!/\bchores?\b/i.test(l.title) || !l.done?.length) continue;
    const open = l.items.filter((it) => !l.done!.some((d) => d.item === it));
    know.push({
      key: `chores:${l.title}`,
      section: "decided",
      text: `${bare(l.title)}: ${l.done.map((d) => `${d.by.toLowerCase()} did ${d.item}`).join(", ")}${open.length ? ` · still open: ${open.join(", ")}` : ""}`,
      why: "who ticked what on the list",
      src: wid("potluck", l.title),
    });
  }
  for (const p of room.polls) {
    if (!p.votes) continue;
    know.push({
      key: `poll:${p.title}`,
      section: "decided",
      text: `${bare(p.title)}: ${p.leader ? `${p.leader} is ahead, ${p.lead} of ${p.votes}` : "tied so far"}`,
      why: `from the poll, ${p.votes} ${p.votes === 1 ? "vote" : "votes"} in`,
      src: wid("poll", p.title),
    });
  }
  for (const r of room.rsvps) {
    const parts = [r.yes.length ? `${listNames(r.yes)} ${r.yes.length === 1 ? "is" : "are"} in` : "nobody's in yet"];
    if (r.no.length) parts.push(`${listNames(r.no)} can't`);
    if (r.maybe.length) parts.push(`${listNames(r.maybe)} said maybe`);
    if (r.waiting.length) parts.push(`${listNames(r.waiting)} ${r.waiting.length === 1 ? "hasn't" : "haven't"} answered`);
    know.push({ key: `rsvp:${r.title}`, section: "decided", text: `${bare(r.title)}: ${parts.join(" · ")}`, why: "from the rsvp", src: wid("rsvp", r.title) });
  }
  for (const sp of room.splits) {
    if (!sp.people.length) continue;
    know.push({ key: `split:${sp.title}`, section: "decided", text: `${bare(sp.title)}: ${/\d/.test(sp.title) || !sp.total ? "split" : `${sp.total.toLocaleString("en-US")} split`} between ${listNames(sp.people)}`, why: "from the split", src: wid("expenseSplit", sp.title) });
  }
  for (const w of room.wheels) {
    if (w.last) know.push({ key: `wheel:${w.title}`, section: "decided", text: `${bare(w.title)}: last landed on ${w.last}`, why: "from the wheel's last spin", src: wid("wheel", w.title) });
  }
  // Habits: only what the rows can back, said as strongly as they back it.
  const habitOf = (f: Fact, text: string): KnowLine => ({
    key: `${f.kind}:${f.what}`,
    section: "habits",
    text,
    why: `said in ${f.n} places: ${f.from.slice(0, 2).join(", ")}${f.n > 2 ? ` + ${f.n - 2} more` : ""}`,
    src: f.from.map((id) => srcWid.get(id) ?? "").filter(Boolean),
  });
  for (const f of lead(dayFacts)) know.push(habitOf(f, `${f.what} is our usual day`));
  for (const f of lead(timeFacts)) know.push(habitOf(f, `${f.what} is our usual time`));
  const paidBy = new Map<string, typeof room.splits>();
  for (const sp of room.splits) if (sp.payer) paidBy.set(sp.payer, [...(paidBy.get(sp.payer) ?? []), sp]);
  const topPayer = [...paidBy.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (topPayer) {
    const [who, on] = topPayer;
    know.push({
      key: `payer:${who}`,
      section: "habits",
      text: on.length >= MIN_EVIDENCE ? `${who} usually covers the most` : `${who} covered the most last time`,
      why: on.length >= MIN_EVIDENCE ? `paid the most on ${on.length} splits` : `from the split "${on[0].title}"`,
      src: on.flatMap((sp) => wid("expenseSplit", sp.title)),
    });
  }
  const spots = placesOf(own).slice(0, 5);
  if (spots.length) {
    const won = room.polls.find((p) => p.leader && spots.some((pl) => pl.label.toLowerCase() === p.leader!.toLowerCase()));
    know.push({
      key: "places",
      section: "habits",
      text: `our places: ${spots.map((pl) => pl.label).join(", ")}`,
      why: `${spots.length} saved ${spots.length === 1 ? "link" : "links"}${won ? `, and ${won.leader} is ahead in "${won.title}" ${won.lead} of ${won.votes}` : ""}`,
      src: [...new Set([...(won ? wid("poll", won.title) : []), ...spots.map((pl) => pl.wid)])],
    });
  }
  for (const [who, items] of claims) {
    if (items.length < MIN_EVIDENCE) continue;
    know.push({ key: `claims:${who}`, section: "habits", text: `${who} takes things on: ${items.slice(0, 3).join(", ")}`, why: `${items.length} claims on the lists`, src: [...(claimWid.get(who) ?? [])] });
  }
  if (room.lowercase) know.push({ key: "lowercase", section: "habits", text: "we write titles in lowercase", why: `${lowerTitles} of ${titles.length} card titles`, src: [] });
  if (termFacts.length >= 3) know.push({ key: "words", section: "habits", text: `words we use a lot: ${termFacts.map((f) => f.what).join(", ")}`, why: "each one in 2 or more places", src: [] });

  /* What the voice asks made, and what the group did with it (the outcome
     log on each `deals` row). Newest first, five at most. */
  const nameOf = new Map(roster.map((m) => [m.userId, m.name]));
  const byId = new Map(widgets.map((w) => [String(w._id), w]));
  const heard = new Set<string>();
  for (const d of deals) {
    if (know.filter((l) => l.section === "made").length >= 5) break;
    let run: { at?: number; said?: string; committed?: string[]; outcome?: { kind: string }[] };
    try {
      run = JSON.parse(d.run) as typeof run;
    } catch {
      continue;
    }
    if (!run.committed?.length || !run.said) continue;
    // The same words asked again (a retry) show once, as the newest.
    if (heard.has(run.said.toLowerCase())) continue;
    heard.add(run.said.toLowerCase());
    const made = run.committed.map((id) => byId.get(id)).filter((w): w is Doc<"widgets"> => !!w);
    const status = !made.length || run.outcome?.some((o) => o.kind === "deleted") ? "removed" : run.outcome?.some((o) => o.kind === "edited") ? "edited" : "kept";
    const who = made[0] ? nameOf.get(made[0].createdBy) : undefined;
    const when = run.at ? dayOf(new Date(run.at).toISOString().slice(0, 10)) : "";
    know.push({
      key: `made:${d._id}`,
      section: "made",
      text: made[0] ? `${CARD_NAME[made[0].type] ?? made[0].type} "${titleOf(made[0])}"` : `"${clip(run.said, 44)}"`,
      why: [who ? `${who} said "${clip(run.said, 40)}"` : made[0] ? `someone said "${clip(run.said, 40)}"` : "a spoken ask", when].filter(Boolean).join(" · "),
      src: made.map((w) => String(w._id)),
      status,
    });
  }
  const people = group.map((n) => {
    const m = cast.find((c) => c.name.toLowerCase() === n.toLowerCase());
    return { name: n, color: m?.color ?? "", ...(away.has(n) ? { away: true } : {}) };
  });
  return { text, facts, lines: lines.map(({ text, src }) => ({ text, src })), room, knows: { people, lines: know } };
}

/** Saved links that are places (maps links, "… place"), each with its card. */
function placesOf(own: Doc<"widgets">[]): { label: string; wid: string }[] {
  const out: { label: string; wid: string }[] = [];
  for (const w of own.filter((w) => w.type === "linkShelf" || w.type === "linkCard")) {
    const d = w.data as { links?: { label?: string; url?: string }[]; label?: string; title?: string; url?: string };
    for (const l of d.links ?? [{ label: d.label ?? d.title, url: d.url }]) {
      const label = str(l.label);
      if (label && (/maps|yelp|opentable|resy/i.test(str(l.url)) || /\b(place|spot|restaurant|cafe|bar)\b/i.test(label))) out.push({ label: label.replace(/\s*\((maps|map)\)\s*$/i, ""), wid: String(w._id) });
    }
  }
  return out;
}

/**
 * The brief's facts as data, for the room tokens (`src/lib/deck/resolve.ts`):
 * the same rows the text is built from, so a token and a brief line never
 * disagree. Shown whole by `inspect` and `roomFacts`.
 */
function factsOf(r: {
  name: string;
  today: string;
  t0: number;
  group: string[];
  away: Map<string, string>;
  rsvps: RoomFacts["rsvps"];
  polls: RoomFacts["polls"];
  own: Doc<"widgets">[];
  zones: { label: string; tz: string }[];
  said: Doc<"widgets">[];
  dayNo: (iso: string) => number;
}): RoomFacts {
  const of = (type: string) => r.own.filter((w) => w.type === type);
  const splits = of("expenseSplit").map((w) => {
    const d = w.data as { total?: number; splits?: { name: string; paid?: number }[]; lastEmail?: { label?: string } };
    const ss = d.splits ?? [];
    const top = [...ss].sort((a, b) => (b.paid ?? 0) - (a.paid ?? 0))[0];
    return {
      title: titleOf(w),
      also: d.lastEmail?.label ? [d.lastEmail.label] : [],
      total: d.total ?? 0,
      people: ss.map((s) => s.name),
      payer: top?.paid ? top.name : null,
      paid: top?.paid ?? 0,
    };
  });
  const wheels = of("wheel").map((w) => {
    const d = w.data as { slices?: { label: string }[]; resultIndex?: number; spinNonce?: number };
    return { title: titleOf(w), options: (d.slices ?? []).map((x) => x.label), last: d.slices?.[d.resultIndex ?? -1]?.label ?? null };
  });
  const lists = of("potluck").map((w) => {
    const its = ((w.data as Data).items as { name?: string; by?: string | null; claimed?: boolean }[] | undefined) ?? [];
    const done = its.filter((it) => it.claimed && str(it.by)).map((it) => ({ item: clip(str(it.name), 24), by: str(it.by) }));
    return { title: titleOf(w), items: its.map((it) => clip(str(it.name), 24)).filter(Boolean).slice(0, 8), ...(done.length ? { done } : {}) };
  });
  const places = placesOf([...of("linkShelf"), ...of("linkCard")]).map((p) => p.label);
  const dates = of("countdown")
    .map((w) => ({ title: titleOf(w), date: str((w.data as Data).targetDate) }))
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date))
    .map((c) => ({ ...c, days: r.dayNo(c.date) - r.t0 }))
    .sort((a, b) => a.days - b.days);
  const board = r.said
    .filter((w) => CARD_NAME[w.type] && w.type !== "frame" && titleOf(w))
    .map((w) => ({ card: CARD_NAME[w.type], title: titleOf(w) }));
  const titles = r.said.map(titleOf).filter((t) => /\p{L}/u.test(t));
  return {
    room: r.name,
    today: r.today,
    people: r.group,
    away: [...r.away].map(([name, why]) => ({ name, why })),
    rsvps: r.rsvps,
    polls: r.polls,
    splits,
    wheels,
    lists,
    places,
    dates,
    clocks: r.zones,
    board,
    lowercase: titles.length >= 4 && titles.filter((t) => /^[^\p{L}]*\p{Ll}/u.test(t)).length / titles.length >= 0.7,
  };
}

/** Rebuilds one room's brief and stores it. */
export const refresh = internalMutation({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, { spaceId }) => {
    const now = Date.now();
    const brief = await buildBrief(ctx, spaceId, now);
    if (!brief) return null;
    const old = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
    // What people told it or crossed out is theirs: a rebuild never drops it.
    const { told = [], forgot = [] } = old ? (JSON.parse(old.facts) as Stored) : {};
    const stored: Stored = { lines: brief.lines, facts: brief.facts, room: brief.room, knows: brief.knows, told, forgot };
    const row = { spaceId, text: brief.text, facts: JSON.stringify(stored), at: now };
    if (old) await ctx.db.replace("briefs", old._id, row);
    else await ctx.db.insert("briefs", row);
    return null;
  },
});

/** Cron: every room that changed since its brief, or whose brief is from an
 * earlier day (its dates say "in N days"), gets a new one. */
export const refreshActive = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let n = 0;
    const midnight = Math.floor(Date.now() / 86_400_000) * 86_400_000;
    for (const space of await ctx.db.query("spaces").take(300)) {
      if (space.archivedAt) continue;
      const brief = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", space._id)).unique();
      if (brief && brief.at >= space.lastActivityAt && brief.at >= midnight) continue;
      await ctx.scheduler.runAfter(0, internal.roomBrief.refresh, { spaceId: space._id });
      n++;
    }
    return n;
  },
});

/** What the ask will read: the stored brief and how old it is. `now` comes
 * from the calling action (queries don't read the clock). */
export const getBrief = internalQuery({
  args: { spaceId: v.id("spaces"), now: v.optional(v.number()) },
  returns: v.union(v.null(), v.object({ text: v.string(), at: v.number(), ageMs: v.number() })),
  handler: async (ctx, { spaceId, now }) => {
    const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
    if (!row) return null;
    return { text: row.text, at: row.at, ageMs: Math.max(0, (now ?? row.at) - row.at) };
  },
});

const lineV = v.object({ text: v.string(), src: v.string() });
const names = v.array(v.string());
/** `RoomFacts` as a validator, for the inspector and `roomFacts`. */
const roomV = v.object({
  room: v.string(),
  today: v.string(),
  people: names,
  away: v.array(v.object({ name: v.string(), why: v.string() })),
  rsvps: v.array(v.object({ title: v.string(), yes: names, no: names, maybe: names, waiting: names })),
  polls: v.array(v.object({ title: v.string(), options: names, leader: v.union(v.string(), v.null()), lead: v.number(), votes: v.number() })),
  splits: v.array(v.object({ title: v.string(), also: names, total: v.number(), people: names, payer: v.union(v.string(), v.null()), paid: v.number() })),
  wheels: v.array(v.object({ title: v.string(), options: names, last: v.union(v.string(), v.null()) })),
  lists: v.array(v.object({ title: v.string(), items: names, done: v.optional(v.array(v.object({ item: v.string(), by: v.string() }))) })),
  places: names,
  dates: v.array(v.object({ title: v.string(), date: v.string(), days: v.number() })),
  clocks: v.array(v.object({ label: v.string(), tz: v.string() })),
  board: v.array(v.object({ card: v.string(), title: v.string() })),
  lowercase: v.boolean(),
  told: v.optional(names),
  challenges: v.optional(v.array(v.object({
    title: v.string(), unit: v.string(), day: v.number(), days: v.number(), reveal: v.union(v.string(), v.null()), revealIn: v.union(v.number(), v.null()),
    people: names, logged: names, waiting: names, stake: v.union(v.string(), v.null()),
    totals: v.array(v.object({ name: v.string(), total: v.number(), streak: v.number(), perfect: v.boolean() })),
  }))),
});

/** For the dev inspector: the stored brief, its age, and which table and how
 * many rows back each line. Read-only, and nothing in it that the room
 * doesn't already show everyone in it (names, board text, counts). */
export const inspect = query({
  args: { spaceId: v.id("spaces"), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({ text: v.string(), chars: v.number(), at: v.number(), ageMs: v.number(), lines: v.array(lineV), room: v.optional(roomV) }),
  ),
  handler: async (ctx, { spaceId, now }) => {
    const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
    if (!row) return null;
    // Briefs stored before the room facts existed have no `room` until the next refresh.
    // The room facts go out as people corrected them: crossed-out lines gone, told facts attached.
    const { lines = [], room, told = [], forgot = [] } = JSON.parse(row.facts) as Stored;
    return { text: row.text, chars: row.text.length, at: row.at, ageMs: Math.max(0, now - row.at), lines, ...(room ? { room: applyCorrections(room, told, forgot) } : {}) };
  },
});

/** Dev check: a fresh brief by slug, lines and evidence, without storing it. */
export const preview = internalQuery({
  args: { slug: v.string(), now: v.number() },
  returns: v.union(v.null(), v.object({ text: v.string(), chars: v.number(), lines: v.array(lineV), facts: v.string() })),
  handler: async (ctx, { slug, now }) => {
    const space = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!space) return null;
    const brief = await buildBrief(ctx, space._id, now);
    return brief && { text: brief.text, chars: brief.text.length, lines: brief.lines, facts: JSON.stringify(brief.facts) };
  },
});

/** The room facts the tokens expand from, from the stored brief (what the ask
 * will read). Dev and the token resolver's eval read this. */
export const getRoomFacts = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.union(v.null(), roomV),
  handler: async (ctx, { spaceId }) => {
    const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
    return row ? ((JSON.parse(row.facts) as { room?: RoomFacts }).room ?? null) : null;
  },
});

/** Dev check: fresh room facts by slug, without storing them. */
export const roomFacts = internalQuery({
  args: { slug: v.string(), now: v.number() },
  returns: v.union(v.null(), roomV),
  handler: async (ctx, { slug, now }) => {
    const space = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!space) return null;
    return (await buildBrief(ctx, space._id, now))?.room ?? null;
  },
});

/* ---------- What this space knows: the page, and people's corrections ---------- */

const knowLineV = v.object({
  key: v.string(),
  section: v.union(v.literal("who"), v.literal("soon"), v.literal("decided"), v.literal("habits"), v.literal("made")),
  text: v.string(),
  why: v.string(),
  src: names,
  n: v.optional(v.number()),
  status: v.optional(v.union(v.literal("kept"), v.literal("edited"), v.literal("removed"))),
});
const saidV = { text: v.string(), by: v.string(), color: v.string(), at: v.number() };

/** The page everyone in the room can open: what code noticed (each line with
 * its cards), what people told it, and what they crossed out, with who did.
 * Names and board text only, the same for everyone in the room. */
export const knows = query({
  args: { spaceId: v.id("spaces") },
  returns: v.union(
    v.null(),
    v.object({
      room: v.string(),
      at: v.number(),
      people: v.array(v.object({ name: v.string(), color: v.string(), away: v.optional(v.boolean()) })),
      lines: v.array(knowLineV),
      told: v.array(v.object({ id: v.string(), ...saidV })),
      forgot: v.array(v.object({ key: v.string(), ...saidV })),
    }),
  ),
  handler: async (ctx, { spaceId }): Promise<RoomKnows | null> => {
    const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
    if (!row) return null;
    const s = JSON.parse(row.facts) as Stored;
    return { room: s.room?.room ?? "", at: row.at, people: s.knows?.people ?? [], lines: s.knows?.lines ?? [], told: s.told ?? [], forgot: s.forgot ?? [] };
  },
});

/** The room's stored brief for a correction to land on; built now if the cron hasn't reached this room yet. */
async function storedFor(ctx: MutationCtx, spaceId: Id<"spaces">): Promise<{ id: Id<"briefs">; s: Stored } | null> {
  const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
  if (row) return { id: row._id, s: JSON.parse(row.facts) as Stored };
  const now = Date.now();
  const brief = await buildBrief(ctx, spaceId, now);
  if (!brief) return null;
  const s: Stored = { lines: brief.lines, facts: brief.facts, room: brief.room, knows: brief.knows, told: [], forgot: [] };
  return { id: await ctx.db.insert("briefs", { spaceId, text: brief.text, facts: JSON.stringify(s), at: now }), s };
}

/**
 * A person corrects what the space knows. Anyone in the room may (it's a
 * shared page), and each change keeps who made it. The name comes from the
 * caller's seat in the room, not from the client:
 * - `tell`: add a short fact in their own words; it goes to voice asks as a fact line.
 * - `untell`: take a told fact back.
 * - `forget`: cross out a noticed line; it stops going to voice asks.
 * - `restore`: put a crossed-out line back.
 */
export const correct = mutation({
  args: {
    spaceId: v.id("spaces"),
    by: v.string(),
    color: v.string(),
    change: v.union(
      v.object({ kind: v.literal("tell"), text: v.string() }),
      v.object({ kind: v.literal("untell"), id: v.string() }),
      v.object({ kind: v.literal("forget"), key: v.string(), text: v.string() }),
      v.object({ kind: v.literal("restore"), key: v.string() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { spaceId, by, color, change }) => {
    const authId = await getAuthUserId(ctx);
    const seat = authId ? await ctx.db.query("members").withIndex("by_space_user", (q) => q.eq("spaceId", spaceId).eq("userId", authId)).first() : null;
    if (!seat) return null;
    const row = await storedFor(ctx, spaceId);
    if (!row) return null;
    const at = Date.now();
    const who = { by: seat.name.trim().slice(0, 40) || by.trim().slice(0, 40) || "someone", color: seat.color || color.slice(0, 40), at };
    let told = row.s.told ?? [];
    let forgot = row.s.forgot ?? [];
    if (change.kind === "tell") {
      const text = change.text.replace(/\s+/g, " ").trim().slice(0, TOLD_CHARS);
      if (!text) return null;
      // The newest facts stay when the list is full.
      told = [...told.filter((t) => t.text.toLowerCase() !== text.toLowerCase()), { id: `t${at.toString(36)}`, text, ...who }].slice(-TOLD_MAX);
    } else if (change.kind === "untell") told = told.filter((t) => t.id !== change.id);
    else if (change.kind === "forget") forgot = [...forgot.filter((f) => f.key !== change.key), { key: change.key.slice(0, 120), text: change.text.slice(0, 200), ...who }].slice(-40);
    else forgot = forgot.filter((f) => f.key !== change.key);
    await ctx.db.patch("briefs", row.id, { facts: JSON.stringify({ ...row.s, told, forgot }) });
    return null;
  },
});
