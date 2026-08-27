import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage } from "../data/chat";
import { playSound } from "../lib/sounds";
import { MemberFace } from "./MemberFace";

export function ThreadContent({
  messages,
  label,
  onSend,
  onPromote,
  promoted = false,
  emptyText = "Start the thread.",
  placeholder,
  highlightMessageId,
  actions,
}: {
  messages: ChatMessage[];
  label: string;
  onSend: (text: string) => void;
  onPromote?: () => void;
  promoted?: boolean;
  emptyText?: string;
  placeholder?: string;
  /** Message "catch me up" sent you here to find. */
  highlightMessageId?: string;
  /** Widget quick actions (e.g. rsvp chips) rendered above the composer. */
  actions?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!highlightMessageId) return;
    listRef.current
      ?.querySelector(`[data-message-id="${highlightMessageId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightMessageId]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    playSound("place");
    onSend(text);
    setDraft("");
  };

  return (
    <div className="thread-content">
      <ul className="thread-message-list" ref={listRef}>
        {messages.length === 0 && (
          <li className="thread-empty">
            <span aria-hidden="true">💬</span>
            <strong>{emptyText}</strong>
            <p>Say something everyone can come back to.</p>
          </li>
        )}
        {messages.map((message) =>
          message.kind === "system" ? (
            <li
              key={message.id}
              className="thread-system-line"
              data-message-id={message.id}
            >
              <i aria-hidden="true" />
              {message.text}
            </li>
          ) : (
          <li
            key={message.id}
            className={`thread-message ${message.promotable ? "is-promotable" : ""} ${
              message.id === highlightMessageId ? "is-recap-found" : ""
            }`}
            data-message-id={message.id}
          >
            <div className="thread-message-author">
              <MemberFace
                name={message.from}
                emoji={message.fromEmoji}
                color={message.fromColor}
                avatarUrl={message.fromAvatarUrl}
                size="xs"
              />
              <strong>{message.from}</strong>
              <span>{message.time}</span>
            </div>
            <p>{message.text}</p>
            {message.promotable && onPromote && (
              <button
                type="button"
                className="promote-button"
                onClick={onPromote}
                disabled={promoted}
              >
                {promoted ? "saved to canvas ✓" : "save as decision ↗"}
              </button>
            )}
          </li>
          ),
        )}
      </ul>

      {actions && <div className="thread-actions">{actions}</div>}

      <div className="thread-composer">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
          placeholder={placeholder ?? `reply on ${label}…`}
          aria-label={`Reply on ${label}`}
        />
        <button type="button" onClick={send} aria-label="Send message">
          ↑
        </button>
      </div>
    </div>
  );
}
