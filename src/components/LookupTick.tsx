import { useEffect, useState } from "react";
import "./lookup.css";

/** The lookup's clock: a ticking numeral ("0.4s") from the moment this screen saw the wait. Typographic on
    purpose, no spinner (nebius/tavily/plan.md §4). `since` fixed = frozen, for the landed line. */
export function LookupTick({ since, frozenAt }: { since: number; frozenAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (frozenAt !== undefined) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [frozenAt]);
  const ms = Math.max(0, (frozenAt ?? now) - since);
  return (
    <b className="lookup-tick" data-testid="lookup-tick">
      {(ms / 1000).toFixed(1)}s
    </b>
  );
}

/** When this screen first saw a thing: a stable start for its tick. */
export function useSeenAt(key: string) {
  const [seen, setSeen] = useState<{ key: string; at: number }>(() => ({ key, at: Date.now() }));
  if (seen.key !== key) setSeen({ key, at: Date.now() });
  return seen.at;
}
