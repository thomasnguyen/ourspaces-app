/**
 * Mock mode's room facts. Live, the room brief hands the voice ask a
 * `RoomFacts` (convex/roomBrief.ts). Mock has no backend, so the same shape is
 * read straight off the mock board's widgets here. Everything downstream is
 * the real path: `routeAsk` picks the facts the words point at, the answer's
 * tokens resolve on screen (`resolve.ts`), a repeat of a card on the board is
 * flagged.
 */
import type { Widget } from "../../data/types";
import { CATALOG } from "./catalog";
import type { RoomFacts } from "./resolve";

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown): Data[] => (Array.isArray(v) ? (v as Data[]) : []);
/** A card's title without its emoji: "maya's bday 🎂" → "maya's bday". */
const plain = (s: string) => s.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").replace(/\s+/g, " ").trim();
const titleOf = (d: Data) => plain(str(d.title) || str(d.question) || str(d.event) || str(d.text));

export function mockFacts(o: { room: string; widgets: Widget[]; people: string[]; today: string }): RoomFacts {
  const of = (type: string) => o.widgets.filter((w) => w.type === type).map((w) => w.data as Data);
  const days = (date: string) => Math.round((Date.parse(date) - Date.parse(o.today)) / 86_400_000);
  return {
    room: o.room,
    today: o.today,
    people: o.people,
    away: [],
    rsvps: of("rsvp").map((d) => {
      const who = (status: string) => arr(d.responses).filter((r) => r.status === status).map((r) => str(r.name));
      return { title: titleOf(d), yes: who("yes"), no: who("no"), maybe: who("maybe"), waiting: (d.waitingOn as string[] | undefined) ?? [] };
    }),
    polls: of("poll").map((d) => {
      const options = arr(d.options);
      const top = [...options].sort((a, b) => Number(b.votes) - Number(a.votes))[0];
      const votes = options.reduce((n, opt) => n + (Number(opt.votes) || 0), 0);
      return { title: titleOf(d), options: options.map((x) => str(x.label)), leader: top && Number(top.votes) > 0 ? str(top.label) : null, lead: Number(top?.votes) || 0, votes };
    }),
    splits: of("expenseSplit").map((d) => {
      const rows = arr(d.splits);
      const payer = [...rows].sort((a, b) => Number(b.paid) - Number(a.paid))[0];
      return { title: titleOf(d), also: [], total: Number(d.total) || 0, people: rows.map((r) => str(r.name)), payer: payer && Number(payer.paid) > 0 ? str(payer.name) : null, paid: Number(payer?.paid) || 0 };
    }),
    wheels: of("wheel").map((d) => ({ title: titleOf(d), options: arr(d.slices).map((x) => str(x.label)), last: null })),
    lists: of("potluck").map((d) => ({ title: titleOf(d), items: arr(d.items).map((x) => str(x.name)) })),
    places: of("linkShelf")
      .flatMap((d) => arr(d.links))
      .filter((l) => /maps|place/i.test(`${str(l.label)} ${str(l.url)}`))
      .map((l) => str(l.label).replace(/\s*\(maps\)\s*$/i, "")),
    dates: of("countdown")
      .filter((d) => str(d.targetDate))
      .map((d) => ({ title: titleOf(d), date: str(d.targetDate), days: days(str(d.targetDate)) })),
    clocks: [],
    board: o.widgets.flatMap((w) => {
      const card = CATALOG.find((c) => c.type === w.type);
      const title = titleOf(w.data as Data);
      return card && title ? [{ card: card.id, title }] : [];
    }),
    lowercase: true,
  };
}
