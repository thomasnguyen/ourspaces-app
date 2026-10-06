import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * The pilot's numbers per room (nebius/pilot.md §What we count, queue I1).
 * Read-only: `summary` is the hand-checkable count for one room (ids, no
 * names); `export` is the same count for several rooms with every id and
 * timestamp replaced by ordinals and hour offsets from the range start, the
 * JSON that goes to eval/pilot/<date>.json. Definitions: eval/pilot/README.md.
 *
 *   npx convex run pilot:summary '{"slug":"…","from":"2026-10-11","to":"2026-10-25"}'
 *   npx convex run pilot:export  '{"slugs":["…"],"labels":["house"],"from":"…","to":"…"}'
 *
 * Every read is a space's own index (`by_space`, ranged on _creationTime), capped;
 * a cap hit is listed in `truncated` rather than counted short in silence.
 */

const CAP = { members: 2000, widgets: 2000, messages: 8000, deals: 3000, aiWrites: 4000, choiceVotes: 500, paint: 4000, votes: 500 };
const SOON_EDIT_MS = 30 * 60_000; // an AI card changed within 30 min of landing = edited (voiceBuild.noteOutcome's window)
const PT = -420; // the pilot's day boundary: US Pacific (PDT) unless told otherwise

const when = v.union(v.number(), v.string());
const toMs = (t: number | string) => (typeof t === "number" ? t : Date.parse(t));

type Person = { key: string; joined: boolean; days: Set<string>; events: number };
type Decision = {
  id: string; kind: "poll" | "choice"; landedAt: number; finishedAt: number | null; finished: boolean;
  voters: number; of: number; share: number; minutes: number | null; messages: number | null;
};
type Card = { id: string; state: "kept" | "edited" | "deleted" };
type Count = {
  slug: string; spaceId: Id<"spaces">; from: number; to: number; tzOffsetMinutes: number;
  people: number; joined: number; guests: number; activeDays: string[]; returned: number;
  perPerson: { key: string; kind: "joined" | "guest"; days: string[]; events: number }[];
  asksByVoice: number; buildAsks: number; voiceEdits: number; modelCalls: number;
  aiCards: { made: number; kept: number; edited: number; deleted: number; cards: Card[] };
  decisions: Decision[]; decisionsFinished: number; messages: number; truncated: string[];
};

async function countRoom(ctx: QueryCtx, slug: string, from: number, to: number, tz: number): Promise<Count> {
  const space = await ctx.db.query("spaces").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
  if (!space) throw new Error(`no room ${slug}`);
  const spaceId = space._id;
  const truncated: string[] = [];
  const capped = <T>(rows: T[], name: keyof typeof CAP) => {
    if (rows.length >= CAP[name]) truncated.push(name);
    return rows;
  };
  const inRange = (t: number) => t >= from && t <= to;
  const day = (t: number) => new Date(t + tz * 60_000).toISOString().slice(0, 10);

  /* People. A member row whose user has an email is a joined person, counted
     whether or not they did anything. A guest (anonymous) counts only if they
     made, voted, wrote, painted or answered something in the range. A guest
     seat folded into an account (users.mergedInto) is that account. Seeded
     cast rows ("seed:…") are never people. */
  const memberRows = capped(await ctx.db.query("members").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(CAP.members), "members");
  const keyOf = new Map<string, string>(); // userId → person key
  const people = new Map<string, Person>();
  const byName = new Map<string, string>(); // a choice vote's voter can be a name
  for (const m of memberRows) {
    if (m.userId.startsWith("seed:") || m._creationTime > to) continue;
    const uid = ctx.db.normalizeId("users", m.userId);
    const user = uid ? await ctx.db.get(uid) : null;
    if (!user) continue;
    const key = user.mergedInto ?? m.userId;
    const account = user.mergedInto ? await ctx.db.get(user.mergedInto as Id<"users">) : user;
    keyOf.set(m.userId, key);
    byName.set(m.name.toLowerCase(), key);
    const joined = !!account?.email;
    const p = people.get(key);
    if (p) p.joined ||= joined;
    else people.set(key, { key, joined, days: new Set(), events: 0 });
  }
  const act = (userId: string | undefined, at: number) => {
    const key = userId && keyOf.get(userId);
    if (!key || !inRange(at)) return;
    const p = people.get(key)!;
    p.days.add(day(at));
    p.events++;
  };

  /* Voice. One `deals` row per model call; one ask = one client session (the
     nonce's first segment, `<session>-<call>-<rand>`), however many speculative
     calls it fired. A voice edit (edits.apply, an `aiWrites` "edit" row by a
     person) is an ask too. The cards an ask made = its row's `committed`. */
  const deals = capped(await ctx.db.query("deals").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", from).lte("_creationTime", to)).take(CAP.deals), "deals");
  const sessions = new Set<string>();
  const made: string[] = [];
  const editedBy = new Set<string>();
  for (const d of deals) {
    let run: { nonce?: string; committed?: string[]; outcome?: { kind: string; id?: string; afterMs: number }[] };
    try {
      run = JSON.parse(d.run);
    } catch {
      continue;
    }
    sessions.add(run.nonce ? run.nonce.split("-")[0] : d._id);
    const mine = run.committed ?? [];
    made.push(...mine);
    for (const o of run.outcome ?? []) {
      if (o.kind !== "edited" || o.afterMs > SOON_EDIT_MS) continue;
      if (o.id) editedBy.add(o.id);
      else if (mine.length === 1) editedBy.add(mine[0]); // rows from before outcome entries carried the card id
    }
  }
  // What people did, from the rows that carry a person and a time.
  const messages = capped(await ctx.db.query("messages").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", from).lte("_creationTime", to)).take(CAP.messages), "messages");
  for (const m of messages) act(m.userId, m._creationTime);
  const widgets = capped(await ctx.db.query("widgets").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).take(CAP.widgets), "widgets");
  const madeSet = new Set(made);
  // a voice card is the asker's action once, as its `build` ledger row below (which outlives a deleted card)
  for (const w of widgets) if (!madeSet.has(String(w._id))) act(w.createdBy, w.createdAt);
  const polls = widgets.filter((w) => w.type === "poll");
  const votesOf = new Map<Id<"widgets">, Doc<"votes">[]>();
  for (const p of polls) {
    const rows = capped(await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", p._id)).take(CAP.votes), "votes");
    votesOf.set(p._id, rows);
    for (const r of rows) act(r.userId, r._creationTime); // a changed vote is the same row: its first time
  }
  const writes = capped(await ctx.db.query("aiWrites").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", from).lte("_creationTime", to)).take(CAP.aiWrites), "aiWrites");
  for (const w of writes) act(w.byUserId, w.at);
  const paint = capped(await ctx.db.query("paintMarks").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", from).lte("_creationTime", to)).take(CAP.paint), "paint");
  for (const s of paint) act(s.userId, s.createdAt);
  const choices = capped(await ctx.db.query("choiceVotes").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("at", from).lte("at", to)).take(CAP.choiceVotes), "choiceVotes");
  const voterKey = (voter: string) => keyOf.get(voter) ?? byName.get(voter.toLowerCase());
  for (const c of choices) for (const a of c.answers) {
    const key = voterKey(a.voter);
    if (key && inRange(a.at)) {
      const p = people.get(key)!;
      p.days.add(day(a.at));
      p.events++;
    }
  }

  const counted = [...people.values()].filter((p) => p.joined || p.events > 0);
  const isPerson = new Set(counted.map((p) => p.key));
  const n = counted.length;
  const allDays = new Set(counted.flatMap((p) => [...p.days]));
  const personMsgs = messages.filter((m) => isPerson.has(keyOf.get(m.userId) ?? "")).map((m) => m._creationTime);

  const voiceEdits = writes.filter((w) => w.kind === "edit" && w.byUserId);
  const cards: Card[] = [];
  for (const id of [...new Set(made)]) {
    const wid = ctx.db.normalizeId("widgets", id);
    const w = wid ? await ctx.db.get(wid) : null;
    const byVoice = voiceEdits.some((e) => e.verdict === "go" && String(e.widgetId) === id && (!w || e.at - w.createdAt <= SOON_EDIT_MS));
    cards.push({ id, state: !w ? "deleted" : editedBy.has(id) || byVoice ? "edited" : "kept" });
  }

  /* Decisions. A poll is finished when more than half the room's people have
     voted in it (at the vote that crossed the line; polls have no close). A
     choice vote (Right of Way, asked only of the people whose choice is at
     stake) is finished when it closed decided (change / keep / moot) or more
     than half of those asked answered. Window = card landing → finish. */
  const msgsBetween = (a: number, b: number) => personMsgs.filter((t) => t >= a && t <= b).length;
  const decisions: Decision[] = [];
  for (const p of polls) {
    if (!inRange(p.createdAt)) continue;
    const first = new Map<string, number>();
    for (const r of votesOf.get(p._id) ?? []) {
      const key = keyOf.get(r.userId);
      if (key && isPerson.has(key) && !(first.get(key)! <= r._creationTime)) first.set(key, r._creationTime);
    }
    const times = [...first.values()].sort((a, b) => a - b);
    const need = Math.floor(n / 2) + 1;
    const finishedAt = n > 0 && times.length >= need ? times[need - 1] : null;
    decisions.push(decision(String(p._id), "poll", p.createdAt, finishedAt, times.length, n));
  }
  for (const c of choices) {
    const answered = new Set(c.answers.map((a) => a.voter)).size;
    const of = c.voters.length;
    const half = [...c.answers].sort((a, b) => a.at - b.at)[Math.floor(of / 2)]?.at ?? null;
    const decided = c.closedAt && ["change", "keep", "moot"].includes(c.state) ? c.closedAt : null;
    const finishedAt = [decided, answered * 2 > of ? half : null].filter((t): t is number => t !== null).sort((a, b) => a - b)[0] ?? null;
    decisions.push(decision(String(c._id), "choice", c.at, finishedAt, answered, of));
  }
  function decision(id: string, kind: "poll" | "choice", landedAt: number, finishedAt: number | null, voters: number, of: number): Decision {
    const done = finishedAt !== null;
    return {
      id, kind, landedAt, finishedAt, finished: done, voters, of,
      share: of ? Math.round((voters / of) * 100) / 100 : 0,
      minutes: done ? Math.round(((finishedAt - landedAt) / 60_000) * 10) / 10 : null,
      messages: done ? msgsBetween(landedAt, finishedAt) : null,
    };
  }
  decisions.sort((a, b) => a.landedAt - b.landedAt);

  return {
    slug, spaceId, from, to, tzOffsetMinutes: tz,
    people: n, joined: counted.filter((p) => p.joined).length, guests: counted.filter((p) => !p.joined).length,
    activeDays: [...allDays].sort(), returned: counted.filter((p) => p.days.size >= 2).length,
    perPerson: counted.map((p) => ({ key: p.key, kind: p.joined ? ("joined" as const) : ("guest" as const), days: [...p.days].sort(), events: p.events })),
    asksByVoice: sessions.size + voiceEdits.length, buildAsks: sessions.size, voiceEdits: voiceEdits.length, modelCalls: deals.length,
    aiCards: {
      made: cards.length, kept: cards.filter((c) => c.state === "kept").length,
      edited: cards.filter((c) => c.state === "edited").length, deleted: cards.filter((c) => c.state === "deleted").length, cards,
    },
    decisions, decisionsFinished: decisions.filter((d) => d.finished).length, messages: personMsgs.length, truncated,
  };
}

const decisionV = v.object({
  id: v.string(), kind: v.union(v.literal("poll"), v.literal("choice")), landedAt: v.number(), finishedAt: v.union(v.number(), v.null()),
  finished: v.boolean(), voters: v.number(), of: v.number(), share: v.number(), minutes: v.union(v.number(), v.null()), messages: v.union(v.number(), v.null()),
});

/** One room's numbers, with row ids for checking by hand (no names, no text). */
export const summary = internalQuery({
  args: { slug: v.string(), from: when, to: when, tzOffsetMinutes: v.optional(v.number()) },
  returns: v.object({
    slug: v.string(), spaceId: v.id("spaces"), from: v.number(), to: v.number(), tzOffsetMinutes: v.number(),
    people: v.number(), joined: v.number(), guests: v.number(), activeDays: v.array(v.string()), returned: v.number(),
    perPerson: v.array(v.object({ key: v.string(), kind: v.union(v.literal("joined"), v.literal("guest")), days: v.array(v.string()), events: v.number() })),
    asksByVoice: v.number(), buildAsks: v.number(), voiceEdits: v.number(), modelCalls: v.number(),
    aiCards: v.object({
      made: v.number(), kept: v.number(), edited: v.number(), deleted: v.number(),
      cards: v.array(v.object({ id: v.string(), state: v.union(v.literal("kept"), v.literal("edited"), v.literal("deleted")) })),
    }),
    decisions: v.array(decisionV), decisionsFinished: v.number(), messages: v.number(), truncated: v.array(v.string()),
  }),
  handler: async (ctx, a) => await countRoom(ctx, a.slug, toMs(a.from), toMs(a.to), a.tzOffsetMinutes ?? PT),
});

const hours = (t: number, from: number) => Math.round(((t - from) / 3_600_000) * 100) / 100;

/** Several rooms, anonymized: counts, ordinals and hour offsets from `from`. Writes nothing; save the output by hand. */
const exportRooms = internalQuery({
  args: { slugs: v.array(v.string()), labels: v.optional(v.array(v.string())), from: when, to: when, tzOffsetMinutes: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, a) => {
    const from = toMs(a.from);
    const to = toMs(a.to);
    const tz = a.tzOffsetMinutes ?? PT;
    const day0 = Date.parse(new Date(from + tz * 60_000).toISOString().slice(0, 10));
    const dayN = (d: string) => Math.round((Date.parse(d) - day0) / 86_400_000);
    const rooms = [];
    for (const [i, slug] of a.slugs.slice(0, 12).entries()) {
      const c = await countRoom(ctx, slug, from, to, tz);
      rooms.push({
        room: a.labels?.[i] ?? `r${i + 1}`,
        people: c.people, joined: c.joined, guests: c.guests,
        activeDays: c.activeDays.length, activeDayIndex: c.activeDays.map(dayN), returned: c.returned,
        perPerson: c.perPerson.map((p, j) => ({ person: `p${j + 1}`, kind: p.kind, days: p.days.length, dayIndex: p.days.map(dayN), actions: p.events })),
        asksByVoice: c.asksByVoice, buildAsks: c.buildAsks, voiceEdits: c.voiceEdits, modelCalls: c.modelCalls,
        aiCards: { made: c.aiCards.made, kept: c.aiCards.kept, edited: c.aiCards.edited, deleted: c.aiCards.deleted },
        decisions: c.decisions.map((d, j) => ({
          decision: `d${j + 1}`, kind: d.kind, landedH: hours(d.landedAt, from), finishedH: d.finishedAt === null ? null : hours(d.finishedAt, from),
          finished: d.finished, voters: d.voters, of: d.of, share: d.share, minutes: d.minutes, messages: d.messages,
        })),
        decisionsFinished: c.decisionsFinished, decisionsTotal: c.decisions.length, messages: c.messages,
        ...(c.truncated.length ? { truncated: c.truncated } : {}),
      });
    }
    return {
      format: "ourspaces-pilot/1",
      range: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), tzOffsetMinutes: tz },
      definitions: DEFINITIONS,
      rooms,
    };
  },
});
export { exportRooms as export };

const DEFINITIONS = {
  person: "a room member who joined with an email, or a guest who made, voted on, wrote, painted or answered something in the range; seeded cast and drive-by visitors are not people",
  activeDay: "a calendar day (in the range's time zone) on which at least one person did one of those things",
  returned: "a person who did something on two or more different days; the app sends no reminders",
  askByVoice: "one spoken ask (however many model calls it fired) or one voice edit",
  aiCard: "a card a voice ask put on the board",
  kept: "an AI card still on the board and not edited",
  edited: "an AI card a person changed within 30 minutes of it landing (its options or items by hand, or anything by voice)",
  deleted: "an AI card no longer on the board",
  finished: "a poll that more than half the room's people voted in, or a choice vote that closed decided or that more than half of those asked answered",
  share: "voters / people (for a choice vote: answers / people asked)",
  minutesAndMessages: "from the card landing to the decision finishing: minutes, and messages people sent in the room in that window",
};
