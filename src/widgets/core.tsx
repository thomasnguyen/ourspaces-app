import { memo, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  CSSProperties,
  KeyboardEventHandler,
  PointerEventHandler,
} from "react";
import { getStickerDefinition } from "../data/stickers";
import type { Widget } from "../data/types";
import { MemberFace } from "../components/MemberFace";
import { playSound } from "../lib/sounds";

type Style = CSSProperties;

export function StickerWidget({ widget, style }: { widget: Widget; style: Style }) {
  const sticker = getStickerDefinition(widget.data.stickerId);
  if (!sticker) return null;

  return (
    <div className="widget-shell widget-sticker" style={style}>
      <img
        src={sticker.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
      />
    </div>
  );
}

export function FrameWidget({
  widget,
  style,
  focused = false,
  editing = false,
  onFocus,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  onMovePointerCancel,
  onMoveKeyDown,
}: {
  widget: Widget;
  style: Style;
  focused?: boolean;
  editing?: boolean;
  onFocus?: () => void;
  onMovePointerDown?: PointerEventHandler<HTMLButtonElement>;
  onMovePointerMove?: PointerEventHandler<HTMLButtonElement>;
  onMovePointerUp?: PointerEventHandler<HTMLButtonElement>;
  onMovePointerCancel?: PointerEventHandler<HTMLButtonElement>;
  onMoveKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const title = String(widget.data.title ?? "frame");

  return (
    <div
      className={`widget-shell widget-frame ${focused ? "is-focused" : ""} ${
        editing ? "is-editing" : ""
      }`}
      style={style}
    >
      <button
        type="button"
        className="frame-label"
        onClick={editing ? undefined : onFocus}
        onPointerDown={editing ? onMovePointerDown : undefined}
        onPointerMove={editing ? onMovePointerMove : undefined}
        onPointerUp={editing ? onMovePointerUp : undefined}
        onPointerCancel={editing ? onMovePointerCancel : undefined}
        onKeyDown={editing ? onMoveKeyDown : undefined}
        aria-label={
          editing
            ? `Move ${title} frame. Use arrow keys for precise movement.`
            : `${focused ? "Leave" : "Focus"} ${title} frame`
        }
        aria-pressed={editing ? undefined : focused}
        title={editing ? "Drag to move frame" : undefined}
      >
        <span className="presence-pulse" aria-hidden="true" />
        <span className="frame-label-copy">{title}</span>
        <span className="frame-focus-arrow" aria-hidden="true">
          {editing ? "⠿" : "↗"}
        </span>
      </button>
      <span className="frame-subtitle">
        {String(widget.data.subtitle ?? "shared corner")}
      </span>
    </div>
  );
}

const DAY_MS = 86_400_000;
const MAX_STRIP_SEGMENTS = 14;

const pad2 = (n: number) => String(n).padStart(2, "0");

function localMidnight(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

export function CountdownWidget({ widget, style }: { widget: Widget; style: Style }) {
  const targetDate =
    typeof widget.data.targetDate === "string" ? widget.data.targetDate : null;
  const startDate =
    typeof widget.data.startDate === "string" ? widget.data.startDate : null;
  const event = typeof widget.data.event === "string" ? widget.data.event : null;
  const tone = typeof widget.data.tone === "string" ? widget.data.tone : "violet";
  const hyped = Array.isArray(widget.data.hyped)
    ? (widget.data.hyped as string[])
    : [];

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const target = targetDate ? localMidnight(targetDate) : null;
  const remaining = target !== null ? target - now : null;
  const isToday = remaining !== null && remaining <= 0;
  const liveDays =
    remaining !== null ? Math.max(0, Math.floor(remaining / DAY_MS)) : null;

  const value =
    liveDays !== null ? String(liveDays) : String(widget.data.value ?? 7);
  const unit =
    liveDays !== null
      ? liveDays === 1
        ? "day!"
        : "days!"
      : String(widget.data.unit ?? "days!");

  const rest = remaining !== null && remaining > 0 ? remaining % DAY_MS : 0;
  const tick = `+ ${pad2(Math.floor(rest / 3_600_000))}h ${pad2(
    Math.floor((rest % 3_600_000) / 60_000),
  )}m ${pad2(Math.floor((rest % 60_000) / 1000))}s`;

  const dateLabel = isToday
    ? "today"
    : target !== null
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
          .format(target)
          .toLowerCase()
      : String(widget.data.date ?? "soon");

  // day-strip: one segment per day between start and target, capped; done = elapsed share
  let segments: Array<"done" | "now" | "todo"> | null = null;
  if (target !== null && startDate) {
    const totalDays = Math.max(
      1,
      Math.round((target - localMidnight(startDate)) / DAY_MS),
    );
    const count = Math.min(totalDays, MAX_STRIP_SEGMENTS);
    const elapsed = Math.min(totalDays, Math.max(0, totalDays - (liveDays ?? 0)));
    const done = isToday ? count : Math.round((elapsed / totalDays) * count);
    segments = Array.from({ length: count }, (_, i) =>
      i < done ? "done" : i === done && !isToday ? "now" : "todo",
    );
  }

  // digit rollover: when the number flips, the old one rolls out and the new one springs in
  const display = isToday ? "today" : value;
  const [shown, setShown] = useState(display);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  useEffect(() => {
    if (display === shown) return;
    setOutgoing(shown);
    setShown(display);
    const id = setTimeout(() => setOutgoing(null), 520);
    return () => clearTimeout(id);
  }, [display, shown]);

  return (
    <div
      className={`widget-shell widget-countdown${
        tone !== "violet" ? ` cd-tone-${tone}` : ""
      }${isToday ? " is-today" : ""}`}
      style={style}
    >
      <div className="countdown-top">
        {event && <span className="countdown-event">{event}</span>}
        <span className="countdown-date">{dateLabel}</span>
      </div>
      <span className="countdown-number-wrap">
        {outgoing !== null && (
          <span className="countdown-number is-roll-out" aria-hidden="true">
            {outgoing}
          </span>
        )}
        <span
          key={shown}
          className={`countdown-number${outgoing !== null ? " is-roll-in" : ""}${
            isToday ? " is-today-word" : ""
          }`}
        >
          {shown}
        </span>
      </span>
      <span className="countdown-unit">{isToday ? "it's here 🎉" : unit}</span>
      {targetDate && (
        <span className="countdown-tick">
          {isToday ? "hope it's a good one" : tick}
        </span>
      )}
      {hyped.length > 0 && (
        <span className="countdown-hype">
          {hyped.slice(0, 3).map((name) => (
            <MemberFace key={name} name={name} size="xs" />
          ))}
          <em>{hyped.length} hyped</em>
        </span>
      )}
      {segments && (
        <span className="countdown-strip" aria-hidden="true">
          {segments.map((state, i) => (
            <i key={i} className={state === "todo" ? "" : `is-${state}`} />
          ))}
        </span>
      )}
    </div>
  );
}

function PollWidgetComponent({
  widget,
  style,
  selectedOptionId,
  onVote,
}: {
  widget: Widget;
  style: Style;
  selectedOptionId?: string;
  onVote?: (optionId: string) => void;
}) {
  const options = useMemo(() => widget.data.options as {
    id: string;
    label: string;
    votes: number;
    total: number;
    voters?: string[];
  }[], [widget.data.options]);
  const waitingOn = (widget.data.waitingOn as string[] | undefined) ?? [];
  const tone = String(widget.data.tone ?? "blush");

  const { hasLocalVote, totalVotes, leadingVotes } = useMemo(
    () => {
      const localVote = Boolean(selectedOptionId);
      return {
        hasLocalVote: localVote,
        totalVotes:
          options.reduce((sum, option) => sum + option.votes, 0) +
          (localVote ? 1 : 0),
        leadingVotes: Math.max(
          0,
          ...options.map(
            (option) =>
              option.votes + (selectedOptionId === option.id ? 1 : 0),
          ),
        ),
      };
    },
    [options, selectedOptionId],
  );

  return (
    <div className={`widget-shell widget-poll poll-tone-${tone}`} style={style}>
      <div className="poll-pin" aria-hidden="true" />
      <div className="poll-content">
        <div className="poll-heading">
          <h3>{String(widget.data.question)}</h3>
          <span className="live-label">
            <i className="live-dot" aria-hidden="true" />
            live
          </span>
        </div>
        <ul className="poll-options">
          {options.map((option) => {
            const selected = selectedOptionId === option.id;
            const votes = option.votes + (selected ? 1 : 0);
            const total = option.total + (hasLocalVote ? 1 : 0);
            const percent = Math.round((votes / Math.max(total, 1)) * 100);
            const voters = option.voters ?? [];
            const shownVoters = voters.slice(0, 3);
            const extraVoters = voters.length - shownVoters.length;
            const leading = totalVotes > 0 && votes === leadingVotes && votes > 0;

            return (
              <li
                key={option.id}
                className={`${selected ? "is-selected" : ""} ${leading ? "is-leading" : ""}`}
              >
                <button
                  type="button"
                  className="poll-row"
                  onClick={() => onVote?.(option.id)}
                  aria-label={`Vote for ${option.label}`}
                  aria-pressed={selected}
                >
                  {totalVotes > 0 && (
                    <span
                      className="poll-row-fill"
                      aria-hidden="true"
                      style={{ width: `${percent}%` }}
                    />
                  )}
                  <span className="poll-check" />
                  <span className="poll-option-label">{option.label}</span>
                  {selected && <span className="poll-you-tag">you</span>}
                  {shownVoters.length > 0 && (
                    <span className="poll-row-faces" aria-hidden="true">
                      {shownVoters.map((name) => (
                        <MemberFace key={name} name={name} size="xs" />
                      ))}
                      {extraVoters > 0 && <span className="poll-row-more">+{extraVoters}</span>}
                    </span>
                  )}
                  {totalVotes > 0 && (
                    <span className="poll-votes" key={votes}>
                      {votes}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {totalVotes === 0 ? (
          <p className="poll-empty">no votes yet — you first?</p>
        ) : (
          waitingOn.length > 0 && (
            <div className="poll-footer">
              <span className="poll-footer-faces">
                {waitingOn.map((name) => (
                  <MemberFace key={name} name={name} size="xs" />
                ))}
              </span>
              {totalVotes} voted · waiting on {waitingOn.join(" + ")}
            </div>
          )
        )}
      </div>
    </div>
  );
}

export const PollWidget = memo(PollWidgetComponent);

export function PotluckWidget({
  widget,
  style,
  onClaim,
  claimantId,
}: {
  widget: Widget;
  style: Style;
  onClaim?: (itemName: string) => void;
  claimantId?: string;
}) {
  const items = widget.data.items as {
    name: string;
    by?: string | null;
    claimed: boolean;
    byUserId?: string;
  }[];
  const tone = String(widget.data.tone ?? "mint");
  const [myClaims, setMyClaims] = useState<Record<string, boolean>>({});
  const claimedItems = items.filter((item) => item.claimed || myClaims[item.name]);
  const openItems = items.filter((item) => !item.claimed && !myClaims[item.name]);
  const coveredCount = claimedItems.length;
  const totalCount = items.length;

  const toggleClaim = (name: string) => {
    setMyClaims((current) => ({ ...current, [name]: !current[name] }));
    playSound("place");
  };

  return (
    <div className={`widget-shell widget-potluck potluck-tone-${tone}`} style={style}>
      <span className="paper-clip" aria-hidden="true" />
      <span className="potluck-sparkle potluck-sparkle-large" aria-hidden="true">✦</span>
      <span className="potluck-sparkle potluck-sparkle-small" aria-hidden="true">✦</span>
      <div className="potluck-content">
        <div className="potluck-heading">
          <div>
            <span className="potluck-kicker">party prep</span>
            <h3>{String(widget.data.title)}</h3>
          </div>
          <span className="potluck-count">
            {coveredCount} covered
          </span>
        </div>
        <div className="potluck-progress" aria-live="polite">
          <strong>{coveredCount}/{totalCount || 0}</strong>
          <span>{openItems.length === 0 && totalCount > 0 ? "all set" : `${openItems.length} still open`}</span>
          <span className="potluck-meter" aria-hidden="true">
            {Array.from({ length: Math.max(1, totalCount) }, (_, index) => (
              <i key={index} className={index < coveredCount ? "is-covered" : ""} />
            ))}
          </span>
        </div>
        {items.length > 0 ? (
          <ul className="potluck-list">
            {items.map((item) => {
              const mine = onClaim
                ? Boolean(claimantId && item.byUserId === claimantId)
                : Boolean(myClaims[item.name]);
              const claimed = item.claimed || mine;
              const claimant = mine ? "You" : item.by;

              return (
                <li
                  key={item.name}
                  className={`${claimed ? "is-claimed" : ""}${mine ? " is-yours" : ""}`}
                >
                  <span className="claim-mark" aria-hidden="true">{claimed ? "✓" : "+"}</span>
                  <span className="potluck-item-copy">
                    <strong>{item.name}</strong>
                    {claimed && claimant && (
                      <small>{mine ? "you've got it" : `by ${claimant}`}</small>
                    )}
                  </span>
                  {claimed ? (
                    mine ? (
                      <button
                        type="button"
                        className="potluck-release"
                        onClick={() => (onClaim ? onClaim(item.name) : toggleClaim(item.name))}
                      >
                        release
                      </button>
                    ) : (
                      <MemberFace name={String(claimant)} size="xs" />
                    )
                  ) : (
                    <button
                      type="button"
                      className="potluck-claim"
                      onClick={() => (onClaim ? onClaim(item.name) : toggleClaim(item.name))}
                    >
                      claim
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="potluck-empty">
            <span aria-hidden="true">✦</span>
            <p>nothing on the list yet — add the first thing.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatWidget({
  widget,
  style,
  onPromote,
  promoted,
}: {
  widget: Widget;
  style: Style;
  onPromote?: () => void;
  promoted?: boolean;
}) {
  const messages = widget.data.messages as {
    from: string;
    text: string;
    time: string;
    promotable?: boolean;
  }[];
  const [localMessages, setLocalMessages] = useState<typeof messages>([]);
  const [draft, setDraft] = useState("");
  const [localPromoted, setLocalPromoted] = useState(false);
  const allMessages = [...messages, ...localMessages];
  const hasPromoted = Boolean(promoted || localPromoted);
  const messagesRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const messageList = messagesRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [allMessages.length]);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setLocalMessages((current) => [...current, { from: "You", text, time: "now" }]);
    setDraft("");
    playSound("tap");
  };

  const promote = () => {
    onPromote?.();
    setLocalPromoted(true);
    playSound("promote");
  };

  return (
    <div className="widget-shell widget-chat" style={style}>
      <div className="chat-heading">
        <div className="chat-heading-title">
          <i className="chat-live-dot" aria-hidden="true" />
          <span>space chat</span>
        </div>
        <div className="chat-heading-meta">
          <span>{allMessages.length} messages</span>
          <span className="live-label">live</span>
        </div>
      </div>
      <ul ref={messagesRef} className="chat-messages">
        {allMessages.map((message, index) => (
          <li
            key={`${message.from}-${message.text}-${index}`}
            className={`${message.from === "You" ? "is-you" : ""}${index === allMessages.length - 1 ? " is-newest" : ""}`}
          >
            <div className="chat-author">
              <MemberFace name={message.from} size="xs" />
              <strong>{message.from}</strong>
              <span>{message.time}</span>
            </div>
            <p className="chat-bubble">{message.text}</p>
            {message.promotable && (
              <button
                type="button"
                className="promote-button"
                onClick={promote}
                disabled={hasPromoted}
              >
                {hasPromoted ? "✓ on the wall" : "↗ save to wall"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="chat-composer" onSubmit={sendMessage}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="say something…"
          aria-label="say something"
        />
        <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
          ↑
        </button>
      </form>
    </div>
  );
}

export function NoteWidget({ widget, style }: { widget: Widget; style: Style }) {
  const tone = String(widget.data.tone ?? "white");
  const [remembered, setRemembered] = useState(Boolean(widget.data.remembered));
  const promoted = Boolean(widget.data.promoted);
  const author = String(widget.data.author ?? "someone");

  const toggleRemembered = () => {
    setRemembered((current) => !current);
    playSound("tap");
  };

  const rememberButton = (
    <button
      type="button"
      className={`note-remember${remembered ? " is-remembered" : ""}`}
      onClick={toggleRemembered}
      aria-pressed={remembered}
    >
      {remembered ? "remembered ✓" : "remember this"}
    </button>
  );

  if (tone === "crew") {
    return (
      <div className={`widget-shell widget-poster${promoted ? " is-promoted" : ""}${remembered ? " is-remembered" : ""}`} style={style}>
        <span className="poster-stamp">{promoted ? "saved from chat" : "today"}</span>
        <div className="note-copy">
          <p>{String(widget.data.text)}</p>
          <span className="note-source">— {author}</span>
        </div>
        <div className="note-footer">
          <span>answer on the wall →</span>
          {rememberButton}
        </div>
      </div>
    );
  }

  if (tone === "warm") {
    return (
      <div className={`widget-shell widget-sticky${promoted ? " is-promoted" : ""}${remembered ? " is-remembered" : ""}`} style={style}>
        <span className="sticky-tape" aria-hidden="true" />
        <span className="sticky-mark">“</span>
        <span className="note-kicker">{promoted ? "saved from chat" : String(widget.data.kicker ?? "a thing to remember")}</span>
        <p>{String(widget.data.text)}</p>
        <div className="note-footer">
          <span className="note-author">— {author}</span>
          {rememberButton}
        </div>
      </div>
    );
  }

  return (
    <div className={`widget-shell widget-torn-note${promoted ? " is-promoted" : ""}${remembered ? " is-remembered" : ""}`} style={style}>
      <span className="note-kicker">
        {promoted ? "saved from chat" : String(widget.data.kicker ?? "summer maybe?")}
      </span>
      <p>{String(widget.data.text)}</p>
      <div className="note-footer">
        <span className="note-author">— {author}</span>
        {rememberButton}
      </div>
    </div>
  );
}

export function MediaWidget({ widget, style }: { widget: Widget; style: Style }) {
  return (
    <figure className="widget-shell widget-photo" style={style}>
      <span className="photo-tape photo-tape-left" aria-hidden="true" />
      <span className="photo-tape photo-tape-right" aria-hidden="true" />
      <img
        src={String(
          widget.data.thumbnailSrc ??
            widget.data.src ??
            "/assets/the-crew-snapshot-thumb.jpg",
        )}
        alt={String(widget.data.caption)}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = "/assets/the-crew-snapshot-thumb.jpg";
        }}
      />
      <figcaption>
        <strong>{String(widget.data.caption)}</strong>
        <span>{String(widget.data.date)}</span>
      </figcaption>
      <span className="photo-heart" aria-hidden="true">
        ♥
      </span>
    </figure>
  );
}
