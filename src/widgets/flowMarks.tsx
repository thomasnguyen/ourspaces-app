/**
 * Marks a card draws on itself for C1 and W2, in the slip / ticket language:
 * - `EmptySlot`: an unfinished card's missing field, marked where it goes
 *   ("add choices"). Tap it and type, Enter: code maps the words onto that
 *   one field (lib/deck/needs.ts `fillSlot`) and the card is whole.
 * - `CallIt`: on a poll or a day-finder that another card waits on, the
 *   smallest honest close: anyone taps "call it" (convex/links.ts `callIt`).
 */
import { useContext, useState } from "react";
import type { Widget } from "../data/types";
import { fillSlot, type Unfinished } from "../lib/deck/needs";
import { BoardLinkContext } from "./challenge";
import "../components/link-threads.css";

const todayHere = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function EmptySlot({ widget }: { widget: Widget }) {
  const { onWidgetData, waiting } = useContext(BoardLinkContext);
  const u = widget.data.unfinished as Unfinished | undefined;
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState(0);
  if (!u || waiting?.[widget.id]) return null;
  const send = (text: string) => {
    const data = fillSlot(widget as { type: string; data: Record<string, unknown> }, text, todayHere());
    if (!data) return setBad((n) => n + 1);
    onWidgetData?.(widget.id, data as Widget["data"]);
    setOpen(false);
  };
  return (
    <label
      className="card-slot"
      data-testid="card-slot"
      data-field={u.field}
      data-bad={bad ? "" : undefined}
      key={bad}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <b aria-hidden>+</b>
      {open ? (
        <input
          autoFocus
          data-testid="card-slot-input"
          placeholder={u.ask}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") send((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setOpen(false);
          }}
          onBlur={() => setOpen(false)}
        />
      ) : (
        <span>{u.slot}</span>
      )}
    </label>
  );
}

export function CallIt({ widget }: { widget: Widget }) {
  const { threads, onCallIt } = useContext(BoardLinkContext);
  if (!onCallIt || (widget.type !== "poll" && widget.type !== "availability")) return null;
  const open = threads?.some((t) => t.from === widget.id && t.state === "waiting" && t.when.includes("closed"));
  if (!open || widget.data.closed) return null;
  return (
    <button
      type="button"
      className="card-call-it"
      data-testid="card-call-it"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onCallIt(widget.id);
      }}
    >
      call it
    </button>
  );
}
