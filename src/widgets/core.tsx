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
  const isParty = widget.data.deco === "party";

  return (
    <div
      className={`widget-shell widget-frame ${focused ? "is-focused" : ""} ${
        editing ? "is-editing" : ""
      }`}
      style={style}
    >
      <svg className="frame-stitch" aria-hidden="true">
        <rect className="frame-stitch-rect" />
      </svg>
      {isParty && (
        <>
          <span className="frame-party-garland" aria-hidden="true">
            {/* two swags strung from the top border, flat die-cut pennants */}
            <svg viewBox="0 0 200 30" fill="none">
              <path
                d="M0 3 Q 50 27 100 4 Q 150 27 200 3"
                stroke="#4a3a40"
                strokeWidth="1.6"
                opacity="0.9"
              />
              {GARLAND_PENNANTS.map(([x, y], i) => (
                <path
                  key={i}
                  d={`M${x - 6} ${y} L${x + 6} ${y} L${x} ${y + 14} Z`}
                  fill={GARLAND_COLORS[i % GARLAND_COLORS.length]}
                />
              ))}
              <circle cx="0" cy="3" r="2.2" fill="#4a3a40" />
              <circle cx="100" cy="4" r="2.2" fill="#4a3a40" />
              <circle cx="200" cy="3" r="2.2" fill="#4a3a40" />
            </svg>
          </span>
          <span
            className="frame-party-garland is-right"
            aria-hidden="true"
          >
            {/* short answering swag on the far side of the cake sticker */}
            <svg viewBox="0 0 110 27" fill="none">
              <path
                d="M0 3 Q 55 24 110 3"
                stroke="#4a3a40"
                strokeWidth="1.6"
                opacity="0.9"
              />
              {GARLAND_PENNANTS_RIGHT.map(([x, y], i) => (
                <path
                  key={i}
                  d={`M${x - 5} ${y} L${x + 5} ${y} L${x} ${y + 12} Z`}
                  fill={GARLAND_COLORS[(i + 1) % GARLAND_COLORS.length]}
                />
              ))}
              <circle cx="0" cy="3" r="2.2" fill="#4a3a40" />
              <circle cx="110" cy="3" r="2.2" fill="#4a3a40" />
            </svg>
          </span>
          <span className="frame-party-confetti" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </>
      )}
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

/* Pennant anchors precomputed along the two garland dips (200×30 viewBox). */
const GARLAND_PENNANTS: Array<[number, number]> = [
  [18, 10.1],
  [38, 14.5],
  [62, 14.7],
  [82, 10.8],
  [118, 10.8],
  [138, 14.7],
  [162, 14.5],
  [182, 10.1],
];
// no white pennant — it would ghost against the frame's kraft mat
const GARLAND_COLORS = ["#e9369d", "#ffb800", "#13b8a6", "#7853ff"];
const GARLAND_PENNANTS_RIGHT: Array<[number, number]> = [
  [22, 9.7],
  [49.5, 13.4],
  [79.2, 11.5],
  [96.8, 7.4],
];

const DAY_MS = 86_400_000;
const MAX_TEAR_SEGMENTS = 14;

const pad2 = (n: number) => String(n).padStart(2, "0");

function localMidnight(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

/* One cell of the black clock chips — value changes roll through a clipped window. */
function ClockCell({ value, unit }: { value: string; unit: string }) {
  const [shown, setShown] = useState(value);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  useEffect(() => {
    if (value === shown) return;
    setOutgoing(shown);
    setShown(value);
    const id = setTimeout(() => setOutgoing(null), 220);
    return () => clearTimeout(id);
  }, [value, shown]);

  return (
    <span className="cd-cell">
      <span className="cd-cell-win">
        {outgoing !== null && (
          <span className="cd-cell-num is-out" aria-hidden="true">
            {outgoing}
          </span>
        )}
        <span
          key={shown}
          className={`cd-cell-num${outgoing !== null ? " is-in" : ""}`}
        >
          {shown}
        </span>
      </span>
      <span className="cd-cell-unit">{unit}</span>
    </span>
  );
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
  const hh = pad2(Math.floor(rest / 3_600_000));
  const mm = pad2(Math.floor((rest % 3_600_000) / 60_000));
  const ss = pad2(Math.floor((rest % 60_000) / 1000));

  const dateLabel = isToday
    ? "today"
    : target !== null
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
          .format(target)
          .toLowerCase()
      : String(widget.data.date ?? "soon");

  // tear-off row: one page stub per day between start and target, capped.
  // done = torn off (gap on the perforation), now = today's page, todo = still hanging
  let segments: Array<"done" | "now" | "todo"> | null = null;
  if (target !== null && startDate) {
    const totalDays = Math.max(
      1,
      Math.round((target - localMidnight(startDate)) / DAY_MS),
    );
    const count = Math.min(totalDays, MAX_TEAR_SEGMENTS);
    const elapsed = Math.min(totalDays, Math.max(0, totalDays - (liveDays ?? 0)));
    const done = isToday ? count : Math.round((elapsed / totalDays) * count);
    segments = Array.from({ length: count }, (_, i) =>
      i < done ? "done" : i === done && !isToday ? "now" : "todo",
    );
  }
  const tearSegments =
    segments ?? Array.from({ length: 12 }, () => "todo" as const);

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
      <span className="countdown-tear" aria-hidden="true">
        {tearSegments.map((state, i) => (
          <i key={i} className={state === "todo" ? "" : `is-${state}`} />
        ))}
      </span>
      <div className="countdown-top">
        {event && <span className="countdown-event">{event}</span>}
        <span className="countdown-date">{dateLabel}</span>
      </div>
      <span className="countdown-number-wrap">
        {outgoing !== null && (
          <span
            className="countdown-number is-roll-out"
            data-len={outgoing.length}
            aria-hidden="true"
          >
            {outgoing}
          </span>
        )}
        <span
          key={shown}
          data-len={shown.length}
          className={`countdown-number${outgoing !== null ? " is-roll-in" : ""}${
            isToday ? " is-today-word" : ""
          }`}
        >
          {shown}
        </span>
      </span>
      <span className="countdown-unit">{isToday ? "it's here 🎉" : unit}</span>
      {targetDate &&
        (isToday ? (
          <span className="countdown-tick">hope it's a good one</span>
        ) : (
          <span className="countdown-clock">
            <ClockCell value={hh} unit="h" />
            <ClockCell value={mm} unit="m" />
            <ClockCell value={ss} unit="s" />
          </span>
        ))}
      {hyped.length > 0 && (
        <span className="countdown-hype">
          {hyped.slice(0, 3).map((name) => (
            <MemberFace key={name} name={name} size="xs" />
          ))}
          <em>{hyped.length} hyped</em>
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
          {options.map((option, optionIndex) => {
            const selected = selectedOptionId === option.id;
            const votes = option.votes + (selected ? 1 : 0);
            const total = option.total + (hasLocalVote ? 1 : 0);
            const percent = Math.round((votes / Math.max(total, 1)) * 100);
            const voters = option.voters ?? [];
            const shownVoters = voters.slice(0, 3);
            const extraVoters = voters.length - shownVoters.length;
            const leading = totalVotes > 0 && votes === leadingVotes && votes > 0;

            // rendered twice: ink layer + a fill-clipped copy, so the label
            // flips to fill ink exactly where the flat color bar ends
            const rowInner = (
              <>
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
              </>
            );

            return (
              <li
                key={option.id}
                style={{ "--i": optionIndex } as Style}
                className={`${selected ? "is-selected" : ""} ${leading ? "is-leading" : ""}`}
              >
                <button
                  type="button"
                  className="poll-row"
                  style={{ "--poll-pct": `${totalVotes > 0 ? percent : 0}%` } as Style}
                  onClick={() => onVote?.(option.id)}
                  aria-label={`Vote for ${option.label}`}
                  aria-pressed={selected}
                >
                  <span className="poll-row-base">{rowInner}</span>
                  <span className="poll-row-fill" aria-hidden="true">
                    {rowInner}
                  </span>
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
              <span className="poll-footer-text">
                <strong>{totalVotes} voted</strong> · waiting on {waitingOn.join(" + ")}
              </span>
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
  const kicker = String(widget.data.kicker ?? "sign-up sheet");
  const [myClaims, setMyClaims] = useState<Record<string, boolean>>({});
  const claimedItems = items.filter((item) => item.claimed || myClaims[item.name]);
  const openItems = items.filter((item) => !item.claimed && !myClaims[item.name]);
  const coveredCount = claimedItems.length;
  const totalCount = items.length;
  const allSet = totalCount > 0 && openItems.length === 0;

  const toggleClaim = (name: string) => {
    setMyClaims((current) => ({ ...current, [name]: !current[name] }));
    playSound("place");
  };

  return (
    <div
      className={`widget-shell widget-potluck potluck-tone-${tone}${allSet ? " is-all-set" : ""}`}
      style={style}
    >
      <span className="potluck-tape" aria-hidden="true" />
      <div className="potluck-content">
        <span className="potluck-sparkle potluck-sparkle-large" aria-hidden="true">✦</span>
        <span className="potluck-sparkle potluck-sparkle-small" aria-hidden="true">✦</span>
        <div className="potluck-heading">
          <div className="potluck-title">
            <span className="potluck-kicker">{kicker}</span>
            <h3>{String(widget.data.title)}</h3>
          </div>
          <div className="potluck-score" aria-live="polite">
            <span className="potluck-score-row">
              <span className="potluck-tally" aria-hidden="true">
                {Array.from({ length: Math.max(1, totalCount) }, (_, index) => (
                  <i key={index} className={index < coveredCount ? "is-inked" : ""} />
                ))}
              </span>
              <strong className="potluck-fraction">
                {coveredCount}
                <span>/{totalCount || 0}</span>
              </strong>
            </span>
            <small>{allSet ? "all set" : `${openItems.length} still open`}</small>
          </div>
        </div>
        {items.length > 0 ? (
          <ul className="potluck-list">
            {items.map((item, index) => {
              const mine = onClaim
                ? Boolean(claimantId && item.byUserId === claimantId)
                : Boolean(myClaims[item.name]);
              const claimed = item.claimed || mine;
              const claimant = mine ? "You" : item.by;

              return (
                <li
                  key={item.name}
                  style={{ "--i": index } as CSSProperties}
                  className={`${claimed ? "is-claimed" : ""}${mine ? " is-yours" : ""}`}
                >
                  <span className="claim-mark" aria-hidden="true">
                    <svg viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.5 5 9l4.5-6.5" />
                    </svg>
                  </span>
                  <strong className="potluck-item-name">{item.name}</strong>
                  {claimed ? (
                    <>
                      {claimant && (
                        <em className="potluck-signature">
                          {mine ? "you've got it" : claimant}
                        </em>
                      )}
                      {mine ? (
                        <button
                          type="button"
                          className="potluck-release"
                          onClick={() => (onClaim ? onClaim(item.name) : toggleClaim(item.name))}
                        >
                          release
                        </button>
                      ) : (
                        <MemberFace name={String(claimant)} size="xs" />
                      )}
                    </>
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
        {allSet && (
          <span className="potluck-stamp" aria-hidden="true">
            all set
          </span>
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
  const paperTone = tone === "crew" || tone === "warm" ? tone : "white";
  const kicker = promoted
    ? "saved from chat"
    : String(
        widget.data.kicker ??
          (paperTone === "crew"
            ? "today"
            : paperTone === "warm"
              ? "a thing to remember"
              : "summer maybe?"),
      );

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

  return (
    <div
      className={`widget-shell widget-paper-note note-paper-${paperTone}${promoted ? " is-promoted" : ""}${remembered ? " is-remembered" : ""}`}
      style={style}
    >
      <span className="note-paper-backing" aria-hidden="true" />
      <div className="note-paper-sheet">
        <span className="note-paper-fold" aria-hidden="true" />
        <span className="note-kicker">{kicker}</span>
        <p>{String(widget.data.text)}</p>
        <div className="note-footer">
          <span className="note-author">— {author}</span>
          {rememberButton}
        </div>
      </div>
      <span className="note-paper-tape" aria-hidden="true" />
      <span className="note-paper-doodle" aria-hidden="true">♡</span>
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
