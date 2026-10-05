/**
 * Right of Way: the gate every AI write passes (nebius R1, R2).
 *
 * The AI never moves or changes what someone is touching, and never
 * overrides a choice someone made: that becomes a vote of the people whose
 * choice it is (convex/choiceVotes.ts; who counts is lib/deck/edits.ts
 * `applyEdit`, how it resolves is lib/choiceVote.ts). Code decides,
 * never the model: this function is pure (no clock, no database, no model)
 * and runs inside the same Convex mutation that would commit the write
 * (convex/rightOfWay.ts), so nothing can slip between the check and the
 * commit. The mock jigsaw's hands ask it too (lib/games/rightOfWay.ts).
 *
 *   go     commit it now
 *   ask    it would override other people's choices: they vote on it, and
 *          only a passed vote sends it again (as a write with no choice left)
 *   wait   someone else holds it: the write is kept as a ghost and lands
 *          when they let go (if it still makes sense then)
 *   never  not this write: code refused it, it would finish what people
 *          are making, or land a new card on a held one
 *
 * Choices first, then hands: a vote that passes while someone holds the card
 * comes back here and waits as a ghost like any other write.
 *
 * | # | the write                                        | held by           | verdict                  |
 * |---|--------------------------------------------------|-------------------|--------------------------|
 * | 1 | it overrides others' choices (3 voted for pizza) | anyone or nobody  | ask(those people, stake) |
 * |1b | it overrides only the asker's own choice         | (rows 3-10)       | on to the rows below     |
 * |1c | an edit code refused for another reason          | anyone or nobody  | never(the refusal)       |
 * | 2 | the space places the last puzzle piece           | anyone or nobody  | never(last one is ours)  |
 * | 3 | a write to a card nobody holds                   | nobody            | go                       |
 * | 4 | a person moves what they hold                    | that person       | go                       |
 * | 5 | an AI write holly asked for, on a card she holds | holly (asker)     | go (her own hand)        |
 * | 6 | an AI write on a card someone else holds         | holly             | wait(holly, the card)    |
 * | 7 | a person reaches for what someone else holds     | holly             | wait(holly, the thing)   |
 * | 8 | a person reaches for what the space holds        | the space         | go (the space lets go)   |
 * | 9 | a new card whose spot overlaps a held card       | holly             | never(spot held: move it)|
 * |10 | a new card in a free spot                        | (others elsewhere)| go                       |
 */

/** Who acts: a person's own hand, or the space (an AI write; `asker` = whose words it was, by id and name). */
export type Hand = { kind: "person"; id: string; name: string } | { kind: "space"; asker?: string; askerName?: string };
/** A choice the write would override: the people who made it (id when the card knows it) and what's at stake. */
export type Choice = { stake: string; people: { id?: string; name: string }[] };
/** A lease: this thing is in this hand right now (a drag, typing, an unsent vote, a puzzle piece). */
export type Lease = { thing: string; by: Hand; kind: "drag" | "type" | "vote" | "piece" };
export type Write = {
  /** What it changes: a card id, "piece:7". None = a new card. */
  thing?: string;
  by: Hand;
  /** A new card: the things its spot overlaps. */
  spot?: string[];
  /** Code found people's choices it would override (lib/deck/edits.ts `applyEdit`). A passed vote resends it without. */
  choice?: Choice;
  /** Code refused it for another reason. */
  refused?: string;
  /** It would complete a shared thing (the last puzzle piece). */
  finishes?: boolean;
};
export type Verdict = { kind: "go"; handover?: true } | { kind: "ask"; who: Choice["people"]; stake: string } | { kind: "wait"; on: Lease } | { kind: "never"; why: string; on?: Lease };

/** A lease is the writer's own: the same person, or the person whose words the AI is acting on. */
const own = (l: Lease, by: Hand) =>
  l.by.kind === "space" ? by.kind === "space" : by.kind === "person" ? by.id === l.by.id : by.asker === l.by.id;

/** The choice is the writer's own: the person themself, or the asker (by id, or by name where the card only knows names). */
const chose = (p: { id?: string; name: string }, by: Hand) => {
  const name = p.name.trim().toLowerCase();
  // an id the card knows decides it: a second seat with the same name is someone else (eval/right-of-way X31-X33)
  if (p.id !== undefined) return p.id === (by.kind === "person" ? by.id : by.asker);
  if (by.kind === "person") return name === by.name.trim().toLowerCase();
  return by.askerName !== undefined && name === by.askerName.trim().toLowerCase();
};

export function rightOfWay(write: Write, leases: readonly Lease[]): Verdict {
  const who = write.choice?.people.filter((p) => !chose(p, write.by)) ?? [];
  if (who.length) return { kind: "ask", who, stake: write.choice!.stake };
  if (write.refused) return { kind: "never", why: write.refused };
  if (write.by.kind === "space" && write.finishes) return { kind: "never", why: "the last one belongs to a person" };
  if (write.thing === undefined) {
    const taken = leases.find((l) => write.spot?.includes(l.thing) && l.by.kind === "person" && !own(l, write.by));
    return taken ? { kind: "never", why: `${(taken.by as { name: string }).name} has that spot`, on: taken } : { kind: "go" };
  }
  const hold = leases.find((l) => l.thing === write.thing && !own(l, write.by));
  if (!hold) return { kind: "go" };
  if (hold.by.kind === "person") return { kind: "wait", on: hold };
  return { kind: "go", handover: true };
}

const holly: Hand = { kind: "person", id: "u-holly", name: "holly" };
const sam: Hand = { kind: "person", id: "u-sam", name: "sam" };
const held = (thing: string, by: Hand = holly, kind: Lease["kind"] = "drag"): Lease => ({ thing, by, kind });
const tara: Hand = { kind: "space", asker: "u-tara", askerName: "tara" };
const voted = (ids: string[]): Choice => ({ stake: `${ids.length} voted for pizza`, people: ids.map((id) => ({ id, name: id.slice(2) })) });

/** The table above as data: the eval replays these (nebius/eval/row/). */
export const CASES: { n: number | string; name: string; write: Write; leases: Lease[]; want: Verdict["kind"] }[] = [
  { n: 1, name: "remove an option 3 people voted for", write: { thing: "poll", by: tara, choice: voted(["u-holly", "u-sam", "u-jo"]) }, leases: [], want: "ask" },
  { n: 1, name: "one person's claimed slot (a direct question)", write: { thing: "list", by: tara, choice: { stake: "jules has towels", people: [{ id: "u-jules", name: "jules" }] } }, leases: [], want: "ask" },
  { n: 1, name: "an rsvp time 3 people said yes to", write: { thing: "rsvp", by: tara, choice: { stake: "3 people said yes to friday", people: [{ id: "u-holly", name: "holly" }, { id: "u-sam", name: "sam" }, { id: "u-jo", name: "jo" }] } }, leases: [], want: "ask" },
  { n: 1, name: "someone who paid into the split (name only)", write: { thing: "split", by: tara, choice: { stake: "maya paid $600", people: [{ name: "maya" }] } }, leases: [], want: "ask" },
  { n: 1, name: "check-ins already logged", write: { thing: "challenge", by: tara, choice: { stake: "2 people logged past day 3", people: [{ name: "holly" }, { name: "sam" }] } }, leases: [], want: "ask" },
  { n: 1, name: "a date someone set by hand", write: { thing: "countdown", by: tara, choice: { stake: "holly set sun oct 11 by hand", people: [{ id: "u-holly", name: "holly" }] } }, leases: [], want: "ask" },
  { n: 1, name: "the asker is one of 3 voters: ask the other 2", write: { thing: "poll", by: tara, choice: voted(["u-tara", "u-sam", "u-jo"]) }, leases: [], want: "ask" },
  { n: 1, name: "choices first: others voted, the asker holds the card", write: { thing: "poll", by: tara, choice: voted(["u-holly"]) }, leases: [held("poll", { kind: "person", id: "u-tara", name: "tara" })], want: "ask" },
  { n: "1b", name: "only the asker's own vote", write: { thing: "poll", by: tara, choice: voted(["u-tara"]) }, leases: [], want: "go" },
  { n: "1b", name: "only the asker's own claim, by name", write: { thing: "list", by: tara, choice: { stake: "tara has towels", people: [{ name: "Tara" }] } }, leases: [], want: "go" },
  { n: "1b", name: "a passed vote, nobody holds it", write: { thing: "poll", by: tara }, leases: [], want: "go" },
  { n: "1b", name: "a passed vote while holly holds it (composed)", write: { thing: "poll", by: tara }, leases: [held("poll")], want: "wait" },
  { n: "1c", name: "edit code refused", write: { thing: "poll", by: tara, refused: "a poll needs two options" }, leases: [], want: "never" },
  { n: 2, name: "space places the last piece", write: { thing: "piece:7", by: { kind: "space" }, finishes: true }, leases: [], want: "never" },
  { n: 3, name: "nobody holds it", write: { thing: "poll", by: { kind: "space", asker: "u-sam" } }, leases: [held("split")], want: "go" },
  { n: 4, name: "a person moves what they hold", write: { thing: "poll", by: holly }, leases: [held("poll")], want: "go" },
  { n: 5, name: "the asker holds it", write: { thing: "poll", by: { kind: "space", asker: "u-holly" } }, leases: [held("poll")], want: "go" },
  { n: 6, name: "someone else holds it (drag)", write: { thing: "poll", by: { kind: "space", asker: "u-sam" } }, leases: [held("poll")], want: "wait" },
  { n: 6, name: "someone else holds it (typing)", write: { thing: "poll", by: { kind: "space", asker: "u-sam" } }, leases: [held("poll", holly, "type")], want: "wait" },
  { n: 6, name: "someone else holds it (unsent vote)", write: { thing: "poll", by: { kind: "space", asker: "u-sam" } }, leases: [held("poll", holly, "vote")], want: "wait" },
  { n: 6, name: "a link fills a held card", write: { thing: "standings", by: { kind: "space" } }, leases: [held("standings")], want: "wait" },
  { n: 6, name: "the space's hand, a held piece", write: { thing: "piece:3", by: { kind: "space" } }, leases: [held("piece:3", holly, "piece")], want: "wait" },
  { n: 7, name: "a person reaches for a held piece", write: { thing: "piece:3", by: sam }, leases: [held("piece:3", holly, "piece")], want: "wait" },
  { n: 8, name: "a person takes the space's piece", write: { thing: "piece:3", by: sam }, leases: [{ thing: "piece:3", by: { kind: "space" }, kind: "piece" }], want: "go" },
  { n: 9, name: "a new card on a held spot", write: { by: { kind: "space", asker: "u-sam" }, spot: ["poll"] }, leases: [held("poll")], want: "never" },
  { n: 10, name: "a new card in a free spot", write: { by: { kind: "space", asker: "u-sam" }, spot: [] }, leases: [held("poll")], want: "go" },
];
