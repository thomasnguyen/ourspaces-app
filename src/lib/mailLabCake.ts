import type { Widget } from "../data/types";
import { getSpace } from "../data/spaces";

/**
 * The receipt beat, playable offline (#/mail → receipt).
 *
 * Mock mode has no Convex, so the lab has to play the router's hand: stand the
 * card up before the envelope flies, then fill it on impact. Both halves
 * mirror `applyExpense` in convex/inbox.ts — same shape, same split rule — so
 * what the clip shows is what the live path writes.
 */

export const MAIL_LAB_CAKE_ID = "mail-cake";

/** Shoot state, per the script: the receipt makes its own card, so the seeded
    tracker comes off the board for the take — two IOU slips side by side is a
    puzzle, not a beat. The sticker goes with it because stickers pin at
    z-index 100000 and this one sits exactly where the card lands. */
export const MAIL_LAB_HIDDEN = ["expense-split", "sticker-since"];
const PAID_BY = "Holly";
const AMOUNT = 126;

/** Step one: an empty tracker, which is what a receipt with nowhere to go
    creates. Title only — no rows, nothing owed. */
export function mailLabCakeCard(): Widget {
  return {
    id: MAIL_LAB_CAKE_ID,
    type: "expenseSplit",
    x: 1366,
    y: 300,
    w: 256,
    h: 300,
    z: 60,
    rotate: -1,
    data: { title: "cake", total: 0, splits: [], kicker: "from email" },
  };
}

/** Step two: the split, on impact. The payer's row first, then everyone else
    on the space owing whole dollars — so the head count follows the cast. */
export function mailLabCakeSplit(spaceId: string): Widget["data"] {
  const cast = getSpace(spaceId).members ?? [];
  const owing = cast.filter(
    (member) => member.name.toLowerCase() !== PAID_BY.toLowerCase(),
  );
  const each = owing.length > 0 ? Math.max(1, Math.round(AMOUNT / owing.length)) : 0;
  return {
    title: "cake",
    total: AMOUNT,
    kicker: "from email",
    splits: [
      { name: PAID_BY, owes: 0, paid: AMOUNT },
      ...owing.map((member) => ({ name: member.name, owes: each, paid: 0 })),
    ],
    lastEmail: {
      who: PAID_BY,
      amount: AMOUNT,
      label: "the cake",
      because: "it's the receipt for the cake, $126 from holly",
    },
  };
}
