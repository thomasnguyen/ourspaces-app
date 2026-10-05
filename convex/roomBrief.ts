import { v } from "convex/values";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

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
export type Brief = { text: string; facts: Fact[]; lines: BriefLine[] };

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
  let cast = seeded.length ? seeded : roster.filter((m) => did.has(m.userId));
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
  const sources: { id: string; text: string }[] = [
    ...said.map((w) => ({ id: `${CARD_NAME[w.type] ?? w.type} "${titleOf(w)}"`, text: wordsOf(w.data, []).join(" · ") })),
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
    if (w.type === "availability" && best in DAY_OF) tally(days, [WEEKDAYS[DAY_OF[best]]], `availability "${titleOf(w)}" best`);
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
  for (const w of own) {
    const d = w.data as Data;
    for (const s of [str(d.title), str(d.subtitle), str(d.text), str(d.kicker)]) {
      for (const n of group) {
        const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s| is)? (?:out|away|traveling|travelling|sick|gone)\\b`, "i");
        if (re.test(s) && !away.has(n)) away.set(n, clip(s, 30));
      }
    }
  }

  /* Live polls (leader from the votes table) and RSVPs. */
  const live: string[] = [];
  const pollFacts: Fact[] = [];
  polls.forEach((p, i) => {
    if (!own.includes(p)) return;
    const options = ((p.data as Data).options as { id: string; label: string }[] | undefined) ?? [];
    const per = new Map<string, number>();
    for (const vote of pollVotes[i]) per.set(vote.optionId, (per.get(vote.optionId) ?? 0) + 1);
    const total = pollVotes[i].length;
    const [topId, top] = [...per.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    const tied = [...per.values()].filter((n) => n === top).length > 1;
    const label = options.find((o) => o.id === topId)?.label;
    if (!total || !label) return;
    live.push(`"${titleOf(p)}": ${tied ? "tied" : `${label} leads ${top} of ${total}`}`);
    pollFacts.push({ kind: "poll", what: `${titleOf(p)} → ${tied ? "tied" : label}`, n: total, from: [`${total} votes`] });
  });
  let rsvpRows = 0;
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
  let claimRows = 0;
  for (const w of own.filter((w) => w.type === "potluck")) {
    for (const it of ((w.data as Data).items as { name?: string; by?: string | null; claimed?: boolean }[] | undefined) ?? []) {
      const by = str(it.by);
      if (!it.claimed || !by) continue;
      claimRows++;
      if (!claims.has(by)) claims.set(by, []);
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
  return { text, facts, lines: lines.map(({ text, src }) => ({ text, src })) };
}

/** Rebuilds one room's brief and stores it. */
export const refresh = internalMutation({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, { spaceId }) => {
    const now = Date.now();
    const brief = await buildBrief(ctx, spaceId, now);
    if (!brief) return null;
    const row = { spaceId, text: brief.text, facts: JSON.stringify({ lines: brief.lines, facts: brief.facts }), at: now };
    const old = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
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

/** For the dev inspector: the stored brief, its age, and which table and how
 * many rows back each line. Read-only, and nothing in it that the room
 * doesn't already show everyone in it (names, board text, counts). */
export const inspect = query({
  args: { spaceId: v.id("spaces"), now: v.number() },
  returns: v.union(v.null(), v.object({ text: v.string(), chars: v.number(), at: v.number(), ageMs: v.number(), lines: v.array(lineV) })),
  handler: async (ctx, { spaceId, now }) => {
    const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
    if (!row) return null;
    const lines = (JSON.parse(row.facts) as { lines?: BriefLine[] }).lines ?? [];
    return { text: row.text, chars: row.text.length, at: row.at, ageMs: Math.max(0, now - row.at), lines };
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
