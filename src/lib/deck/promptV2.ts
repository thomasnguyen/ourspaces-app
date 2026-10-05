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
import { catalogJson } from "./prompt";
import { callTimes, type RoomFacts } from "./resolve";

const EXTRA: Record<string, Record<string, string>> = {
  checklist: { for: "people token?" },
  split: { among: "people token?" },
};

const TOKEN_RULES = `ROOM FACTS
The user turn lists this room's facts as @token = value. To use a fact, write the token itself in a setting, never its value: code fills it in, so it is always current.
- A people token (@home, @coming, @everyone-but(Name), @on-trip(title)) can be a wheel's or poll's options item, a checklist's "for", a split's "among".
- A token can sit inside text: "matcha cake" can be "@leader(cake flavor?) cake".
- Use a fact only when the words need it: who takes part, the group's own options, who pays, when. Words that already say everything (a note, a code, a station, a place they named) get no tokens and nothing from the room.
- Never make up a name, place or date about this room. A date the words give or everyone knows (a holiday) is written plainly, YYYY-MM-DD. A fact marked past is not a date to use.
- When a card needs something the room doesn't have, still deal the card and leave that setting out: code fills a placeholder.
- Deal what the words ask for, usually one card. Never add a card the words didn't ask for.`;

/* Worked examples, one per card kind that takes a token, in a room that is
   none of the eval rooms. The note is the control: room facts don't touch it. */
const EXAMPLE_ROOM = `Room: the group chat · today Sun 2026-10-04 · people: Thomas, Holly, Priya, Dev
@home = Thomas, Holly, Priya (away: Dev)
@coming(game night) = Thomas, Holly, Priya
@leader(dessert?) = tiramisu (2 of 3 votes)
@on-trip(lake weekend) = Thomas, Holly, Dev · @payer = Holly
@places = taco window, lucia's
@date(holly's graduation) = Fri 2026-10-23, in 19 days
@zones = Thomas London · Holly NY · @call-times = Mon 7p·2p, Tue 7p·2p, Wed 7p·2p, Thu 7p·2p, Fri 7p·2p
titles: lowercase`;

const EXAMPLES = `EXAMPLES (room above)
Said: "prep list for the bbq, give everyone a job"
{"card":"checklist","settings":{"title":"bbq prep","items":["grill","salads","drinks","ice"],"for":"@home"}}
Said: "spin for who hosts game night"
{"card":"wheel","settings":{"title":"who hosts game night","options":["@coming(game night)"]}}
Said: "poll for brunch spots"
{"card":"poll","settings":{"question":"brunch where?","options":["@places","somewhere new"]}}
Said: "split the lake house, 300"
{"card":"split","settings":{"title":"lake house","total":300,"paidBy":"@payer","among":"@on-trip(lake weekend)"}}
Said: "find a night for a movie call"
{"card":"availability","settings":{"title":"movie call · @zones","days":["@call-times"]}}
Said: "bake the winning dessert, done 2 days before the graduation"
{"card":"checklist","settings":{"title":"@leader(dessert?) by @date(holly's graduation, -2d)","items":["buy what it needs","bake it","bring it"]}}
Said: "countdown to Holly's graduation"
{"card":"countdown","settings":{"event":"holly's graduation","date":"@date(holly's graduation)"}}
Said: "note: the door code is 4417"
{"card":"note","settings":{"text":"door code is 4417","label":"door"}}`;

/** The fixed system prompt (a cacheable prefix, like `deckPrompt`). `examples: false` is the ablation. */
export function deckPromptV2(opts: { examples?: boolean } = {}): string {
  const deck = catalogJson()
    .map((c) => `${c.id}: ${c.use}. settings ${JSON.stringify({ ...c.settings, ...EXTRA[c.id] })}`)
    .join("\n");
  const examples = opts.examples === false ? "" : `\n\n${EXAMPLE_ROOM}\n\n${EXAMPLES}`;
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
  people: /\b(who|who's|whose|driv\w*|chores?|jobs?|tasks?|assign|surprise|split|spin|turns?|bring\w*|host\w*|help|everyone)\b/i,
  money: /\b(split|pay|paid|cost|owe|bill|rent|cabin|airbnb|tickets?)\b|\$|\b\d{2,}\b/i,
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
  // The group's standing lists and wheels, titles only: a list's items read as one item to copy.
  if (want("list")) {
    const own = [...f.lists.slice(0, 3).map((l) => `list "${l.title}"`), ...f.wheels.slice(0, 2).map((w) => `wheel "${w.title}"`)];
    if (own.length) lines.push(`their lists: ${own.join(", ")}`);
  }
  if (f.lowercase) lines.push("titles: lowercase");
  return lines.join("\n");
}

/** The user turn: the facts, then the words. */
export function dealTurnV2(r: { menu: string; said: string }): string {
  return `${r.menu}\nSaid: "${r.said}"`;
}
