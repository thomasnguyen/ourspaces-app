/**
 * Right of Way for the jigsaw's hands, people's and the space's alike: the
 * mock engine (lib/jigsaw/engine.ts) asks this for every pick-up and
 * placement. It is the one gate (lib/rightOfWay.ts) with the jigsaw's
 * words: a mover is a person by name or the space, a hold is a piece.
 */
import { rightOfWay as gate, type Hand } from "../rightOfWay";

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

const hand = (m: Mover): Hand => (m.kind === "space" ? { kind: "space" } : { kind: "person", id: m.name, name: m.name });

export function rightOfWay(holds: readonly Hold[], move: Move): Decision {
  const v = gate({ thing: move.thing, by: hand(move.by), finishes: move.finishes }, holds.map((h) => ({ thing: h.thing, by: hand(h.by), kind: "piece" as const })));
  if (v.kind === "wait") return { kind: "wait", on: v.on.by.kind === "person" ? v.on.by.name : "the space" };
  if (v.kind === "never") return { kind: "never", why: "the last one belongs to a person" };
  return v.kind === "go" && v.handover ? { kind: "go", handover: true } : { kind: "go" };
}
