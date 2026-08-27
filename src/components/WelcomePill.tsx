import { useEffect, useRef, useState } from "react";

const WELCOME_KEY = "ourspaces:welcome-dismissed";

function wasDismissed() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(WELCOME_KEY) === "done";
}

export function WelcomePill() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const visibleRef = useRef(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (wasDismissed()) return;

    let showTimer = 0;
    let hideTimer = 0;

    const dismiss = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      window.sessionStorage.setItem(WELCOME_KEY, "done");

      if (!visibleRef.current) {
        window.clearTimeout(showTimer);
        return;
      }

      setLeaving(true);
      hideTimer = window.setTimeout(() => setVisible(false), 200);
    };

    showTimer = window.setTimeout(() => {
      if (leavingRef.current) return;
      visibleRef.current = true;
      setVisible(true);
    }, 1100);

    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`welcome-pill${leaving ? " is-leaving" : ""}`} role="status">
      <span>this is the crew's space — everything on it is live.</span>
      <span>try the cake poll.</span>
      <button type="button" aria-label="Dismiss welcome note">
        ×
      </button>
    </div>
  );
}
