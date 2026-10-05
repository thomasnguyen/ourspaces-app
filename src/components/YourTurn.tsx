/**
 * "your turn" — the small pile by the room's header that says what's waiting
 * on you and lets you do it in one tap. A self-contained layer: it takes the
 * items `lib/yourTurn.ts` computed plus the room's own handlers, and owns
 * nothing but its open/tucked state and the half second a finished card
 * takes to leave.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { panToWidget } from "../lib/recapBoard";
import { TURN_SHOWN, type TurnItem, type TurnViewer } from "../lib/yourTurn";
import "./yourTurn.css";

export type YourTurnHandlers = {
  onVote?: (widgetId: string, optionId: string) => void;
  onRsvp?: (widgetId: string, status: "yes" | "maybe" | "no") => void;
  onClaim?: (widgetId: string, itemName: string) => void;
  onDays?: (widgetId: string, dayIndex: number) => void;
  onAnswer?: (widgetId: string, text: string) => void;
};

const LEAVE_MS = 640;
const CLEAR_MS = 2400;
const PULSE_MS = 1700;
const PHONE = "(max-width: 800px)";

/** `?turn=open` holds it open, `?turn=tucked` starts it as the label — the
    states a take needs without clicking its way there. */
function turnParam() {
  return new URLSearchParams(window.location.search).get("turn") ?? "";
}

/** Fly the board to the card and ring it once. The ring is a class straight
    on the DOM, the way the recap's reading scan does it: transient, unowned. */
export function goToTurnWidget(widgetId: string) {
  panToWidget(widgetId);
  const group = document
    .querySelector<HTMLElement>(`[data-widget-id="${widgetId}"]`)
    ?.closest<HTMLElement>(".widget-group");
  if (!group) return;
  group.classList.remove("is-your-turn");
  void group.offsetWidth;
  group.classList.add("is-your-turn");
  window.setTimeout(() => group.classList.remove("is-your-turn"), PULSE_MS);
}

type Row = { item: TurnItem; done: boolean; wasTop: boolean };

export function YourTurn({
  roomKey,
  items: latest,
  viewer,
  onVote,
  onRsvp,
  onClaim,
  onDays,
  onAnswer,
}: YourTurnHandlers & {
  /** the room; a new one starts the layer over */
  roomKey: string;
  items: TurnItem[];
  viewer: TurnViewer;
}) {
  /* the list is recomputed on every render of the room; hold it still until
     it actually reads differently */
  const sig = latest.map((item) => `${item.key}=${item.waiting}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => latest, [sig]);

  const param = useMemo(turnParam, []);
  /* a phone starts as one line (the label names the top card); a desktop
     starts open, in the header band where it covers nothing */
  const startOpen = () => param === "open" || (param !== "tucked" && !window.matchMedia(PHONE).matches);
  const [open, setOpen] = useState(startOpen);
  const [all, setAll] = useState(false);
  const [topKey, setTopKey] = useState("");
  const [leaving, setLeaving] = useState<Array<{ item: TurnItem; wasTop: boolean }>>([]);
  const [cleared, setCleared] = useState(false);
  const [settled, setSettled] = useState(false);
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const prev = useRef<{ room: string; items: TurnItem[] }>({ room: roomKey, items });
  const lastTop = useRef("");
  const rootRef = useRef<HTMLElement>(null);
  const flying = useRef(0);
  const flyTo = (widgetId: string) => {
    flying.current = Date.now() + 1200;
    goToTurnWidget(widgetId);
  };

  const top = items.find((item) => item.key === topKey) ?? items[0];

  /* The list is computed, so "done" is an item that stopped being there.
     Keep it on screen for the moment it takes to be struck and dropped. */
  useEffect(() => {
    const before = prev.current;
    prev.current = { room: roomKey, items };
    if (before.room !== roomKey) {
      setLeaving([]);
      setCleared(false);
      setAll(false);
      setTopKey("");
      setDraft("");
      setOpen(startOpen());
      return;
    }
    const gone = before.items
      .filter((item) => !items.some((next) => next.key === item.key))
      .map((item) => ({ item, wasTop: item.key === lastTop.current }));
    if (items.some((item) => !before.items.some((old) => old.key === item.key))) {
      // something new needs you: the pile comes back on its own
      setOpen(true);
      setCleared(false);
    }
    if (gone.length === 0) return;
    setLeaving((current) => [...current, ...gone]);
    setDraft("");
    const keys = gone.map(({ item }) => item.key);
    // timers are left to run: a second card finishing mid-exit must not strand the first
    window.setTimeout(
      () => setLeaving((current) => current.filter(({ item }) => !keys.includes(item.key))),
      LEAVE_MS,
    );
    if (items.length === 0) {
      setCleared(true);
      window.setTimeout(() => setCleared(false), CLEAR_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, roomKey]);

  // after the effect above, so it reads which card was on top a render ago
  useEffect(() => {
    lastTop.current = top?.key ?? "";
  });

  // the entrance waits for the room's own; later cards don't
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  /* Once you start using the board the pile gets out of the way; it comes
     back on its own only when something new needs you. The header scrolls
     off with the board, so a pan tucks it too (that covers "take me there"). */
  useEffect(() => {
    if (!open || !settled || param === "open") return;
    const tuck = (event: Event) => {
      // the pile's own "take me there" pans the board; that isn't you leaving
      if (event.type === "scroll" && Date.now() < flying.current) return;
      const target = event.target as Element | null;
      if (rootRef.current?.contains(target)) return;
      if (event.type === "scroll" ? !target?.classList?.contains("space-scroll") : !target?.closest(".space-canvas, .widget-group")) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", tuck, true);
    document.addEventListener("scroll", tuck, true);
    return () => {
      window.removeEventListener("pointerdown", tuck, true);
      document.removeEventListener("scroll", tuck, true);
    };
  }, [open, param, settled]);

  const rows = useMemo<Row[]>(() => {
    const shown = all ? items : items.slice(0, TURN_SHOWN);
    const rest = shown.filter((item) => item.key !== top?.key);
    return [
      ...leaving.map(({ item, wasTop }) => ({ item, done: true, wasTop })),
      ...(top ? [{ item: top, done: false, wasTop: false }] : []),
      ...rest.map((item) => ({ item, done: false, wasTop: false })),
    ];
  }, [all, items, leaving, top]);

  if (rows.length === 0 && !cleared) return null;

  const guest = viewer.standing === "guest";
  // a phone shows one card at a time, so everything else is "more"
  const phone = window.matchMedia(PHONE).matches;
  const more = items.length - Math.min(items.length, phone ? 1 : TURN_SHOWN);
  const label = guest ? "jump in" : "your turn";

  const choose = (item: TurnItem, choice: string) => {
    setPicked((current) => ({ ...current, [item.key]: choice }));
    if (item.act === "vote") onVote?.(item.widgetId, choice);
    if (item.act === "rsvp") onRsvp?.(item.widgetId, choice as "yes" | "maybe" | "no");
    if (item.act === "claim") onClaim?.(item.widgetId, choice);
    if (item.act === "days") onDays?.(item.widgetId, Number(choice));
  };

  const answer = (event: FormEvent, item: TurnItem) => {
    event.preventDefault();
    const text = draft.trim();
    if (text) onAnswer?.(item.widgetId, text);
  };

  return (
    <aside
      ref={rootRef}
      className={`your-turn${open ? " is-open" : " is-tucked"}${guest ? " is-guest" : ""}${all ? " is-all" : ""}${settled ? " is-settled" : ""}`}
      data-testid="your-turn"
      data-count={items.length}
    >
      {rows.length === 0 ? (
        <p className="yt-clear" data-testid="your-turn-clear">
          <span className="yt-clear-mark" aria-hidden="true">
            ✓
          </span>
          {guest ? "you're in on all of it" : "that's you done"}
        </p>
      ) : (
        <>
          <button
            type="button"
            className="yt-tab"
            data-testid="your-turn-tab"
            onClick={() => setOpen((value) => !value)}
            title={open ? "tuck away" : label}
          >
            <span>{label}</span>
            {items.length > 0 && <b>{items.length}</b>}
            {top && <i>{top.title}</i>}
          </button>
          <ol className="yt-pile">
            {rows.map(({ item, done, wasTop }, index) => {
              const isTop = !done && item.key === top?.key;
              const unfolded = isTop || (done && wasTop);
              return (
                <li
                  key={item.key}
                  className={`yt-item kind-${item.kind}${unfolded ? " is-top" : ""}${done ? " is-done" : ""}${item.soft ? " is-soft" : ""}`}
                  data-testid="your-turn-item"
                  data-kind={item.kind}
                  style={{ "--i": Math.max(0, index - leaving.length) } as CSSProperties}
                >
                  <button
                    type="button"
                    className="yt-go"
                    data-testid="your-turn-go"
                    title={isTop ? "show me the card" : undefined}
                    onClick={() => {
                      // a card behind comes to the front; the front one flies you to its widget
                      if (!isTop) {
                        setTopKey(item.key);
                        setDraft("");
                        return;
                      }
                      flyTo(item.widgetId);
                    }}
                  >
                    <span className="yt-verb">{done ? "done ✓" : item.verb}</span>
                    <span className="yt-name">{item.title}</span>
                    <span className="yt-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </button>
                  <div className="yt-fold">
                    <div className="yt-fold-in">
                      <p className="yt-meta">
                        {item.when && <em>{item.when}</em>}
                        <span>{item.waiting}</span>
                      </p>
                      {item.act === "answer" ? (
                        <form className="yt-answer" onSubmit={(event) => answer(event, item)}>
                          <input
                            value={isTop ? draft : ""}
                            onChange={(event) => setDraft(event.target.value)}
                            placeholder="your answer…"
                            data-testid="your-turn-answer"
                            disabled={!isTop}
                          />
                          <button type="submit" disabled={!isTop || !draft.trim()}>
                            send
                          </button>
                        </form>
                      ) : item.act !== "go" && item.choices.length > 0 ? (
                        <div className="yt-choices">
                          {item.choices.map((choice) => (
                            <button
                              key={choice.id}
                              type="button"
                              className={picked[item.key] === choice.id ? "is-picked" : ""}
                              data-testid="your-turn-choice"
                              data-choice={choice.id}
                              disabled={!isTop}
                              onClick={() => choose(item, choice.id)}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="yt-choices">
                          <button type="button" disabled={!isTop} onClick={() => flyTo(item.widgetId)}>
                            take me there
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {guest && <p className="yt-guest-note">nothing's on you yet</p>}
          {more > 0 && (
            <button
              type="button"
              className="yt-more"
              data-testid="your-turn-more"
              onClick={() => {
                // a phone shows one card: +N deals the next one instead
                if (phone && top) {
                  const next = items[(items.indexOf(top) + 1) % items.length];
                  setAll(true);
                  setTopKey(next.key);
                  setDraft("");
                  return;
                }
                setAll((value) => !value);
              }}
            >
              {all && !phone ? "fewer" : `+${more}`}
            </button>
          )}
        </>
      )}
    </aside>
  );
}
