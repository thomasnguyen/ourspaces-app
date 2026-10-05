/**
 * Your hands on the board, told to the server as leases (convex/leases.ts,
 * Right of Way). A card is yours while you drag it (the canvas gesture calls
 * `start`/`stop`), while a field inside it has focus (typing, the title too),
 * and while you press one of its choices and haven't let go (an unsent vote).
 * Renewed every second; on let-go the server keeps it a short grace more
 * (a drag 0.6 s, typing or choosing 1.5 s), and a
 * silent client loses it within 3 s.
 */
import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Kind = "drag" | "type" | "vote";
const RENEW_EVERY_MS = 1_000;
const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const CHOICE = "[data-testid='poll-option'], [aria-pressed], [role='radio']";

export function useHolds(o: { spaceId?: Id<"spaces">; me: { userId: string; name: string; color: string }; enabled: boolean }) {
  const hold = useMutation(api.leases.hold);
  const letGo = useMutation(api.leases.letGo);
  const held = useRef(new Map<string, Kind>());
  const ctx = useRef(o);
  ctx.current = o;

  const send = useCallback((thing: string, kind: Kind) => {
    const { spaceId, me } = ctx.current;
    if (spaceId) void hold({ spaceId, thing, kind, userId: me.userId, name: me.name, color: me.color }).catch(() => {});
  }, [hold]);
  const start = useCallback((thing: string, kind: Kind) => {
    if (!ctx.current.enabled || held.current.get(thing) === kind) return;
    held.current.set(thing, kind);
    send(thing, kind);
  }, [send]);
  const stop = useCallback((thing: string, kind?: Kind) => {
    const was = held.current.get(thing);
    if (!was || (kind && was !== kind)) return;
    held.current.delete(thing);
    const { spaceId, me } = ctx.current;
    if (spaceId) void letGo({ spaceId, thing, userId: me.userId }).catch(() => {});
  }, [letGo]);

  useEffect(() => {
    if (!o.enabled) return;
    const renew = window.setInterval(() => held.current.forEach((kind, thing) => send(thing, kind)), RENEW_EVERY_MS);
    const cardOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-widget-id]")?.dataset.widgetId : undefined);
    const onFocusIn = (e: FocusEvent) => {
      const id = cardOf(e.target);
      if (id && (e.target as Element).matches(EDITABLE)) start(id, "type");
    };
    const onFocusOut = (e: FocusEvent) => {
      const id = cardOf(e.target);
      if (id) stop(id, "type");
    };
    let pressed: string | null = null;
    const onDown = (e: PointerEvent) => {
      const id = cardOf(e.target);
      if (id && (e.target as Element).closest(CHOICE)) {
        pressed = id;
        start(id, "vote");
      }
    };
    const onUp = () => {
      if (pressed) stop(pressed, "vote");
      pressed = null;
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    return () => {
      window.clearInterval(renew);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      [...held.current.keys()].forEach((thing) => stop(thing));
    };
  }, [o.enabled, send, start, stop]);

  return { start, stop, holding: (thing: string) => held.current.has(thing) };
}
