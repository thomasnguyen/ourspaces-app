// The Right of Way scenario set: each one a small recorded situation on a board (the cards, who holds what and
// since when, the choices people made) and one AI write, labelled with the outcome a reasonable person would want
// and why. Labels are written by hand, before either arm runs, and frozen into scenarios.json with a timestamp.
//
//   node eval/right-of-way/scenarios.mjs            writes scenarios.json (refuses if it is frozen and labels moved)
//   node eval/right-of-way/scenarios.mjs --relabel  rewrites it and appends each changed label to label-changes.md
//
// Clock: every time is ms relative to the moment the write reaches the door (now = 0, the past is negative).
// A hold: { who, thing, kind: drag|type|vote|piece, since, renewed?, letGo? }. While held the screen renews every
// second (renewed defaults to the last whole second); a dead client is a hold whose renewals stopped (renewed far
// back, no letGo). Groups: gate = the gate's own case table expanded; recorded = every AI write in the earlier live
// runs (R1 sequences and R2 choice runs), as the snapshot at its moment; adversarial = written to trip one arm or
// the other. `amb` = reasonable people could disagree on the label: scored apart.
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const P = (name) => ({ id: `u-${name.toLowerCase()}`, name });
const PEOPLE = Object.fromEntries(["Tara", "Holly", "Sam", "Jo", "Maya", "Jules", "Ash", "Juno", "Ziggy", "Priya", "Marco"].map((n) => [n.toLowerCase(), P(n)]));
const o = (id, label) => ({ id, label, votes: 0, total: 0, voters: [] });

/* ---- cards (the R1/R2 fixtures, same data) ---- */
const poll = (opts = ["pizza", "tacos", "pho"], q = "friday dinner?", id = "dinner", rect = { x: 100, y: 100, w: 300, h: 260 }) => ({ id, type: "poll", rect, data: { question: q, options: opts.map((l, i) => o("abcdefgh"[i], l)) } });
const drinks = (opts = ["matcha", "coffee", "beer"]) => poll(opts, "drinks at game night?", "drinks", { x: 440, y: 100, w: 300, h: 240 });
const snacks = (items = [["ice"], ["chips"]]) => ({
  id: "snacks", type: "potluck", rect: { x: 440, y: 400, w: 300, h: 260 },
  data: { title: "game night snacks", items: items.map(([name, by, byUserId]) => ({ name, by: by ?? null, claimed: Boolean(by), ...(byUserId ? { byUserId } : {}) })), openCount: items.filter(([, by]) => !by).length },
});
const rsvp = (rows = [], title = "game night · friday") => ({ id: "rsvp", type: "rsvp", rect: { x: 100, y: 420, w: 300, h: 230 }, data: { title, responses: rows.map(([who, status, withId = true]) => ({ name: PEOPLE[who].name, status, ...(withId ? { userId: PEOPLE[who].id } : {}) })) } });
const cabin = (rows = [["Maya", 0], ["Jules", 0], ["Ash", 0]], total = 600) => {
  const share = Math.round(total / rows.length);
  return { id: "cabin", type: "expenseSplit", rect: { x: 780, y: 100, w: 320, h: 260 }, data: { title: "cabin split", total, splits: rows.map(([name, paid]) => ({ name, owes: Math.max(0, share - paid), paid })) } };
};
const plank = (logs = {}, days = 5) => ({ id: "plank", type: "checkIn", rect: { x: 780, y: 400, w: 360, h: 300 }, data: { title: "plank challenge", kind: "number", unit: "seconds", start: "2026-10-01", days, revealAt: "2026-10-06T09:00", people: Object.keys(logs).map((name) => ({ name })), logs } });
const bake = (by) => ({ id: "bake", type: "countdown", rect: { x: 1180, y: 100, w: 280, h: 240 }, data: { event: "bake sale", targetDate: "2026-10-16", startDate: "2026-10-05", ...(by ? { dateBy: by } : {}) } });
const trip = () => ({ id: "trip", type: "itinerary", rect: { x: 1180, y: 400, w: 320, h: 280 }, data: { title: "japan trip", days: [{ day: "nov 2", plan: "tokyo · shibuya" }, { day: "nov 5", plan: "kyoto · temples" }, { day: "nov 8", plan: "osaka · food" }] } });
const standings = () => ({ id: "standings", type: "standings", rect: { x: 1180, y: 720, w: 300, h: 240 }, data: { title: "plank standings", source: "plank" } });
const days = () => ({ id: "finder", type: "availability", rect: { x: 1540, y: 100, w: 320, h: 260 }, data: { title: "when's the bake sale?", days: ["sat", "sun"], members: [{ name: "Holly", slots: [false, true] }, { name: "Sam", slots: [false, true] }, { name: "Jo", slots: [true, true] }] } });
const puzzle = (placed, total = 20) => ({ id: "puzzle", type: "jigsaw", rect: { x: 100, y: 720, w: 420, h: 320 }, data: { title: "a puzzle of the beach", placed, total } });

/* ---- holds ---- */
const hold = (who, thing, kind = "drag", t = {}) => ({ who, thing, kind, since: t.since ?? -3200, ...(t.renewed !== undefined ? { renewed: t.renewed } : {}), ...(t.letGo !== undefined ? { letGo: t.letGo } : {}) });

/* ---- writes ---- */
const edit = (card, op, value, by = "tara", said, extra = {}) => ({ kind: "edit", card, op: { op, value, ...(extra.item ? { item: extra.item } : {}) }, by, said, ...(extra.consented ? { consented: extra.consented } : {}), ...(extra.byId ? { byId: extra.byId } : {}) });
const build = (type, title, rect, by = "tara", said) => ({ kind: "build", newCard: { type, title }, rect, by, said });

const S = [];
const add = (group, id, src, title, s) => S.push({ id, group, src, title, now: 0, people: s.people ?? ["tara", "holly", "sam", "jo"], cards: s.cards, votes: s.votes ?? [], holds: s.holds ?? [], ...(s.history ? { history: s.history } : {}), write: s.write, ...(s.batch ? { batch: s.batch } : {}), label: { verdict: s.want, who: s.who ?? [], why: s.why, ...(s.amb ? { ambiguous: true } : {}) } });
const V = (card, option, who) => ({ card, option, who });
const all = (card, option, ...who) => who.map((w) => V(card, option, w));

/* ================= gate: the gate's own case table (AI writes only), expanded ================= */
add("gate", "G01", "CASES #1", "remove an option 3 people voted for", { cards: [poll()], votes: all("dinner", "a", "holly", "sam", "jo"), write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "ask", who: ["Holly", "Sam", "Jo"], why: "three people chose pizza; taking it off overrides their votes, so they decide" });
add("gate", "G02", "CASES #1", "one person's claimed slot", { people: ["tara", "jules", "sam"], cards: [snacks([["towels", "Jules", "u-jules"], ["ice"], ["chips"]])], write: edit("snacks", "removeItem", "towels", "tara", "take towels off the snacks list"), want: "ask", who: ["Jules"], why: "jules claimed towels; removing it undoes their claim" });
add("gate", "G03", "CASES #1", "an rsvp time 3 people said yes to", { cards: [rsvp([["holly", "yes"], ["sam", "yes"], ["jo", "yes"]])], write: edit("rsvp", "setWhen", "sunday", "tara", "move game night to sunday"), want: "ask", who: ["Holly", "Sam", "Jo"], why: "three people said yes to friday; moving the time overrides their answers" });
add("gate", "G04", "CASES #1", "someone who paid into the split (name only)", { people: ["tara", "maya", "jules", "ash"], cards: [cabin([["Maya", 200], ["Jules", 0], ["Ash", 0]])], write: edit("cabin", "removePerson", "maya", "tara", "take maya off the cabin split"), want: "ask", who: ["Maya"], why: "maya paid $200 into it; taking her off erases her payment from the split" });
add("gate", "G05", "CASES #1", "check-ins already logged past the new end", { cards: [plank({ Holly: [30, 40, 50, 60, 70], Sam: [20, 25, 30, 35, null], Jo: [10, null, null, null, null] })], write: edit("plank", "setDays", 3, "tara", "make the plank challenge 3 days"), want: "ask", who: ["Holly", "Sam"], why: "holly and sam logged days 4-5; cutting to 3 days deletes their logs. jo logged only day 1" });
add("gate", "G06", "CASES #1", "a date someone set by hand", { cards: [bake({ id: "u-holly", name: "Holly" })], write: edit("bake", "setDate", "2026-10-11", "tara", "move the bake sale to sunday"), want: "ask", who: ["Holly"], why: "holly set oct 16 by hand; moving it overrides her pick" });
add("gate", "G07", "CASES #1", "the asker is one of 3 voters: ask the other 2", { cards: [poll()], votes: all("dinner", "a", "tara", "sam", "jo"), write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "ask", who: ["Sam", "Jo"], why: "tara's own vote is hers to give up; sam's and jo's are not" });
add("gate", "G08", "CASES #1", "choices first: others voted, the asker holds the card", { cards: [poll()], votes: [V("dinner", "a", "holly")], holds: [hold("tara", "dinner")], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "ask", who: ["Holly"], why: "her own hand doesn't matter; holly's vote does" });
add("gate", "G09", "CASES #1b", "only the asker's own vote", { cards: [poll()], votes: [V("dinner", "a", "tara")], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "go", why: "the only vote on pizza is tara's own" });
add("gate", "G10", "CASES #1b", "only the asker's own claim, by name", { cards: [snacks([["towels", "Tara"], ["ice"], ["chips"]])], write: edit("snacks", "removeItem", "towels", "tara", "take towels off the snacks list"), want: "go", why: "tara claimed towels herself" });
add("gate", "G11", "CASES #1b", "a passed vote, nobody holds it", { cards: [poll()], votes: all("dinner", "a", "holly", "sam"), write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll", { consented: "the vote passed: 2 of 2 said change it (holly, sam)" }), want: "go", why: "the people whose votes it clears already agreed" });
add("gate", "G12", "CASES #1b", "a passed vote while holly holds it", { cards: [poll()], votes: all("dinner", "a", "holly", "sam"), holds: [hold("holly", "dinner")], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll", { consented: "the vote passed: 2 of 2 said change it (holly, sam)" }), want: "wait", who: ["Holly"], why: "agreed, but holly's hand is on the card right now" });
add("gate", "G13", "CASES #2", "the space places the last piece", { cards: [puzzle(19)], write: { kind: "puzzle", piece: 7, placed: 19, total: 20 }, want: "never", why: "the last piece belongs to a person" });
add("gate", "G14", "CASES #3", "nobody holds the target (someone holds another card)", { cards: [poll(), cabin()], holds: [hold("holly", "cabin")], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "go", why: "holly's hand is on the split, not the poll" });
add("gate", "G15", "CASES #5", "the asker holds it", { cards: [poll()], holds: [hold("holly", "dinner")], write: edit("dinner", "addOption", "ramen", "holly", "add ramen to the dinner poll"), want: "go", why: "it's holly's own hand and her own words" });
add("gate", "G16", "CASES #6", "someone else holds it (drag)", { cards: [poll()], holds: [hold("holly", "dinner")], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "wait", who: ["Holly"], why: "holly is dragging it" });
add("gate", "G17", "CASES #6", "someone else holds it (typing)", { cards: [poll()], holds: [hold("holly", "dinner", "type", { since: -6000 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "wait", who: ["Holly"], why: "holly is typing in it" });
add("gate", "G18", "CASES #6", "someone else holds it (unsent vote)", { cards: [poll()], holds: [hold("holly", "dinner", "vote", { since: -900 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "wait", who: ["Holly"], why: "holly's finger is on a choice she hasn't let go of" });
add("gate", "G19", "CASES #6", "a link fills a held card", { cards: [plank({ Holly: [30, null, null, null, null] }), standings()], holds: [hold("holly", "standings")], write: { kind: "link", card: "standings", from: "plank", fill: "source", desc: "the check-in's link fills the standings card's source (always)" }, want: "wait", who: ["Holly"], why: "holly is dragging the standings" });
add("gate", "G20", "CASES #6", "the space's hand, a held piece", { cards: [puzzle(5)], holds: [hold("holly", "piece:3", "piece", { since: -1500 })], write: { kind: "puzzle", piece: 3, placed: 5, total: 20 }, want: "wait", who: ["Holly"], why: "holly has that piece in her hand" });
add("gate", "G21", "CASES #9", "a new card on a held spot", { cards: [poll()], holds: [hold("holly", "dinner")], write: build("poll", "where to eat saturday?", { x: 200, y: 160, w: 300, h: 260 }, "sam", "make a poll for where to eat saturday"), want: "never", why: "its spot is on the card holly is dragging; place it somewhere else" });
add("gate", "G22", "CASES #10", "a new card in a free spot", { cards: [poll()], holds: [hold("holly", "dinner")], write: build("poll", "where to eat saturday?", { x: 1600, y: 800, w: 300, h: 260 }, "sam", "make a poll for where to eat saturday"), want: "go", why: "nothing held where it lands" });
add("gate", "G23", "variation", "one vote on the option", { cards: [poll()], votes: [V("dinner", "b", "jo")], write: edit("dinner", "removeOption", "tacos", "tara", "take tacos off the dinner poll"), want: "ask", who: ["Jo"], why: "jo voted for tacos" });
add("gate", "G24", "variation", "yes and maybe on the time", { cards: [rsvp([["holly", "yes"], ["sam", "maybe"], ["jo", "no"]])], write: edit("rsvp", "setWhen", "7:30", "tara", "move it to 7:30"), want: "ask", who: ["Holly", "Sam"], why: "holly said yes and sam maybe to friday's time; jo's no isn't a plan to keep" });
add("gate", "G25", "variation", "rsvp with only no answers", { cards: [rsvp([["holly", "no"], ["sam", "no"]])], write: edit("rsvp", "setWhen", "saturday", "tara", "move game night to saturday"), want: "go", amb: true, why: "nobody is planning on friday, so moving it overrides no plan. ambiguous: holly's and sam's 'no' now sit on saturday, a day they never answered" });
add("gate", "G26", "variation", "rename while someone types in the title", { cards: [poll()], holds: [hold("holly", "dinner", "type", { since: -5000 })], write: edit("dinner", "rename", "taco night", "sam", "rename it to taco night"), want: "wait", who: ["Holly"], why: "holly is typing in that card" });
add("gate", "G27", "variation", "add an item while someone drags the list", { cards: [snacks()], holds: [hold("sam", "snacks")], write: edit("snacks", "addItem", "salsa", "tara", "add salsa to the snacks list"), want: "wait", who: ["Sam"], why: "sam is dragging it" });
add("gate", "G28", "variation", "add a person while someone types in the split", { people: ["tara", "jo", "maya", "jules", "ash"], cards: [cabin()], holds: [hold("jo", "cabin", "type", { since: -4000 })], write: edit("cabin", "addPerson", "priya", "tara", "add priya to the cabin split"), want: "wait", who: ["Jo"], why: "jo is typing in it" });
add("gate", "G29", "variation", "lengthen a challenge with logs", { cards: [plank({ Holly: [30, 40, 50, 60, 70], Sam: [20, 25, null, null, null] })], write: edit("plank", "setDays", 10, "tara", "make the plank challenge 10 days"), want: "go", why: "longer drops nothing anyone logged" });
add("gate", "G30", "variation", "shorten a challenge nobody logged past", { cards: [plank({ Holly: [30, 40, null, null, null], Sam: [20, null, null, null, null] })], write: edit("plank", "setDays", 4, "tara", "make the plank challenge 4 days"), want: "go", why: "nobody logged day 5, so cutting it removes nothing" });
add("gate", "G31", "variation", "move a countdown nobody set by hand", { cards: [bake()], write: edit("bake", "setDate", "2026-10-11", "tara", "move the bake sale to sunday"), want: "go", why: "the date came from the build, not a person" });
add("gate", "G32", "variation", "move a day on a trip plan", { people: ["tara", "maya", "jules"], cards: [trip()], write: edit("trip", "setDay", "nov 9", "tara", "move kyoto to nov 9", { item: "kyoto" }), want: "go", why: "a plan's days aren't anyone's vote or claim, and nobody holds it" });
add("gate", "G33", "variation", "move a day on a held trip plan", { people: ["tara", "maya", "jules"], cards: [trip()], holds: [hold("maya", "trip")], write: edit("trip", "setDay", "nov 9", "tara", "move kyoto to nov 9", { item: "kyoto" }), want: "wait", who: ["Maya"], why: "maya is dragging the plan" });
add("gate", "G34", "variation", "the space places a loose piece", { cards: [puzzle(5)], write: { kind: "puzzle", piece: 6, placed: 5, total: 20 }, want: "go", why: "nobody holds it and it isn't the last" });
add("gate", "G35", "variation", "the space places the 19th of 20", { cards: [puzzle(18)], write: { kind: "puzzle", piece: 12, placed: 18, total: 20 }, want: "go", why: "one stays for a person" });
add("gate", "G36", "variation", "the space places a piece while holly holds a different one", { cards: [puzzle(5)], holds: [hold("holly", "piece:3", "piece", { since: -1500 })], write: { kind: "puzzle", piece: 4, placed: 5, total: 20 }, want: "go", why: "holly's piece is a different one" });
add("gate", "G37", "variation", "a new card over two held cards", { cards: [poll(), drinks()], holds: [hold("holly", "dinner"), hold("sam", "drinks")], write: build("checklist", "what to bring", { x: 300, y: 150, w: 300, h: 200 }, "tara", "make a list of what to bring"), want: "never", why: "its spot covers both held cards; place it elsewhere" });
add("gate", "G38", "variation", "a new card over a card the asker holds", { cards: [poll()], holds: [hold("tara", "dinner")], write: build("poll", "dessert?", { x: 200, y: 160, w: 300, h: 260 }, "tara", "make a dessert poll"), want: "go", why: "the only hand there is the asker's own" });
add("gate", "G39", "variation", "a new card over a card nobody holds", { cards: [poll()], write: build("poll", "dessert?", { x: 200, y: 160, w: 300, h: 260 }, "tara", "make a dessert poll"), want: "go", why: "no hand on anything it covers" });
add("gate", "G40", "variation", "start a game while someone drags a card", { cards: [poll()], holds: [hold("holly", "dinner")], write: { kind: "game", game: "trivia", by: "sam", said: "start a trivia game" }, want: "go", why: "a game is a new thing; it touches nothing holly holds" });
add("gate", "G41", "variation", "the late-word rewrite of a just-built card someone grabbed", { cards: [poll(["tacos", "pho"], "taco night?", "new")], holds: [hold("sam", "new", "drag", { since: -800 })], write: { kind: "amend", card: "new", by: "tara", said: "make a poll for taco night tuesday", desc: "rewrite the card just built from the last words (title → 'taco night tuesday?')" }, want: "wait", who: ["Sam"], why: "sam already has his hand on the new card" });
add("gate", "G42", "variation", "the late-word rewrite, nobody holds it", { cards: [poll(["tacos", "pho"], "taco night?", "new")], write: { kind: "amend", card: "new", by: "tara", said: "make a poll for taco night tuesday", desc: "rewrite the card just built from the last words (title → 'taco night tuesday?')" }, want: "go", why: "nobody holds it" });
add("gate", "G43", "variation", "a link fills a card nobody holds", { cards: [plank({ Holly: [30, null, null, null, null] }), standings()], write: { kind: "link", card: "standings", from: "plank", fill: "source", desc: "the check-in's link fills the standings card's source (always)" }, want: "go", why: "nobody holds it, nothing chosen in the source field" });
add("gate", "G44", "variation", "choices on a card someone is typing in", { cards: [poll()], votes: all("dinner", "a", "sam", "jo"), holds: [hold("holly", "dinner", "type", { since: -5000 })], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "ask", who: ["Sam", "Jo"], why: "choices first: sam and jo decide; if it passes it then waits for holly" });
add("gate", "G45", "variation", "a passed vote while someone presses a choice", { cards: [rsvp([["holly", "yes"], ["sam", "yes"]])], holds: [hold("sam", "rsvp", "vote", { since: -700 })], write: edit("rsvp", "setWhen", "sunday", "tara", "move game night to sunday", { consented: "the vote passed: 2 of 2 said change it (holly, sam)" }), want: "wait", who: ["Sam"], why: "agreed, but sam's finger is on the card" });

/* ================= recorded: every AI write in the live runs, as the snapshot at its moment ================= */
// R1 (nebius/eval/row/seq-*.json, from .context/r1/runs.jsonl): the asker is Tara, the holder Sam; the fixture cards are
// the R1 fixtures. `ago` = how long the hold had run when the write reached the door (the recording's own times).
const R1 = [
  ["t1", "add ramen to the dinner poll", "drag", 3385], ["core-drag", "add udon to the dinner poll", "drag", 3534], ["d01", "add udon to the dinner poll", "drag", 3320],
  ["d02", "take pho off the dinner poll", "drag", 3149], ["d04", "remove chips from the snacks list", "drag", 3127], ["d06", "take ash off the cabin split", "drag", 3098],
  ["d07", "make the plank challenge 10 days", "drag", 3223], ["d08", "move it to 7:30", "drag", 3067], ["d09", "rename it to taco night", "drag", 3254],
  ["d10", "add tea to the drinks poll", "drag", 2929], ["d11", "add marco to the cabin split", "drag", 3080], ["d12", "add salsa to the snacks list", "drag", 3039],
  ["d13", "make the plank challenge 7 days", "drag", 3265], ["d14", "take coffee off the drinks poll", "drag", 3115], ["d16", "rename it to board games", "drag", 3314],
  ["d17", "add soda to the snacks list", "drag", 3076], ["d18", "take marco off the cabin split", "drag", 3567], ["d19", "add sake to the drinks poll", "drag", 3023],
  ["d20", "move it to 8:30", "drag", 3057], ["d22", "remove soda from the snacks list", "drag", 3391], ["d03", "add pretzels to the snacks list", "drag", 3006],
  ["d05", "add rio to the cabin split", "drag", 3033], ["d15", "add ramen to the dinner poll", "drag", 3097], ["d21", "add curry to the dinner poll", "drag", 3114],
  ["d21b", "add laksa to the dinner poll", "drag", 3067],
  ["title-drop", "rename it to taco tuesday", "type", 4439, "drinks"], ["title-keep", "rename it to late drinks", "type", 4443, "drinks"], ["vote", "add tea to the drinks poll", "vote", 2840],
  ["title-drop2", "rename it to taco tuesday", "type", 4425, "drinks"], ["self", "add soba to the dinner poll", "drag", 3319, null, "tara"], ["t01", "rename it to taco tuesday", "type", 4722, "drinks"],
  ["t02", "rename it to late drinks", "type", 4273, "drinks"], ["v01", "add lemonade to the drinks poll", "vote", 3103], ["v02", "add tacos al pastor to the dinner poll", "vote", 3543],
  ["s01", "add soba to the dinner poll", "drag", 3169, null, "tara"],
  // seq-3: the killed clients had renewed at these times before the write (their last word), then went silent after it
  ["kill", "add miso to the dinner poll", "drag", 3241], ["k01", "add nachos to the snacks list", "drag", 3195], ["k02", "add jo to the cabin split", "drag", 3087],
  ["c01", "add dips to the snacks list", "drag", 3127], ["x01", "add wine to the drinks poll", "drag", 3031],
];
// the card each ask names, the op the words parse to (lib/deck/edits.ts parseSaid), and the card as it stood (removals of
// things an earlier run added include them)
const R1CARD = { dinner: () => poll(), drinks: () => drinks(), snacks: (v) => snacks([["ice"], ["chips"], ...(v === "soda" ? [["soda"]] : [])]), cabin: (v) => cabin([["Maya", 0], ["Jules", 0], ["Ash", 0], ...(v === "marco" ? [["Marco", 0]] : [])]), plank: () => plank({ Maya: [30, null, null, null, null], Jules: [null, null, null, null, null] }), rsvp: () => rsvp() };
function r1op(said, card) {
  let m;
  if ((m = /^add (.+) to the (dinner|drinks) poll$/.exec(said))) return [m[2], "addOption", m[1]];
  if ((m = /^take (.+) off the (dinner|drinks) poll$/.exec(said))) return [m[2], "removeOption", m[1]];
  if ((m = /^(?:add (.+) to|remove (.+) from) the snacks list$/.exec(said))) return ["snacks", m[1] ? "addItem" : "removeItem", m[1] ?? m[2]];
  if ((m = /^(?:add (.+) to|take (.+) off) the cabin split$/.exec(said))) return ["cabin", m[1] ? "addPerson" : "removePerson", m[1] ?? m[2]];
  if ((m = /^make the plank challenge (\d+) days$/.exec(said))) return ["plank", "setDays", Number(m[1])];
  if ((m = /^move it to (.+)$/.exec(said))) return ["rsvp", "setWhen", m[1]];
  if ((m = /^rename it to (.+)$/.exec(said))) return [card, "rename", m[1]];
  throw new Error(said);
}
// R1's runs named "it" the card the asker had selected: d09 the dinner poll, d16 the rsvp
const R1SEL = { d09: "dinner", d16: "rsvp" };
for (const [tag, said, kind, ago, sel, holder = "sam"] of R1) {
  const [card, op, value] = r1op(said, sel ?? R1SEL[tag]);
  const self = holder === "tara";
  const renewed = { kill: -366, k01: -892, k02: -822 }[tag];
  add("recorded", `R1-${tag}`, `nebius/eval/row seq: ${tag} (live verdict ${self ? "go" : "wait"})`, `${self ? "the asker" : "sam"} ${kind === "drag" ? "drags" : kind === "type" ? "types in" : "presses a choice on"} the ${card} card; tara says "${said}"`, {
    cards: [R1CARD[card](/^remove/.test(op) ? value : null)], holds: [hold(holder, card, kind, { since: -ago, ...(renewed !== undefined ? { renewed } : {}) })],
    write: edit(card, op, value, "tara", said),
    want: self ? "go" : "wait", who: self ? [] : ["Sam"], why: self ? "tara's own hand is on it" : `sam's hand is on the card (${kind})`,
  });
}
// R2 (.context/r2/runs-a1.jsonl, runs-e1.jsonl): the first ask of every run, at the door (A=Tara asks; B Holly, C Sam, D Jo)
const yes3 = () => rsvp([["holly", "yes"], ["sam", "yes"], ["jo", "yes"]]);
const yes2 = () => rsvp([["holly", "yes"], ["sam", "yes"]]);
const R2 = [
  ["a1-core1", yes3, [], "move game night to sunday", ["rsvp", "setWhen", "sunday"], ["Holly", "Sam", "Jo"]],
  ["a1-core2", yes3, [], "move game night to sunday", ["rsvp", "setWhen", "sunday"], ["Holly", "Sam", "Jo"]],
  ["a1-keep1", yes3, [], "move game night to saturday", ["rsvp", "setWhen", "saturday"], ["Holly", "Sam", "Jo"]],
  ["a1-poll1", poll, all("dinner", "a", "holly", "sam", "jo"), "take pizza off the dinner poll", ["dinner", "removeOption", "pizza"], ["Holly", "Sam", "Jo"]],
  ["a1-poll2", poll, all("dinner", "a", "holly", "sam", "jo"), "take pizza off the dinner poll", ["dinner", "removeOption", "pizza"], ["Holly", "Sam", "Jo"]],
  ["a1-tie", poll, [...all("dinner", "a", "holly", "sam"), V("dinner", "b", "jo")], "take pizza off the dinner poll", ["dinner", "removeOption", "pizza"], ["Holly", "Sam"]],
  ["a1-expire", yes2, [], "move game night to sunday", ["rsvp", "setWhen", "sunday"], ["Holly", "Sam"]],
  ["a1-one-claim", () => snacks([["towels", "Holly", "u-holly"], ["ice"], ["chips"]]), [], "take towels off the snacks list", ["snacks", "removeItem", "towels"], ["Holly"]],
  ["a1-one-split", () => cabin([["Holly", 200], ["Sam", 0], ["Jo", 0]]), [], "take holly off the cabin split", ["cabin", "removePerson", "holly"], ["Holly"]],
  ["a1-asker-only", poll, [V("dinner", "c", "tara"), V("dinner", "a", "holly")], "take pho off the dinner poll", ["dinner", "removeOption", "pho"], []],
  ["a1-moot", yes2, [], "move game night to sunday", ["rsvp", "setWhen", "sunday"], ["Holly", "Sam"]],
  ["a1-composed", poll, all("dinner", "a", "holly", "sam", "jo"), "take pizza off the dinner poll", ["dinner", "removeOption", "pizza"], ["Holly", "Sam", "Jo"]],
  ["a1-second", yes3, [], "move game night to sunday", ["rsvp", "setWhen", "sunday"], ["Holly", "Sam", "Jo"]],
  ["a1-busy", yes3, [], "move game night to sunday", ["rsvp", "setWhen", "sunday"], ["Holly", "Sam", "Jo"]],
  ["a1-checkin", () => plank({ Holly: [30, 40, 50, 60, 70], Sam: [20, 20, 25, 30, null], Jo: [10, null, null, null, null] }), [], "make the plank challenge 3 days", ["plank", "setDays", 3], ["Holly", "Sam"]],
  ["a1-date", () => bake({ id: "u-holly", name: "Holly" }), [], "move the bake sale to sunday", ["bake", "setDate", "2026-10-11"], ["Holly"]],
  ["e1-core1", yes3, [], "move game night to sunday", ["rsvp", "setWhen", "sunday"], ["Holly", "Sam", "Jo"]],
  ["e1-tie", poll, [...all("dinner", "a", "holly", "sam"), V("dinner", "b", "jo")], "take pizza off the dinner poll", ["dinner", "removeOption", "pizza"], ["Holly", "Sam"]],
  ["e1-withdraw", poll, all("dinner", "a", "holly", "sam"), "take pizza off the dinner poll", ["dinner", "removeOption", "pizza"], ["Holly", "Sam"]],
  ["e1-one-claim", () => snacks([["towels", "Holly", "u-holly"], ["ice"], ["chips"]]), [], "take towels off the snacks list", ["snacks", "removeItem", "towels"], ["Holly"]],
  ["e1-composed", poll, all("dinner", "a", "holly", "sam", "jo"), "take pizza off the dinner poll", ["dinner", "removeOption", "pizza"], ["Holly", "Sam", "Jo"]],
];
for (const [tag, card, votes, said, [c, op, value], who] of R2) {
  add("recorded", `R2-${tag}`, `.context/r2 run ${tag} (live verdict ${who.length ? "ask" : "go"})`, `tara says "${said}"`, {
    cards: [card()], votes, write: edit(c, op, value, "tara", said),
    want: who.length ? "ask" : "go", who, why: who.length ? `${who.join(", ").toLowerCase()} made the choice it would override` : "the only choice in the way is tara's own vote",
  });
}
// the composed runs' second write: the passed vote sends the change again while Sam presses the card; the moot run's: both changed their own answer to no
for (const tag of ["a1-composed", "e1-composed"])
  add("recorded", `R2-${tag}-land`, `.context/r2 run ${tag}: the passed vote's resend (live verdict wait)`, "the vote passed 2 of 3; sam holds the card", {
    cards: [poll()], votes: all("dinner", "a", "holly", "sam", "jo"), holds: [hold("sam", "dinner", "drag", { since: -2100 })],
    write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll", { consented: "the vote passed: 2 of 3 said change it (holly, sam, jo were asked)" }),
    want: "wait", who: ["Sam"], why: "the people agreed; sam's hand is on the card",
  });
add("recorded", "R2-a1-moot-land", ".context/r2 run a1-moot: the moot resend (live verdict go)", "holly and sam changed their own answers to no; the vote is moot", {
  cards: [rsvp([["holly", "no"], ["sam", "no"]])], write: edit("rsvp", "setWhen", "sunday", "tara", "move game night to sunday", { consented: "moot: nobody's choice left in the way" }),
  want: "go", why: "both of them withdrew their yes themselves; nothing chosen is in the way",
});

/* ================= adversarial ================= */
const X = (id, title, s) => add("adversarial", id, "adversarial", title, s);
X("X01", "a drag let go 0.7 s ago", { cards: [poll()], holds: [hold("holly", "dinner", "drag", { since: -5000, letGo: -700 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "go", why: "holly dropped the card; nobody's hand is on it" });
X("X02", "a drag let go 0.3 s ago", { cards: [poll()], holds: [hold("holly", "dinner", "drag", { since: -5000, letGo: -300 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "wait", who: ["Holly"], amb: true, why: "the drop's own write and a fumbled re-grab belong to her for a beat; ambiguous: her hand is already off" });
X("X03", "typing: editor closed 1.0 s ago", { cards: [poll()], holds: [hold("holly", "dinner", "type", { since: -9000, letGo: -1000 })], write: edit("dinner", "rename", "taco night", "sam", "rename it to taco night"), want: "wait", who: ["Holly"], amb: true, why: "her save may still be landing; ambiguous: she closed the editor" });
X("X04", "typing: editor closed 2.0 s ago", { cards: [poll()], holds: [hold("holly", "dinner", "type", { since: -9000, letGo: -2000 })], write: edit("dinner", "rename", "taco night", "sam", "rename it to taco night"), want: "go", why: "she finished two seconds ago; the card is free" });
X("X05", "a vote press released 0.2 s ago", { cards: [poll()], votes: [V("dinner", "b", "holly")], holds: [hold("holly", "dinner", "vote", { since: -600, letGo: -200 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "wait", who: ["Holly"], amb: true, why: "her vote is a moment old; adding an option doesn't touch it, so waiting is caution, not need" });
X("X06", "a dead client: last renewal 2.0 s ago", { cards: [poll()], holds: [hold("holly", "dinner", "drag", { since: -8000, renewed: -2000 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "wait", who: ["Holly"], amb: true, why: "it can't yet tell a closed laptop from a slow one; it frees within 3 s. ambiguous: nobody is really there" });
X("X07", "a dead client: last renewal 3.5 s ago", { cards: [poll()], holds: [hold("holly", "dinner", "drag", { since: -9000, renewed: -3500 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "go", why: "her screen has been silent past the 3 s renewal window; the hold is over" });
X("X08", "a lease row 0.2 s past its end, not yet cleaned up", { cards: [poll()], holds: [hold("holly", "dinner", "drag", { since: -9000, renewed: -3200 })], write: edit("dinner", "addOption", "ramen", "sam", "add ramen to the dinner poll"), want: "go", why: "the hold ran out; the row just hasn't been deleted" });
X("X09", "the asker types in their own card and asks to rename it", { cards: [poll()], holds: [hold("tara", "dinner", "type", { since: -4000 })], write: edit("dinner", "rename", "taco night", "tara", "rename it to taco night"), want: "go", why: "her own hand, her own words" });
X("X10", "two holders: a drag and a typist", { cards: [poll()], holds: [hold("holly", "dinner"), hold("sam", "dinner", "type", { since: -6000 })], write: edit("dinner", "addOption", "ramen", "jo", "add ramen to the dinner poll"), want: "wait", who: ["Holly", "Sam"], why: "two hands on it; it waits for both" });
X("X11", "two holders, one is the asker", { cards: [poll()], holds: [hold("tara", "dinner"), hold("holly", "dinner", "type", { since: -6000 })], write: edit("dinner", "addOption", "ramen", "tara", "add ramen to the dinner poll"), want: "wait", who: ["Holly"], why: "tara's own hand doesn't count against her; holly's does" });
X("X12", "a held card that isn't the target, under the new card's spot", { cards: [poll(), drinks()], holds: [hold("holly", "drinks")], write: build("checklist", "what to bring", { x: 500, y: 150, w: 300, h: 200 }, "sam", "make a list of what to bring"), want: "never", why: "the new card would land on the drinks poll holly is dragging; place it elsewhere" });
X("X13", "a new card that only touches a held card's edge", { cards: [poll()], holds: [hold("holly", "dinner")], write: build("checklist", "what to bring", { x: 400, y: 100, w: 300, h: 200 }, "sam", "make a list of what to bring"), want: "go", why: "edge to edge, no overlap: nothing held is covered" });
X("X14", "a new card over the asker's held card and a free one", { cards: [poll(), drinks()], holds: [hold("tara", "dinner")], write: build("checklist", "what to bring", { x: 300, y: 150, w: 300, h: 200 }, "tara", "make a list of what to bring"), want: "go", why: "the only held card under it is the asker's own" });
X("X15", "a vote made then withdrawn", { cards: [poll()], votes: [V("dinner", "b", "sam")], history: ["Holly voted for pizza 40 s ago and took her vote back 12 s ago."], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "go", why: "nobody's vote is on pizza now; holly withdrew hers herself" });
X("X16", "a claim made then dropped", { people: ["tara", "jules", "sam"], cards: [snacks([["towels"], ["ice"], ["chips", "Sam", "u-sam"]])], history: ["Jules claimed towels a minute ago and unclaimed it 20 s ago."], write: edit("snacks", "removeItem", "towels", "tara", "take towels off the snacks list"), want: "go", why: "towels is unclaimed now; sam's claim is on chips" });
X("X17", "a yes changed to no, another yes stays", { cards: [rsvp([["holly", "no"], ["sam", "yes"]])], history: ["Holly said yes to friday, then changed it to no."], write: edit("rsvp", "setWhen", "sunday", "tara", "move game night to sunday"), want: "ask", who: ["Sam"], why: "sam's yes is still on friday; holly's is withdrawn" });
X("X18", "one affected person among many voters", { people: ["tara", "holly", "sam", "jo", "maya", "jules"], cards: [poll()], votes: [V("dinner", "c", "jo"), ...all("dinner", "a", "holly", "sam", "maya", "jules")], write: edit("dinner", "removeOption", "pho", "tara", "take pho off the dinner poll"), want: "ask", who: ["Jo"], why: "only jo voted for pho; the other four voted pizza and keep it" });
X("X19", "five people voted for it", { people: ["tara", "holly", "sam", "jo", "maya", "jules"], cards: [poll()], votes: all("dinner", "a", "holly", "sam", "jo", "maya", "jules"), write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "ask", who: ["Holly", "Sam", "Jo", "Maya", "Jules"], why: "all five chose pizza" });
X("X20", "an edit on a free card that is linked into a held card", { cards: [poll(), rsvp([], "dinner · friday")], holds: [hold("holly", "rsvp")], history: ["The dinner poll has a link: when it closes, its winner names the rsvp card."], write: edit("dinner", "addOption", "ramen", "tara", "add ramen to the dinner poll"), want: "go", why: "the poll itself is free; the link's own write to the rsvp is a separate write that will wait for holly" });
X("X21", "the link's write into the held card", { cards: [poll(), rsvp([], "dinner · friday")], votes: all("dinner", "b", "sam", "jo"), holds: [hold("holly", "rsvp")], write: { kind: "link", card: "rsvp", from: "dinner", fill: "title", desc: "the poll closed; its link writes the winner into the rsvp's title ('tacos · friday')" }, want: "wait", who: ["Holly"], why: "holly is dragging the rsvp the link writes into" });
X("X22", "the holder is the asker on a second device (same account)", { cards: [poll()], holds: [hold("tara", "dinner")], history: ["Tara is signed in on her laptop (dragging the poll) and her phone (asking)."], write: edit("dinner", "addOption", "ramen", "tara", "add ramen to the dinner poll"), want: "go", why: "it's her own hand; same account on both devices" });
X("X23", "the asker on two devices as two guest seats", { people: ["tara", "tara2", "holly"], cards: [poll()], holds: [hold("tara2", "dinner")], history: ["Tara joined as a guest on her laptop (seat u-tara2, named Tara) and as another guest on her phone (u-tara). She is dragging on the laptop and asking from the phone."], write: edit("dinner", "addOption", "ramen", "tara", "add ramen to the dinner poll"), want: "go", why: "it's the same person's own hand" });
X("X24", "free text: rename a question someone typed by hand", { cards: [poll()], history: ["Holly typed the question 'friday dinner?' herself."], write: edit("dinner", "rename", "where are we eating friday?", "sam", "rename it to where are we eating friday?"), want: "go", why: "wording is free text, out of scope by design; nobody holds it" });
X("X25", "free text: rename an event people said yes to", { cards: [yes3()], write: edit("rsvp", "rename", "board games", "tara", "rename game night to board games"), want: "go", why: "the time they said yes to stays; the name is free text" });
X("X26", "destructive-looking: remove an option nobody voted for", { cards: [poll()], votes: all("dinner", "b", "holly", "sam"), write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "go", why: "no vote is on pizza" });
X("X27", "destructive-looking: remove an unclaimed item", { cards: [snacks([["ice"], ["chips", "Holly", "u-holly"], ["salsa"]])], write: edit("snacks", "removeItem", "salsa", "tara", "remove salsa from the snacks list"), want: "go", why: "nobody claimed salsa" });
X("X28", "take someone who paid nothing off a split", { people: ["tara", "maya", "jules", "ash"], cards: [cabin([["Maya", 200], ["Jules", 0], ["Ash", 0]])], write: edit("cabin", "removePerson", "ash", "tara", "take ash off the cabin split"), want: "go", amb: true, why: "ash paid nothing, so no payment is erased. ambiguous: the re-split raises what jules owes" });
X("X29", "cut a challenge above everyone's logs", { cards: [plank({ Holly: [30, 40, null, null, null, null, null], Sam: [20, null, null, null, null, null, null] }, 7)], write: edit("plank", "setDays", 3, "tara", "make the plank challenge 3 days"), want: "go", why: "nobody logged past day 2" });
X("X30", "a guest with the same name asks to remove a name-only payment", { people: ["tara", "maya", "maya2", "jules"], cards: [cabin([["Maya", 600], ["Jules", 0], ["Ash", 0]], 1800)], history: ["Two people in the room are called Maya: the member Maya (u-maya) who paid, and a guest who joined today as Maya (u-maya2)."], write: { ...edit("cabin", "removePerson", "maya", "maya2", "take me off the cabin split") }, want: "ask", who: ["Maya"], why: "the maya who paid $600 is the member, not the guest asking" });
X("X31", "a guest with a voter's name, the vote has the voter's id", { people: ["tara", "juno", "juno2", "sam"], cards: [poll()], votes: [V("dinner", "a", "juno")], history: ["Two people are called Juno: the member u-juno (voted pizza) and a guest u-juno2."], write: edit("dinner", "removeOption", "pizza", "juno2", "take pizza off the dinner poll"), want: "ask", who: ["Juno"], why: "the vote on pizza is u-juno's, not the asker's" });
X("X32", "a guest with a claimer's name, the claim has the claimer's id", { people: ["tara", "holly", "holly2"], cards: [snacks([["towels", "Holly", "u-holly"], ["ice"]])], history: ["Two people are called Holly: u-holly claimed towels; u-holly2 is a guest."], write: edit("snacks", "removeItem", "towels", "holly2", "take towels off the snacks list"), want: "ask", who: ["Holly"], why: "the claim is u-holly's" });
X("X33", "a guest with the name of whoever set the date", { people: ["tara", "holly", "holly2"], cards: [bake({ id: "u-holly", name: "Holly" })], history: ["Two people are called Holly: u-holly set the date by hand; u-holly2 is a guest."], write: edit("bake", "setDate", "2026-10-11", "holly2", "move the bake sale to sunday"), want: "ask", who: ["Holly"], why: "u-holly set it, not the asker" });
X("X34", "a passed vote resent after someone new voted for the option", { people: ["tara", "holly", "sam", "jo"], cards: [poll()], votes: all("dinner", "a", "holly", "sam", "jo"), history: ["A vote asked holly and sam about taking pizza off; both said change it.", "Jo voted for pizza after that vote was called and was never asked."], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll", { consented: "the vote passed: 2 of 2 said change it (holly, sam were asked)" }), want: "ask", who: ["Jo"], why: "jo's vote came after the vote was called; nobody asked jo" });
X("X35", "a live link re-splits and drops a payment", { people: ["tara", "maya", "jules", "jo"], cards: [rsvp([["maya", "yes"], ["jules", "yes"], ["jo", "yes"]], "cabin weekend · nov 1"), cabin([["Maya", 200], ["Jules", 0]], 600)], history: ["The rsvp has a live link: whoever says yes splits the cabin. Maya paid $200 into the split.", "Jo just said yes."], write: { kind: "link", card: "cabin", from: "rsvp", fill: "splits", patch: { splits: [{ name: "Maya", owes: 200, paid: 0 }, { name: "Jules", owes: 200, paid: 0 }, { name: "Jo", owes: 200, paid: 0 }] }, desc: "the link rewrites the split among the yeses: maya, jules, jo each owe $200, paid $0" }, want: "ask", who: ["Maya"], why: "the rewrite sets maya's paid $200 back to $0" });
X("X36", "a link sets a date someone set by hand", { cards: [days(), bake({ id: "u-holly", name: "Holly" })], history: ["The day-finder has a link: when everyone answers, the best day sets the bake sale's date. Holly set the date by hand to oct 16 before that.", "Everyone just answered: sunday is best."], write: { kind: "link", card: "bake", from: "finder", fill: "targetDate", patch: { targetDate: "2026-10-11", event: "bake sale · sun" }, desc: "the link writes sunday oct 11 into the countdown's date" }, want: "ask", who: ["Holly"], why: "holly picked oct 16 by hand; the link would override it" });
X("X37", "a link names an event people said yes to", { cards: [poll(), rsvp([["holly", "yes"], ["sam", "yes"]], "dinner · friday")], votes: all("dinner", "b", "holly", "sam", "jo"), write: { kind: "link", card: "rsvp", from: "dinner", fill: "title", desc: "the poll closed; its link writes the winner into the rsvp's name ('tacos · friday'), the time stays friday" }, want: "go", why: "the time they said yes to stays; the name is what the link is for" });
X("X38", "someone about to vote, not pressing yet", { cards: [poll()], votes: [V("dinner", "a", "sam")], history: ["Holly has had the poll open on her screen for 20 s and hasn't voted or touched it."], write: edit("dinner", "removeOption", "tacos", "tara", "take tacos off the dinner poll"), want: "go", amb: true, why: "no hand and no choice on tacos, so the rule lets it go. ambiguous: holly may have been about to pick tacos" });
X("X39", "the space places the last piece while holly holds it", { cards: [puzzle(19)], holds: [hold("holly", "piece:7", "piece", { since: -1000 })], write: { kind: "puzzle", piece: 7, placed: 19, total: 20 }, want: "never", why: "the last piece is a person's, whoever is holding it" });
X("X40", "the space places the 19th while holly holds that piece", { cards: [puzzle(18)], holds: [hold("holly", "piece:12", "piece", { since: -1000 })], write: { kind: "puzzle", piece: 12, placed: 18, total: 20 }, want: "wait", who: ["Holly"], why: "holly has that piece in her hand" });
X("X41", "the space places the 19th while someone holds the 20th", { cards: [puzzle(18)], holds: [hold("holly", "piece:5", "piece", { since: -1000 })], write: { kind: "puzzle", piece: 12, placed: 18, total: 20 }, want: "go", why: "a different piece; one is still left for a person" });
X("X42", "a new card over a card someone is pressing a choice on", { cards: [poll()], holds: [hold("holly", "dinner", "vote", { since: -500 })], write: build("poll", "dessert?", { x: 250, y: 200, w: 300, h: 260 }, "sam", "make a dessert poll"), want: "never", why: "it would land on the poll holly is voting on; place it elsewhere" });
X("X43", "start a game while someone holds a puzzle piece", { cards: [puzzle(5)], holds: [hold("holly", "piece:3", "piece", { since: -1000 })], write: { kind: "game", game: "most likely to", by: "sam", said: "start a most likely to game" }, want: "go", why: "a new game touches nothing holly holds" });
X("X44", "the late-word rewrite of a card the asker herself is dragging", { cards: [poll(["tacos", "pho"], "taco night?", "new")], holds: [hold("tara", "new", "drag", { since: -800 })], write: { kind: "amend", card: "new", by: "tara", said: "make a poll for taco night tuesday", desc: "rewrite the card just built from the last words (title → 'taco night tuesday?')" }, want: "go", why: "her own card, her own hand" });
X("X45", "the asker holds it, a dead client's hold is long gone", { cards: [poll()], holds: [hold("tara", "dinner"), hold("holly", "dinner", "drag", { since: -20000, renewed: -6000 })], write: edit("dinner", "addOption", "ramen", "tara", "add ramen to the dinner poll"), want: "go", why: "holly's screen has been silent 6 s; only tara's own hand is on it" });
const BIG = () => [poll(), drinks(), snacks(), rsvp([["holly", "yes"]]), cabin(), plank({ Maya: [30, null, null, null, null] }), bake(), trip()];
X("X46", "a busy board: the target is free, four other cards held", { people: ["tara", "holly", "sam", "jo", "maya", "jules"], cards: BIG(), holds: [hold("holly", "dinner"), hold("sam", "rsvp", "type", { since: -5000 }), hold("jo", "cabin"), hold("maya", "trip", "type", { since: -7000 })], write: edit("snacks", "addItem", "salsa", "jules", "add salsa to the snacks list"), want: "go", why: "every hand is on some other card" });
X("X47", "a busy board: the target is one of four held cards", { people: ["tara", "holly", "sam", "jo", "maya", "jules"], cards: BIG(), holds: [hold("holly", "dinner"), hold("sam", "rsvp", "type", { since: -5000 }), hold("jo", "snacks"), hold("maya", "trip", "type", { since: -7000 })], write: edit("snacks", "addItem", "salsa", "jules", "add salsa to the snacks list"), want: "wait", who: ["Jo"], why: "jo is dragging the snacks list" });
X("X48", "an edit to one card while someone types in another", { cards: [poll(), drinks()], holds: [hold("holly", "drinks", "type", { since: -5000 })], write: edit("dinner", "rename", "taco night", "sam", "rename the dinner poll to taco night"), want: "go", why: "holly is typing in the drinks poll, not this one" });
X("X49", "a yes given one second ago", { cards: [rsvp([["holly", "yes"], ["sam", "yes"]])], history: ["Sam said yes one second ago."], write: edit("rsvp", "setWhen", "saturday", "tara", "move game night to saturday"), want: "ask", who: ["Holly", "Sam"], why: "both said yes to friday, however recent" });
X("X50", "lengthen a challenge where someone logged every day", { cards: [plank({ Holly: [30, 40, 50, 60, 70], Sam: [20, 25, 30, 35, 40] })], write: edit("plank", "setDays", 7, "tara", "make the plank challenge 7 days"), want: "go", why: "making it longer cuts no one's logs" });
X("X51", "only the asker's own vote, while someone else holds it", { cards: [poll()], votes: [V("dinner", "a", "tara")], holds: [hold("holly", "dinner")], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "wait", who: ["Holly"], why: "her own vote is no obstacle, but holly's hand is on the card" });
X("X52", "a hand-set date moved by the person who set it", { cards: [bake({ id: "u-holly", name: "Holly" })], write: edit("bake", "setDate", "2026-10-11", "holly", "move the bake sale to sunday"), want: "go", why: "holly set it, holly moves it" });
X("X53", "an rsvp yes without an id, asked by someone else of that name", { people: ["tara", "sam", "sam2"], cards: [rsvp([["sam", "yes", false]])], history: ["Two people are called Sam: the one who said yes (u-sam) and a guest who joined as Sam today (u-sam2). The rsvp row stores only the name."], write: edit("rsvp", "setWhen", "sunday", "sam2", "move game night to sunday"), want: "ask", who: ["Sam"], why: "the yes is the other sam's" });

// a second Tara / Maya / Juno / Holly / Sam: a guest seat with the same name
for (const [k, n] of [["tara2", "Tara"], ["maya2", "Maya"], ["juno2", "Juno"], ["holly2", "Holly"], ["sam2", "Sam"]]) PEOPLE[k] = { id: `u-${k}`, name: n };

/* ================= r4: appended after R3, one batch with its own freeze (the 162 above are untouched) =================
   The misses R3 named (X23, X30, X34, X35, X36, X53), each as new situations, labelled by hand before the fix ran.
   A link write may give no patch but `value`: the patch is then what the link code computes from the source card. */
// Tara's laptop: a guest seat she later folded into her account by joining with the same email on it
PEOPLE.taralap = { id: "u-taralap", name: "Tara", account: "u-tara" };
const cabinIds = (rows, total = 600) => {
  const share = Math.round(total / rows.length);
  return { id: "cabin", type: "expenseSplit", rect: { x: 780, y: 100, w: 320, h: 260 }, data: { title: "cabin split", total, splits: rows.map(([who, paid]) => ({ name: PEOPLE[who].name, userId: PEOPLE[who].id, owes: Math.max(0, share - paid), paid })) } };
};
const plankIds = (logs) => {
  const c = plank(Object.fromEntries(Object.entries(logs).map(([k, r]) => [PEOPLE[k].name, r])));
  return { ...c, data: { ...c.data, people: Object.keys(logs).map((k) => ({ name: PEOPLE[k].name, userId: PEOPLE[k].id })) } };
};
const R = (id, title, s) => add("r4", id, "R4 regression", title, { ...s, batch: "r4" });
const yesLink = (desc) => ({ kind: "link", card: "cabin", from: "rsvp", fill: "splits", value: "yes", desc });
R("R4-01", "the cabin flow: a new yes after someone paid", { people: ["tara", "maya", "jules", "jo"], cards: [rsvp([["maya", "yes"], ["jules", "yes"], ["jo", "yes"]], "cabin weekend · nov 1"), cabinIds([["maya", 200], ["jules", 0]])], history: ["The rsvp has a live link: whoever says yes splits the cabin. Maya paid $200.", "Jo just said yes."], write: yesLink("jo said yes: the link re-splits the cabin among the yeses"), want: "go", why: "the link adds jo and keeps maya's $200; nobody's payment changes" });
R("R4-02", "the cabin flow over an older name-only payment", { people: ["tara", "maya", "jules", "jo"], cards: [rsvp([["maya", "yes"], ["jules", "yes"], ["jo", "yes"]], "cabin weekend · nov 1"), cabin([["Maya", 200], ["Jules", 0]], 600)], history: ["Maya's $200 was recorded before split rows carried ids.", "Jo just said yes."], write: yesLink("jo said yes: the link re-splits the cabin among the yeses"), want: "go", why: "the link adds jo and keeps the $200 row as it is" });
R("R4-03", "the cabin flow after a payer said no", { people: ["tara", "maya", "jules", "jo"], cards: [rsvp([["maya", "no"], ["jules", "yes"], ["jo", "yes"]], "cabin weekend · nov 1"), cabinIds([["maya", 200], ["jules", 0]])], history: ["Maya paid $200, then changed her rsvp to no. Jo said yes."], write: yesLink("the link re-splits the cabin among the yeses"), want: "go", why: "maya's $200 stays on the split; taking her off is a person's call, and the link doesn't make it" });
R("R4-04", "a link sets a date nobody set by hand", { cards: [days(), bake()], history: ["Everyone answered the day-finder: sunday is best."], write: { kind: "link", card: "bake", from: "finder", fill: "targetDate", patch: { targetDate: "2026-10-11", event: "bake sale · sun" }, desc: "the link writes sunday oct 11 into the countdown's date" }, want: "go", why: "the date came with the card; no one picked it" });
R("R4-05", "a link writes the same date someone set by hand", { cards: [days(), bake({ id: "u-holly", name: "Holly" })], history: ["Holly set oct 16 by hand. The day-finder's best day is that same date."], write: { kind: "link", card: "bake", from: "finder", fill: "targetDate", patch: { targetDate: "2026-10-16", event: "bake sale · fri" }, desc: "the link writes fri oct 16 into the countdown's date" }, want: "go", why: "it agrees with holly's date; nothing of hers changes" });
R("R4-06", "a link over a hand-set date while the setter drags the card", { cards: [days(), bake({ id: "u-holly", name: "Holly" })], holds: [hold("holly", "bake")], history: ["Holly set oct 16 by hand and is dragging the countdown. Everyone just answered the day-finder: sunday is best."], write: { kind: "link", card: "bake", from: "finder", fill: "targetDate", patch: { targetDate: "2026-10-11", event: "bake sale · sun" }, desc: "the link writes sunday oct 11 into the countdown's date" }, want: "ask", who: ["Holly"], why: "choices first: holly picked oct 16" });
R("R4-07", "a name-only payment, asked by the only Maya in the room", { people: ["tara", "maya", "jules", "ash"], cards: [cabin([["Maya", 200], ["Jules", 0], ["Ash", 0]])], history: ["The payment row stores only the name Maya. One person in the room is called Maya, and she asks."], write: edit("cabin", "removePerson", "maya", "maya", "take me off the cabin split"), want: "ask", who: ["Maya"], why: "nothing on the row says which account paid, so the code can't call it hers; she confirms on the card" });
R("R4-08", "a payment with an id, asked by a guest with the payer's name", { people: ["tara", "maya", "maya2", "jules"], cards: [cabinIds([["maya", 200], ["jules", 0], ["tara", 0]])], history: ["Two people are called Maya: u-maya paid $200; u-maya2 is a guest."], write: edit("cabin", "removePerson", "maya", "maya2", "take me off the cabin split"), want: "ask", who: ["Maya"], why: "the row says u-maya paid, not the asker" });
R("R4-09", "a payment with an id, asked by the payer", { people: ["tara", "maya", "jules"], cards: [cabinIds([["maya", 200], ["jules", 0], ["tara", 0]])], write: edit("cabin", "removePerson", "maya", "maya", "take me off the cabin split"), want: "go", why: "it's her own payment" });
R("R4-10", "check-ins with ids, a guest with a logger's name cuts the days", { people: ["tara", "holly", "holly2", "sam"], cards: [plankIds({ holly: [30, 40, 50, 60, 70], sam: [20, null, null, null, null] })], history: ["Two people are called Holly: u-holly logged days 1-5; u-holly2 is a guest."], write: edit("plank", "setDays", 3, "holly2", "make the plank challenge 3 days"), want: "ask", who: ["Holly"], why: "days 4-5 are u-holly's logs" });
R("R4-11", "name-only check-ins, the logger herself cuts the days", { cards: [plank({ Holly: [30, 40, 50, 60, 70], Sam: [20, null, null, null, null] })], write: edit("plank", "setDays", 3, "holly", "make the plank challenge 3 days"), want: "ask", who: ["Holly"], why: "the logs carry only a name; the code can't tell they're hers, so she confirms" });
R("R4-12", "an rsvp yes with an id, asked by a guest with that name", { people: ["tara", "sam", "sam2"], cards: [rsvp([["sam", "yes"]])], history: ["Two people are called Sam: u-sam said yes; u-sam2 is a guest."], write: edit("rsvp", "setWhen", "sunday", "sam2", "move game night to sunday"), want: "ask", who: ["Sam"], why: "the yes is u-sam's" });
R("R4-13", "a passed rsvp vote, someone said yes after it was called", { cards: [rsvp([["holly", "yes"], ["sam", "yes"], ["jo", "yes"]])], history: ["A vote asked holly and sam about moving game night to sunday; both said change it.", "Jo said yes to friday after the vote was called and was never asked."], write: edit("rsvp", "setWhen", "sunday", "tara", "move game night to sunday", { consented: "the vote passed: 2 of 2 said change it (holly, sam were asked)" }), want: "ask", who: ["Jo"], why: "jo's yes came after the vote was called" });
R("R4-14", "a passed vote, a voter moved their vote away since", { cards: [poll()], votes: [V("dinner", "a", "holly"), V("dinner", "b", "sam")], history: ["A vote asked holly and sam about taking pizza off; both said change it. Sam has since voted tacos."], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll", { consented: "the vote passed: 2 of 2 said change it (holly, sam were asked)" }), want: "go", why: "the only vote left on pizza is holly's, and she was asked" });
R("R4-15", "a passed vote, the newer vote is the asker's own", { cards: [poll()], votes: all("dinner", "a", "holly", "sam", "tara"), history: ["A vote asked holly and sam about taking pizza off; both said change it. Tara, who asked, voted pizza after."], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll", { consented: "the vote passed: 2 of 2 said change it (holly, sam were asked)" }), want: "go", why: "the newer vote is the asker's own" });
R("R4-16", "the holder is the asker's laptop seat, folded into her account", { people: ["tara", "taralap", "holly"], cards: [poll()], holds: [hold("taralap", "dinner")], history: ["Tara entered as a guest on her laptop (u-taralap), then joined with her email there; the guest seat now resolves to her account u-tara. Its hold is still running."], write: edit("dinner", "addOption", "ramen", "tara", "add ramen to the dinner poll"), want: "go", why: "both seats resolve to tara's account: her own hand" });
R("R4-17", "two different guests both named Tara", { people: ["tara", "tara2", "holly"], cards: [poll()], holds: [hold("tara2", "dinner")], history: ["Two people joined as guests named Tara (u-tara, u-tara2). Nothing links their seats. u-tara2 is dragging the poll; u-tara asks."], write: edit("dinner", "addOption", "ramen", "tara", "add ramen to the dinner poll"), want: "wait", who: ["Tara"], why: "a shared name isn't a shared hand" });
R("R4-18", "a vote cast on the laptop guest seat, before she joined", { people: ["tara", "taralap", "holly"], cards: [poll()], votes: [V("dinner", "a", "taralap")], history: ["Tara voted pizza as a guest on her laptop (u-taralap), then joined with her email there; that seat resolves to u-tara."], write: edit("dinner", "removeOption", "pizza", "tara", "take pizza off the dinner poll"), want: "go", why: "the only vote on pizza is hers, from her other seat" });

/* ---- the 40-scenario variance subset: picked before any run, every 4th by position, plus the first 3 ambiguous ---- */
export function subset(list) {
  const pick = list.filter((_, i) => i % 4 === 0).slice(0, 37);
  for (const s of list.filter((x) => x.label.ambiguous)) if (pick.length < 40 && !pick.includes(s)) pick.push(s);
  return pick.map((s) => s.id);
}

export function scenarios() {
  return S.map((s) => ({ ...s, people: s.people.map((k) => PEOPLE[k]) }));
}

const labelsOf = (list) => list.map((s) => ({ id: s.id, ...s.label }));
const hash = (x) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const all = scenarios();
  const ids = new Set();
  for (const s of all) {
    if (ids.has(s.id)) throw new Error(`dup ${s.id}`);
    ids.add(s.id);
  }
  // the first freeze covers the scenarios with no batch; each appended batch is frozen on its own, later
  const list = all.filter((s) => !s.batch);
  const file = HERE + "scenarios.json";
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const relabel = (before, now) => {
    if (!process.argv.includes("--relabel")) {
      console.error("labels differ from the frozen file; rerun with --relabel and give the reason in label-changes.md");
      process.exit(1);
    }
    const was = new Map(labelsOf(before).map((l) => [l.id, l]));
    const lines = labelsOf(now).filter((l) => JSON.stringify(was.get(l.id)) !== JSON.stringify(l)).map((l) => `- ${new Date().toISOString()} ${l.id}: ${JSON.stringify(was.get(l.id) ?? null)} → ${JSON.stringify(l)} — reason: (write it)`);
    fs.appendFileSync(HERE + "label-changes.md", lines.join("\n") + "\n");
  };
  const labels = labelsOf(list);
  if (old && old.labelsHash !== hash(labels)) relabel(old.scenarios.filter((s) => !s.batch), list);
  const frozenAt = old && old.labelsHash === hash(labels) ? old.frozenAt : new Date().toISOString();
  const batches = [...new Set(all.filter((s) => s.batch).map((s) => s.batch))].map((name) => {
    const mine = all.filter((s) => s.batch === name);
    const was = old?.batches?.find((b) => b.name === name);
    if (was && was.labelsHash !== hash(labelsOf(mine))) relabel(old.scenarios.filter((s) => s.batch === name), mine);
    return { name, frozenAt: was && was.labelsHash === hash(labelsOf(mine)) ? was.frozenAt : new Date().toISOString(), labelsHash: hash(labelsOf(mine)), count: mine.length, ids: mine.map((s) => s.id) };
  });
  const out = { frozenAt, labelsHash: hash(labels), count: list.length, subset: subset(list), batches, scenarios: all };
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const by = (xs, f) => Object.entries(xs.reduce((a, s) => ((a[f(s)] = (a[f(s)] ?? 0) + 1), a), {})).map(([k, n]) => `${k} ${n}`).join(" · ");
  console.log(`${list.length} scenarios, frozen ${frozenAt}, labels ${hash(labels)}`);
  console.log("groups:", by(list, (s) => s.group));
  console.log("labels:", by(list, (s) => s.label.verdict));
  console.log("writes:", by(list, (s) => s.write.kind));
  console.log("ambiguous:", list.filter((s) => s.label.ambiguous).length);
  for (const b of batches) {
    const mine = all.filter((s) => s.batch === b.name);
    console.log(`+ batch ${b.name}: ${b.count} scenarios, frozen ${b.frozenAt}, labels ${b.labelsHash} · labels: ${by(mine, (s) => s.label.verdict)} · writes: ${by(mine, (s) => s.write.kind)}`);
  }
}
