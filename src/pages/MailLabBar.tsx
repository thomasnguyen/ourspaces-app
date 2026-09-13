import "./labs.css";
import type { MailKind } from "../lib/mailArrival";

/**
 * The #/mail lab's pill — the real space with fixtures fired at it. Lazy,
 * so labs.css only loads on the lab. Never on camera.
 */
const KINDS: MailKind[] = ["receipt", "booking", "letter", "unfiled", "spam"];

export function MailLabBar({
  slow,
  onSlow,
  onFire,
  onReplay,
  onClear,
}: {
  slow: boolean;
  onSlow: () => void;
  onFire: (kind: MailKind) => void;
  onReplay: () => void;
  onClear: () => void;
}) {
  return (
    <div className="arrival-lab-bar mail-lab-bar">
      <span className="arrival-lab-kicker">mail lab</span>
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={kind === "receipt" ? "is-main" : ""}
          onClick={() => onFire(kind)}
        >
          {kind}
        </button>
      ))}
      <i aria-hidden="true" />
      <button type="button" className={slow ? "is-on" : ""} onClick={onSlow}>
        {slow ? "¼ speed · on" : "¼ speed"}
      </button>
      <button type="button" onClick={onReplay}>replay</button>
      <button type="button" onClick={onClear}>clear</button>
    </div>
  );
}
