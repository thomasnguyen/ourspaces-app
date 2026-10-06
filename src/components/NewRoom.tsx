import { useState, type CSSProperties } from "react";
import { inviteUrlForSpace } from "../lib/routes";
import "./newRoom.css";

/**
 * A room someone just made (N1, nebius/eval/n1-new-space.md). Two small
 * things on the live page, nothing else:
 * - `NewRoomStart`: the empty board says "say the first thing" with three
 *   starter asks; a tap plays the words into the orb as if they were said.
 * - `NewRoomInvite`: once the first card is up and it's still only you, the
 *   invite link one tap away.
 */

/** The tour's three, in the tour's order (OrbHint.tsx): the first builds the dinner pair. */
export const STARTER_ASKS = [
  "plan dinner saturday",
  "start a push-up challenge for us",
  "who's in this group?",
] as const;

export function NewRoomStart({ roomName, onAsk }: { roomName: string; onAsk: (words: string) => void }) {
  return (
    <div className="new-room-start" data-testid="new-room-empty">
      <p className="new-room-kicker">{roomName} · just made</p>
      <h2>say the first thing</h2>
      <p className="new-room-sub">tap the orb and talk, or try one:</p>
      <ul>
        {STARTER_ASKS.map((words, i) => (
          <li key={words} style={{ "--i": i } as CSSProperties}>
            <button type="button" data-testid={`new-room-starter-${i}`} onClick={() => onAsk(words)}>
              “{words}”
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewRoomInvite({ slug, first, onClose }: { slug: string; first: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrlForSpace(slug);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };
  const canShare = typeof navigator.share === "function" && window.matchMedia("(max-width: 800px)").matches;
  return (
    <div className={`new-room-invite ${first ? "is-first" : ""}`} data-testid="new-room-invite">
      <p>
        <b>{first ? "first card’s up." : "it’s just you in here."}</b> it gets good when your people are in.
      </p>
      <button type="button" className="new-room-invite-copy" data-testid="new-room-invite-copy" onClick={canShare ? () => void navigator.share({ url }).catch(() => {}) : copy}>
        {copied ? "copied!" : canShare ? "send the link" : "copy invite link"}
      </button>
      <button type="button" className="new-room-invite-close" aria-label="not now" data-testid="new-room-invite-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
