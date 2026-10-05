/**
 * How a choice vote resolves (nebius R2). Pure: no clock (the caller says
 * whether it ran out), no database, no model. convex/choiceVotes.ts runs it
 * after every answer and at the end of the vote's life; screens run it to
 * draw the count.
 *
 * Only the people whose choice is at stake vote (lib/deck/edits.ts
 * `applyEdit` names them). The asker is shown as having asked; if their own
 * choice is one of those at stake, their answer is the change they asked for.
 *
 * | # | the answers so far                               | outcome                  |
 * |---|--------------------------------------------------|--------------------------|
 * | 1 | one change has more than half of the voters      | change (that one)        |
 * | 2 | "keep it" has more than half                     | keep (majority)          |
 * | 3 | everyone answered, nothing has more than half    | keep (a tie keeps it)    |
 * | 4 | its life ran out without rows 1-3                | keep (expired)           |
 * | 5 | otherwise                                        | open                     |
 *
 * Closed by people, outside this function: the asker withdraws it; everyone
 * at stake changes their own choice by hand, so nothing is left to override
 * (moot: the write just goes). A second ask on the same choice joins as
 * another option, up to three options in all.
 */

export const KEEP = "keep";
export const MAX_OPTIONS = 3;

export type Voter = { id?: string; name: string };
export type Answer = { voter: string; option: string };
export type Outcome =
  | { state: "open" }
  | { state: "change"; option: string; n: number; of: number }
  | { state: "keep"; why: "majority" | "tie" | "expired"; n: number; of: number };

/** A voter's key on the ballot: their id where the card knows it, else their name. */
export const voterKey = (p: Voter) => p.id ?? `name:${p.name.trim().toLowerCase()}`;

/** Is this person (a screen's user id and name) one of the voters? Their key if so. */
export function voterOf(voters: readonly Voter[], userId: string, name: string): string | null {
  const low = name.trim().toLowerCase();
  const hit = voters.find((p) => p.id === userId) ?? voters.find((p) => p.id === undefined && p.name.trim().toLowerCase() === low);
  return hit ? voterKey(hit) : null;
}

export function tally(voters: readonly Voter[], options: readonly { id: string }[], answers: readonly Answer[], expired = false): Outcome {
  const keys = new Set(voters.map(voterKey));
  const counted = answers.filter((a) => keys.has(a.voter));
  const of = keys.size;
  const count = (id: string) => counted.filter((a) => a.option === id).length;
  for (const o of options) {
    if (o.id === KEEP) continue;
    const n = count(o.id);
    if (n * 2 > of) return { state: "change", option: o.id, n, of };
  }
  const kept = count(KEEP);
  if (kept * 2 > of) return { state: "keep", why: "majority", n: kept, of };
  if (counted.length >= of) return { state: "keep", why: "tie", n: kept, of };
  if (expired) return { state: "keep", why: "expired", n: kept, of };
  return { state: "open" };
}

/** The stage's line when the door says ask (the slip family): "that's 3 people's choice · asked them". */
export function askLine(v: { state: string; who: string[] }, me: { name: string }): string {
  const others = v.who.filter((n) => n.trim().toLowerCase() !== me.name.trim().toLowerCase());
  const whose = others.length === 1 ? `${others[0].toLowerCase()}'s` : `${others.length} people's`;
  if (v.state === "busy") return "one thing at a time · there's a vote open on it";
  if (v.state === "already") return "already asked · it's on the card";
  if (v.state === "joined") return `that's ${whose} choice · added to their vote`;
  return `that's ${whose} choice · asked ${others.length === 1 ? others[0].toLowerCase() : "them"}`;
}

const v = (...names: string[]) => names.map((name) => ({ id: `u-${name}`, name }));
const said = (...pairs: [string, string][]) => pairs.map(([who, option]) => ({ voter: `u-${who}`, option }));
const two = [{ id: KEEP }, { id: "c1" }];

/** The table above as data (nebius/eval/row/cases.mjs replays it). */
export const VOTE_CASES: { n: number; name: string; voters: Voter[]; options: { id: string }[]; answers: Answer[]; expired?: boolean; want: string }[] = [
  { n: 1, name: "2 of 3 say change it", voters: v("holly", "sam", "jo"), options: two, answers: said(["holly", "c1"], ["sam", "c1"]), want: "change" },
  { n: 1, name: "one voter says ok", voters: v("jules"), options: two, answers: said(["jules", "c1"]), want: "change" },
  { n: 1, name: "a second ask joined: 2 of 3 pick it", voters: v("holly", "sam", "jo"), options: [...two, { id: "c2" }], answers: said(["holly", "c2"], ["jo", "c2"]), want: "change" },
  { n: 2, name: "2 of 3 say keep it", voters: v("holly", "sam", "jo"), options: two, answers: said(["holly", KEEP], ["sam", KEEP]), want: "keep" },
  { n: 2, name: "one voter says no", voters: v("jules"), options: two, answers: said(["jules", KEEP]), want: "keep" },
  { n: 3, name: "a tie, 1 to 1", voters: v("holly", "sam"), options: two, answers: said(["holly", "c1"], ["sam", KEEP]), want: "keep" },
  { n: 3, name: "three ways, nobody has half", voters: v("holly", "sam", "jo"), options: [...two, { id: "c2" }], answers: said(["holly", "c1"], ["sam", "c2"], ["jo", KEEP]), want: "keep" },
  { n: 4, name: "ran out with 1 of 3 for change", voters: v("holly", "sam", "jo"), options: two, answers: said(["holly", "c1"]), expired: true, want: "keep" },
  { n: 5, name: "1 of 3 so far", voters: v("holly", "sam", "jo"), options: two, answers: said(["holly", "c1"]), want: "open" },
  { n: 5, name: "a non-voter's answer doesn't count", voters: v("holly", "sam", "jo"), options: two, answers: said(["holly", "c1"], ["tara", "c1"]), want: "open" },
];
