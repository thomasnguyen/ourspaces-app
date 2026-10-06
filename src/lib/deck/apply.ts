import type { Widget } from "../../data/types";
import { cardSize, getCard, CARD_IDS, type CardContext, type DealtCard } from "./catalog";
import { checkSettings, type Schema } from "./schema";
import { checkRecipe, isRecipe } from "./recipes";
import { blankSlot, needsOf, type Unfinished } from "./needs";
import type { Field } from "./schema";

/** Something that passes a field's check, for a field that is about to be left empty. */
const stand = (f: Field): unknown => (f.kind === "list" ? ["…", "…"] : f.kind === "number" ? f.min : f.kind === "date" ? "2000-01-01" : f.kind === "rows" ? [{}] : "…");

const POLL_ROW = 42; // one poll option row, in canvas px

export type CardCheck =
  | { ok: true; card: DealtCard; notes: string[] }
  | { ok: false; reason: string };

/**
 * One parsed line of model output → a typed card, or a reason. Accepts
 * `{"card","settings"}` and the flat `{"card","question",…}` slip. Never throws.
 */
export function checkCard(raw: unknown): CardCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "not an object" };
  const { card: id, settings, ...flat } = raw as Record<string, unknown>;
  if (typeof id !== "string") return { ok: false, reason: "no card id" };
  if (isRecipe(id.trim().toLowerCase())) {
    const r = checkRecipe(id.trim().toLowerCase(), settings ?? flat);
    if (!r.ok) return { ok: false, reason: `${id}: ${r.reason}` };
    return { ok: true, card: { card: id.trim().toLowerCase() as "challenge", settings: r.value as Record<string, unknown> }, notes: r.notes };
  }
  const def = getCard(id.trim().toLowerCase());
  if (!def) return { ok: false, reason: `unknown card ${id} (deck: ${CARD_IDS.join(", ")})` };
  const r = checkSettings(def.settings as Schema, settings ?? flat);
  if (!r.ok) return { ok: false, reason: `${def.id}: ${r.reason}` };
  return { ok: true, card: { card: def.id, settings: r.value } as DealtCard, notes: r.notes };
}

export type Applied =
  | { ok: true; widget: Widget; notes: string[] }
  | { ok: false; reason: string };

/**
 * A dealt card → the widget row the canvas renders and Convex stores, at
 * (0, 0): `placeCards` decides where it goes. Pure; takes raw model output
 * or an already-checked card.
 */
export function applyCard(
  card: unknown,
  ctx: CardContext,
  opts: {
    id?: string;
    z?: number;
    assignees?: string[];
    /** Leave this setting empty on the card (a link fills it, or a person: C1 / W2). */
    blank?: string;
    /** The card lands unfinished: the empty slot is marked and is a "your turn" for whoever asked. */
    unfinished?: { by: string; byUserId?: string };
  } = {},
): Applied {
  if (opts.blank && card && typeof card === "object") {
    const c = card as { card?: string; settings?: Record<string, unknown> };
    const f = c.card ? (getCard(c.card)?.settings as Record<string, Field> | undefined)?.[opts.blank] : undefined;
    if (f && c.settings?.[opts.blank] === undefined) card = { ...c, settings: { ...c.settings, [opts.blank]: stand(f) } };
  }
  const checked = checkCard(card);
  if (!checked.ok) return checked;
  // A recipe is several cards: `expandRecipe` makes them, each applied on its own.
  if (isRecipe(checked.card.card)) return { ok: false, reason: `${checked.card.card} is a recipe: expand it` };
  const def = getCard(checked.card.card)!;
  const size = cardSize(def);
  // `build` is typed per card; the union lookup loses the pairing, the check above restores it.
  const build = def.build as (s: unknown, c: CardContext) => Widget["data"];
  let data = build(checked.card.settings, ctx);
  // One person per checklist item (room tokens: `for`), shown as already theirs.
  if (def.type === "potluck" && opts.assignees?.length) {
    const d = data as { items: { name: string; by: string | null; claimed: boolean }[]; openCount: number };
    const items = d.items.map((it, i) => (opts.assignees![i] ? { ...it, by: opts.assignees![i], claimed: true } : it));
    data = { ...d, items, openCount: items.filter((it) => !it.claimed).length } as Widget["data"];
  }
  if (opts.blank) {
    data = blankSlot(def.type, data as Record<string, unknown>, opts.blank) as Widget["data"];
    const n = needsOf(def.id).find((x) => x.field === opts.blank);
    if (opts.unfinished && n) data = { ...data, unfinished: { field: n.field, slot: n.slot, ask: n.ask, card: def.id, ...opts.unfinished } satisfies Unfinished } as Widget["data"];
  }
  // A poll's box fits three options; each one past that needs its own row (and its rules line, closes / needs, one more).
  const pd = data as { options?: unknown[]; closesAt?: string; needs?: number };
  const options = def.type === "poll" ? (pd.options?.length ?? 0) + (pd.closesAt || pd.needs ? 1 : 0) : 0;
  return {
    ok: true,
    notes: checked.notes,
    widget: {
      id: opts.id ?? `deck-${def.id}-${Date.now().toString(36)}`,
      type: def.type,
      x: 0,
      y: 0,
      w: size.w,
      h: size.h + Math.max(0, options - 3) * POLL_ROW,
      z: opts.z ?? 30,
      ...("rotate" in def ? { rotate: def.rotate } : {}),
      data,
    },
  };
}
