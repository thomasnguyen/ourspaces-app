/**
 * A card was named with nothing to put in it ("add a poll"). Before anyone is
 * asked to say more, the room offers what it already knows could fill it:
 * the next date on the board, the group's saved places, who said yes. Pure
 * and model-free: `RoomFacts` in, at most three offers out. Each offer is
 * words to add to the ask (so the ask then runs the normal path) and where
 * the idea came from.
 */
import type { RoomFacts } from "./resolve";

export type AskOffer = {
  /** What the chip says: "where we eat". */
  label: string;
  /** The words it adds to the ask: "for where we eat". */
  say: string;
  /** Where the room got it: "your saved places". */
  from: string;
};

/** A title as someone would say it: no emoji ("maya's bday 🎂" → "maya's bday"). */
const spoken = (s: string) => s.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").replace(/\s+/g, " ").trim();

export function offersFor(f: RoomFacts | null, card: string): AskOffer[] {
  if (!f) return [];
  const date = f.dates.filter((d) => d.days >= 0).sort((a, b) => a.days - b.days)[0];
  const next = date ? { ...date, title: spoken(date.title) } : undefined;
  const countdown = next ? `the “${next.title}” countdown` : "";
  const rsvp = f.rsvps[0] ? { ...f.rsvps[0], title: spoken(f.rsvps[0].title) } : undefined;
  const out: AskOffer[] = [];
  if (card === "poll") {
    if (f.places.length) out.push({ label: "where we eat", say: "for where we eat", from: "your saved places" });
    if (next) out.push({ label: `what to do for ${next.title}`, say: `for what to do for ${next.title}`, from: countdown });
  }
  if (card === "checklist" && next) out.push({ label: `${next.title} prep`, say: `for ${next.title} prep`, from: countdown });
  if (card === "wheel" && rsvp) out.push({ label: "who drives", say: "for who drives", from: `who said yes to “${rsvp.title}”` });
  if (card === "split" && next) out.push({ label: `${next.title} costs`, say: `for ${next.title} costs`, from: countdown });
  return out.slice(0, 3);
}
