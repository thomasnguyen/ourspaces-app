import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import "./orbHint.css";

/**
 * The orb hint (FM1b, nebius/eval/fm1b-first-minute-designer.md): one black
 * slip pinned above the orb the first time a browser lands in a tour room.
 * It names the move (tap the orb and talk), carries three starter asks that
 * play through the orb the way NewRoom's do, and folds into the orb on the
 * first ask or on tap. `?hint=1` forces it, `?hint=0` hides it; otherwise it
 * shows once per browser (localStorage). Test ids: `orb-hint`,
 * `orb-hint-starter-0..2`, `orb-hint-dismiss`.
 */

export const ORB_HINT_KEY = "ourspaces:orb-hint";

export const ORB_HINT_STARTERS = [
  "plan dinner saturday",
  "start a push-up challenge for us",
  "who's in this group?",
] as const;

const ORB = '[data-testid="dock-voice-orb"]';
/** The fold into the orb (orbHint.css `orb-hint-out`). */
const LEAVE_MS = 260;

export function orbHintWanted() {
  const param = new URLSearchParams(window.location.search).get("hint");
  if (param === "0") return false;
  if (param === "1") return true;
  try {
    return window.localStorage.getItem(ORB_HINT_KEY) !== "seen";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(ORB_HINT_KEY, "seen");
  } catch {
    /* private mode: it shows again next time, which is fine */
  }
}

export function OrbHint({
  roomName,
  onAsk,
  onGone,
}: {
  roomName: string;
  onAsk: (words: string) => void;
  onGone: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  /* Pinned to the orb: its centre x and the dock's top edge, re-read while
     the dock settles and on every resize. */
  const pin = useCallback(() => {
    const el = node.current;
    const orb = document.querySelector<HTMLElement>(ORB);
    if (!el || !orb) return;
    const r = orb.getBoundingClientRect();
    if (!r.width) return;
    el.style.setProperty("--orb-x", `${Math.round(r.left + r.width / 2)}px`);
    el.style.setProperty("--orb-top", `${Math.round(r.top)}px`);
  }, []);
  useLayoutEffect(() => {
    pin();
    const timers = [300, 900, 1600].map((ms) => window.setTimeout(pin, ms));
    window.addEventListener("resize", pin);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", pin);
    };
  }, [pin]);

  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    markSeen();
    setLeaving(true);
    window.setTimeout(onGone, LEAVE_MS);
  }, [onGone]);

  /* The first ask, however it starts (a tap on the orb, "say what to add",
     a starter): the dock strip leaves idle, or the stage comes up. */
  useEffect(() => {
    const dock = document.querySelector<HTMLElement>(".dock-voice");
    const check = () => {
      if (document.body.classList.contains("voice-stage-up") || (dock && !dock.classList.contains("is-idle"))) leave();
    };
    check();
    const watch = new MutationObserver(check);
    watch.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (dock) watch.observe(dock, { attributes: true, attributeFilter: ["class"] });
    return () => watch.disconnect();
  }, [leave]);

  return (
    <div
      ref={node}
      className={`orb-hint${leaving ? " is-leaving" : ""}`}
      data-testid="orb-hint"
      data-leaving={leaving ? "1" : "0"}
    >
      <p className="orb-hint-kicker">
        <i aria-hidden="true" />
        {roomName} · you're in
      </p>
      <h2>tap the orb and talk</h2>
      <p className="orb-hint-sub">say what you want on the board and it makes the card. or try one:</p>
      <ul>
        {ORB_HINT_STARTERS.map((words, i) => (
          <li key={words} style={{ "--i": i } as CSSProperties}>
            <button
              type="button"
              data-testid={`orb-hint-starter-${i}`}
              onClick={() => {
                onAsk(words);
                leave();
              }}
            >
              <span aria-hidden="true">▶</span>
              {words}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="orb-hint-dismiss" data-testid="orb-hint-dismiss" title="later" onClick={leave}>
        ×
      </button>
    </div>
  );
}
