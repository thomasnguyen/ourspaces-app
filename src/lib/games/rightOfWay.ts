/**
 * Right of Way, as one decision.
 *
 * Given who is holding what, and a move somebody wants to make on one thing,
 * say whether the move may go now, has to wait (and on whom), or is never
 * the mover's to make. Pure: no clock, no DOM, no model.
 *
 * The jigsaw (mock mode) calls this for every pick-up and every placement,
 * people's and the space's alike. The live Right of Way gate (a later task:
 * a Convex mutation every AI write passes through, with leases stored per
 * object) is meant to be this same decision, called with real leases. Keep
 * it that small: if a rule can't be said here, it isn't a rule yet.
 */

export type Mover = { kind: "person"; name: string } | { kind: "space" };

/** A lease: this thing is in this mover's hand right now. */
export type Hold = { thing: string; by: Mover };

export type Move = {
  thing: string;
  by: Mover;
  /** the move would complete the shared thing (the last piece of a puzzle) */
  finishes?: boolean;
};

export type Decision =
  | { kind: "go"; /** the space had it and lets go for a person */ handover?: true }
  | { kind: "wait"; on: string }
  | { kind: "never"; why: "the last one belongs to a person" };

const sameMover = (a: Mover, b: Mover) => a.kind === b.kind && (a.kind === "space" || a.name === (b as { name: string }).name);

export function rightOfWay(holds: readonly Hold[], move: Move): Decision {
  /* the space never finishes what people are making together */
  if (move.by.kind === "space" && move.finishes) return { kind: "never", why: "the last one belongs to a person" };
  const hold = holds.find((h) => h.thing === move.thing);
  if (!hold || sameMover(hold.by, move.by)) return { kind: "go" };
  /* a person's hand outranks everyone: other people wait, and so does the space */
  if (hold.by.kind === "person") return { kind: "wait", on: hold.by.name };
  /* the space is holding it: a person may take it, and the space lets go */
  return { kind: "go", handover: true };
}
