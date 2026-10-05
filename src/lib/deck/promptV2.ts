/**
 * The deal prompt with room tokens (eval: nebius/eval/brief/v2.md). The model
 * sees each room fact as `@token = its value` and writes the token, never the
 * value; `resolve.ts` expands it after the answer. Only the facts the words
 * point at are sent (a keyword pass, no model), so a wifi note never sees the
 * rent split.
 *
 * Same wire format as `prompt.ts`: one `{"card","settings"}` per line, so
 * `parseDeal` still finds the objects. Two settings exist only here and are
 * lifted out by the resolver: checklist `for` (a people token, one person per
 * item) and split `among` (a people token, who shares it).
 */
import { catalogJson, parseDeal } from "./prompt";
import { checkCard } from "./apply";
import { CATALOG, type DealtCard } from "./catalog";
import { RECIPES } from "./recipes";
import { callTimes, choresOf, resolveCard, type Resolved, type RoomFacts } from "./resolve";

const EXTRA: Record<string, Record<string, string>> = {
  checklist: { for: "people token?" },
  split: { among: "people token?" },
  challenge: { who: "people token?" },
};

/** Rules that only matter when their card is in the deck shown. */
const CARD_RULES: Array<[string, string]> = [
  ["challenge", "- A challenge between people is the challenge recipe, one line: fill activity, unit, days and stake only when said, and who. Never deal its cards one by one."],
  ["wheel", "- Picking one person (who's driving, who cooks, whose turn) is a wheel of those people. A poll is for choosing between options."],
  ["checklist", "- A checklist's \"for\" hands out every item; leave it out for a sign-up where people claim their own (who's bringing what, packing)."],
];

const tokenRules = (has: (id: string) => boolean) => `ROOM FACTS
The user turn lists this room's facts as @token = value. To use a fact, write the token itself in a setting, never its value: code fills it in, so it is always current.
- A people token (@all, @home, @coming, @everyone-but(Name), @on-trip(title)) can be a wheel's or poll's options item, a checklist's "for", a split's "among", a challenge's "who".
${CARD_RULES.filter(([id]) => has(id)).map(([, line]) => `${line}\n`).join("")}- A token can sit inside text: "matcha cake" can be "@leader(cake flavor?) cake".
- Only the tokens listed in the user turn exist; never write another one (there is no @everyone).
- Use a fact only when the words need it: who takes part, the group's own options, who pays, when. Words that already say everything (a note, a code, a station, a place they named) get no tokens and nothing from the room.
- Never make up a name, place or date about this room. A date the words give or everyone knows (a holiday) is written plainly, YYYY-MM-DD. A fact marked past is not a date to use.
- When a card needs something the room doesn't have, still deal the card and leave that setting out: code fills a placeholder.
- Deal what the words ask for, usually one card. Never add a card the words didn't ask for.`;

/* Worked examples, one per card kind that takes a token, in a room that is
   none of the eval rooms. The note is the control: room facts don't touch it. */
const EXAMPLE_ROOM = `Room: the group chat · today Sun 2026-10-04 · people: Thomas, Holly, Priya, Dev
@home = Thomas, Holly, Priya (away: Dev)
@all = Thomas, Holly, Priya, Dev
@chores = dishes, bins
@coming(game night) = Thomas, Holly, Priya
@leader(dessert?) = tiramisu (2 of 3 votes)
@on-trip(lake weekend) = Thomas, Holly, Dev · @payer = Holly
@places = taco window, lucia's
@date(holly's graduation) = Fri 2026-10-23, in 19 days
@zones = Thomas London · Holly NY · @call-times = Mon 7p·2p, Tue 7p·2p, Wed 7p·2p, Thu 7p·2p, Fri 7p·2p
titles: lowercase`;

/** One worked example per card kind (the note is the control: room facts don't touch it); only the shown cards' go out. */
const EXAMPLES: Array<[string, string]> = [
  ["checklist", "Said: \"prep list for the bbq, give everyone a job\"\n{\"card\":\"checklist\",\"settings\":{\"title\":\"bbq prep\",\"items\":[\"grill\",\"salads\",\"drinks\",\"ice\"],\"for\":\"@home\"}}"],
  ["wheel", "Said: \"who's driving to game night\"\n{\"card\":\"wheel\",\"settings\":{\"title\":\"who drives to game night\",\"options\":[\"@coming(game night)\"]}}"],
  ["checklist", "Said: \"chores for the week\"\n{\"card\":\"checklist\",\"settings\":{\"title\":\"chores this week\",\"items\":[\"@chores\",\"vacuum\"],\"for\":\"@home\"}}"],
  ["poll", "Said: \"poll on what we do friday\"\n{\"card\":\"poll\",\"settings\":{\"question\":\"friday plans?\",\"options\":[\"movie night\",\"bowling\",\"stay in\"]}}"],
  ["poll", "Said: \"poll for brunch spots\"\n{\"card\":\"poll\",\"settings\":{\"question\":\"brunch where?\",\"options\":[\"@places\",\"somewhere new\"]}}"],
  ["split", "Said: \"split the lake house, 300\"\n{\"card\":\"split\",\"settings\":{\"title\":\"lake house\",\"total\":300,\"paidBy\":\"@payer\",\"among\":\"@on-trip(lake weekend)\"}}"],
  ["availability", "Said: \"find a night for a movie call\"\n{\"card\":\"availability\",\"settings\":{\"title\":\"movie call · @zones\",\"days\":[\"@call-times\"]}}"],
  ["checklist", "Said: \"bake the winning dessert, done 2 days before the graduation\"\n{\"card\":\"checklist\",\"settings\":{\"title\":\"@leader(dessert?) by @date(holly's graduation, -2d)\",\"items\":[\"buy what it needs\",\"bake it\",\"bring it\"]}}"],
  ["countdown", "Said: \"countdown to Holly's graduation\"\n{\"card\":\"countdown\",\"settings\":{\"event\":\"holly's graduation\",\"date\":\"@date(holly's graduation)\"}}"],
  ["challenge", "Said: \"plank challenge for all of us this week, loser makes dinner\"\n{\"card\":\"challenge\",\"settings\":{\"activity\":\"planks\",\"unit\":\"seconds\",\"days\":7,\"stake\":\"loser makes dinner\",\"who\":\"@all\"}}"],
  ["note", "Said: \"note: the door code is 4417\"\n{\"card\":\"note\",\"settings\":{\"text\":\"door code is 4417\",\"label\":\"door\"}}"],
];

/**
 * The system prompt. `cards`: only these deck cards, their rules and their
 * examples (the per-ask shortlist, `shortlist.ts`); without, the whole deck.
 * `examples: false` is the ablation.
 */
export function deckPromptV2(opts: { examples?: boolean; cards?: string[]; focus?: string[] } = {}): string {
  const has = (id: string) => !opts.cards || opts.cards.includes(id);
  const deck = catalogJson()
    .filter((c) => has(c.id))
    .map((c) => `${c.id}: ${c.use}. settings ${JSON.stringify({ ...c.settings, ...EXTRA[c.id] })}`)
    .join("\n");
  // Worked examples only for the cards the ask points at (`focus`), the note always (the control).
  const showEx = (id: string) => id === "note" || (opts.focus ? opts.focus.includes(id) : has(id));
  const shown = EXAMPLES.filter(([id]) => showEx(id)).map(([, ex]) => ex);
  // The example room carries only the facts those examples use.
  const room = EXAMPLE_ROOM.split("\n").filter((line, i) => {
    if (i === 0 || line.startsWith("titles:")) return true;
    const toks = [...line.matchAll(/@([a-z-]+)/g)].map((m) => m[1]);
    return toks.some((t) => shown.some((ex) => ex.includes(`@${t}`)));
  });
  const examples = opts.examples === false ? "" : `\n\n${room.join("\n")}\n\nEXAMPLES (room above)\n${shown.join("\n")}`;
  const TOKEN_RULES = tokenRules(has);
  return `You place cards in a shared space for a group of friends. You never write UI, layout or prose.
Pick cards from the deck below and fill their settings. Answer with one card per line, each line compact JSON:
{"card":"<id>","settings":{...}}
Keep settings short. A field marked ? can be left out.
If no card fits, answer exactly {"card":"none"}.

DECK
${deck}

${TOKEN_RULES}${examples}

Every line is one complete JSON object that closes before the newline. Only deck ids are valid cards. Settings values are plain strings, numbers or arrays.`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const STOP = new Set("a an the of for to on in at is are do does did who whos what which our we us it this that and or with".split(" "));
const wordsOf = (s: string) =>
  new Set(s.toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, "")));
const overlaps = (said: Set<string>, title: string) => [...wordsOf(title)].some((w) => said.has(w));

/** Which fact groups the words point at. Cheap and loose on purpose: a missed group only costs a fact. */
const WANTS = {
  people: /\b(who|who's|whose|driv\w*|chores?|jobs?|tasks?|assign|surprise|split|spin|turns?|bring\w*|host\w*|help|everyone|challenge)\b|\bof us\b/i,
  // A bare number is money only from three digits ("640"), so "November 14" or "at 7" isn't.
  money: /\b(split|pay|paid|cost|owe|bill|rent|cabin|airbnb|tickets?|dollars|bucks)\b|\$|\b\d{3,}\b/i,
  place: /\b(eat|dinner|lunch|brunch|breakfast|restaurants?|where|spot|places?|bar|coffee)\b/i,
  wheel: /\b(spin|turn|whose|wheel|on \w+ tonight)\b/i,
  clock: /\b(call|facetime|video|talk|zones?)\b/i,
  list: /\b(chores?|list|errands?|clean\w*|grocer\w*|shop\w*|pack\w*|prep)\b/i,
} as const;

/**
 * The room as tokens with their values. With `said`, only the lines the words
 * point at (by keyword or a shared word with a fact's title); without, all of them.
 */
export function tokenMenu(f: RoomFacts, said?: string): string {
  const sw = said ? wordsOf(said) : null;
  const want = (k: keyof typeof WANTS, title = "") => !said || WANTS[k].test(said) || (!!title && overlaps(sw!, title));
  // A poll's leader and a countdown's date belong to one topic: shown only when the words share a word with its title.
  const about = (title: string) => !said || overlaps(sw!, title);
  const lines: string[] = [`Room: ${f.room} · today ${dow(f.today)} ${f.today} · people: ${f.people.join(", ")}`];
  const awayNote = f.away.length ? ` (away: ${f.away.map((a) => a.name).join(", ")})` : "";
  // Everyone, away or not: only when the words ask for the whole group (a challenge, "the four of us").
  if (said === undefined || ALL_OF_US.test(said)) lines.push(`@all = ${f.people.join(", ")}`);
  if (want("people")) lines.push(`@home = ${f.people.filter((p) => !f.away.some((a) => a.name === p)).join(", ")}${awayNote}`);
  for (const r of f.rsvps.slice(0, 2)) {
    if (!want("people", r.title)) continue;
    const rest = [r.no.length && `no: ${r.no.join(", ")}`, r.waiting.length && `no answer: ${r.waiting.join(", ")}`].filter(Boolean).join("; ");
    lines.push(`@coming(${r.title}) = ${r.yes.join(", ") || "nobody yet"}${rest ? ` (${rest})` : ""}`);
  }
  for (const p of f.polls.slice(0, 3)) {
    if (!p.leader || !about(p.title)) continue;
    lines.push(`@leader(${p.title}) = ${p.leader} (${p.lead} of ${p.votes} votes)`);
  }
  const payer = f.splits.find((s) => s.payer);
  for (const s of f.splits.slice(0, 2)) {
    if (!want("money", [s.title, ...s.also].join(" "))) continue;
    const also = s.also.length ? `, also "${s.also.join('", "')}"` : "";
    lines.push(`@on-trip(${s.title}${also}) = ${s.people.join(", ")} · ${s.payer ? `@payer(${s.title}) = ${s.payer} (paid ${s.paid} of ${s.total})` : "no payer"}`);
  }
  if (payer && f.splits.length > 1 && want("money")) lines.push(`@payer = ${payer.payer} (most paid overall)`);
  if (f.places.length && want("place")) lines.push(`@places = ${f.places.join(", ")}`);
  for (const d of f.dates.slice(0, 3)) {
    if (!about(d.title)) continue;
    const when = d.days < 0 ? `${-d.days} days ago, past` : d.days === 0 ? "today" : `in ${d.days} days`;
    lines.push(`@date(${d.title}) = ${dow(d.date)} ${d.date}, ${when}`);
  }
  for (const w of f.wheels.slice(0, 2)) {
    if (!want("wheel", w.title)) continue;
    lines.push(`wheel "${w.title}": ${w.options.join(", ")}${w.last ? ` · @last(${w.title}) = ${w.last}` : ""}`);
  }
  if (f.clocks.length >= 2 && want("clock")) lines.push(`@zones = ${f.clocks.slice(0, 2).map((c) => `${c.label} ${c.tz}`).join(" · ")} · @call-times = ${callTimes(f).join(", ") || "none"}`);
  // The chores this room already tracks (its dishes wheel, its grocery run), named by code.
  const chores = choresOf(f);
  if (chores.length && (!said || /\b(chores?|jobs?|tasks?|clean\w*|rota|roster)\b/i.test(said))) lines.push(`@chores = ${chores.join(", ")}`);
  // A chore list's last week: who did what, what's still open (for "set up chores for next week").
  if (said === undefined || /\b(chores?|jobs?|tasks?|clean\w*|rota|roster|who did|did last)\b/i.test(said)) {
    for (const l of f.lists.filter((x) => /\bchores?\b/i.test(x.title) && x.done?.length).slice(0, 1)) {
      const open = l.items.filter((it) => !l.done!.some((d) => d.item === it));
      lines.push(`list "${l.title}" this week: done ${l.done!.map((d) => `${d.item} (${d.by})`).join(", ")}${open.length ? `; still open ${open.join(", ")}` : ""}`);
    }
  }
  // A running challenge, when the words are about it (or what it decides)
  for (const c of (f.challenges ?? []).slice(0, 1)) {
    if (said !== undefined && !/\b(challenge|standings|winning|ahead|behind|leader|logged|streak|reveal)\b/i.test(said) && !overlaps(sw!, `${c.title} ${c.unit} ${c.stake ?? ""}`)) continue;
    lines.push(`challenge "${c.title}" running: day ${c.day} of ${c.days}${c.reveal ? `, reveal ${c.reveal}` : ""}; ${c.totals.map((t) => `${t.name} ${t.total}`).join(", ")}; logged today ${c.logged.join(", ") || "nobody"}${c.stake ? `; stake: ${c.stake}` : ""}`);
  }
  // The group's standing lists and wheels, titles only: a list's items read as one item to copy.
  if (want("list")) {
    const own = [...f.lists.slice(0, 3).map((l) => `list "${l.title}"`), ...f.wheels.slice(0, 2).map((w) => `wheel "${w.title}"`)];
    if (own.length) lines.push(`their lists: ${own.join(", ")}`);
  }
  if (f.lowercase) lines.push("titles: lowercase");
  // What people told the space themselves (the "what this space knows" page).
  if (f.told?.length) lines.push(`${TOLD_LEAD} ${f.told.join("; ")}`);
  return lines.join("\n");
}

/** Leads the line of facts people told the space; they outrank what code noticed. */
export const TOLD_LEAD = "The group told us (true, wins over anything above):";

/** The user turn: the facts, then the words (and the card, when the decide pass already picked it). */
export function dealTurnV2(r: { menu: string; said: string; card?: string }): string {
  return `${r.menu}\nSaid: "${r.said}"${r.card ? `\n${cardLine(r.card)}` : ""}`;
}

/** The decided card, as the last line of either route's user turn. */
export const cardLine = (card: string) => `Deal one ${card} card.`;

/* ---------- Route by need: the brain only when the words point at a room fact ---------- */

/** Words that ask for the room's people. "everyone" alone ("remind everyone…") doesn't. */
const ASKS_WHO = /\b(who|who's|whose|driv\w*|chores?|jobs?|tasks?|assign\w*|surprise|split|spin|turns?|bring\w*|host\w*|challenge)\b|\bof us\b/i;
/** Words that ask for the whole group, away or not. */
const ALL_OF_US = /\b(challenge|all of us|(two|three|four|five|six|seven|eight|\d+) of us|whole (family|house|group|crew))\b/i;

export type AskRoute = {
  route: "fast" | "brain";
  /** One line for the drawer. */
  why: string;
  /** The token menu the brain would be sent (null without room facts). */
  menu: string | null;
  /** The fact lines that decided it. */
  facts: string[];
};

/** The fact a menu line names: "@coming(who's coming)", "wheel \"who does dishes\"", "their lists". */
const factName = (line: string) => line.split(/ = |: /)[0];

/**
 * Which fill this ask gets. The per-ask fact picker (`tokenMenu`) already
 * knows which room facts the words point at: none → today's fast fill on
 * Lightning, unchanged; some → the token prompt on the brain model.
 */
export function routeAsk(f: RoomFacts | null, said: string): AskRoute {
  if (!f) return { route: "fast", why: "no room brief yet", menu: null, facts: [] };
  const menu = tokenMenu(f, said);
  const lines = menu.split("\n").slice(1).filter((l) => !l.startsWith("titles:"));
  // Told facts ride along with a brain ask; alone they don't make one.
  const told = lines.filter((l) => l.startsWith(TOLD_LEAD));
  let facts = lines.filter((l) => !l.startsWith(TOLD_LEAD));
  if (!ASKS_WHO.test(said)) facts = facts.filter((l) => !/^@(home|coming|all)\b/.test(l));
  return facts.length
    ? { route: "brain", why: `the words point at ${facts.map(factName).join(", ")}`, menu, facts: [...facts, ...told] }
    : { route: "fast", why: "no room fact in the words", menu, facts };
}

export type ResolvedItem =
  | { ok: true; card: DealtCard; notes: string[]; raw: string; resolved: Resolved }
  | { ok: false; reason: string; raw: string; resolved?: Resolved };

/** `parseDeal` for a token answer: each object is resolved against the room, then checked. */
export function parseDealResolved(text: string, done: boolean, f: RoomFacts, said: string) {
  const d = parseDeal(text, done);
  const items: ResolvedItem[] = d.items.map((it) => {
    let obj: { card?: unknown; settings?: Record<string, unknown> } & Record<string, unknown>;
    try {
      obj = JSON.parse(it.raw);
    } catch {
      try {
        obj = JSON.parse(it.raw.replace(/,\s*([}\]])/g, "$1"));
      } catch {
        return it.ok ? { ok: false, reason: "not valid JSON", raw: it.raw } : it;
      }
    }
    if (!obj || typeof obj.card !== "string") return it.ok ? { ok: false, reason: "no card id", raw: it.raw } : it;
    const { card, settings, ...flat } = obj;
    const resolved = resolveCard({ card: card as string, settings: settings ?? flat }, f, said);
    const c = checkCard({ card: resolved.card, settings: resolved.settings });
    return c.ok ? { ...c, raw: it.raw, resolved } : { ok: false, reason: c.reason, raw: it.raw, resolved };
  });
  return { items, none: d.none && !items.some((i) => i.ok), rest: d.rest };
}

const TOKEN_IN_TEXT = /@[a-z][a-z-]*(\((?:[^()]|\([^()]*\))*\))?/gi;

/** A tentative fill never shows a raw token: anything the resolver left reads as a neutral "…". */
export function scrubTokens<T>(v: T): T {
  if (typeof v === "string") return (v.includes("@") ? v.replace(TOKEN_IN_TEXT, "…") : v) as T;
  if (Array.isArray(v)) return v.map(scrubTokens) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubTokens(x)])) as T;
  return v;
}

/* ---------- The decide pass: one letter from the big model, while you talk ---------- */

/** Deck cards A…Q, then none and several. "several" is the one-vs-several question (the separate count question was dropped: nebius/eval/decide). */
export const DECIDE_CHOICES: string[] = [...CATALOG.map((c) => c.id), ...RECIPES.map((r) => r.id), "none", "several"];
export const DECIDE_LETTERS = DECIDE_CHOICES.map((_, i) => String.fromCharCode(65 + i));

const DECIDE_SYSTEM =
  "You read one request said aloud in a shared space for a group of friends and answer one multiple-choice question about it. Reply with the single letter of the best option and nothing else.";

/** The fan-out's second question, as measured (Ultra 16 of 18, nebius/eval/decide/head.md). Same prefix as the card question. */
const BOARD_Q = "Is a card already on the board that does what the request asks?\nA yes\nB no";
export const BOARD_LETTERS = ["A", "B"];

/** The decide prompt as measured (nebius/eval/decide/prompts.mjs), board titles in. `q: "board"` asks the yes/no instead, about `match` when code found one. */
export function decideMessages(r: { context: string; board: string[]; said: string; q?: "card" | "board"; match?: string }) {
  const q =
    r.q === "board"
      ? r.match
        ? `This card is already on the board: ${r.match}. Does it already do what the request asks, so no new card is needed?\nA yes\nB no`
        : BOARD_Q
      : "Which card should be placed?\n" +
    DECIDE_CHOICES.map((id, i) => {
      const what =
        id === "none"
          ? "none: no card fits, or it isn't a request for a card"
          : id === "several"
            ? "several: it asks for two or more different cards (a plan with parts)"
            : `${id}: ${(CATALOG.find((c) => c.id === id) ?? RECIPES.find((r) => r.id === id))!.use}`;
      return `${DECIDE_LETTERS[i]} ${what}`;
    }).join("\n");
  const board = r.board.length ? `\nOn the board: ${r.board.join(" · ")}` : "";
  return [
    { role: "system" as const, content: DECIDE_SYSTEM },
    { role: "user" as const, content: `${r.context}${board}\nSaid: "${r.said}"\n\n${q}` },
  ];
}
