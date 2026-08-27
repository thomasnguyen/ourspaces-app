import { useState, type FormEvent } from "react";

export type ChatMessage = {
  _id: string;
  text: string;
  authorName: string;
  authorColor: string;
  promotedWidgetId?: string;
};

type ChatProps = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onPromote: (messageId: string) => void;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Chat({ messages, onSend, onPromote }: ChatProps) {
  const [draft, setDraft] = useState("");

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <article className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-card bg-rail text-ink shadow-[6px_6px_0_var(--color-sticker)]">
      <header className="relative shrink-0 border-b border-white/10 px-5 pb-4 pt-5">
        <span className="absolute right-5 top-4 -rotate-3 rounded-pill bg-lime px-3 py-1 text-[0.64rem] font-extrabold uppercase tracking-[0.11em] text-sticker">
          live now
        </span>
        <p className="mb-1 text-[0.66rem] font-bold uppercase tracking-[0.13em] text-muted">the room</p>
        <h2 className="font-display text-[1.35rem] font-extrabold leading-none tracking-[-0.04em]">crew chat</h2>
        <p className="mt-2 text-xs font-semibold text-muted">say it here, keep it on the wall</p>
      </header>

      <ul className="m-0 min-h-0 flex-1 list-none space-y-4 overflow-y-auto px-4 py-5 [scrollbar-color:var(--color-muted)_transparent]">
        {messages.length === 0 && (
          <li className="grid h-full place-items-center px-5 text-center">
            <div>
              <span className="mb-3 block text-3xl" aria-hidden="true">💬</span>
              <strong className="block text-sm font-extrabold">start the hang</strong>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-muted">Drop a thought for everyone to pick up.</p>
            </div>
          </li>
        )}

        {messages.map((message, index) => {
          const promoted = Boolean(message.promotedWidgetId);
          return (
            <li key={message._id} className="group relative flex gap-2.5">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-rail text-[0.6rem] font-extrabold text-sticker shadow-[2px_2px_0_var(--color-sticker)]"
                style={{ backgroundColor: message.authorColor }}
                title={message.authorName}
              >
                {initials(message.authorName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline gap-2">
                  <strong className="truncate text-xs font-extrabold">{message.authorName}</strong>
                  <span className="shrink-0 text-[0.62rem] font-semibold text-muted">{index === messages.length - 1 ? "now" : "earlier"}</span>
                </div>
                <div className="relative inline-block max-w-full rounded-[17px] rounded-tl-[5px] bg-base px-3.5 py-2.5">
                  <p className="break-words text-[0.78rem] font-semibold leading-relaxed text-white/90">{message.text}</p>
                  {promoted ? (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-lime/15 px-2 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.06em] text-lime">
                      <span aria-hidden="true">✓</span> on the canvas
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPromote(message._id)}
                      className="absolute -right-2 -top-3 translate-y-1 rounded-pill bg-sticker px-2.5 py-1.5 text-[0.6rem] font-extrabold text-white opacity-0 shadow-[2px_2px_0_var(--color-rail)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-lime hover:text-sticker group-hover:translate-y-0 group-hover:opacity-100"
                    >
                      → canvas
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={send} className="shrink-0 border-t border-white/10 bg-base/45 p-3">
        <div className="flex items-center gap-2 rounded-pill bg-base px-2 py-1.5 ring-1 ring-white/10 focus-within:ring-lime/70">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="say something…"
            aria-label="Send a chat message"
            className="min-w-0 flex-1 bg-transparent px-2 text-xs font-semibold text-white outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            aria-label="Send message"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime text-lg font-extrabold leading-none text-sticker transition-transform hover:-rotate-6 hover:scale-105"
          >
            ↑
          </button>
        </div>
      </form>
    </article>
  );
}

