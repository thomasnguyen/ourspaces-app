import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { Widget } from "../data/types";
import { MemberFace } from "../components/MemberFace";
import { playSound } from "../lib/sounds";

type Style = CSSProperties;

type DailyAnswer = {
  name: string;
  text: string;
  reactions?: Record<string, string[]>;
};

type DailyHistoryEntry = {
  day: string;
  question: string;
  topAnswer: { name: string; text: string };
  count: number;
};

type AvailabilityMember = {
  name: string;
  slots?: boolean[];
};

type ShelfLink = {
  label: string;
  url: string;
  by?: string;
  contributor?: string;
};

const REACTION_EMOJIS = ["❤️", "😂", "👀"];

type WheelSlice = { id: string; label: string };
type WheelSpin = { spinNonce: number; resultIndex: number };

function wheelPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function wheelPath(index: number, count: number) {
  const cx = 130;
  const cy = 130;
  const radius = 112;
  const start = -90 + (360 / count) * index;
  const end = start + 360 / count;
  const from = wheelPoint(cx, cy, radius, start);
  const to = wheelPoint(cx, cy, radius, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y} Z`;
}

function localDateKey(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

function dateOffsetLabel(date: Date, timeZone: string) {
  const localKey = localDateKey(date, timeZone);
  const todayKey = localDateKey(new Date(), undefined);
  if (localKey === todayKey) return "today";
  const local = new Date(`${localKey}T00:00:00Z`).getTime();
  const today = new Date(`${todayKey}T00:00:00Z`).getTime();
  const days = Math.round((local - today) / 86_400_000);
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 1 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export function WheelWidget({
  widget,
  style,
  onSpin,
  disabled = false,
}: {
  widget: Widget;
  style: Style;
  onSpin?: (spin: WheelSpin) => void;
  disabled?: boolean;
}) {
  const slices = (Array.isArray(widget.data.slices) ? widget.data.slices : []) as WheelSlice[];
  const count = Math.max(1, slices.length);
  const resultIndex = Math.min(count - 1, Math.max(0, Number(widget.data.resultIndex ?? 0)));
  const spinNonce = Number(widget.data.spinNonce ?? 0);
  const rotation = useRef(0);
  const initialized = useRef(false);
  const spinning = useRef(false);
  const [angle, setAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [localResult, setLocalResult] = useState<number | null>(null);

  useEffect(() => {
    const landing = 360 - ((resultIndex + 0.5) * 360) / count;
    if (!initialized.current) {
      rotation.current = landing;
      setAngle(landing);
      initialized.current = true;
      return;
    }
    const next = rotation.current + 1440 + ((landing - (rotation.current % 360) + 360) % 360);
    rotation.current = next;
    spinning.current = true;
    setIsSpinning(true);
    setAngle(next);
  }, [count, resultIndex, spinNonce]);

  const spin = () => {
    if (disabled || spinning.current || !slices.length) return;
    playSound("tap");
    const next = Math.floor(Math.random() * slices.length);
    setLocalResult(next);
    onSpin?.({ spinNonce: spinNonce + 1, resultIndex: next });
    if (!onSpin) {
      // The widget lab is intentionally self-contained; live canvases provide the callback.
      const landing = 360 - ((next + 0.5) * 360) / count;
      const nextAngle = rotation.current + 1440 + ((landing - (rotation.current % 360) + 360) % 360);
      rotation.current = nextAngle;
      spinning.current = true;
      setIsSpinning(true);
      setAngle(nextAngle);
    }
  };

  const finishSpin = () => {
    if (!spinning.current) return;
    spinning.current = false;
    setIsSpinning(false);
    playSound("place");
  };

  useEffect(() => {
    if (!isSpinning || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timeout = window.setTimeout(finishSpin, 0);
    return () => window.clearTimeout(timeout);
  }, [angle, isSpinning]);

  const shownResultIndex = localResult ?? resultIndex;

  return (
    <section className={`widget-shell widget-wheel wheel-tone-${String(widget.data.tone ?? "mint")}`} style={style}>
      <div className="wheel-heading">
        <div>
          <span className="wheel-kicker">group decision</span>
          <h3>{String(widget.data.title ?? "spin the wheel")}</h3>
        </div>
        <span className="wheel-live-mark"><i /> live</span>
      </div>
      <div className="wheel-stage">
        <span className="wheel-pointer" aria-hidden="true" />
        <svg className={`wheel-svg${isSpinning ? " is-spinning" : ""}`} viewBox="0 0 260 260" role="img" aria-label={String(widget.data.title ?? "spin wheel")}>
          <g
            className="wheel-rotor"
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: "130px 130px" }}
            onTransitionEnd={(event) => {
              if (event.propertyName === "transform") finishSpin();
            }}
          >
            {slices.map((slice, index) => {
              const start = -90 + (360 / count) * index;
              const mid = start + 180 / count;
              const labelPoint = wheelPoint(130, 130, 72, mid);
              const labelRotation = mid + 90;
              return (
                <g key={slice.id}>
                  <path className={`wheel-slice wheel-slice-${index % 6}`} d={wheelPath(index, count)} />
                  <text
                    className="wheel-slice-label"
                    x={labelPoint.x}
                    y={labelPoint.y}
                    transform={`rotate(${labelRotation} ${labelPoint.x} ${labelPoint.y})`}
                  >
                    {slice.label.slice(0, 14)}
                  </text>
                </g>
              );
            })}
            <circle className="wheel-center" cx="130" cy="130" r="22" />
            <text className="wheel-center-label" x="130" y="134">spin</text>
          </g>
        </svg>
      </div>
      <button type="button" className="wheel-spin-button" onClick={spin} disabled={disabled || isSpinning || !slices.length}>
        {isSpinning ? "landing…" : disabled ? "preview only" : "spin it →"}
      </button>
      <p className="wheel-result" aria-live="polite">
        {slices[shownResultIndex] ? <><strong>{String(widget.data.spunBy ?? "someone")}</strong> spun → {slices[shownResultIndex].label.toLowerCase()}</> : "add a few slices first"}
      </p>
    </section>
  );
}

type ClockPlace = { label: string; tz: string };

export function DualClockWidget({ widget, style }: { widget: Widget; style: Style }) {
  const [, setTick] = useState(0);
  const left = (widget.data.left ?? {}) as Partial<ClockPlace>;
  const right = (widget.data.right ?? {}) as Partial<ClockPlace>;
  const now = new Date();

  useEffect(() => {
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const formatTime = (timeZone: string) => new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  return (
    <section className="widget-shell widget-dual-clock" style={style}>
      <div className="dual-clock-heading">
        <span className="dual-clock-kicker">right now</span>
        <h3>{String(widget.data.title ?? "two places")}</h3>
      </div>
      <div className="dual-clock-grid">
        {[left, right].map((place, index) => {
          const tz = String(place.tz ?? "UTC");
          return (
            <div className={`dual-clock-place${index === 1 ? " is-second" : ""}`} key={`${tz}-${index}`}>
              <span className="dual-clock-label">{String(place.label ?? "place")}</span>
              <strong>{formatTime(tz)}</strong>
              <span className="dual-clock-day">{dateOffsetLabel(now, tz)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Scribble({ length, out = false }: { length: number; out?: boolean }) {
  // Bar width tracks the hidden answer's length so the lock still gossips a little.
  const width = 44 + ((length * 9) % 68);

  return (
    <svg
      className={`dq-scribble ${out ? "is-out" : ""}`}
      viewBox="0 0 100 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={out ? undefined : { width: `${width}px` }}
    >
      <path d="M2 8 C5 2 9 12 13 7 S21 2 25 8 S33 13 38 6 S46 2 50 9 S58 13 63 6 S71 2 76 9 S85 12 90 6 S95 4 98 7" />
    </svg>
  );
}

export function DailyQWidget({
  widget,
  style,
  localAnswer,
  localReactions = {},
  onAnswer,
  onReact,
}: {
  widget: Widget;
  style: Style;
  /** Your answer this session — posting it unlocks the scribbled answers. */
  localAnswer?: string;
  /** Your reaction per answer author, e.g. { Maya: "😂" }. */
  localReactions?: Record<string, string>;
  onAnswer?: (text: string) => void;
  onReact?: (answerName: string, emoji: string) => void;
}) {
  const answers = (widget.data.answers as DailyAnswer[] | undefined) ?? [];
  const history = (widget.data.history as DailyHistoryEntry[] | undefined) ?? [];
  const waitingOn = (widget.data.waitingOn as string[] | undefined) ?? [];
  const tone = String(widget.data.tone ?? "butter");
  const streak = Number(widget.data.streak ?? 0);

  const revealing = Boolean(localAnswer);
  const unlocked = Boolean(widget.data.youAnswered) || revealing;

  const [draft, setDraft] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [nudged, setNudged] = useState(false);

  const shown: DailyAnswer[] = revealing
    ? [...answers, { name: "You", text: localAnswer ?? "" }]
    : answers;

  const viewing = dayIndex > 0 ? history[dayIndex - 1] : null;
  const nextIndex = (dayIndex + 1) % (history.length + 1);
  const nextLabel = nextIndex === 0 ? "today" : history[nextIndex - 1].day;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAnswer?.(text);
    setDraft("");
  };

  const nudge = () => {
    playSound("tap");
    setNudged(true);
    window.setTimeout(() => setNudged(false), 1600);
  };

  return (
    <div
      className={`widget-shell widget-daily-q dq-tone-${tone} ${revealing ? "is-revealing" : ""}`}
      style={style}
    >
      <div className="dq-content">
        <div className="dq-top">
          <span className="daily-q-stamp">{viewing ? viewing.day : "today"}</span>
          {!viewing && streak > 0 && <span className="dq-streak">day {streak} 🔥</span>}
          {history.length > 0 && (
            <button type="button" className="dq-flip" onClick={() => setDayIndex(nextIndex)}>
              ↺ {nextLabel}
            </button>
          )}
        </div>
        {viewing ? (
          <div className="dq-page is-history" key={viewing.day}>
            <p className="daily-q-question">{viewing.question}</p>
            <div className="dq-answers">
              <div className="dq-bubble is-crowned">
                <span className="dq-crown" aria-hidden="true">
                  👑
                </span>
                <MemberFace name={viewing.topAnswer.name} size="xs" />
                <span className="dq-bubble-body">
                  <span className="dq-bubble-name">{viewing.topAnswer.name.toLowerCase()}</span>
                  <span className="dq-bubble-text">{viewing.topAnswer.text}</span>
                </span>
              </div>
            </div>
            <div className="dq-footer">
              <span className="dq-footer-text">
                {viewing.count} answered · {viewing.topAnswer.name.toLowerCase()} took the crown
              </span>
            </div>
          </div>
        ) : (
          <div className="dq-page" key="today">
            <p className="daily-q-question">{String(widget.data.question)}</p>
            <div className="dq-answers">
              {shown.length === 0 && (
                <p className="dq-empty">no one's answered yet — go first 👀</p>
              )}
              {shown.map((answer, index) => {
                const isYou = answer.name === "You";
                const yourReaction = localReactions[answer.name];
                const seeded = answer.reactions ?? {};
                const chips = Object.entries(seeded).map(([emoji, names]) => ({
                  emoji,
                  count: names.length + (yourReaction === emoji ? 1 : 0),
                }));
                if (yourReaction && !seeded[yourReaction]) {
                  chips.push({ emoji: yourReaction, count: 1 });
                }

                return (
                  <div
                    key={answer.name}
                    className={`dq-bubble ${isYou ? "is-you" : ""}`}
                    style={
                      revealing
                        ? ({
                            "--dq-delay": isYou ? "0ms" : `${140 + index * 80}ms`,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    <MemberFace name={answer.name} size="xs" />
                    <span className="dq-bubble-body">
                      {isYou ? (
                        <span className="dq-you-tag">you</span>
                      ) : (
                        <span className="dq-bubble-name">{answer.name.toLowerCase()}</span>
                      )}
                      {unlocked ? (
                        <span className="dq-bubble-textwrap">
                          <span className="dq-bubble-text">{answer.text}</span>
                          {revealing && !isYou && <Scribble length={answer.text.length} out />}
                        </span>
                      ) : (
                        <Scribble length={answer.text.length} />
                      )}
                    </span>
                    {unlocked && !isYou && onReact && (
                      <span className="dq-react-tray">
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className={yourReaction === emoji ? "is-active" : ""}
                            onClick={() => onReact(answer.name, emoji)}
                            aria-label={`react ${emoji} to ${answer.name}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </span>
                    )}
                    {chips.length > 0 && (
                      <span className="dq-react-chips" aria-hidden="true">
                        {chips.map((chip) => (
                          <span key={chip.emoji} className="dq-react-chip">
                            {chip.emoji}
                            {chip.count > 1 ? ` ${chip.count}` : ""}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {unlocked ? (
              <div className="dq-footer">
                {waitingOn.length > 0 ? (
                  <>
                    <span className="dq-footer-faces">
                      {waitingOn.map((name) => (
                        <MemberFace key={name} name={name} size="xs" />
                      ))}
                    </span>
                    <span className="dq-footer-text">
                      waiting on {waitingOn.join(" + ").toLowerCase()}
                    </span>
                    <button type="button" className="dq-nudge" onClick={nudge}>
                      {nudged ? "nudged!" : "nudge"}
                    </button>
                  </>
                ) : (
                  <span className="dq-footer-text">{shown.length} answered · everyone's in</span>
                )}
              </div>
            ) : (
              <>
                {answers.length > 0 && (
                  <div className="dq-footer">
                    <span className="dq-footer-text">
                      {answers.length} answered — answer to peek 👀
                    </span>
                  </div>
                )}
                <form className="dq-input" onSubmit={submit}>
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="your answer…"
                    aria-label="your answer"
                  />
                  <button type="submit" className="dq-send" aria-label="post your answer">
                    →
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>
      {history.length > 0 && <span className="dq-stack" aria-hidden="true" />}
    </div>
  );
}

export type RsvpStatus = "yes" | "maybe" | "no";
type RsvpResponse = { name: string; status: RsvpStatus };

export const RSVP_CHOICES: Array<{ status: RsvpStatus; label: string }> = [
  { status: "yes", label: "🎉 in" },
  { status: "maybe", label: "🤔 maybe" },
  { status: "no", label: "😭 can't" },
];

export function RsvpWidget({
  widget,
  style,
  focused = false,
  rsvpSelection,
  onRsvp,
}: {
  widget: Widget;
  style: Style;
  /** Zoomed-in detail render — names out, respond moves to the thread note. */
  focused?: boolean;
  rsvpSelection?: RsvpStatus;
  onRsvp?: (widgetId: string, status: RsvpStatus) => void;
}) {
  const seeded = Array.isArray(widget.data.responses)
    ? (widget.data.responses as RsvpResponse[])
    : [];
  const waitingOn = Array.isArray(widget.data.waitingOn)
    ? (widget.data.waitingOn as string[])
    : [];
  const waitingNote =
    typeof widget.data.waitingNote === "string" ? widget.data.waitingNote : "";
  const tone = typeof widget.data.tone === "string" ? widget.data.tone : "blush";

  const [picking, setPicking] = useState(false);
  const [localStatus, setLocalStatus] = useState<RsvpStatus | null>(null);
  const myStatus = onRsvp ? (rsvpSelection ?? null) : localStatus;

  const responses: RsvpResponse[] = myStatus
    ? [...seeded, { name: "You", status: myStatus }]
    : seeded;
  const yes = responses.filter((r) => r.status === "yes");
  const maybe = responses.filter((r) => r.status === "maybe");
  const cant = responses.filter((r) => r.status === "no");
  const answered = responses.length;

  const pick = (status: RsvpStatus) => {
    if (onRsvp) {
      onRsvp(widget.id, status);
    } else {
      setLocalStatus(status);
      playSound("place");
    }
    setPicking(false);
  };

  const quietGroup = (list: RsvpResponse[], word: string, ghost: boolean) =>
    list.length > 0 && (
      <span className={`rsvp-quiet-group${ghost ? " is-ghost" : ""}`}>
        {list.slice(0, 2).map((r) => (
          <MemberFace key={r.name} name={r.name} size="xs" />
        ))}
        <em>
          {list.length} {word}
        </em>
      </span>
    );

  return (
    <div
      className={`widget-shell widget-rsvp${
        tone !== "blush" ? ` rsvp-tone-${tone}` : ""
      }${focused ? " is-detail" : ""}`}
      style={
        focused ? { ...style, height: "auto", minHeight: "100%" } : style
      }
    >
      <div className="rsvp-heading">
        <h3>{String(widget.data.title)}</h3>
      </div>

      {answered === 0 ? (
        <div className="rsvp-empty">
          <span className="rsvp-empty-faces" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p>no one's answered yet — you first?</p>
        </div>
      ) : (
        <>
          <div className="rsvp-hero">
            <strong key={yes.length}>{yes.length}</strong>
            <em>in!</em>
          </div>
          <div className="rsvp-cluster">
            {yes.map((r) => (
              <span
                key={r.name}
                className={`rsvp-chip${r.name === "You" ? " is-you" : ""}`}
              >
                <MemberFace name={r.name} size="sm" />
                {focused ? (
                  <b>{r.name === "You" ? "you" : r.name.toLowerCase()}</b>
                ) : (
                  r.name === "You" && <b>you</b>
                )}
              </span>
            ))}
          </div>
          {!focused && (maybe.length > 0 || cant.length > 0) && (
            <p className="rsvp-quiet">
              {quietGroup(maybe, "maybe", false)}
              {quietGroup(cant, "can't", true)}
            </p>
          )}
          {focused &&
            [...maybe.map((r) => ({ ...r, word: "maybe" })),
              ...cant.map((r) => ({ ...r, word: "can't" }))].map((r) => (
              <p key={r.name} className="rsvp-detail-row">
                <MemberFace name={r.name} size="xs" />
                <b>{r.name.toLowerCase()}</b>
                <span>{r.word}</span>
              </p>
            ))}
        </>
      )}

      {waitingOn.length > 0 && (
        <p className="rsvp-waiting">
          {waitingOn.slice(0, 2).map((name) => (
            <MemberFace key={name} name={name} size="xs" />
          ))}
          <span>waiting on {waitingOn.join(" + ")}</span>
        </p>
      )}
      {focused && waitingOn.length > 0 && waitingNote && (
        <p className="rsvp-waiting-note">
          <span aria-hidden="true">💬</span>“{waitingNote}”
        </p>
      )}

      {!focused && myStatus === null && !picking && (
        <button type="button" className="rsvp-add" onClick={() => setPicking(true)}>
          + respond
        </button>
      )}
      {!focused && picking && (
        <div className="rsvp-choices">
          {RSVP_CHOICES.map((choice, index) => (
            <button
              type="button"
              key={choice.status}
              style={{ animationDelay: `${index * 45}ms` }}
              onClick={() => pick(choice.status)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
      {!focused && myStatus !== null && !picking && (
        <button
          type="button"
          className="rsvp-add is-answered"
          onClick={() => {
            if (!onRsvp) setLocalStatus(null);
            setPicking(true);
          }}
        >
          {myStatus === "yes"
            ? "you're in 🎉"
            : myStatus === "maybe"
              ? "you're a maybe 🤔"
              : "you can't make it 😭"}
          <i>change</i>
        </button>
      )}

      <span className="rsvp-meter" aria-hidden="true">
        {Array.from({ length: answered + waitingOn.length || 1 }, (_, i) => (
          <i key={i} className={i < yes.length ? "is-in" : ""} />
        ))}
      </span>
    </div>
  );
}

export function DecisionWidget({ widget, style }: { widget: Widget; style: Style }) {
  const title = String(widget.data.title ?? "decision made").trim() || "decision made";
  const detail = String(widget.data.detail ?? "").trim();
  const author = String(widget.data.author ?? "You").trim() || "You";
  const source = String(widget.data.source ?? "promoted from chat").trim() || "promoted from chat";
  const tone = String(widget.data.tone ?? "lime");
  const [acknowledged, setAcknowledged] = useState(false);

  const toggleAcknowledged = () => {
    setAcknowledged((current) => !current);
    playSound("tap");
  };

  return (
    <article
      className={`widget-shell widget-decision decision-tone-${tone}${
        acknowledged ? " is-acknowledged" : ""
      }${detail ? "" : " is-missing-outcome"}`}
      style={style}
    >
      <span className="decision-pin" aria-hidden="true" />
      <span className="decision-deco decision-deco-one" aria-hidden="true">✦</span>
      <span className="decision-deco decision-deco-two" aria-hidden="true">·</span>
      <header className="decision-header">
        <span className="decision-status">
          <i aria-hidden="true">✓</i>
          {title}
        </span>
        <span className="decision-receipt-label">receipt</span>
      </header>
      <div className="decision-outcome">
        <span className="decision-outcome-label">outcome</span>
        {detail ? (
          <p className="decision-detail">{detail}</p>
        ) : (
          <div className="decision-missing">
            <strong>no outcome yet</strong>
            <span>edit this receipt when the group lands on it.</span>
          </div>
        )}
      </div>
      <footer className="decision-footer">
        <div className="decision-provenance">
          <span className="decision-source"><span aria-hidden="true">↗</span>{source}</span>
          <span className="decision-author">
            <MemberFace name={author} size="xs" />
            <span>{author}</span>
          </span>
        </div>
        <button
          type="button"
          className={`decision-acknowledge${acknowledged ? " is-active" : ""}`}
          onClick={toggleAcknowledged}
          aria-pressed={acknowledged}
          aria-live="polite"
        >
          {acknowledged ? "seen ✓" : "acknowledge"}
        </button>
      </footer>
      {acknowledged && <span className="decision-acknowledged">you registered this decision</span>}
    </article>
  );
}

export function AvailabilityWidget({ widget, style }: { widget: Widget; style: Style }) {
  const days = Array.isArray(widget.data.days)
    ? (widget.data.days as unknown[]).filter((day): day is string => typeof day === "string" && day.trim().length > 0)
    : [];
  const members = Array.isArray(widget.data.members)
    ? (widget.data.members as AvailabilityMember[]).filter(
        (member) => typeof member?.name === "string" && member.name.trim().length > 0,
      )
    : [];
  const title = String(widget.data.title ?? "when can we all meet?");
  const best = String(widget.data.best ?? "").trim();
  const tone = String(widget.data.tone ?? "sky");
  const [yourSlots, setYourSlots] = useState<Record<string, boolean>>({});

  const bestIndex = days.findIndex((day) =>
    best.toLowerCase().startsWith(day.toLowerCase()),
  );
  const recommendedIndex = bestIndex >= 0 ? bestIndex : days.length > 0 ? 0 : -1;
  const counts = days.map((_, dayIndex) =>
    members.reduce(
      (count, member) => count + (Boolean(member.slots?.[dayIndex]) ? 1 : 0),
      0,
    ) + (yourSlots[days[dayIndex]] ? 1 : 0),
  );
  const recommendedDay = recommendedIndex >= 0 ? days[recommendedIndex] : "";
  const recommendedCount = recommendedIndex >= 0 ? counts[recommendedIndex] : 0;

  const toggleYourAvailability = (day: string) => {
    setYourSlots((current) => ({ ...current, [day]: !current[day] }));
    playSound("tap");
  };

  const hasSchedule = days.length > 0 && members.length > 0;

  return (
    <section className={`widget-shell widget-availability availability-tone-${tone}`} style={style}>
      <header className="avail-heading">
        <div>
          <span className="avail-kicker">scheduling snapshot</span>
          <h3>{title}</h3>
        </div>
        <span className="avail-tone-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </header>
      {hasSchedule ? (
        <>
          <div className="avail-recommendation" aria-live="polite">
            <div>
              <span className="avail-recommendation-label">best fit</span>
              <strong>{best || recommendedDay || "pick a day"}</strong>
            </div>
            <div className="avail-recommendation-count">
              <strong>{recommendedCount}</strong>
              <span>free</span>
            </div>
            <span className="avail-recommendation-note">
              {yourSlots[recommendedDay] ? "you fit too" : `${members.length} members checked`}
            </span>
          </div>
          <div className="avail-table-wrap">
            <table className="avail-grid">
              <thead>
                <tr>
                  <th scope="col">who</th>
                  {days.map((day, index) => (
                    <th key={day} scope="col" className={index === recommendedIndex ? "is-recommended" : ""}>
                      <span>{day}</span>
                      <small>{counts[index]} free</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.name}>
                    <th scope="row">
                      <MemberFace name={member.name} size="xs" />
                      <span>{member.name}</span>
                    </th>
                    {days.map((day, index) => {
                      const available = Boolean(member.slots?.[index]);
                      const recommended = index === recommendedIndex;
                      return (
                        <td
                          key={`${member.name}-${day}`}
                          className={`${available ? "is-free" : "is-busy"}${recommended ? " is-recommended" : ""}`}
                          aria-label={`${member.name} is ${available ? "available" : "unavailable"} on ${day}`}
                        >
                          <span aria-hidden="true">{available ? "✓" : "·"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="avail-you-row">
                  <th scope="row">
                    <span className="avail-you-face" aria-hidden="true">you</span>
                    <span>You</span>
                  </th>
                  {days.map((day, index) => {
                    const available = Boolean(yourSlots[day]);
                    const recommended = index === recommendedIndex;
                    return (
                      <td key={`you-${day}`} className={recommended ? "is-recommended" : ""}>
                        <button
                          type="button"
                          className={`avail-cell-button${available ? " is-free" : " is-unset"}`}
                          onClick={() => toggleYourAvailability(day)}
                          aria-label={`Mark yourself ${available ? "unavailable" : "available"} on ${day}`}
                          aria-pressed={available}
                          title={available ? `You're free ${day}` : `Tap to mark yourself free ${day}`}
                        >
                          {available ? "✓" : "+"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="avail-hint">tap your row to add your availability</p>
        </>
      ) : (
        <div className="avail-empty">
          <span aria-hidden="true">▦</span>
          <div>
            <strong>nothing to compare yet</strong>
            <p>Add a few dates and people to find the day that works.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function PhotoWallWidget({ widget, style }: { widget: Widget; style: Style }) {
  const photos = (Array.isArray(widget.data.photos) ? widget.data.photos : []) as {
    caption: string;
    date: string;
    rotate: number;
    by?: string;
    focus?: string;
    src?: string;
    thumbnailSrc?: string;
  }[];
  const title = String(widget.data.title ?? "recent memories");
  const tone = String(widget.data.tone ?? "blush");
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const cover = photos[0];
  const peeks = photos.slice(1, 3);

  const toggleFavorite = (caption: string) => {
    setFavorites((current) => ({ ...current, [caption]: !current[caption] }));
    playSound("tap");
  };

  return (
    <div className={`widget-shell widget-photo-wall photo-wall-tone-${tone}`} style={style}>
      <div className="photo-wall-heading">
        <div>
          <span className="photo-wall-kicker">
            <i aria-hidden="true" />
            memory wall
          </span>
          <h3>{title}</h3>
        </div>
        <span className="photo-wall-count">
          {photos.length} {photos.length === 1 ? "moment" : "moments"}
          <i aria-hidden="true">↗</i>
        </span>
      </div>
      {photos.length > 0 ? (
        <div className={`photo-wall-preview${peeks.length ? " has-peeks" : ""}`}>
          {peeks.map((photo, index) => (
            <figure
              key={photo.caption}
              className={`photo-wall-peek photo-wall-peek-${index + 1}`}
              aria-hidden="true"
            >
              <img
                src={photo.thumbnailSrc ?? photo.src ?? "/assets/the-crew-snapshot-thumb.jpg"}
                alt=""
                style={{ objectPosition: photo.focus ?? "center" }}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/assets/the-crew-snapshot-thumb.jpg";
                }}
              />
            </figure>
          ))}
          <figure className={`photo-wall-cover${favorites[cover.caption] ? " is-favorite" : ""}`}>
            <div className="photo-wall-frame">
              <img
                src={cover.thumbnailSrc ?? cover.src ?? "/assets/the-crew-snapshot-thumb.jpg"}
                alt={cover.caption}
                style={{ objectPosition: cover.focus ?? "center 35%" }}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/assets/the-crew-snapshot-thumb.jpg";
                }}
              />
            </div>
            <figcaption>
              <div className="photo-wall-caption">
                <strong>{cover.caption}</strong>
                <span>{cover.by ? `${cover.by} · ` : ""}{cover.date}</span>
              </div>
              <button
                type="button"
                className="photo-favorite"
                onClick={() => toggleFavorite(cover.caption)}
                aria-pressed={Boolean(favorites[cover.caption])}
                aria-label={`${favorites[cover.caption] ? "Remove favorite from" : "Favorite"} ${cover.caption}`}
              >
                {favorites[cover.caption] ? "♥" : "♡"}
              </button>
            </figcaption>
          </figure>
        </div>
      ) : (
        <div className="photo-wall-empty">
          <span aria-hidden="true">✦</span>
          <p>add a moment here so the wall remembers it.</p>
        </div>
      )}
    </div>
  );
}

export function LinkShelfWidget({ widget, style }: { widget: Widget; style: Style }) {
  const links = Array.isArray(widget.data.links)
    ? (widget.data.links as ShelfLink[]).filter(
        (link) => typeof link?.label === "string" && typeof link?.url === "string",
      )
    : [];
  const title = String(widget.data.title ?? "saved links");
  const tone = String(widget.data.tone ?? "sky");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const domainFor = (url: string) => {
    const value = url.trim();
    try {
      return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "");
    } catch {
      return value.split("/")[0] || "shared link";
    }
  };

  const hrefFor = (url: string) => {
    const value = url.trim();
    return value.includes("://") ? value : `https://${value}`;
  };

  const copyLink = async (link: ShelfLink, key: string) => {
    setCopiedKey(key);
    playSound("tap");
    try {
      await navigator.clipboard?.writeText(hrefFor(link.url));
    } catch {
      // Clipboard permissions are optional in the prototype; the visible state is the affordance.
    }
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
  };

  return (
    <section className={`widget-shell widget-link-shelf link-shelf-tone-${tone}`} style={style}>
      <header className="link-shelf-heading">
        <div>
          <span className="link-shelf-kicker">shared shelf</span>
          <h3>{title}</h3>
        </div>
        <span className="link-shelf-count">{links.length} {links.length === 1 ? "link" : "links"}</span>
      </header>
      {links.length > 0 ? (
        <ol className="link-shelf-list">
          {links.map((link, index) => {
            const key = `${link.label}-${index}`;
            const copied = copiedKey === key;
            const contributor = link.by ?? link.contributor;
            const domain = domainFor(link.url);
            return (
              <li key={key} className={`link-shelf-row${copied ? " is-copied" : ""}`}>
                <span className="link-shelf-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="link-shelf-icon" aria-hidden="true">↗</span>
                <span className="link-shelf-copy">
                  <a href={hrefFor(link.url)} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                  <span>
                    {domain}
                    {contributor ? ` · ${contributor}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="link-copy-button"
                  onClick={() => void copyLink(link, key)}
                  aria-label={`${copied ? "Copied" : "Copy"} ${link.label}`}
                  aria-live="polite"
                >
                  {copied ? "copied ✓" : "copy"}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="link-shelf-empty">
          <span aria-hidden="true">↗</span>
          <p>save a link here when the group finds the good stuff.</p>
        </div>
      )}
    </section>
  );
}

export function PlaylistWidget({ widget, style }: { widget: Widget; style: Style }) {
  const title = String(widget.data.title ?? "shared soundtrack");
  const song = String(widget.data.song ?? "").trim();
  const artist = String(widget.data.artist ?? "").trim();
  const pickedBy = String(widget.data.pickedBy ?? "").trim();
  /* One accent per board: the countdown owns the purple; the deck is chrome. */
  const tone = String(widget.data.tone ?? "ink");
  const seededVibes = Array.isArray(widget.data.vibes)
    ? widget.data.vibes.length
    : Number(widget.data.vibes ?? 0) || 0;
  const [vibed, setVibed] = useState(false);
  const vibeCount = seededVibes + (vibed ? 1 : 0);

  const toggleVibe = () => {
    setVibed((current) => !current);
    playSound("tap");
  };

  return (
    <section className={`widget-shell widget-playlist playlist-tone-${tone}${song && artist ? "" : " is-missing-track"}`} style={style}>
      <span className="playlist-deco playlist-deco-one" aria-hidden="true">✦</span>
      <span className="playlist-deco playlist-deco-two" aria-hidden="true">·</span>
      <header className="playlist-heading">
        <span className="playlist-now"><i aria-hidden="true" /> now playing</span>
        <span className="playlist-context">{title}</span>
      </header>
      {song && artist ? (
        <>
          <div className="playlist-main">
            <span className="playlist-art" aria-hidden="true">
              <span className="playlist-art-disc" />
              <span className="playlist-art-note">♫</span>
            </span>
            <div className="playlist-info">
              <strong>{song}</strong>
              <span>{artist}</span>
              <span className="playlist-by">
                {pickedBy && <MemberFace name={pickedBy} size="xs" />}
                {pickedBy ? `${pickedBy} picked this` : "picked for the room"}
              </span>
            </div>
            <button
              type="button"
              className={`playlist-vibe${vibed ? " is-active" : ""}`}
              onClick={toggleVibe}
              aria-pressed={vibed}
              aria-label={`${vibed ? "Remove your vibe from" : "Vibe with"} ${song}`}
            >
              <span aria-hidden="true">♥</span>
              <strong>{vibeCount}</strong>
              <small>{vibed ? "you vibe" : "vibe"}</small>
            </button>
          </div>
          <div className="playlist-equalizer" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <em>shared soundtrack</em>
          </div>
        </>
      ) : (
        <div className="playlist-empty">
          <span className="playlist-empty-art" aria-hidden="true">♫</span>
          <div>
            <strong>no track picked yet</strong>
            <p>drop in the next song the group needs.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function JokeRegistryWidget({ widget, style }: { widget: Widget; style: Style }) {
  const jokes = widget.data.jokes as { text: string; votes: number }[];

  return (
    <div className="widget-shell widget-joke-registry" style={style}>
      <span className="joke-tape" aria-hidden="true" />
      <h3>{String(widget.data.title)}</h3>
      <ol>
        {jokes.map((joke, i) => (
          <li key={joke.text}>
            <span className="joke-rank">{i + 1}</span>
            <span>{joke.text}</span>
            <span className="joke-votes">{joke.votes} ★</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ExpenseSplitWidget({ widget, style }: { widget: Widget; style: Style }) {
  const splits = widget.data.splits as {
    name: string;
    owes: number;
    paid: number;
  }[];

  return (
    <div className="widget-shell widget-expense" style={style}>
      <div className="expense-heading">
        <h3>{String(widget.data.title)}</h3>
        <span>${String(widget.data.total)} total</span>
      </div>
      <ul>
        {splits.map((split) => (
          <li key={split.name}>
            <MemberFace name={split.name} size="xs" />
            <span>{split.name}</span>
            {split.owes > 0 ? (
              <span className="expense-owes">owes ${split.owes}</span>
            ) : (
              <span className="expense-paid">paid ${split.paid}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ItineraryWidget({ widget, style }: { widget: Widget; style: Style }) {
  const days = widget.data.days as { day: string; plan: string }[];

  return (
    <div className="widget-shell widget-itinerary" style={style}>
      <h3>{String(widget.data.title)}</h3>
      <ul>
        {days.map((entry) => (
          <li key={entry.day}>
            <span className="itinerary-day">{entry.day}</span>
            <span>{entry.plan}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MessageWallWidget({ widget, style }: { widget: Widget; style: Style }) {
  const messages = widget.data.messages as { from: string; text: string }[];

  return (
    <div className="widget-shell widget-message-wall" style={style}>
      <span className="message-wall-label">{String(widget.data.title)}</span>
      <div className="message-wall-scroll">
        {messages.map((message) => (
          <div key={`${message.from}-${message.text}`} className="message-wall-card">
            <MemberFace name={message.from} size="xs" />
            <strong>{message.from}</strong>
            <p>{message.text}</p>
          </div>
        ))}
        <button type="button" className="message-wall-add">
          + add message
        </button>
      </div>
    </div>
  );
}

export function QuoteWidget({ widget, style }: { widget: Widget; style: Style }) {
  return (
    <div className="widget-shell widget-quote" style={style}>
      <span className="quote-pin" aria-hidden="true" />
      <span className="quote-week">{String(widget.data.week)}</span>
      <p>“{String(widget.data.text)}”</p>
      <span>— {String(widget.data.author)}</span>
    </div>
  );
}

export function WeatherWidget({ widget, style }: { widget: Widget; style: Style }) {
  return (
    <div className="widget-shell widget-weather" style={style}>
      <span className="weather-tape" aria-hidden="true" />
      <span className="weather-kicker">{String(widget.data.event)}</span>
      <div className="weather-main">
        <span className="weather-icon">☀️</span>
        <span className="weather-temp">{String(widget.data.temp)}°</span>
      </div>
      <span className="weather-condition">{String(widget.data.condition)}</span>
      <span className="weather-note">{String(widget.data.note)}</span>
      <span className="weather-date">{String(widget.data.date)}</span>
    </div>
  );
}

export function SportsWidget({ widget, style }: { widget: Widget; style: Style }) {
  const home = widget.data.home as { team: string; score: number; color: string };
  const away = widget.data.away as { team: string; score: number; color: string };

  return (
    <div className="widget-shell widget-sports" style={style}>
      <div className="sports-header">
        <span className="live-label">live</span>
        <span>
          {String(widget.data.quarter)} · {String(widget.data.clock)}
        </span>
      </div>
      <div className="sports-scoreboard">
        <div className="sports-team">
          <span className="sports-abbr" style={{ background: away.color }}>
            {away.team.slice(0, 3).toUpperCase()}
          </span>
          <span className="sports-name">{away.team}</span>
          <span className="sports-score">{away.score}</span>
        </div>
        <div className="sports-team is-leading">
          <span className="sports-abbr" style={{ background: home.color }}>
            {home.team.slice(0, 3).toUpperCase()}
          </span>
          <span className="sports-name">{home.team}</span>
          <span className="sports-score">{home.score}</span>
        </div>
      </div>
      <div className="sports-pulse" aria-hidden="true" />
    </div>
  );
}

export function BackendLiveWidget({ widget, style }: { widget: Widget; style: Style }) {
  const counts = widget.data.counts as { label: string; value: number }[];

  return (
    <div className="widget-shell widget-backend-live" style={style}>
      <div className="backend-live-heading">
        <span className="presence-pulse" aria-hidden="true" />
        <span>live backend</span>
      </div>
      <div className="backend-live-pills">
        {counts.map((item) => (
          <div key={item.label} className="backend-live-pill">
            <span className="backend-live-value">{item.value}</span>
            <span className="backend-live-label">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
