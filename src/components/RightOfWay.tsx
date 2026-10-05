/**
 * Right of Way on the board (nebius R1): the halo on anything someone else
 * holds, and the ghost of an AI write waiting for them to let go. Both are
 * portaled into the card's own element, so they ride a drag with it. Plain
 * on purpose; a design pass follows. Data: convex/leases.ts `forRoom`,
 * convex/rightOfWay.ts `room`. Mock: a scripted second person (lib/rowMock.ts).
 */
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { applyEdit, type EditOp } from "../lib/deck/edits";
import "./right-of-way.css";

export type RowLease = { thing: string; kind: string; userId: string; name: string; color: string; since: number; letGoAt?: number; scripted?: boolean };
export type RowGhost = { id: string; writeId?: string; thing: string; widgetId?: string; kind: string; by: string; byUserId?: string; text: string; write: string; on: string; at: number; scripted?: boolean };
type Holder = { userId: string; name: string; color: string; kind: string };
type Card = { id: string; type: string; data: Record<string, unknown> };

/** A hold this short is a tap: no halo (it would flicker). */
export const HALO_AFTER_MS = 250;
const LEAVE_MS = 220;
const DOING: Record<string, string> = { drag: "moving it", type: "typing", vote: "choosing", piece: "holding it" };
const REMOVES = new Set(["removeOption", "removeItem", "removePerson"]);

/** The card element on the board, once it's there. */
function useCardEl(host: HTMLElement | null, id: string | undefined) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!host || !id) return;
    let t = 0;
    const find = () => {
      const hit = host.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
      setEl((was) => (was === hit ? was : hit));
      t = window.setTimeout(find, hit ? 1000 : 200);
    };
    find();
    return () => window.clearTimeout(t);
  }, [host, id]);
  return el;
}

/** Keep a list's leavers on screen for the exit. */
function useLeaving<T extends { key: string }>(items: T[]) {
  const [shown, setShown] = useState<(T & { leaving?: boolean })[]>(items);
  useEffect(() => {
    const keys = new Set(items.map((x) => x.key));
    setShown((was) => [...items, ...was.filter((x) => !keys.has(x.key)).map((x) => ({ ...x, leaving: true }))]);
    const t = window.setTimeout(() => setShown((was) => was.filter((x) => keys.has(x.key))), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [items]);
  return shown;
}

function Halo({ host, lease, leaving }: { host: HTMLElement | null; lease: RowLease; leaving?: boolean }) {
  const el = useCardEl(host, lease.thing);
  // debounce on the hold itself: a tap (let go inside 250 ms) never shows
  const tap = lease.letGoAt !== undefined && lease.letGoAt - lease.since < HALO_AFTER_MS;
  const [ripe, setRipe] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRipe(true), HALO_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);
  if (!el || tap || (!ripe && !leaving)) return null;
  return createPortal(
    <div
      className={`row-halo${leaving ? " is-leaving" : ""}${lease.letGoAt !== undefined ? " is-letting-go" : ""}`}
      data-testid="row-halo"
      data-holder={lease.name}
      data-kind={lease.kind}
      data-scripted={lease.scripted ? "true" : undefined}
      style={{ "--holder": lease.color } as CSSProperties}
      aria-hidden
    >
      <span className="row-halo-tag" data-testid="row-halo-tag">
        {lease.name.toLowerCase()} has this{lease.scripted ? " · scripted" : ""}
      </span>
    </div>,
    el,
  );
}

/** Halos for everything held by someone other than me. */
export function RowHalos({ host, leases, me }: { host: HTMLElement | null; leases: RowLease[]; me: string }) {
  const items = useMemo(() => leases.filter((l) => l.userId !== me).map((l) => ({ ...l, key: `${l.thing}:${l.userId}` })), [leases, me]);
  const shown = useLeaving(items);
  return (
    <>
      {shown.map((l) => (
        <Halo key={l.key} host={host} lease={l} leaving={l.leaving} />
      ))}
    </>
  );
}

const parse = <T,>(s: string): T | null => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};
export const holderOf = (g: RowGhost) => parse<Holder>(g.on) ?? { userId: "", name: "someone", color: "var(--color-lime)", kind: "drag" };
const opOf = (g: RowGhost) => parse<{ kind: string; op?: EditOp; today?: string }>(g.write);

/**
 * Cards with a waiting edit, drawn with the change in (the changed part is
 * then dashed by `RowGhosts`). Not for removals (the row stays, struck) and
 * not while the holder is typing in that card (their field is theirs).
 */
export function withGhosts<T extends Card>(cards: T[], ghosts: RowGhost[], leases: RowLease[]): T[] {
  if (!ghosts.length) return cards;
  return cards.map((c) => {
    const g = ghosts.find((x) => x.thing === c.id);
    const w = g && opOf(g);
    if (!g || !w?.op || REMOVES.has(w.op.op) || leases.some((l) => l.thing === c.id && l.kind === "type")) return c;
    const r = applyEdit(c, w.op, { today: w.today ?? "" });
    return r.ok ? { ...c, data: r.data as T["data"] } : c;
  });
}

function Ghost({ host, ghost, mine, onCancel, leaving }: { host: HTMLElement | null; ghost: RowGhost; mine: boolean; onCancel: (id: string) => void; leaving?: boolean }) {
  const el = useCardEl(host, ghost.thing);
  const on = holderOf(ghost);
  const w = opOf(ghost);
  // the changed part: what the op names (the new option, the struck one, the new name)
  const want = String(w?.op?.value ?? "").toLowerCase().trim();
  const removal = Boolean(w?.op && REMOVES.has(w.op.op));
  useLayoutEffect(() => {
    if (!el || !want || leaving) return;
    const body = el.querySelector<HTMLElement>(".widget-group-body") ?? el;
    const hits = [...body.querySelectorAll<HTMLElement>("*")].filter((x) => !x.closest(".row-ghost, .row-halo") && (x.textContent ?? "").toLowerCase().includes(want));
    const deepest = hits.filter((x) => !hits.some((o) => o !== x && x.contains(o)));
    const marked = deepest.slice(0, 2).map((x) => x.closest<HTMLElement>("li, tr") ?? x);
    for (const m of marked) {
      m.setAttribute("data-ghost-changed", removal ? "remove" : "add");
      m.style.setProperty("--holder", on.color);
    }
    return () => marked.forEach((m) => m.removeAttribute("data-ghost-changed"));
  });
  if (!el) return null;
  const what = ghost.kind === "link" ? "fills in" : ghost.kind === "puzzle" ? "the space's piece" : ghost.text || "a change";
  return createPortal(
    <div className={`row-ghost${leaving ? " is-leaving" : ""}`} data-testid="row-ghost" data-pending-id={ghost.id} data-scripted={ghost.scripted ? "true" : undefined} style={{ "--holder": on.color } as CSSProperties}>
      <span className="row-ghost-what">{mine ? what : `${ghost.by.toLowerCase()}: ${what}`}</span>
      <span className="row-ghost-on" data-testid="row-ghost-on">
        waiting on {on.name.toLowerCase()} · {DOING[on.kind] ?? "holding it"}
        {ghost.scripted ? " · scripted" : ""}
      </span>
      {mine && !leaving && (
        <button type="button" className="row-ghost-cancel" data-testid="row-ghost-cancel" onPointerDown={(e) => e.stopPropagation()} onClick={() => onCancel(ghost.id)}>
          cancel
        </button>
      )}
    </div>,
    el,
  );
}

export function RowGhosts({ host, ghosts, me, onCancel }: { host: HTMLElement | null; ghosts: RowGhost[]; me: string; onCancel: (id: string) => void }) {
  const keyed = useMemo(() => ghosts.map((g) => ({ ...g, key: g.id })), [ghosts]);
  const items = useLeaving(keyed);
  return (
    <>
      {items.map((g) => (
        <Ghost key={g.key} host={host} ghost={g} mine={g.byUserId === me} onCancel={onCancel} leaving={g.leaving} />
      ))}
    </>
  );
}

/** How a settled wait reads on a slip. */
export function settledLine(s: { by: string; byUserId?: string; text: string; outcome: string }, me: string): string | null {
  const o = parse<{ state: string; ms: number; on: string; why?: string }>(s.outcome);
  if (!o) return null;
  const mine = s.byUserId === me;
  if (o.state === "landed") return `${mine ? "" : `${s.by.toLowerCase()} `}${s.text} (waited ${(o.ms / 1000).toFixed(1)} s for ${o.on.toLowerCase()})`;
  if (!mine || o.state === "cancelled" || o.state === "replaced") return null;
  return o.why ?? "that changed while you waited; nothing done";
}

export type HeldBackRow = { id: string; at: number; kind: string; by: string; verdict: string; reason: string; text: string; outcome?: string };

/** "What it held back": the ledger's waits and nevers, said plainly. */
export function HeldBack({ rows }: { rows: HeldBackRow[] }) {
  return (
    <section className="knows-sec row-held-back" data-testid="knows-held-back">
      <h2>what it held back</h2>
      {rows.length === 0 ? (
        <p className="row-held-empty">nothing yet. when someone is holding a card, the space waits for them.</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const o = r.outcome ? parse<{ state: string; ms: number; on: string; why?: string }>(r.outcome) : null;
            const asked = r.by === "the space" ? `the space's hand: ${r.text || r.kind}` : `${r.by.toLowerCase()} asked: ${r.text || r.kind}`;
            const line =
              r.verdict === "wait"
                ? o
                  ? `waited ${(o.ms / 1000).toFixed(1)} s for ${o.on.toLowerCase()} · ${o.state === "landed" ? "then it landed" : o.state === "expired" ? "gave up after 30 s" : o.state === "cancelled" ? "cancelled" : `dropped: ${o.why ?? "it had changed"}`}`
                  : `waiting: ${r.reason}`
                : r.kind === "build"
                  ? r.reason
                  : `didn't: ${r.reason}`;
            return (
              <li key={r.id} data-verdict={r.verdict}>
                <span className="row-held-asked">{r.verdict === "wait" || r.kind !== "build" ? asked : `${r.by.toLowerCase()}'s new card`}</span>
                <span className="row-held-line">{line}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The live section: mounted only while the knows page is open, so the ledger isn't read on every write. */
export function LiveHeldBack({ spaceId }: { spaceId: Id<"spaces"> }) {
  const rows = useQuery(api.rightOfWay.heldBack, { spaceId });
  return <HeldBack rows={(rows ?? []).map((r) => ({ ...r, id: String(r.id) }))} />;
}
