import type { ChatMessage, ChatThread } from "../data/chat";
import { getGlobalThread, getThread } from "../data/chat";
import { getSpace } from "../data/spaces";
import { ThreadContent } from "./ThreadContent";

export function GlobalChatPanel({
  spaceId,
  open,
  activeThreadId,
  onToggle,
  onThreadChange,
  extraMessages = [],
  activeThreadLabel,
  onSendMessage,
  onPromote,
  promoted,
  highlightMessageId,
  title,
  messages,
  onSend,
}: {
  spaceId: string;
  open: boolean;
  activeThreadId: string;
  onToggle: () => void;
  onThreadChange: (widgetId: string) => void;
  extraMessages?: ChatMessage[];
  activeThreadLabel?: string;
  onSendMessage: (threadId: string, text: string) => void;
  onPromote?: () => void;
  promoted?: boolean;
  /** Message "catch me up" sent you here to find. */
  highlightMessageId?: string;
  title?: string;
  messages?: ChatMessage[];
  onSend?: (text: string) => void;
}) {
  const baseThread =
    activeThreadId === "global"
      ? getGlobalThread(spaceId)
      : getThread(spaceId, activeThreadId);

  const thread: ChatThread = {
    ...baseThread,
    label: activeThreadLabel ?? baseThread.label,
    messages: messages ?? [...baseThread.messages, ...extraMessages],
  };

  const isGlobal = activeThreadId === "global";

  if (!open) {
    return null;
  }

  return (
    <aside className="global-chat-panel" aria-label="Space chat">
      <header className="global-chat-header">
        <div>
          {isGlobal ? (
            <>
              <span className="global-chat-kicker">space chat</span>
              <h2>{title ?? getSpace(spaceId).name}</h2>
            </>
          ) : (
            <>
              <button
                type="button"
                className="global-chat-back"
                onClick={() => onThreadChange("global")}
              >
                ← everyone
              </button>
              <h2>{thread.label}</h2>
            </>
          )}
        </div>
        <button
          type="button"
          className="global-chat-close"
          onClick={onToggle}
          aria-label="Collapse chat"
        >
          →
        </button>
      </header>

      {!isGlobal && (
        <p className="global-chat-context">
          thread on this widget · click anything on the wall to switch
        </p>
      )}

      <ThreadContent
        key={activeThreadId}
        messages={thread.messages}
        label={thread.label}
        onSend={(text) => (onSend ? onSend(text) : onSendMessage(activeThreadId, text))}
        onPromote={onPromote}
        promoted={promoted}
        highlightMessageId={highlightMessageId}
        placeholder={isGlobal ? "say something…" : undefined}
        emptyText={isGlobal ? "Start the conversation." : undefined}
      />
    </aside>
  );
}
