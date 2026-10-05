/**
 * Voice edits: the fourth answer to an ask, besides a card, nothing, or
 * "already here" (nebius right-of-way R0). "add ramen to the dinner poll",
 * "take pizza off", "move it to 7:30", "make the challenge 10 days".
 *
 * Three parts, all pure (the asker's screen and convex/edits.ts run the same code):
 *  - the target: the selected card, else the card the words name, else the one
 *    card that holds the thing named ("take ash off" → the split ash is on).
 *    Two fit → offers, never a guess.
 *  - the op: one of the closed set the card declares next to its schema
 *    (catalog.ts `edits`), `{op: "addOption", value: "ramen"}`.
 *  - `applyEdit`: the new data, the fields it touched (only the ones the op
 *    names), the inverse op for undo, or a refusal when it would undo what
 *    people did (a voted option, a claimed slot, a date people said yes to).
 */
import { CATALOG, revealOf } from "./catalog";
import type { Field } from "./schema";
import { blankSlot, fillSlot, type Unfinished } from "./needs";

type W = { id: string; type: string; data: Record<string, unknown> };
export type EditOp = { op: string; value: string | number; item?: string };
export type FieldChange = { field: string; old: unknown; new: unknown };
export type EditResult =
  | { ok: true; data: Record<string, unknown>; fields: FieldChange[]; text: string; changed: string; undo: EditOp }
  | { ok: false; reason: string; refused: boolean };
/** What people did on the card that an edit must not undo. Server: the votes table. Client: the merged card. */
export type EditCtx = { today: string; votes?: Record<string, number> };

const BY_TYPE = new Map<string, (typeof CATALOG)[number]>(CATALOG.map((c) => [c.type as string, c]));
/** The ops a widget type takes, op → its value's field. */
export const opsFor = (type: string): Record<string, Field> | null => (BY_TYPE.get(type) as { edits?: Record<string, Field> } | undefined)?.edits ?? null;
export const editable = (w: { type: string }) => opsFor(w.type) !== null;

/** The fields each op may touch; anything else changed is a bug and the server refuses it. */
const RENAMES: Record<string, string> = { poll: "question", potluck: "title", countdown: "event", rsvp: "title", expenseSplit: "title", itinerary: "title", checkIn: "title" };
export function fieldsOf(type: string, op: string): string[] {
  switch (op) {
    case "addOption":
    case "removeOption":
      return ["options"];
    case "addItem":
    case "removeItem":
      return ["items", "openCount"];
    case "setDate":
      return ["targetDate"];
    case "setWhen":
      return ["title"];
    case "addPerson":
    case "removePerson":
      return ["splits"];
    case "setDay":
      return ["days"];
    case "setDays":
      return ["days", "revealAt"];
    case "rename":
      return RENAMES[type] ? [RENAMES[type]] : [];
    default:
      return [];
  }
}

/** Top-level data keys that differ (by value). */
export function touched(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

const low = (x: unknown) => String(x ?? "").toLowerCase().trim();
const words = (s: string) => low(s).replace(/['’]s\b/g, "").replace(/[^\p{L}\p{N} ]+/gu, " ").split(" ").filter((w) => w.length > 1 && !FILLER.has(w)).map((w) => w.replace(/(es|s)$/, ""));
const FILLER = new Set("the a an of for to on in at our my it this that and or with".split(" "));
/** Does `label` mean what the words say? All of a short label's words, or every said word in it. */
const same = (said: string, label: string) => {
  const a = words(said), b = words(label);
  if (!a.length || !b.length) return low(said) === low(label);
  return a.every((w) => b.includes(w)) || b.every((w) => a.includes(w));
};
const clip = (s: string, f: Field) => {
  const max = f.kind === "text" ? f.max : 40;
  const v = s.trim().replace(/\s+/g, " ");
  return v.length > max ? v.slice(0, max) : v;
};
const LETTERS = "abcdefghijklmnop";
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const niceDate = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const refuse = (reason: string): EditResult => ({ ok: false, reason, refused: true });
const fail = (reason: string): EditResult => ({ ok: false, reason, refused: false });

/**
 * The op on this card's data. Never touches a field the op doesn't name;
 * refuses what would undo people's choices (R2 turns those into a vote).
 */
export function applyEdit(w: { type: string; data: Record<string, unknown> }, op: EditOp, ctx: EditCtx): EditResult {
  // an unfinished card's empty slot (C1): the words fill that one field; undo empties it again
  if (op.op === "fill" || op.op === "unfill") return fillEdit(w, op, ctx);
  const ops = opsFor(w.type);
  const f = ops?.[op.op];
  if (!ops || !f) return fail(`a ${w.type} can't ${op.op}`);
  const d = w.data;
  const str = typeof op.value === "string" ? clip(op.value, f) : "";
  const done = (data: Record<string, unknown>, text: string, changed: string, undo: EditOp): EditResult => {
    const fields = touched(d, data).map((field) => ({ field, old: d[field], new: data[field] }));
    if (!fields.length) return fail("nothing changes");
    const allowed = fieldsOf(w.type, op.op);
    const stray = fields.filter((x) => !allowed.includes(x.field));
    if (stray.length) return fail(`would touch ${stray.map((x) => x.field).join(", ")}`);
    return { ok: true, data, fields, text, changed, undo };
  };
  switch (op.op) {
    case "rename": {
      const key = RENAMES[w.type];
      if (!str) return fail("no new name");
      if (w.type === "rsvp") {
        const [, when] = splitWhen(String(d.title ?? ""));
        const old = String(d.title ?? "");
        return done({ ...d, title: when ? `${str} · ${when}` : str }, `renamed it ${str}`, str, { op: "rename", value: splitWhen(old)[0] });
      }
      return done({ ...d, [key]: str }, `renamed it ${str}`, str, { op: "rename", value: String(d[key] ?? "") });
    }
    case "addOption": {
      const opts = (d.options as { id: string; label: string }[] | undefined) ?? [];
      if (!str) return fail("nothing to add");
      if (opts.some((o) => low(o.label) === low(str))) return fail(`${str} is already on it`);
      if (opts.length >= 8) return fail("the poll is full");
      const id = [...LETTERS].find((l) => !opts.some((o) => o.id === l)) ?? `o${opts.length}`;
      return done({ ...d, options: [...opts, { id, label: str, votes: 0, total: 0, voters: [] }] }, `added ${str}`, str, { op: "removeOption", value: str });
    }
    case "removeOption": {
      const opts = (d.options as { id: string; label: string; voters?: string[] }[] | undefined) ?? [];
      const hit = opts.find((o) => low(o.label) === low(str)) ?? opts.find((o) => same(str, o.label));
      if (!hit) return fail(`no option called ${str}`);
      const n = ctx.votes ? (ctx.votes[hit.id] ?? 0) : (hit.voters?.length ?? 0);
      if (n > 0) return refuse(`${people(n)} voted for ${low(hit.label)}; i won't remove it`);
      if (opts.length <= 2) return fail("a poll needs two options");
      return done({ ...d, options: opts.filter((o) => o !== hit) }, `took ${low(hit.label)} off`, low(hit.label), { op: "addOption", value: hit.label });
    }
    case "addItem": {
      const items = (d.items as { name: string; by: string | null; claimed: boolean }[] | undefined) ?? [];
      if (!str) return fail("nothing to add");
      if (items.some((i) => low(i.name) === low(str))) return fail(`${str} is already on it`);
      if (items.length >= 16) return fail("the list is full");
      const next = [...items, { name: str, by: null, claimed: false }];
      return done({ ...d, items: next, openCount: next.filter((i) => !i.claimed).length }, `added ${str}`, str, { op: "removeItem", value: str });
    }
    case "removeItem": {
      const items = (d.items as { name: string; by: string | null; claimed: boolean }[] | undefined) ?? [];
      const hit = items.find((i) => low(i.name) === low(str)) ?? items.find((i) => same(str, i.name));
      if (!hit) return fail(`no ${str} on the list`);
      if (hit.claimed) return refuse(`${low(hit.by) || "someone"} has ${low(hit.name)}; i won't take it off`);
      const next = items.filter((i) => i !== hit);
      return done({ ...d, items: next, openCount: next.filter((i) => !i.claimed).length }, `took ${low(hit.name)} off`, low(hit.name), { op: "addItem", value: hit.name });
    }
    case "setDate": {
      const iso = String(op.value).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fail("no date");
      const old = String(d.targetDate ?? "");
      return done({ ...d, targetDate: old.length > 10 ? `${iso}${old.slice(10)}` : iso }, `moved it to ${niceDate(iso)}`, niceDate(iso), { op: "setDate", value: old.slice(0, 10) });
    }
    case "setWhen": {
      const [base, when] = splitWhen(String(d.title ?? ""));
      const rows = (d.responses as { status: string }[] | undefined) ?? [];
      const said = rows.filter((r) => r.status === "yes" || r.status === "maybe").length;
      if (said > 0) return refuse(`${people(said)} said they're in for ${when || base}; i won't move it`);
      const next = str ? mergeWhen(when, str) : "";
      return done({ ...d, title: next ? `${base} · ${next}` : base }, next ? `moved it to ${next}` : "took the time off", next, { op: "setWhen", value: when });
    }
    case "addPerson": {
      const rows = (d.splits as { name: string; owes: number; paid: number }[] | undefined) ?? [];
      if (!str) return fail("nobody to add");
      if (rows.some((r) => low(r.name) === low(str))) return fail(`${str} is already on it`);
      const name = rows.length && rows.every((r) => r.name === low(r.name)) ? low(str) : str[0].toUpperCase() + str.slice(1);
      return done({ ...d, splits: resplit([...rows, { name, owes: 0, paid: 0 }], d.total) }, `added ${low(name)}`, name, { op: "removePerson", value: name });
    }
    case "removePerson": {
      const rows = (d.splits as { name: string; owes: number; paid: number }[] | undefined) ?? [];
      const hit = rows.find((r) => low(r.name) === low(str));
      if (!hit) return fail(`${str} isn't on the split`);
      if (hit.paid > 0) return refuse(`${low(hit.name)} paid $${hit.paid}; i won't take them off`);
      if (rows.length <= 2) return fail("a split needs two people");
      return done({ ...d, splits: resplit(rows.filter((r) => r !== hit), d.total) }, `took ${low(hit.name)} off`, low(hit.name), { op: "addPerson", value: hit.name });
    }
    case "setDay": {
      const days = (d.days as { day: string; plan: string }[] | undefined) ?? [];
      const hit = op.item ? days.find((r) => same(op.item!, r.plan) || words(r.plan).some((x) => words(op.item!).includes(x))) : days.length === 1 ? days[0] : undefined;
      if (!hit) return fail(op.item ? `no ${op.item} on the plan` : "which day?");
      return done({ ...d, days: days.map((r) => (r === hit ? { ...r, day: str } : r)) }, `moved ${low(hit.plan).split(" · ")[0]} to ${str}`, str, { op: "setDay", value: hit.day, item: hit.plan });
    }
    case "setDays": {
      const n = Math.round(Number(op.value));
      if (!Number.isFinite(n) || n < 1 || n > 30) return fail("days must be 1–30");
      const logs = (d.logs as Record<string, (number | null)[]> | undefined) ?? {};
      const logged = Math.max(0, ...Object.values(logs).map((r) => r.length));
      if (n < logged) return refuse(`people have logged ${logged} days; i won't cut it to ${n}`);
      const start = String(d.start ?? ctx.today);
      return done({ ...d, days: n, revealAt: revealOf(start, n) }, `${n} days now`, `${n}`, { op: "setDays", value: Number(d.days ?? n) });
    }
  }
  return fail(`unknown op ${op.op}`);
}

/** "game night · friday" → ["game night", "friday"]. */
export function splitWhen(title: string): [string, string] {
  const i = title.lastIndexOf(" · ");
  return i < 0 ? [title, ""] : [title.slice(0, i), title.slice(i + 3)];
}
const TIME = /^(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)$/;
const DAY = /^(?:(?:next|this)\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day$|^(?:tomorrow|tonight|today)$/;
const DATE = new RegExp(`^(?:${MONTHS.join("|")})[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?$|^(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)$|^\\d{1,2}/\\d{1,2}$`);
/** A day and/or a time as said: "sunday", "7:30", "sunday at 7", "oct 20". */
export function whenOf(s: string): { day?: string; time?: string } | null {
  const t = low(s).replace(/[.!?]+$/, "");
  const m = /^(.+?)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/.exec(t);
  if (m && (DAY.test(m[1]) || DATE.test(m[1]))) return { day: m[1], time: m[2] };
  if (TIME.test(t)) return { time: t.replace(/^at\s+/, "") };
  if (DAY.test(t) || DATE.test(t)) return { day: t };
  return null;
}
/** A new time keeps the old day, a new day keeps the old time. */
function mergeWhen(old: string, said: string): string {
  const n = whenOf(said);
  if (!n) return said;
  const o = whenOf(old) ?? {};
  return [n.day ?? o.day, n.time ?? o.time].filter(Boolean).join(" ");
}
/** Even shares of the total; what each already paid comes off their share. */
function resplit(rows: { name: string; owes: number; paid: number }[], total: unknown) {
  const sum = Number(total) || rows.reduce((a, r) => a + r.paid + r.owes, 0);
  const share = Math.round(sum / Math.max(1, rows.length));
  return rows.map((r) => ({ ...r, owes: Math.max(0, share - r.paid) }));
}
function fillEdit(w: { type: string; data: Record<string, unknown> }, op: EditOp, ctx: EditCtx): EditResult {
  const d = w.data;
  let data: Record<string, unknown> | null;
  let undo: EditOp;
  if (op.op === "fill") {
    const u = d.unfinished as Unfinished | undefined;
    if (!u) return fail("it isn't missing anything");
    data = fillSlot(w, String(op.value), ctx.today);
    if (!data) return fail(`that isn't ${u.slot.replace(/^add /, "")}`);
    undo = { op: "unfill", value: JSON.stringify(u) };
  } else {
    const u = JSON.parse(String(op.value)) as Unfinished;
    data = { ...blankSlot(w.type, d, u.field), unfinished: u };
    undo = { op: "fill", value: "" };
  }
  const fields = touched(d, data).map((field) => ({ field, old: d[field], new: data![field] }));
  if (!fields.length) return fail("nothing changes");
  const u = (d.unfinished ?? data.unfinished) as Unfinished;
  return { ok: true, data, fields, text: op.op === "fill" ? `filled in ${u.slot.replace(/^add /, "")}` : "emptied it again", changed: op.op === "fill" ? String(op.value) : "", undo };
}

/** "sunday", "oct 20", "the 20th" → the next such date from today (YYYY-MM-DD). */
export function isoFor(day: string, today: string): string | null {
  const base = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const t = low(day).replace(/^(this|next)\s+/, "");
  const plus = (n: number) => new Date(base.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  if (t === "today" || t === "tonight") return plus(0);
  if (t === "tomorrow") return plus(1);
  const wd = DAYS.findIndex((x) => t.startsWith(x));
  if (wd >= 0 && /day$/.test(t)) return plus(((wd - base.getUTCDay() + 7) % 7) || 7);
  const md = new RegExp(`^(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})`).exec(t);
  const th = /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)$/.exec(t);
  const sl = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  let y = base.getUTCFullYear(), mo = base.getUTCMonth(), dd = 0;
  if (md) [mo, dd] = [MONTHS.indexOf(md[1]), Number(md[2])];
  else if (th) dd = Number(th[1]);
  else if (sl) [mo, dd] = [Number(sl[1]) - 1, Number(sl[2])];
  else return null;
  let d = new Date(Date.UTC(y, mo, dd, 12));
  if (th && d < base) d = new Date(Date.UTC(y, mo + 1, dd, 12));
  if (!th && d < base) d = new Date(Date.UTC(++y, mo, dd, 12));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* ---------- The words: which card, which op (code, 0 ms) ---------- */

const NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30 };
const clean = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/[?.!]+\s*$/, "").replace(/\s+/g, " ").trim()
    .replace(/^((hey|ok|okay|so|um|uh|please|alright|orb|can you|could you),?\s+)+/, "");
const REF = "(?:it|this|that|(?:the|our|my|this|that) (.+?))";
/** One edit sentence: the op family, the value, the card phrase (if named), an item (setDay). */
type Said = { fam: "add" | "remove" | "rename" | "when" | "length" | "fill"; value: string; phrase?: string; item?: string };
export function parseSaid(said: string): Said | null {
  const t = clean(said);
  let m: RegExpExecArray | null;
  // the missing part of an unfinished card, said outright: "the choices are tacos, pho and pizza"
  if ((m = /^(?:the )?(choices|options|items|things|total|cost|date|day|question|words)(?: (?:for|on) (?:the|our|my|this|that) (.+?))? (?:are|is|was|will be) (.+)$/.exec(t)))
    return { fam: "fill", value: t, phrase: m[2] };
  if ((m = /^(?:rename|retitle) (?:it|this|that|(?:the|our|my) (.+?)) (?:to|as) (.+)$/.exec(t)) || (m = /^change the (?:name|title)(?: of (?:the|our|my) (.+?))? to (.+)$/.exec(t)) || (m = /^call (?:it|this|that) (.+)$()/.exec(t)))
    return m[2] !== "" ? { fam: "rename", value: m[2], phrase: m[1] } : { fam: "rename", value: m[1] };
  if ((m = new RegExp(`^(?:make|set|change|extend|cut) ${REF} (?:to |last |into )?(\\d+|${Object.keys(NUMS).join("|")}) days?(?: long)?$`).exec(t)))
    return { fam: "length", value: String(NUMS[m[2]] ?? m[2]), phrase: m[1] ?? "challenge" };
  if ((m = /^(?:add|put|throw|stick|include) (.+?)(?: (?:to|on|onto|in|into) (?:the|our|my|this|that) (.+))?$/.exec(t))) {
    if (/^(a|an|another|one|some new|new) /.test(m[1]) || /^(a |an )?(poll|list|checklist|wheel|card|rsvp|countdown|split|note|question|challenge)\b/.test(m[1])) return null;
    return { fam: "add", value: m[1].replace(/^(some|the) /, ""), phrase: m[2] };
  }
  if ((m = /^(?:take|cross|scratch|knock) (.+?) (?:off|out)(?: (?:of )?(?:the|our|my|this|that) (.+))?$/.exec(t)) || (m = /^(?:remove|drop|delete|cut) (.+?)(?: (?:from|off|out of) (?:the|our|my|this|that) (.+))?$/.exec(t))) {
    if (/^(the |this |that |it$)/.test(m[1]) && !m[2]) return null; // "delete the poll": a whole card, not an edit
    return { fam: "remove", value: m[1].replace(/^(the) /, ""), phrase: m[2] };
  }
  // the last "to" splits the card from the new time: "move the trivia night countdown to oct 20"
  if ((m = /^(?:move|push|change|switch|make|set|bump|shift) (?:it|this|that|(?:the|our|my) (.+)) (?:to|till|until|for|on) (.+)$/.exec(t)) && whenOf(m[2]))
    return { fam: "when", value: m[2], phrase: m[1] };
  if ((m = /^(?:make|set|change|switch) (?:it|this|that) (.+)$/.exec(t)) && whenOf(m[1])) return { fam: "when", value: m[1] };
  // "move kyoto to nov 9": a row on a plan
  if ((m = /^(?:move|push|shift) (.+?) to (.+)$/.exec(t)) && whenOf(m[2]) && !/^(it|this|that)$/.test(m[1])) return { fam: "when", value: m[2], item: m[1] };
  return null;
}
/** Words that are an edit (the router's test). `selected`: a card is selected, so "add rio" means it. */
export function isEditSaid(said: string, selected: boolean): boolean {
  // "add ramen to the…" while the card's name is still coming: an edit until a word says otherwise
  if (/^(add|put|throw|stick) (?!(a|an|another|one|some new|new|me|us)\b)\S+( \S+)? (to|on|onto|in|into)( the| our| my)?$/.test(clean(said))) return true;
  const p = parseSaid(said);
  if (!p) return false;
  if (p.fam === "add") return Boolean(p.phrase && KIND.some(([re]) => re.test(p.phrase!))) || (selected && !p.phrase && p.value.split(" ").length <= 3);
  return true;
}

const KIND: Array<[RegExp, string]> = [
  [/\bpoll\b/, "poll"],
  [/\b(list|checklist|sign-?up|packing|chores|errands)\b/, "potluck"],
  [/\brsvp\b/, "rsvp"],
  [/\bcountdown\b/, "countdown"],
  [/\b(split|bill|tab|ious?)\b/, "expenseSplit"],
  [/\b(itinerary|plan|trip)\b/, "itinerary"],
  [/\b(challenge|check-?in|streak)\b/, "checkIn"],
];
const NOUNS = /\b(poll|list|checklist|sign-?up|rsvp|countdown|split|itinerary|challenge|check-?in|card|sheet)\b/g;
const titleOf = (w: W) => String(w.data.title ?? w.data.question ?? w.data.event ?? "").replace(/\p{Extended_Pictographic}/gu, "").trim();
/** What a card holds, for "take ash off" with no card named. */
const holds = (w: W): string[] =>
  w.type === "poll" ? ((w.data.options as { label: string }[]) ?? []).map((o) => o.label)
    : w.type === "potluck" ? ((w.data.items as { name: string }[]) ?? []).map((i) => i.name)
      : w.type === "expenseSplit" ? ((w.data.splits as { name: string }[]) ?? []).map((r) => r.name)
        : w.type === "itinerary" ? ((w.data.days as { plan: string }[]) ?? []).map((r) => r.plan) : [];
const FAM_OPS: Record<Said["fam"], Record<string, string>> = {
  add: { poll: "addOption", potluck: "addItem", expenseSplit: "addPerson" },
  remove: { poll: "removeOption", potluck: "removeItem", expenseSplit: "removePerson" },
  rename: Object.fromEntries(Object.keys(RENAMES).map((k) => [k, "rename"])),
  when: { rsvp: "setWhen", countdown: "setDate", itinerary: "setDay" },
  length: { checkIn: "setDays" },
  fill: {},
};

export type EditPlan =
  | { kind: "do"; target: W; how: string; op: EditOp; result: Extract<EditResult, { ok: true }> }
  | { kind: "refused"; target: W; how: string; op: EditOp; text: string }
  | { kind: "offers"; targets: { target: W; op: EditOp; label: string }[]; why: string }
  | { kind: "none"; text: string; target?: W; how?: string };

/**
 * "add ramen to the dinner poll" on this board: the target, how it was found,
 * the op, and the result of applying it to the card as this screen has it.
 */
export function editFor(said: string, widgets: W[], selectedId: string | null, ctx: EditCtx, frames: (w: W) => string = () => ""): EditPlan {
  const p = parseSaid(said);
  if (!p) return { kind: "none", text: "i can't tell what to change" };
  if (p.fam === "fill") return fillFor(p, widgets, selectedId, ctx);
  const cards = widgets.filter((w) => editable(w) && !w.id.startsWith("voice-draft-"));
  const fits = (w: W) => Boolean(FAM_OPS[p.fam][w.type]);
  const phrase = p.phrase && !/^(it|this|that)$/.test(p.phrase) ? p.phrase : undefined;
  const kind = phrase ? KIND.find(([re]) => re.test(phrase))?.[1] : undefined;
  const topic = phrase ? words(phrase.replace(NOUNS, " ")) : [];
  const score = (w: W) => { const have = words(`${titleOf(w)} ${frames(w)}`); return topic.filter((x) => have.includes(x)).length; };
  const sel = selectedId ? cards.find((w) => w.id === selectedId) : undefined;
  let target: W | undefined;
  let how = "";
  let offers: W[] = [];
  if (sel && (!phrase || ((!kind || kind === sel.type) && (!topic.length || score(sel) > 0)))) {
    target = sel;
    how = "the selected card";
  } else if (phrase) {
    const pool = cards.filter((w) => (kind ? w.type === kind : fits(w)));
    const ranked = pool.map((w) => ({ w, n: score(w) })).sort((a, b) => b.n - a.n);
    if (ranked[0]?.n && ranked[0].n > (ranked[1]?.n ?? 0)) [target, how] = [ranked[0].w, `named: "${phrase}" (shares ${topic.filter((x) => words(titleOf(ranked[0].w)).includes(x)).join(", ") || "its frame"})`];
    else if (pool.length === 1 && !topic.length) [target, how] = [pool[0], `the only ${kind ?? "card"} here`];
    else if (ranked[0]?.n) offers = ranked.filter((r) => r.n === ranked[0].n).map((r) => r.w);
    else if (pool.length > 1 && !topic.length) offers = pool;
    else return { kind: "none", text: kind ? `no ${phrase} here` : `couldn't find the ${phrase}` };
  } else if (p.fam === "remove" || p.item) {
    // nothing named or selected: the card that holds what the words name ("take ash off")
    const want = p.item ?? p.value;
    const hit = cards.filter((w) => fits(w) && holds(w).some((h) => same(want, h)));
    if (hit.length === 1) [target, how] = [hit[0], `the one card with "${want}" on it`];
    else if (hit.length > 1) offers = hit;
    else return { kind: "none", text: `nothing here has ${want}` };
  } else {
    return { kind: "none", text: "which card? select it or say its name" };
  }
  if (offers.length) {
    const opts = offers.slice(0, 3).flatMap((w) => { const op = opFor(p, w, ctx); return op ? [{ target: w, op, label: `${titleOf(w) || w.type}` }] : []; });
    if (opts.length === 1) [target, how] = [opts[0].target, "the only one that takes this change"];
    else if (opts.length) return { kind: "offers", targets: opts, why: `${opts.length} cards fit` };
    else return { kind: "none", text: "no card here takes that change" };
  }
  if (!target) return { kind: "none", text: "which card? select it or say its name" };
  const op = opFor(p, target, ctx);
  if (!op) return { kind: "none", target, how, text: p.fam === "when" && target.type === "countdown" ? "a countdown has no time" : `can't ${p.fam} that on a ${BY_TYPE.get(target.type)?.id ?? target.type}` };
  const result = applyEdit(target, op, ctx);
  if (!result.ok) return result.refused ? { kind: "refused", target, how, op, text: result.reason } : { kind: "none", target, how, text: result.reason };
  return { kind: "do", target, how, op, result };
}

/** "the choices are …": the selected card, the named one, or the one card on the board missing that part. */
function fillFor(p: Said, widgets: W[], selectedId: string | null, ctx: EditCtx): EditPlan {
  const open = widgets.filter((w) => w.data.unfinished && !w.id.startsWith("voice-draft-"));
  const phrase = p.phrase ? words(p.phrase.replace(NOUNS, " ")) : [];
  const sel = open.find((w) => w.id === selectedId);
  const named = phrase.length ? open.filter((w) => phrase.some((x) => words(titleOf(w)).includes(x))) : [];
  const [target, how] = sel ? [sel, "the selected card"] : named.length === 1 ? [named[0], `named: "${p.phrase}"`] : open.length === 1 ? [open[0], "the one card missing something"] : [undefined, ""];
  if (!target) return { kind: "none", text: open.length ? "which card? select it or say its name" : "nothing here is missing anything" };
  const op = { op: "fill", value: p.value };
  const result = applyEdit(target, op, ctx);
  if (!result.ok) return { kind: "none", target, how, text: result.reason };
  return { kind: "do", target, how, op, result };
}

/** The typed op for these words on this card, or null when the card doesn't take it. */
function opFor(p: Said, w: W, ctx: EditCtx): EditOp | null {
  const op = FAM_OPS[p.fam][w.type];
  if (!op) return null;
  if (op === "setDate") {
    const when = whenOf(p.value);
    const iso = when?.day ? isoFor(when.day, ctx.today) : null;
    return iso ? { op, value: iso } : null;
  }
  if (op === "setDays") return { op, value: Number(p.value) };
  if (op === "setDay") {
    const days = (w.data.days as { plan: string }[] | undefined) ?? [];
    const item = p.item ?? (days.length === 1 ? days[0].plan : undefined);
    return item ? { op, value: p.value, item } : null;
  }
  return { op, value: p.value };
}

/** One line for the drawer and the prompt: what a card takes. */
export const opsLine = (type: string) => Object.keys(opsFor(type) ?? {}).join(", ");
