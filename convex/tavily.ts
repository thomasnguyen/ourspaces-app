import { v } from "convex/values";
import { env, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { canRead, requireSeat } from "./seat";
import { widgetsCounter } from "./stats";
import { touchSpace } from "./activity";
import { writeWidgetData } from "./widgets";
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
type Place = { name: string; host: string; url: string; rating?: number; reviews?: number; closed?: boolean; text: string; order: number; img?: string; imgFrom?: string };
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
  kept: { name: string; host: string; url: string; rating?: number; reviews?: number; source: string; img?: string; imgFrom?: string; emoji: string }[];
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

/* ── the picture: an image Tavily returned for THAT place, else an emoji from code ──
 * A place's own page (a Yelp /biz/, a Tripadvisor review, the venue's site): the first photo on it.
 * A list page: only an image whose own words name the place. Nothing else, never the model's pick;
 * the emoji comes from this table, read off what the ask or the card already knows. */
const KINDS: [RegExp, string][] = [
  [/pumpkin/i, "🎃"], [/corn maze/i, "🌽"], [/christmas tree/i, "🎄"], [/apple|orchard/i, "🍎"], [/winery|vineyard|wine/i, "🍷"], [/brewery|beer/i, "🍺"],
  [/(pho|phở)/i, "🍜"], [/ramen|noodle|udon|vietnamese/i, "🍜"], [/sushi|omakase/i, "🍣"], [/taco|taquer|mexican|burrito/i, "🌮"], [/pizz|italian|pasta/i, "🍕"],
  [/dim sum|dumpling|xiao long/i, "🥟"], [/hot ?pot|shabu/i, "🍲"], [/curry|indian|thai/i, "🍛"], [/korean|bbq|barbecue/i, "🍖"], [/burger/i, "🍔"], [/steak/i, "🥩"],
  [/seafood|oyster|crab/i, "🦐"], [/boba|tea house/i, "🧋"], [/coffee|cafe|café|espresso/i, "☕"], [/bakery|pastry|croissant/i, "🥐"], [/brunch|pancake|breakfast/i, "🥞"],
  [/vegan|salad/i, "🥗"], [/mediterranean|falafel|gyro/i, "🥙"], [/tapas/i, "🍢"], [/chinese/i, "🥡"], [/japanese|izakaya/i, "🍱"], [/museum/i, "🏛️"], [/zoo/i, "🦁"], [/festival|fair/i, "🎪"], [/farm|ranch/i, "🚜"], [/park|garden/i, "🌳"],
];
export const emojiOf = (fallback: string, ...texts: (string | undefined)[]) => {
  for (const t of texts) for (const [re, e] of KINDS) if (t && re.test(t)) return e;
  return fallback;
};
type Img = string | { url: string; description?: string | null };
const NOT_PHOTO = /\.(svg|gif|ico)(\?|$)|logo|icon|badge|wordmark|placeholder|sprite|avatar|emoji|tiktok|instagram|facebook|twitter|pinterest|static\.tacdn|staticmap|maps\.google|screen_?shot/i;
const urlOf = (i: Img) => (typeof i === "string" ? i : i.url);
const fileOf = (u: string) => {
  try {
    return decodeURIComponent(new URL(u).pathname.split("/").pop() ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
};
/** The first photo in a page's images (a jpg/webp before a png), or none. */
export function photoOf(imgs: Img[] | undefined) {
  const ok = (imgs ?? []).map(urlOf).filter((u) => /^https:\/\//.test(u) && !NOT_PHOTO.test(u));
  return ok.find((u) => /\.(jpe?g|webp)(\?|$)/i.test(u)) ?? ok[0];
}

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

type Hit = { url: string; title: string; content: string; images?: Img[] };

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
  // on a list page, a picture counts only when its own words name the place: its alt text, or the caption its file is named
  // after (Tripadvisor: ".../original-joe-s-san-jose.jpg")
  const named = (name: string) => low(name).length >= 5 ? (hit.images ?? []).find((i) => !NOT_PHOTO.test(urlOf(i)) && low(`${typeof i === "string" ? "" : i.description ?? ""} ${fileOf(urlOf(i))}`).includes(low(name))) : undefined;
  const add = (name: string | null, seg: string, extra: Partial<Place> = {}) => {
    if (!name) return;
    const pic = extra.img ? null : named(name);
    out.push({ name, host, url: hit.url, rating: ratingIn(seg), reviews: reviewsIn(seg), closed: closedIn(seg), text: seg.slice(0, 240), order: order0 + out.length, ...(pic ? { img: urlOf(pic), imgFrom: hit.url } : {}), ...extra });
  };
  const single = /\/biz\/|\/r\/|Restaurant_Review/.test(hit.url);
  if (single) {
    // "KUMAKO RAMEN DEN - Updated … - 1063 Reviews - 487 Saratoga Ave, San Jose" / "Kumako Ramen Den - San Jose, CA"
    const head = hit.title.split(/\s+[-|–]\s+|,\s/)[0];
    const mixed = hit.content.match(new RegExp(head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))?.[0];
    const img = photoOf(hit.images);
    add(cleanName(mixed && /[a-z]/.test(mixed) ? mixed : head, cityName), text.slice(0, 600), img ? { img, imgFrom: hit.url } : {});
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
  // Tripadvisor names the state in the address: ".../Restaurants-g33020-…-San_Jose_California-Ramen.html"
  if (state?.toUpperCase() === "CA" && all.includes(`${name.toLowerCase()} california`)) return true;
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
      const s = await post("search", { query, search_depth: "basic", max_results: 6, include_usage: true, include_domains: DOMAINS, include_images: true }, left());
      r.ms.search = s.ms;
      r.credits.search = (s.json.usage as { credits?: number } | undefined)?.credits;
      if (!s.ok) throw new Error(s.error);
      const hits = ((s.json.results as Hit[] | undefined) ?? []).filter((h) => DOMAINS.some((d) => hostOf(h.url) === d.split(".")[0]));
      const here = hits.filter((h) => inCity(h, a.room.city));
      for (const h of hits) if (!here.includes(h)) r.skipped.push({ name: h.title.slice(0, 60), host: hostOf(h.url), why: "another city" });
      // the Tripadvisor list, extracted, when one came back and there's time (names with their bubbles and counts)
      const ta = here.find((h) => hostOf(h.url) === "tripadvisor" && !/Restaurant_Review/.test(h.url));
      if (ta && left() > 2500) {
        const e = await post("extract", { urls: [ta.url], query: `${a.food} restaurant name rating reviews`, chunks_per_source: 3, include_usage: true, include_images: true }, Math.min(1500, left() - 1500));
        r.ms.extract = e.ms;
        r.credits.extract = (e.json.usage as { credits?: number } | undefined)?.credits;
        const got = ((e.json.results as { raw_content?: string; images?: string[] }[] | undefined) ?? [])[0];
        if (got?.raw_content) here.push({ url: ta.url, title: ta.title, content: got.raw_content.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").slice(0, 6000), images: got.images });
      }
      const cityName = a.room.show;
      const seen = new Map<string, Place>();
      here.forEach((h, i) => {
        for (const p of placesIn(h, cityName, i * 20)) {
          const k = low(p.name);
          const had = seen.get(k);
          if (!had) seen.set(k, p);
          else seen.set(k, { ...had, rating: had.rating ?? p.rating, reviews: had.reviews ?? p.reviews, closed: had.closed || p.closed, ...(!had.img && p.img ? { img: p.img, imgFrom: p.imgFrom } : {}), ...(had.rating === undefined && had.reviews === undefined && (p.rating !== undefined || p.reviews !== undefined) ? { url: p.url, host: p.host, text: p.text } : {}) });
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
      // the ones the page gave a number for first, then the ones with a picture of their own, then in the web's order
      const rated = (p: Place) => Number(p.rating !== undefined || p.reviews !== undefined);
      const pic = (p: Place) => Number(!!p.img);
      const pool = [...cands].sort((x, y) => rated(y) - rated(x) || pic(y) - pic(x) || x.order - y.order).slice(0, 10);
      // Nemotron Lightning picks by number and names the room fact it used; code keeps only real numbers
      if (pool.length > 0 && left() > 900 && (await ctx.runQuery(internal.guard.underCeiling, {}))) {
        const t1 = Date.now();
        const list = pool.map((p, i) => `${i + 1}. ${p.name} · ${p.host}${p.rating !== undefined ? ` · ${p.rating} of 5` : ""}${p.reviews !== undefined ? ` · ${num(p.reviews)} reviews` : ""}${p.img ? " · photo" : ""}`).join("\n");
        const asked = streamChat({
          model: "lightning",
          maxTokens: 120,
          messages: [
            { role: "system", content: `You pick places for a group's ${a.mode === "add" ? "poll: one place for what they asked" : "dinner poll: up to 3, best first"}. Never one of their usual places or one already on the poll. Prefer places with a rating or a review count, then ones with a photo. Reply with one line of JSON: {"picks":[numbers],"fact":"the one room fact you used, copied exactly, or empty"}` },
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
    r.kept = picks.map((p) => ({
      name: p.name, host: p.host, url: p.url, ...(p.rating !== undefined ? { rating: p.rating } : {}), ...(p.reviews !== undefined ? { reviews: p.reviews } : {}), source: sourceLine(p),
      ...(p.img ? { img: p.img, imgFrom: p.imgFrom } : {}),
      // "add ramen": what they asked for; a dinner poll: what the place's name or its line says it is
      emoji: a.mode === "add" ? emojiOf("🍽️", a.food, p.name) : emojiOf("🍽️", p.name, p.text),
    }));
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

const mark = (k: Receipt["kept"][number]): WebMark => ({ url: k.url, host: k.host, ...(k.rating !== undefined ? { rating: k.rating } : {}), ...(k.reviews !== undefined ? { reviews: k.reviews } : {}), ...(k.img ? { img: k.img } : {}), ...(k.emoji ? { emoji: k.emoji } : {}) });
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

/* ── the post vs the page: a pasted link, read (TV2a) ──────────────────────
 * Someone pastes a link on the board (src/live/useLiveHandlers.ts, the paste
 * entry point; Firecrawl's link card is the fallback when this is off). Two
 * cards land at once, reading: a plan card (a countdown with `read`) and a
 * who's in. Then the chain, one 9 s cap:
 *   Tavily extract of the pasted page (query-focused) → code names the venue
 *   and its town → Tavily search for the venue's own site → Tavily extract of
 *   it, same query → code parses the parking fee for Saturday from each.
 * The venue's own domain outranks social and review sites by a code rule
 * (`ownSite`). The card shows the site's figure; `the post said …` only when
 * both parsed Saturday parking for the same venue and season and they differ.
 * No model writes a name or a number; code picks the cards and the title.
 */

const READ_Q = "parking price hours Saturday admission";
const READ_CAP_MS = 9000;
const SOCIAL = ["instagram", "tiktok", "facebook", "fb", "yelp", "twitter", "x", "threads", "youtube", "youtu", "pinterest", "reddit", "tripadvisor", "wikipedia", "google", "linktr", "eventbrite", "groupon", "timeout", "patch", "sfgate", "mercurynews"];
const DAY_RE = "(mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)";
const DAY_IX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const SPAN = new RegExp(`\\b${DAY_RE}(?:\\s*(-|–|—|to|through|thru|&|and|/)\\s*${DAY_RE})?\\b|\\b(weekends?|daily|every ?day)\\b`, "gi");
const AMOUNT = /\$\s?(\d{1,3}(?:\.\d{2})?)|\bfree\b/gi;

export type Fee = { days: number[]; amount: number; cash: boolean; line: string };
const dayOf = (w: string) => DAY_IX[w.toLowerCase().slice(0, 3)];

/** "Mon–Thu" → 1..4, "Sat/Sun" → 6,0, "weekends" → 6,0, "daily" → all. */
function daysOf(m: RegExpMatchArray): number[] {
  if (m[4]) return /week/i.test(m[4]) ? [6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const a = dayOf(m[1]);
  if (!m[3]) return [a];
  const b = dayOf(m[3]);
  if (/^(&|and|\/)$/i.test(m[2])) return [a, b];
  const out = [a];
  for (let d = a; d !== b; ) out.push((d = (d + 1) % 7));
  return out;
}

/** Code, not the model: each "<item> … <days> … $N" a page states, paired in reading order. */
export function feesIn(text: string, item = "parking"): Fee[] {
  const out: Fee[] = [];
  const clean = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  for (const m of clean.matchAll(new RegExp(`\\b${item}\\b`, "gi"))) {
    // from the start of its sentence, over the lines that continue it ("$30 cash only Fridays")
    const start = Math.max(clean.lastIndexOf("\n", m.index!) + 1, clean.lastIndexOf(". ", m.index!) + 2, 0);
    const lines = clean.slice(start, m.index! + 260).split(/\n/);
    let passage = lines[0];
    for (const l of lines.slice(1)) {
      if (!/^\s*(\$|free\b|\(|(mon|tue|wed|thu|fri|sat|sun))/i.test(l)) break;
      passage += ` ${l}`;
    }
    passage = passage.split(/\[\.\.\.\]|(?<=\.)\s+(?=[A-Z][a-z]+ (?!through|thru))/)[0];
    const cash = /\bcash\b/i.test(passage);
    const tokens = [
      ...[...passage.matchAll(SPAN)].map((t) => ({ at: t.index!, days: daysOf(t) })),
      ...[...passage.matchAll(AMOUNT)].map((t) => ({ at: t.index!, amount: t[1] ? Number(t[1]) : 0 })),
    ].sort((x, y) => x.at - y.at);
    let days: number[] | null = null;
    let amount: number | null = null;
    for (const t of tokens) {
      if ("days" in t) {
        if (amount !== null) out.push({ days: t.days, amount, cash: cash && amount > 0, line: passage.replace(/\s+/g, " ").trim().slice(0, 160) }), (amount = null);
        else days = t.days;
      } else if (days) {
        out.push({ days, amount: t.amount, cash: cash && t.amount > 0, line: passage.replace(/\s+/g, " ").trim().slice(0, 160) });
        days = null;
      } else amount = t.amount;
    }
  }
  return out;
}

/** One figure for one day, or none when the page gives two different ones. */
export function feeOn(fees: Fee[], day: number): Fee | null {
  const on = fees.filter((f) => f.days.includes(day));
  if (!on.length || on.some((f) => f.amount !== on[0].amount)) return null;
  return { ...on[0], cash: on.some((f) => f.cash) };
}

const NOT_A_NAME = /^(this|the|open|hours?|park pass|take|adding|hi|log|reply|video|photo|more|sign|follow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const CATEGORY = /\s+(pumpkin patch|apple orchard|corn maze|christmas tree farm|farm stand|winery|brewery|restaurant|cafe|café|bakery|museum|zoo|park|festival)$/i;

/** The venue a post is about: the first capitalised name in its words (not an address, a day, a month or a heading). */
export function venueIn(text: string): string | null {
  const head = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").slice(0, 1200);
  const word = "[A-Z][\\p{L}'’.-]*";
  for (const m of head.matchAll(new RegExp(`${word}(?:[ \\t]+(?:${word}|&|of|the|and)){1,5}`, "gu"))) {
    const name = m[0].replace(/\s+(of|the|and|&)$/i, "").replace(/\s+\d{4}$/, "").trim();
    if (name.split(/\s+/).length < 2 || NOT_A_NAME.test(name) || /\b(Ave|St|Blvd|Rd|Road|Street|Hwy|Lane|Dr)\b/.test(name)) continue;
    if (/^[^,\n]{0,40},\s*[A-Z]{2}\b/.test(head.slice(m.index!))) continue; // "Morgan Hill, CA" is the town
    return name;
  }
  return null;
}

/** "225 Laguna Ave, Morgan Hill, CA 95037" → Morgan Hill; else "in Morgan Hill". */
export function townIn(text: string): string | null {
  const m = text.match(/,\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}),\s*(?:CA|California|[A-Z]{2})\b/) ?? text.match(/\b(?:in|join us in)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?=[\s!.,])/);
  return m?.[1] ?? null;
}

/** The venue's own site: not social or a review site, and its domain carries the venue's name. */
export function ownSite(url: string, venue: string) {
  const host = (() => {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const base = host.split(".").slice(-2, -1)[0] ?? "";
  if (!host || SOCIAL.includes(base)) return false;
  // every word of the name (its first four letters), so "Spina Farms" is not spinabifidaassociation.org
  const flat = host.replace(/[^a-z0-9]/g, "");
  const words = venue.replace(CATEGORY, "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 3);
  return words.length > 0 && words.every((w) => flat.includes(w.slice(0, 4)));
}

const yearsIn = (s: string) => [...s.matchAll(/\b(20\d\d)\b/g)].map((m) => Number(m[1]));
const nounOf = (venue: string) => {
  const w = venue.replace(CATEGORY, "").split(/\s+/).at(-1)?.toLowerCase().replace(/s$/, "") ?? "";
  return ["farm", "winery", "brewery", "museum", "zoo", "orchard", "ranch", "garden", "park", "cafe", "bakery"].includes(w) ? w : null;
};
const hostName = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export type LinkReceipt = {
  mode: "link";
  line: string;
  url: string;
  status: string;
  venue?: string;
  town?: string;
  query?: string;
  day: string;
  reads: { role: "post" | "site"; url: string; host: string; ms: number; credits?: number; said?: string; fee?: number; cash?: boolean }[];
  search?: { ms: number; credits?: number; picked?: string; skipped: { host: string; why: string }[] };
  ms: { total: number };
  credits: { extract?: number; search?: number };
  pickedBy: string;
  shown: string;
  struck?: string;
  why?: string;
  /** the plan card's picture: the first photo on the venue's own page, and that page; else only the emoji */
  img?: { url: string; from: string };
  emoji?: string;
  landed?: string;
};

const readCard = { plan: { w: 250, h: 236 }, who: { w: 200, h: 236 } };

/** The paste: two cards land reading, then the chain runs. `{ ok: false }` = off here; the screen makes a Firecrawl link card. */
export const readLink = mutation({
  args: { spaceId: v.id("spaces"), url: v.string(), plan: v.object({ x: v.number(), y: v.number() }), who: v.object({ x: v.number(), y: v.number() }), today: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), planId: v.id("widgets"), whoId: v.id("widgets") }), v.object({ ok: v.literal(false), why: v.string() })),
  handler: async (ctx, a) => {
    if (!lookupOn()) return { ok: false as const, why: "off" };
    const me = await requireSeat(ctx, a.spaceId);
    let url: URL;
    try {
      url = new URL(a.url.trim().includes("://") ? a.url.trim() : `https://${a.url.trim()}`);
    } catch {
      return { ok: false as const, why: "not a link" };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false as const, why: "not a link" };
    if (!(await rateLimiter.limit(ctx, "tavilyRoomDay", { key: a.spaceId })).ok) return { ok: false as const, why: "today's limit" };
    const host = url.host.replace(/^www\./, "");
    const now = Date.now();
    const z = 6;
    const planId = await ctx.db.insert("widgets", {
      spaceId: a.spaceId, type: "countdown", ...a.plan, ...readCard.plan, z, rotate: -1, createdBy: me.userId, createdAt: now,
      data: { event: host, tone: "butter", read: { url: url.toString(), host, at: now, step: "post" } },
    });
    const whoId = await ctx.db.insert("widgets", {
      spaceId: a.spaceId, type: "rsvp", ...a.who, ...readCard.who, z, rotate: 1.2, createdBy: me.userId, createdAt: now,
      data: { title: "who's in?", responses: [{ name: me.name, status: "yes", userId: me.userId }], waitingOn: [], bringPending: true },
    });
    await widgetsCounter.inc(ctx);
    await widgetsCounter.inc(ctx);
    await touchSpace(ctx, a.spaceId, now);
    const line = `reading ${host} · then the venue's own page`;
    const writeId = await log(ctx, { kind: "edit", spaceId: a.spaceId, widgetId: planId, by: { name: me.name, userId: me.userId }, fields: [], text: line }, "lookup", "reading the link");
    await ctx.db.patch(writeId, { kind: "lookup" });
    await ctx.scheduler.runAfter(0, internal.tavily.readRun, { spaceId: a.spaceId, planId, whoId, writeId, url: url.toString(), today: a.today, line });
    return { ok: true as const, planId, whoId };
  },
});

/** The next Saturday on or after today (YYYY-MM-DD). */
function nextDay(today: string, day: number) {
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + ((day - t.getUTCDay() + 7) % 7));
  return t.toISOString().slice(0, 10);
}

export const readRun = internalAction({
  args: { spaceId: v.id("spaces"), planId: v.id("widgets"), whoId: v.id("widgets"), writeId: v.id("aiWrites"), url: v.string(), today: v.string(), line: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const t0 = Date.now();
    const left = () => READ_CAP_MS - (Date.now() - t0);
    const SAT = 6;
    const r: LinkReceipt = { mode: "link", line: a.line, url: a.url, status: "ok", day: "sat", reads: [], ms: { total: 0 }, credits: {}, pickedBy: "code", shown: "" };
    const credit = (j: Record<string, unknown>) => (j.usage as { credits?: number } | undefined)?.credits;
    const textOf = (j: Record<string, unknown>) => ((j.results as { raw_content?: string; title?: string; url?: string; images?: string[] }[] | undefined) ?? []);
    let postFee: Fee | null = null;
    let siteFee: Fee | null = null;
    let siteUrl: string | null = null;
    let postText = "";
    let siteText = "";
    try {
      // 1 · the pasted page
      const own = !SOCIAL.includes(hostOf(a.url));
      const e1 = await post("extract", { urls: [a.url], query: READ_Q, chunks_per_source: 3, include_usage: true, ...(own ? { include_images: true } : {}) }, left());
      const got1 = textOf(e1.json)[0];
      postText = got1?.raw_content ?? "";
      r.credits.extract = (credit(e1.json) ?? 0);
      if (!e1.ok || !postText) throw new Error(e1.error ?? "couldn't read the link");
      postFee = feeOn(feesIn(postText), SAT);
      r.venue = (own ? got1?.title?.split(/\s+[-|–·]\s+/)[0]?.trim() : null) || venueIn(postText) || undefined;
      r.town = townIn(postText) ?? undefined;
      r.reads.push({ role: own ? "site" : "post", url: a.url, host: hostName(a.url), ms: e1.ms, credits: credit(e1.json), said: postFee?.line, ...(postFee ? { fee: postFee.amount, cash: postFee.cash } : {}) });
      if (!r.venue) throw new Error("no venue named on the page");
      // what kind of place, from what the post says (code's table): the card's tile while the site is read
      r.emoji = emojiOf("📍", [r.venue, got1?.title, postText.slice(0, 1500)].join(" "));
      await ctx.runMutation(internal.tavily.readStep, { planId: a.planId, patch: JSON.stringify({ step: "site", venue: r.venue, emoji: r.emoji, ...(r.town ? { town: r.town } : {}) }) });
      if (own) {
        // the pasted page is the venue's own: one source, no post to compare
        siteFee = postFee;
        siteUrl = a.url;
        siteText = postText;
        postFee = null;
        const img = photoOf(got1?.images);
        if (img) r.img = { url: img, from: a.url };
      } else if (left() > 2500) {
        // 2 · the venue's own site, found by search; social and review sites never count as it
        r.query = `${r.venue}${r.town ? ` ${r.town}` : ""}`;
        const s = await post("search", { query: r.query, search_depth: "basic", max_results: 6, include_usage: true }, left() - 1200);
        r.credits.search = credit(s.json);
        const hits = (s.json.results as Hit[] | undefined) ?? [];
        const skipped: { host: string; why: string }[] = [];
        const pick = hits.find((h) => {
          if (ownSite(h.url, r.venue!)) return true;
          skipped.push({ host: hostName(h.url), why: SOCIAL.includes(hostOf(h.url)) ? "social or a review site" : "not the venue's domain" });
          return false;
        });
        r.search = { ms: s.ms, credits: credit(s.json), picked: pick?.url, skipped: skipped.slice(0, 6) };
        if (pick && left() > 600) {
          const more = hits.filter((h) => h !== pick && hostName(h.url) === hostName(pick.url)).slice(0, 1).map((h) => h.url);
          const e2 = await post("extract", { urls: [pick.url, ...more], query: READ_Q, chunks_per_source: 3, include_usage: true, include_images: true }, left());
          r.credits.extract = (r.credits.extract ?? 0) + (credit(e2.json) ?? 0);
          siteText = textOf(e2.json).map((x) => `${x.title ?? ""}\n${x.raw_content ?? ""}`).join("\n\n");
          siteFee = feeOn(textOf(e2.json).flatMap((x) => feesIn(x.raw_content ?? "")), SAT);
          siteUrl = pick.url;
          const pageImg = textOf(e2.json).map((x) => ({ from: x.url ?? pick.url, url: photoOf(x.images) })).find((x) => x.url);
          if (pageImg?.url) r.img = { url: pageImg.url, from: pageImg.from };
          r.emoji = emojiOf(r.emoji ?? "📍", [textOf(e2.json)[0]?.title, r.venue, postText.slice(0, 1500)].join(" "));
          r.reads.push({ role: "site", url: pick.url, host: hostName(pick.url), ms: e2.ms, credits: credit(e2.json), said: siteFee?.line, ...(siteFee ? { fee: siteFee.amount, cash: siteFee.cash } : {}) });
          if (!e2.ok) r.status = e2.error ?? "the site didn't read";
        } else if (!pick) r.status = "no site of its own in the results";
      } else r.status = "out of time before the site";
    } catch (e) {
      r.status = String(e instanceof Error ? e.message : e).slice(0, 120);
    }
    // the guards: same venue (its name on the site), same season (no other year named), same day (Saturday parsed on both)
    const year = Number(a.today.slice(0, 4));
    const venueOk = !!r.venue && !!siteText && siteText.toLowerCase().includes(r.venue.toLowerCase().replace(CATEGORY, "").split(/\s+/)[0]);
    const seasonOk = [postText, siteText].every((t) => !yearsIn(t).length || yearsIn(t).includes(year));
    const noun = r.venue ? nounOf(r.venue) : null;
    const label = noun ? `the ${noun}'s site` : "their site";
    const fee = siteFee ?? postFee;
    const fromSite = !!siteFee;
    const struck = fromSite && postFee && venueOk && seasonOk && postFee.amount !== siteFee!.amount ? postFee.amount : undefined;
    r.why = struck !== undefined ? `both parsed Saturday parking for ${r.venue}; they differ, the ${noun ?? "venue"}'s own page wins` : postFee && siteFee ? (postFee.amount === siteFee.amount ? "both agree" : !venueOk ? "the site didn't name the venue: no compare" : "another season named: no compare") : siteFee ? "only the site gave Saturday parking" : postFee ? "only the post gave Saturday parking" : "neither page gave Saturday parking";
    const money = (n: number) => (n === 0 ? "free" : `$${n}`);
    r.shown = fee ? `parking ${money(fee.amount)}${fee.cash ? " cash" : ""} Sat · ${fromSite ? label : "the post"}` : "";
    if (struck !== undefined) r.struck = `the post said ${money(struck)}`;
    r.ms.total = Date.now() - t0;
    const read = {
      step: "done",
      ...(r.venue ? { venue: r.venue.replace(CATEGORY, "") } : {}),
      ...(r.town ? { town: r.town } : {}),
      day: "sat",
      ...(fee ? { fee: { item: "parking", amount: fee.amount, cash: fee.cash } } : {}),
      ...(fee ? { source: fromSite && siteUrl ? { label, url: siteUrl, host: hostName(siteUrl) } : { label: "the post", url: a.url, host: hostName(a.url) } } : {}),
      ...(struck !== undefined ? { post: { amount: struck, url: a.url } } : {}),
      ...(!fee ? { note: r.venue ? "no parking price on either page" : "nothing to plan from this page" } : {}),
      ...(r.img ? { img: r.img.url } : {}),
      ...(r.emoji ? { emoji: r.emoji } : {}),
      ms: r.ms.total,
    };
    const bring = fee && fee.amount > 0 ? (fee.cash ? `bring $${fee.amount} cash` : `parking $${fee.amount}`) : undefined;
    await ctx.runMutation(internal.tavily.readLand, { planId: a.planId, whoId: a.whoId, writeId: a.writeId, patch: JSON.stringify(read), event: r.venue ? `${r.venue.replace(CATEGORY, "")}${r.town ? ` · ${r.town}` : ""}` : "", targetDate: nextDay(a.today, SAT), whoTitle: r.venue ? "who's in · sat" : "", ...(bring ? { bring } : {}), receipt: JSON.stringify(r) });
    return null;
  },
});

export const readStep = internalMutation({
  args: { planId: v.id("widgets"), patch: v.string() },
  returns: v.null(),
  handler: async (ctx, { planId, patch }) => {
    const w = await ctx.db.get(planId);
    const read = (w?.data as { read?: object } | undefined)?.read;
    if (!w || !read) return null;
    await ctx.db.patch(planId, { data: { ...(w.data as object), read: { ...read, ...(JSON.parse(patch) as object) } } as Doc<"widgets">["data"] });
    return null;
  },
});

export const readLand = internalMutation({
  args: { planId: v.id("widgets"), whoId: v.id("widgets"), writeId: v.id("aiWrites"), patch: v.string(), event: v.string(), targetDate: v.string(), whoTitle: v.string(), bring: v.optional(v.string()), receipt: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const r = JSON.parse(a.receipt) as LinkReceipt;
    const plan = await ctx.db.get(a.planId);
    const landed: string[] = [];
    if (plan) {
      const d = plan.data as { read?: object; event?: string };
      await writeWidgetData(ctx, plan, { ...d, ...(a.event ? { event: a.event } : {}), targetDate: a.targetDate, read: { ...(d.read ?? {}), ...(JSON.parse(a.patch) as object) } } as Doc<"widgets">["data"]);
      landed.push(r.shown ? `plan: ${a.event} · ${r.shown}${r.struck ? ` (struck: ${r.struck})` : ""}` : `plan: ${a.event || "the link"}`);
    }
    const who = await ctx.db.get(a.whoId);
    if (who) {
      const d = who.data as Record<string, unknown>;
      const { bringPending: _, ...rest } = d;
      await writeWidgetData(ctx, who, { ...rest, ...(a.whoTitle ? { title: a.whoTitle } : {}), ...(a.bring ? { bring: a.bring } : {}) } as Doc<"widgets">["data"]);
      if (a.bring) landed.push(`who's in: ${a.bring}`);
    }
    r.landed = landed.join(" · ") || "the cards were deleted";
    const row = await ctx.db.get(a.writeId);
    if (row) await ctx.db.patch(row._id, { text: r.shown ? `${a.event} · ${r.shown}` : row.text, outcome: JSON.stringify({ state: "replaced", ms: Date.now() - row.at, on: "the web", why: "the web answered", receipt: r }) });
    return null;
  },
});

/** Test cleanup (dev lane): delete the cards one paste made, by id. */
export const sweepRead = internalMutation({
  args: { ids: v.array(v.id("widgets")) },
  returns: v.number(),
  handler: async (ctx, { ids }) => {
    let n = 0;
    for (const id of ids) {
      const w = await ctx.db.get(id);
      if (!w) continue;
      await ctx.db.delete(id);
      await widgetsCounter.dec(ctx);
      n++;
    }
    return n;
  },
});
