import { v } from "convex/values";
import { env, internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { canRead } from "./seat";
import { leasesOn } from "./leases";
import { rateLimiter } from "./rateLimits";
import { streamChat } from "./nebius";
import { commitEdit, log, rightOfWay, type Holder } from "./rightOfWay";
import { applyEdit, type EditOp, type WebMark } from "../src/lib/deck/edits";
import { run as runEdit } from "./edits";
import type { RoomFacts } from "../src/lib/deck";
import type { Told } from "../src/lib/roomKnows";

/**
 * Tavily, the lookup: when the house's own places run out, it finds real ones nearby.
 *
 * Two asks start it, both after the card is already on the board (nothing here
 * sits in front of the first card):
 *  - "where should we eat Saturday": the poll lands with the house's places
 *    (voiceBuild.commit); `lookupAfterBuild` (from noteCommitted) then adds up
 *    to three real places under them, through the door as one AI edit.
 *  - "add ramen to the dinner poll": `lookupForEdit` (edits.run) keeps the
 *    ramen row waiting. Nobody holding the poll, it waits on the web (its own
 *    `pending` row, so every screen draws the ghost); someone holding it, it
 *    waits on them as always. Either way the waiting row fills in as a real
 *    ramen place before it lands; an option already on the poll never changes.
 *
 * The chain (one 6 s cap): Tavily search (basic, review sites) → Tavily extract
 * of the Tripadvisor page when one came back → code parses name / rating /
 * reviews / CLOSED out of the text → Nemotron Lightning picks ≤ 3 by number,
 * naming the room fact it used → code keeps only names that are in their
 * source and not on the poll or the house's usual places. The model never
 * writes a name or a number. No key, another deployment, or no city: nothing
 * runs and the ask is exactly what it was. The receipt (query, city and where
 * it came from, ms per step, credits, kept with their source line, skipped and
 * why) goes on the lookup's ledger row and, for a poll, on the ask's deals row.
 */

/** The deployments the lookup runs on (the key alone isn't enough: prod joins on Thomas's word). */
const LANES = ["dusty-condor-648"];
export const lookupOn = () => !!env.TAVILY_API_KEY?.trim() && LANES.some((name) => env.CONVEX_CLOUD_URL.includes(name));

const CAP_MS = 6000;
const DOMAINS = ["yelp.com", "tripadvisor.com", "opentable.com", "eater.com"];
const WHERE_EAT = /\bwhere\b.*\b(eat|dinner|lunch|brunch|breakfast|food|drinks)\b|\b(dinner|lunch|brunch) (spot|place)s?\b/i;
const MEAL_POLL = /\b(where|eat|dinner|lunch|brunch|breakfast|food|restaurant|takeout)\b/i;
const DAYS = /\b(tonight|today|tomorrow|this|next|(mon|tues|wednes|thurs|fri|satur|sun)day|weekend|night|for|at|on)\b.*$/i;
const FOODS = ["ramen", "pho", "sushi", "tacos", "taco", "pizza", "thai", "korean", "bbq", "barbecue", "burgers", "burger", "curry", "indian", "mexican", "italian", "chinese", "dim sum", "noodles", "dumplings", "hot pot", "vietnamese", "japanese", "brunch", "seafood", "steak", "vegan", "boba", "coffee", "tapas", "mediterranean"];
const WEB: Holder = { userId: "web", name: "the web", color: "var(--color-lime)", kind: "lookup" };

type Ctx = { city: string; show: string; from: string; usual: string[]; facts: string[] };
type Place = { name: string; host: string; url: string; rating?: number; reviews?: number; closed?: boolean; text: string; order: number };
export type Receipt = {
  mode: "poll" | "add";
  said: string;
  line: string;
  query?: string;
  city: string;
  from: string;
  status: string;
  ms: { search?: number; extract?: number; pick?: number; total: number };
  credits: { search?: number; extract?: number };
  pickedBy?: string;
  fact?: string;
  kept: { name: string; host: string; url: string; rating?: number; reviews?: number; source: string }[];
  skipped: { name: string; host: string; why: string }[];
  landed?: string;
};

const low = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const hostOf = (url: string) => {
  try {
    const parts = new URL(url).host.split(".");
    return parts[parts.length - 2] ?? parts[0];
  } catch {
    return "web";
  }
};
const num = (n: number) => (n >= 1000 && n % 100 === 0 ? `${n / 1000}k` : n.toLocaleString("en-US"));
const sourceLine = (p: { host: string; rating?: number; reviews?: number }) => [p.rating !== undefined ? `${p.rating}` : null, p.reviews !== undefined ? `${num(p.reviews)} reviews` : null, p.host].filter(Boolean).join(" · ");

/** The city: a place named in the words wins, else the newest told "we're in …", else none. */
export function cityOf(said: string, told: Told[], room: string): { city: string; show: string; from: string } | null {
  const named = said.match(/\b(?:in|near|around)\s+(?!the\b|a\b|our\b|my\b|town\b)([a-z][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){0,2})/iu);
  const fromWords = named?.[1].replace(DAYS, "").trim();
  if (fromWords && fromWords.length >= 3) return { city: fromWords, show: fromWords, from: "you said it" };
  for (const t of [...told].reverse()) {
    const m = t.text.match(/\b(?:we(?:'re|’re| are)|we live|i(?:'m|’m| am)|i live|the house is|we're based|based|located)\s+(?:in|near|around)\s+([^.;!?]+)/i);
    const city = m?.[1].trim().slice(0, 40);
    if (city) return { city, show: city.replace(/,\s*[A-Z]{2}$/, ""), from: `the ${room.replace(/^(our|the)\s+/i, "")}'s city` };
  }
  return null;
}

/** The room's facts the lookup reads: the told city, the usual places, what the pick may cite. */
async function roomCtx(ctx: MutationCtx, spaceId: Id<"spaces">, said: string): Promise<Ctx | null> {
  const space = await ctx.db.get(spaceId);
  const row = await ctx.db.query("briefs").withIndex("by_space", (q) => q.eq("spaceId", spaceId)).unique();
  const s = row ? (JSON.parse(row.facts) as { room?: RoomFacts; told?: Told[] }) : {};
  const where = cityOf(said, s.told ?? [], space?.name ?? "room");
  if (!where) return null;
  const usual = s.room?.places ?? [];
  const yes = s.room?.rsvps.find((r) => /dinner|lunch|brunch|eat/i.test(r.title));
  const facts = [
    ...(usual.length ? [`their usual places: ${usual.join(", ")}`] : []),
    ...(s.told ?? []).map((t) => `told by ${t.by}: ${t.text}`),
    ...(yes?.yes.length ? [`said yes to ${yes.title}: ${yes.yes.join(", ")}`] : []),
  ];
  return { ...where, usual, facts };
}

const foodIn = (said: string) => FOODS.find((f) => new RegExp(`\\b${f}\\b`, "i").test(said));

/** The lookup's own ledger row (kind "lookup"); with a ghost, its pending row waiting on the web. */
async function open(ctx: MutationCtx, a: { spaceId: Id<"spaces">; widget: Doc<"widgets">; by: { name: string; userId?: string }; text: string; ghost?: EditOp; today: string }) {
  const verdict = a.ghost ? "wait" : "lookup";
  const writeId = await log(ctx, { kind: "edit", spaceId: a.spaceId, widgetId: a.widget._id, by: a.by, fields: [], text: a.text }, verdict, a.ghost ? "waiting on the web" : "looking it up");
  await ctx.db.patch(writeId, { kind: "lookup" });
  if (!a.ghost) return { writeId };
  const pendingId = await ctx.db.insert("pending", { spaceId: a.spaceId, thing: a.widget._id, writeId, write: JSON.stringify({ kind: "edit", op: a.ghost, today: a.today }), on: JSON.stringify(WEB), at: Date.now() });
  // the action always closes it; this only covers a lookup that never came back
  await ctx.scheduler.runAfter(20_000, internal.rightOfWay.expire, { pendingId });
  return { writeId, pendingId };
}

/** noteCommitted: a "where should we eat …" poll just landed; look up real places for it. */
export async function lookupAfterBuild(ctx: MutationCtx, a: { spaceId: Id<"spaces">; dealId: Id<"deals">; run: string; ids: Id<"widgets">[] }) {
  if (!lookupOn()) return;
  const said = String((JSON.parse(a.run) as { said?: string }).said ?? "");
  if (!WHERE_EAT.test(said)) return;
  let poll: Doc<"widgets"> | null = null;
  for (const id of a.ids) {
    const w = await ctx.db.get(id);
    if (w?.type === "poll") poll = w;
  }
  if (!poll) return;
  const room = await roomCtx(ctx, a.spaceId, said);
  const runRow = await ctx.db.get(a.dealId);
  if (!room) {
    if (runRow) await ctx.db.patch(a.dealId, { run: JSON.stringify({ ...JSON.parse(runRow.run), web: { status: "no city", line: "say where you are and I'll look nearby" } }) });
    return;
  }
  if (!(await rateLimiter.limit(ctx, "tavilyRoomDay", { key: a.spaceId })).ok) return;
  const m = await ctx.db.query("members").withIndex("by_space_user", (q) => q.eq("spaceId", a.spaceId).eq("userId", poll.createdBy)).first();
  const by = m?.name ?? "someone";
  const food = foodIn(said);
  const line = `looking up ${food ?? "places"} near ${room.show} · ${room.from}${room.usual.length ? " · not your usual places" : ""}`;
  const today = new Date().toISOString().slice(0, 10);
  // the ghost is the ticket only: an empty add draws no row, and a let-go replays it to nothing
  const { writeId, pendingId } = await open(ctx, { spaceId: a.spaceId, widget: poll, by: { name: by }, text: line, ghost: { op: "addOption", value: "" }, today });
  await ctx.scheduler.runAfter(0, internal.tavily.lookup, { mode: "poll", spaceId: a.spaceId, widgetId: poll._id, writeId, pendingId, dealId: a.dealId, said, food: food ?? "dinner restaurants", room: { city: room.city, show: room.show, from: room.from, usual: room.usual, facts: room.facts }, line, by, today, t0: Date.now() });
}

/**
 * edits.run, before the door: "add ramen to the dinner poll". Null = no lookup
 * (not a meal poll, no key, no city, today's limit). `waits`: nobody else holds
 * the poll, so the row waits on the web (the caller returns it as its wait).
 * `fill`: someone holds it; the door's pending row gets filled in when the web answers.
 */
export async function lookupForEdit(ctx: MutationCtx, a: { widget: Doc<"widgets">; op: EditOp; by: { name: string; userId: string }; today: string; text: string }) {
  if (!lookupOn() || a.op.web || a.op.op !== "addOption" || a.widget.type !== "poll") return null;
  const value = String(a.op.value).trim();
  const question = String((a.widget.data as { question?: string }).question ?? "");
  if (!MEAL_POLL.test(question) || !value || value.split(/\s+/).length > 4 || /\d|'s\b|\b(home|house|place|leftovers|cook|in|near)\b/i.test(value)) return null;
  const room = await roomCtx(ctx, a.widget.spaceId, value);
  if (!room) return null;
  if (!(await rateLimiter.limit(ctx, "tavilyRoomDay", { key: a.widget.spaceId })).ok) return null;
  const line = `looking up ${value} near ${room.show} · ${room.from}`;
  const args = { mode: "add" as const, spaceId: a.widget.spaceId, widgetId: a.widget._id, said: value, food: value, room: { city: room.city, show: room.show, from: room.from, usual: room.usual, facts: room.facts }, line, by: a.by.name, byUserId: a.by.userId, today: a.today };
  const others = (await leasesOn(ctx, a.widget.spaceId, a.widget._id)).some((l) => l.userId !== a.by.userId);
  if (others) {
    // someone holds the poll: the door makes it wait on them; the web fills that waiting row in
    const { writeId } = await open(ctx, { spaceId: a.widget.spaceId, widget: a.widget, by: a.by, text: line, today: a.today });
    return { fill: async (pendingId: Id<"pending">) => void (await ctx.scheduler.runAfter(0, internal.tavily.lookup, { ...args, writeId, pendingId, t0: Date.now() })) };
  }
  const { writeId, pendingId } = await open(ctx, { spaceId: a.widget.spaceId, widget: a.widget, by: a.by, text: `${a.text} · ${line.replace(/^looking up \S+ /, "looking up ")}`, ghost: { op: "addOption", value }, today: a.today });
  await ctx.scheduler.runAfter(0, internal.tavily.lookup, { ...args, writeId, pendingId, t0: Date.now() });
  return { waits: { text: line, writeId, pendingId: pendingId!, on: WEB } };
}

/* ── the chain ─────────────────────────────────────────────────────────── */

type Hit = { url: string; title: string; content: string };

async function post(path: "search" | "extract", body: object, ms: number): Promise<{ ok: boolean; json: Record<string, unknown>; ms: number; error?: string }> {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(200, ms));
  try {
    const res = await fetch(`https://api.tavily.com/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.TAVILY_API_KEY!.trim()}` },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return res.ok ? { ok: true, json, ms: Date.now() - t0 } : { ok: false, json, ms: Date.now() - t0, error: `${path} ${res.status}` };
  } catch (e) {
    return { ok: false, json: {}, ms: Date.now() - t0, error: ctl.signal.aborted ? `${path} timed out` : `${path}: ${String(e).slice(0, 80)}` };
  } finally {
    clearTimeout(timer);
  }
}

const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} &'’.!-]*$/u;
const GENERIC = /\b(restaurants?|reviews?|updated|best|top|image|near me|photos?|menu|tripadvisor|yelp|opentable|eater|things to do|hotels?)\b/i;

function cleanName(raw: string, cityName: string): string | null {
  let n = raw.replace(/\s+/g, " ").replace(/^[#*\s]+|[\s.,;:·*-]+$/g, "").trim();
  n = n.replace(new RegExp(`\\s*[-–,]\\s*${cityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "").replace(/\s+Restaurant$/i, "").trim();
  // "KUMAKO RAMEN DEN" (a Yelp title) reads as a name; a short one stays as written ("GIWA")
  if (!/[a-z]/.test(n) && n.length > 5) n = n.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
  if (n.length < 2 || n.length > 40 || !NAME_OK.test(n) || GENERIC.test(n) || /^\d+$/.test(n)) return null;
  return n;
}

// "4.8 of 5 bubbles" (Tripadvisor), "4.7 (1.3k reviews)" (Yelp)
const ratingIn = (s: string) => {
  const m = s.match(/\b([1-5]\.\d)\s*(?:of 5 bubbles|stars?|\/\s*5|\(\s*[\d.,]+k?\s+reviews?)/i);
  return m ? Number(m[1]) : undefined;
};
// "1063 Reviews", "(227 reviews)", "1.3k reviews" (kept as 1,300: shown as 1.3k, never more exact than the page)
const reviewsIn = (s: string) => {
  const m = s.match(/\(?([\d,]{1,7}|\d+(?:\.\d)?k)\s+reviews?\b/i);
  if (!m) return undefined;
  return /k$/i.test(m[1]) ? Math.round(Number(m[1].slice(0, -1)) * 1000) : Number(m[1].replace(/,/g, ""));
};
// permanently closed, never "Closed today" / "Closed now"
const closedIn = (s: string) => /\s-\s+CLOSED\s+-\s|\bpermanently closed\b/i.test(s) || /^[^a-z]*\bCLOSED\b/.test(s);

/** Code, not the model: the places a page names, each with the number the page gave it (if any). */
export function placesIn(hit: Hit, cityName: string, order0: number): Place[] {
  const host = hostOf(hit.url);
  const text = `${hit.title}\n${hit.content}`;
  const out: Place[] = [];
  const add = (name: string | null, seg: string, extra: Partial<Place> = {}) => {
    if (!name) return;
    out.push({ name, host, url: hit.url, rating: ratingIn(seg), reviews: reviewsIn(seg), closed: closedIn(seg), text: seg.slice(0, 240), order: order0 + out.length, ...extra });
  };
  const single = /\/biz\/|\/r\/|Restaurant_Review/.test(hit.url);
  if (single) {
    // "KUMAKO RAMEN DEN - Updated … - 1063 Reviews - 487 Saratoga Ave, San Jose" / "Kumako Ramen Den - San Jose, CA"
    const head = hit.title.split(/\s+[-|–]\s+|,\s/)[0];
    const mixed = hit.content.match(new RegExp(head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))?.[0];
    add(cleanName(mixed && /[a-z]/.test(mixed) ? mixed : head, cityName), text.slice(0, 600));
    return out;
  }
  // a list: "1. Kumako Den · (227 reviews). Japanese ; 2. Fogo de Chão …" or "1. Pho Long Thinh. 4.8. 4.8 of 5 bubbles"
  const starts = [...text.matchAll(/(?:^|[\s;·(])(\d{1,2})\.\s+(?=[\p{Lu}\p{N}])/gu)];
  if (starts.length >= 2) {
    starts.forEach((m, i) => {
      const from = m.index! + m[0].length;
      const seg = text.slice(from, starts[i + 1]?.index ?? Math.min(text.length, from + 240));
      const name = seg.split(/\s·\s|\.\s|\s\(|\s{2,}|;|\s\d\.\d\b|\n/)[0];
      add(cleanName(name, cityName), seg);
    });
    return out;
  }
  // a map list: "11 Phenomenal Bowls of Pho in the South Bay · Phở Lovers · Gogo Phở · …"
  const dots = hit.content.split(/\s·\s/);
  if (dots.length >= 4) dots.slice(1).forEach((seg) => add(cleanName(seg.split(/[.\n]/)[0], cityName), seg));
  return out;
}

/** The results that are about this city (San José, Costa Rica answers "best restaurants in San Jose" too). */
function inCity(hit: Hit, city: string) {
  const all = `${decodeURIComponent(hit.url).replace(/[-_+]/g, " ")} ${hit.title} ${hit.content}`.toLowerCase();
  const [name, state] = city.split(/,\s*/);
  if (!all.includes(name.toLowerCase())) return false;
  // another place with the same name: "San Jose, Costa Rica", "Province of San Jose", "San Jose, IL"
  if (/costa rica|province of/.test(all)) return false;
  const other = [...all.matchAll(new RegExp(`${name.toLowerCase()},\\s*([a-z]{2})\\b`, "g"))].map((m) => m[1]);
  return !state || !other.length || other.includes(state.toLowerCase());
}

export const lookup = internalAction({
  args: {
    mode: v.union(v.literal("poll"), v.literal("add")),
    spaceId: v.id("spaces"),
    widgetId: v.id("widgets"),
    writeId: v.id("aiWrites"),
    pendingId: v.optional(v.id("pending")),
    dealId: v.optional(v.id("deals")),
    said: v.string(),
    food: v.string(),
    room: v.object({ city: v.string(), show: v.string(), from: v.string(), usual: v.array(v.string()), facts: v.array(v.string()) }),
    line: v.string(),
    by: v.string(),
    byUserId: v.optional(v.string()),
    today: v.string(),
    t0: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const t0 = Date.now();
    const left = () => CAP_MS - (Date.now() - t0);
    const query = `best ${a.food} in ${a.room.city}`;
    const r: Receipt = { mode: a.mode, said: a.said, line: a.line, query, city: a.room.city, from: a.room.from, status: "ok", ms: { total: 0 }, credits: {}, kept: [], skipped: [] };
    const want = a.mode === "add" ? 1 : 3;
    let picks: Place[] = [];
    try {
      const s = await post("search", { query, search_depth: "basic", max_results: 6, include_usage: true, include_domains: DOMAINS }, left());
      r.ms.search = s.ms;
      r.credits.search = (s.json.usage as { credits?: number } | undefined)?.credits;
      if (!s.ok) throw new Error(s.error);
      const hits = ((s.json.results as Hit[] | undefined) ?? []).filter((h) => DOMAINS.some((d) => hostOf(h.url) === d.split(".")[0]));
      const here = hits.filter((h) => inCity(h, a.room.city));
      for (const h of hits) if (!here.includes(h)) r.skipped.push({ name: h.title.slice(0, 60), host: hostOf(h.url), why: "another city" });
      // the Tripadvisor list, extracted, when one came back and there's time (names with their bubbles and counts)
      const ta = here.find((h) => hostOf(h.url) === "tripadvisor" && !/Restaurant_Review/.test(h.url));
      if (ta && left() > 2500) {
        const e = await post("extract", { urls: [ta.url], query: `${a.food} restaurant name rating reviews`, chunks_per_source: 3, include_usage: true }, Math.min(1500, left() - 1500));
        r.ms.extract = e.ms;
        r.credits.extract = (e.json.usage as { credits?: number } | undefined)?.credits;
        const raw = ((e.json.results as { raw_content?: string }[] | undefined) ?? [])[0]?.raw_content;
        if (raw) here.push({ url: ta.url, title: ta.title, content: raw.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").slice(0, 6000) });
      }
      const cityName = a.room.show;
      const seen = new Map<string, Place>();
      here.forEach((h, i) => {
        for (const p of placesIn(h, cityName, i * 20)) {
          const k = low(p.name);
          const had = seen.get(k);
          if (!had) seen.set(k, p);
          else seen.set(k, { ...had, rating: had.rating ?? p.rating, reviews: had.reviews ?? p.reviews, closed: had.closed || p.closed, ...(had.rating === undefined && had.reviews === undefined && (p.rating !== undefined || p.reviews !== undefined) ? { url: p.url, host: p.host, text: p.text } : {}) });
        }
      });
      // what's on the poll right now, and the house's usual places: never offered again
      const poll = await ctx.runQuery(internal.tavily.optionsOf, { widgetId: a.widgetId });
      const onPoll = poll.map(low);
      const usual = a.room.usual.map((u) => low(u.replace(/\(.*?\)/g, "")));
      const cands: Place[] = [];
      for (const p of [...seen.values()].sort((x, y) => x.order - y.order)) {
        const k = low(p.name);
        const why = p.closed
          ? `${p.host} says closed`
          : onPoll.some((o) => o && (o === k || k.includes(o) && o.length > 5))
            ? "already on the poll"
            : usual.some((u) => u && (u === k || u.includes(k) || k.includes(u)))
              ? "one of your usual places"
              : p.name.length > 32
                ? "name too long for a poll row"
                : !`${p.text}`.toLowerCase().includes(p.name.toLowerCase().slice(0, 12)) && !here.some((h) => `${h.title} ${h.content}`.toLowerCase().includes(k.split(" ")[0]))
                  ? "not in its source"
                  : null;
        if (why) r.skipped.push({ name: p.name, host: p.host, why });
        else cands.push(p);
      }
      // the ones the page gave a number for first, then in the web's order
      const rated = (p: Place) => Number(p.rating !== undefined || p.reviews !== undefined);
      const pool = [...cands].sort((x, y) => rated(y) - rated(x) || x.order - y.order).slice(0, 10);
      // Nemotron Lightning picks by number and names the room fact it used; code keeps only real numbers
      if (pool.length > 0 && left() > 900 && (await ctx.runQuery(internal.guard.underCeiling, {}))) {
        const t1 = Date.now();
        const list = pool.map((p, i) => `${i + 1}. ${p.name} · ${p.host}${p.rating !== undefined ? ` · ${p.rating} of 5` : ""}${p.reviews !== undefined ? ` · ${num(p.reviews)} reviews` : ""}`).join("\n");
        const asked = streamChat({
          model: "lightning",
          maxTokens: 120,
          messages: [
            { role: "system", content: `You pick places for a group's ${a.mode === "add" ? "poll: one place for what they asked" : "dinner poll: up to 3, best first"}. Never one of their usual places or one already on the poll. Prefer places with a rating or a review count. Reply with one line of JSON: {"picks":[numbers],"fact":"the one room fact you used, copied exactly, or empty"}` },
            { role: "user", content: `Room facts:\n${[...a.room.facts, `on the poll: ${poll.join(", ")}`].map((f) => `- ${f}`).join("\n")}\nAsked: "${a.mode === "add" ? `add ${a.said} to the dinner poll` : a.said}"\nPlaces found on the web:\n${list}` },
          ],
        });
        const res = await Promise.race([asked, new Promise<null>((ok) => setTimeout(() => ok(null), Math.max(300, left() - 300)))]);
        r.ms.pick = Date.now() - t1;
        if (res?.usage) await ctx.runMutation(internal.guard.noteSpend, { calls: [{ model: "lightning", prompt: res.usage.prompt_tokens ?? 0, completion: res.usage.completion_tokens ?? 0 }] });
        try {
          const j = JSON.parse((res?.content ?? "").match(/\{[\s\S]*\}/)?.[0] ?? "null") as { picks?: unknown[]; fact?: string } | null;
          const ids = (j?.picks ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= pool.length);
          picks = [...new Set(ids)].slice(0, want).map((n) => pool[n - 1]);
          // the fact counts only if it is one of the facts it was given
          const fact = String(j?.fact ?? "").trim();
          if (fact && [...a.room.facts, `on the poll: ${poll.join(", ")}`].some((f) => low(f).includes(low(fact)) || low(fact).includes(low(f)))) r.fact = fact;
          if (picks.length) r.pickedBy = "Nemotron Lightning";
        } catch {
          // an answer that isn't the shape: code picks below
        }
        if (!res) r.status = "the model ran out of time; code picked";
      }
      if (!picks.length) {
        // code's pick: the ones with a number first, in the order the web gave them
        picks = pool.slice(0, want);
        if (picks.length) r.pickedBy = "code";
      }
      for (const p of pool) if (!picks.includes(p)) r.skipped.push({ name: p.name, host: p.host, why: "not picked" });
      if (!picks.length) r.status = cands.length ? "nothing picked" : "no places in the results";
    } catch (e) {
      r.status = String(e instanceof Error ? e.message : e).slice(0, 120);
    }
    r.kept = picks.map((p) => ({ name: p.name, host: p.host, url: p.url, ...(p.rating !== undefined ? { rating: p.rating } : {}), ...(p.reviews !== undefined ? { reviews: p.reviews } : {}), source: sourceLine(p) }));
    r.ms.total = Date.now() - t0;
    await ctx.runMutation(internal.tavily.land, {
      mode: a.mode, spaceId: a.spaceId, widgetId: a.widgetId, writeId: a.writeId, ...(a.pendingId ? { pendingId: a.pendingId } : {}), ...(a.dealId ? { dealId: a.dealId } : {}),
      by: a.by, ...(a.byUserId ? { byUserId: a.byUserId } : {}), today: a.today, receipt: JSON.stringify(r), tries: 0,
    });
    return null;
  },
});

export const optionsOf = internalQuery({
  args: { widgetId: v.id("widgets") },
  returns: v.array(v.string()),
  handler: async (ctx, { widgetId }) => {
    const w = await ctx.db.get(widgetId);
    return ((w?.data as { options?: { label: string }[] } | undefined)?.options ?? []).map((o: { label: string }) => o.label);
  },
});

/* ── landing: through the door, as the AI's edit ───────────────────────── */

const mark = (k: Receipt["kept"][number]): WebMark => ({ url: k.url, host: k.host, ...(k.rating !== undefined ? { rating: k.rating } : {}), ...(k.reviews !== undefined ? { reviews: k.reviews } : {}) });
const landV = {
  mode: v.union(v.literal("poll"), v.literal("add")),
  spaceId: v.id("spaces"),
  widgetId: v.id("widgets"),
  writeId: v.id("aiWrites"),
  pendingId: v.optional(v.id("pending")),
  dealId: v.optional(v.id("deals")),
  by: v.string(),
  byUserId: v.optional(v.string()),
  today: v.string(),
  receipt: v.string(),
  tries: v.number(),
};

/** The receipt goes on the lookup's ledger row (and a poll's ask row); "replaced" keeps it out of "what it held back". */
async function finish(ctx: MutationCtx, a: { writeId: Id<"aiWrites">; dealId?: Id<"deals"> }, r: Receipt, landed: string) {
  r.landed = landed;
  const row = await ctx.db.get(a.writeId);
  if (row) {
    const was = row.outcome ? (JSON.parse(row.outcome) as { state?: string }) : null;
    await ctx.db.patch(row._id, { outcome: JSON.stringify({ state: was?.state === "cancelled" ? "cancelled" : "replaced", ms: Date.now() - row.at, on: "the web", why: "the web answered", receipt: r }) });
  }
  const deal = a.dealId ? await ctx.db.get(a.dealId) : null;
  if (deal) await ctx.db.patch(deal._id, { run: JSON.stringify({ ...(JSON.parse(deal.run) as object), web: r }) });
}

export const land = internalMutation({
  args: landV,
  returns: v.null(),
  handler: async (ctx, a) => {
    const r = JSON.parse(a.receipt) as Receipt;
    const row = await ctx.db.get(a.writeId);
    const cancelled = !!row?.outcome?.includes('"cancelled"');
    const p = a.pendingId ? await ctx.db.get(a.pendingId) : null;
    const widget = await ctx.db.get(a.widgetId);
    if (a.mode === "poll") {
      if (p && p.writeId === a.writeId) await ctx.db.delete(p._id);
      if (cancelled) return void (await finish(ctx, a, r, "cancelled; nothing added"));
      if (!widget) return void (await finish(ctx, a, r, "the poll was deleted"));
      if (!r.kept.length) return void (await finish(ctx, a, r, `nothing added (${r.status})`));
      let data = widget.data as Record<string, unknown>;
      const added: string[] = [];
      for (const k of r.kept) {
        const out = applyEdit({ type: "poll", data }, { op: "addOption", value: k.name, web: mark(k) }, { today: a.today });
        if (out.ok) {
          data = out.data;
          added.push(k.name);
        } else r.skipped.push({ name: k.name, host: k.host, why: out.reason });
      }
      if (!added.length) return void (await finish(ctx, a, r, "nothing added"));
      const text = added.length === 1 ? `added ${added[0]}` : `added ${added.length} places from the web`;
      const fields = [{ field: "options", old: (widget.data as Record<string, unknown>).options, new: data.options }];
      // the asker's name, no seat: the ledger shows whose ask it was; a vote in progress makes it wait like any AI write
      const door = await rightOfWay(ctx, { kind: "edit", spaceId: a.spaceId, widgetId: widget._id, by: { name: a.by }, fields, text });
      if (door.verdict === "go") {
        await commitEdit(ctx, widget, { ok: true, data, fields, text, changed: added.join(", "), undo: { op: "removeOption", value: added[0] } });
        // the write above logged "edited soon after" on the ask's row (voiceBuild.noteOutcome): that's for people's corrections, not the ask finishing itself
        const deal = a.dealId ? await ctx.db.get(a.dealId) : null;
        const run = deal ? (JSON.parse(deal.run) as { outcome?: { kind: string; id?: string; field?: string }[] }) : null;
        const last = run?.outcome?.at(-1);
        if (deal && run && last?.kind === "edited" && last.id === widget._id && last.field === "options") await ctx.db.patch(deal._id, { run: JSON.stringify({ ...run, outcome: run.outcome!.slice(0, -1) }) });
        return void (await finish(ctx, a, r, text));
      }
      if (door.verdict === "wait" && a.tries < 20) return void (await ctx.scheduler.runAfter(1500, internal.tavily.land, { ...a, tries: a.tries + 1 }));
      return void (await finish(ctx, a, r, `not added: ${door.reason}`));
    }
    // "add ramen": the waiting row
    const pick = r.kept[0];
    if (!p) return void (await finish(ctx, a, r, cancelled ? "cancelled" : "the words landed before the web answered"));
    const write = JSON.parse(p.write) as { kind: "edit"; op: EditOp; today: string };
    const on = JSON.parse(p.on) as Holder;
    if (!pick) {
      if (on.kind !== "lookup") return void (await finish(ctx, a, r, `no place found; the row stays ${write.op.value}`));
      await ctx.db.delete(p._id);
      await runEdit(ctx, { spaceId: a.spaceId, widgetId: a.widgetId, op: write.op, by: a.by, byUserId: a.byUserId ?? "", today: a.today, kind: "edit", noLookup: true });
      return void (await finish(ctx, a, r, `no place found; added ${write.op.value} as asked`));
    }
    const op: EditOp = { op: "addOption", value: pick.name, web: mark(pick) };
    // the waiting row fills in: every screen's ghost now shows the real place
    await ctx.db.patch(p._id, { write: JSON.stringify({ ...write, op }) });
    if (on.kind !== "lookup") {
      // a person holds the poll: it lands as this place when they let go (rightOfWay.landWaiting)
      const door = await ctx.db.get(p.writeId);
      if (door) await ctx.db.patch(door._id, { text: `added ${pick.name}`, undo: JSON.stringify({ op: "removeOption", value: pick.name }) });
      return void (await finish(ctx, a, r, `filled the waiting row: ${pick.name}; lands when ${on.name.toLowerCase()} lets go`));
    }
    if (row) await ctx.db.patch(row._id, { text: `found ${pick.name} · ${pick.source}` });
    // waiting on the web: let it be seen filled in for a beat, then land it through the door
    await ctx.scheduler.runAfter(1200, internal.tavily.settleAdd, { ...a, tries: 0 });
    return null;
  },
});

/** "add ramen", waiting on the web, filled in: land it (or, someone grabbed the poll meanwhile, wait on them). */
export const settleAdd = internalMutation({
  args: landV,
  returns: v.null(),
  handler: async (ctx, a) => {
    const r = JSON.parse(a.receipt) as Receipt;
    const p = a.pendingId ? await ctx.db.get(a.pendingId) : null;
    if (!p) return void (await finish(ctx, a, r, "the row landed or was cancelled before the web's place did"));
    const write = JSON.parse(p.write) as { kind: "edit"; op: EditOp; today: string };
    await ctx.db.delete(p._id);
    const out = await runEdit(ctx, { spaceId: a.spaceId, widgetId: a.widgetId, op: write.op, by: a.by, byUserId: a.byUserId ?? "", today: a.today, kind: "edit", noLookup: true });
    await finish(ctx, a, r, out.status === "applied" ? `added ${write.op.value}` : out.status === "wait" ? `waiting on ${out.on?.name.toLowerCase() ?? "someone"} as ${write.op.value}` : `not added: ${out.text}`);
    return null;
  },
});

/** The drawer's lookup section: the newest lookup on this card since the ask began (JSON: the receipt, or the line while it runs). */
export const receipt = query({
  args: { spaceId: v.id("spaces"), widgetId: v.string(), since: v.number() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { spaceId, widgetId, since }) => {
    if (!(await canRead(ctx, spaceId))) return null;
    const rows = await ctx.db.query("aiWrites").withIndex("by_space", (q) => q.eq("spaceId", spaceId).gte("_creationTime", since)).order("desc").take(30);
    const row = rows.find((w) => w.kind === "lookup" && String(w.widgetId) === widgetId);
    if (!row) return null;
    const done = row.outcome ? (JSON.parse(row.outcome) as { receipt?: Receipt }).receipt : undefined;
    return JSON.stringify(done ?? { line: row.text ?? "", status: "running" });
  },
});

/** Test cleanup (dev lane): take the web-found options off one poll. Only options carrying a `web` mark, which only the lookup writes. */
export const sweepWeb = internalMutation({
  args: { widgetId: v.id("widgets") },
  returns: v.number(),
  handler: async (ctx, { widgetId }) => {
    const w = await ctx.db.get(widgetId);
    if (!w || w.type !== "poll") return 0;
    const options = (w.data as { options: { id: string; web?: WebMark }[] }).options;
    const keep = options.filter((o) => !o.web);
    if (keep.length === options.length) return 0;
    for (const vote of await ctx.db.query("votes").withIndex("by_widget", (q) => q.eq("widgetId", widgetId)).take(500))
      if (!keep.some((o) => o.id === vote.optionId)) await ctx.db.delete(vote._id);
    await ctx.db.patch(widgetId, { data: { ...(w.data as object), options: keep } as Doc<"widgets">["data"] });
    return options.length - keep.length;
  },
});
