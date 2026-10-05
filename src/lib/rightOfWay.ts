/**
 * Right of Way: the gate every AI write passes (nebius R1).
 *
 * The AI never moves or changes what someone is touching. Code decides,
 * never the model: this function is pure (no clock, no database, no model)
 * and runs inside the same Convex mutation that would commit the write
 * (convex/rightOfWay.ts), so nothing can slip between the check and the
 * commit. The mock jigsaw's hands ask it too (lib/games/rightOfWay.ts).
 *
 *   go     commit it now
 *   wait   someone else holds it: the write is kept as a ghost and lands
 *          when they let go (if it still makes sense then)
 *   never  not this write: it would undo people's choices, finish what
 *          people are making, or land a new card on a held one
 *
 * | # | the write                                        | held by           | verdict                  |
 * |---|--------------------------------------------------|-------------------|--------------------------|
 * | 1 | an edit code refused (it would undo choices)     | anyone or nobody  | never(the refusal)       |
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

/** Who acts: a person's own hand, or the space (an AI write; `asker` = whose words it was). */
export type Hand = { kind: "person"; id: string; name: string } | { kind: "space"; asker?: string };
/** A lease: this thing is in this hand right now (a drag, typing, an unsent vote, a puzzle piece). */
export type Lease = { thing: string; by: Hand; kind: "drag" | "type" | "vote" | "piece" };
export type Write = {
  /** What it changes: a card id, "piece:7". None = a new card. */
  thing?: string;
  by: Hand;
  /** A new card: the things its spot overlaps. */
  spot?: string[];
  /** Code found it would undo people's choices (lib/deck/edits.ts `applyEdit`). */
  refused?: string;
  /** It would complete a shared thing (the last puzzle piece). */
  finishes?: boolean;
};
export type Verdict = { kind: "go"; handover?: true } | { kind: "wait"; on: Lease } | { kind: "never"; why: string; on?: Lease };

/** A lease is the writer's own: the same person, or the person whose words the AI is acting on. */
const own = (l: Lease, by: Hand) =>
  l.by.kind === "space" ? by.kind === "space" : by.kind === "person" ? by.id === l.by.id : by.asker === l.by.id;

export function rightOfWay(write: Write, leases: readonly Lease[]): Verdict {
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

/** The table above as data: the eval replays these (nebius/eval/row/). */
export const CASES: { n: number; name: string; write: Write; leases: Lease[]; want: Verdict["kind"] }[] = [
  { n: 1, name: "edit code refused", write: { thing: "poll", by: { kind: "space", asker: "u-sam" }, refused: "3 people voted for pizza; i won't remove it" }, leases: [], want: "never" },
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
