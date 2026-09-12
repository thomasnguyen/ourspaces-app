import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SPACE_TEMPLATES, WIDGET_CATALOG } from "../data/templates";
import type { SpaceTemplate, WidgetType } from "../data/types";
import { useIdentity } from "../live/identity";
import { useCreateSpace } from "../live/useCreateSpace";
import { useAccount, useJoin } from "../live/useJoin";
import { CodeSlots } from "./CodeSlots";
import { MemberFace } from "./MemberFace";

/**
 * "start a new space" — one sheet, three beats.
 *
 *   1. pick a shape: the sheet drenches in that template's colour and the
 *      mini board fills with its widgets, so you see the room before it's real.
 *   2. call it something (or don't — the shape's name is the default).
 *   3. keep it: joined people press one button. A guest gets the email + code
 *      right here, and the sixth digit is the last thing they touch — the
 *      space is made and opened on its own, no "you're in" pit stop.
 *
 * The order matters. The old flow asked for an email before you'd picked or
 * named anything, which read as a login wall over a title that said "start".
 * Investment first, the gate last, and the gate is one line.
 */

/**
 * Where the tiles land on the mini board, in order. Any prefix has to look
 * inhabited — a three-widget shape (game night) fills the middle band, five
 * spill into a second row. Percent of the board, plus a resting tilt.
 */
const SLOTS_FULL = [
  { left: 4, top: 27, width: 29, tilt: -2 },
  { left: 36, top: 22, width: 27, tilt: 1.5 },
  { left: 67, top: 29, width: 29, tilt: -1.2 },
  { left: 15, top: 63, width: 28, tilt: 2 },
  { left: 50, top: 64, width: 31, tilt: -1.6 },
  { left: 80, top: 66, width: 18, tilt: 1 },
];

// Three widgets get a diagonal, so the wall is used top to bottom.
const SLOTS_THREE = [
  { left: 5, top: 26, width: 32, tilt: -2 },
  { left: 38, top: 50, width: 30, tilt: 1.6 },
  { left: 65, top: 24, width: 31, tilt: -1.3 },
];

/**
 * Every shape is a starting point: pick one and the builder below fills
 * with its colour, mark and widgets, all of which you can change. "blank"
 * starts empty. The swatches are the identity colours the showcase spaces
 * already wear (`@theme`), so a hand-made space sits in the rail like it
 * belongs there.
 */
const CUSTOM_COLORS = [
  "#7853ff",
  "#e9369d",
  "#3f70ff",
  "#ff7c42",
  "#13b8a6",
  "oklch(0.42 0.09 160)",
];
const CUSTOM_MARKS = ["✦", "♥", "▲", "◎", "★", "☀", "♪", "✿"];
const CUSTOM_TYPES: WidgetType[] = [
  "note",
  "chat",
  "poll",
  "countdown",
  "photoWall",
  "dailyQ",
  "rsvp",
  "potluck",
  "playlist",
  "availability",
];
const CUSTOM_MAX = SLOTS_FULL.length;
const CUSTOM_ID = "blank";

type Draft = { color: string; icon: string; types: WidgetType[] };

function draftFrom(template: SpaceTemplate): Draft {
  return {
    color: template.color,
    icon: template.icon,
    types: template.widgets.map((item) => item.type),
  };
}

const BLANK: Draft = { color: CUSTOM_COLORS[0], icon: CUSTOM_MARKS[0], types: [] };

function widgetEntry(type: WidgetType) {
  for (const template of SPACE_TEMPLATES) {
    const hit = template.widgets.find((item) => item.type === type);
    if (hit) return hit;
  }
  return WIDGET_CATALOG.find((item) => item.type === type);
}

/**
 * A widget at postage-stamp size. Each type gets the shape it really has on
 * the canvas — the countdown is a big number, the poll is bars, the chat is
 * bubbles — so the board reads as a room, not a feature list. Pure CSS
 * shapes; nothing here is interactive.
 */
function MiniWidget({ type }: { type: WidgetType }) {
  switch (type) {
    case "note":
      return (
        <span className="mini-note">
          <i />
          <i />
          <i />
        </span>
      );
    case "countdown":
      return (
        <span className="mini-count">
          <strong>12</strong>
          <span>days</span>
        </span>
      );
    case "sports":
      return (
        <span className="mini-score">
          <span>
            <i>LAL</i>
            <b>98</b>
          </span>
          <span>
            <i>BOS</i>
            <b>94</b>
          </span>
        </span>
      );
    case "poll":
      return (
        <span className="mini-bars">
          <i style={{ width: "88%" }} />
          <i style={{ width: "54%" }} />
          <i style={{ width: "31%" }} />
        </span>
      );
    case "expenseSplit":
      return (
        <span className="mini-ledger">
          <span>
            <i />
            <b>$48</b>
          </span>
          <span>
            <i />
            <b>$120</b>
          </span>
          <span>
            <i />
            <b>$9</b>
          </span>
        </span>
      );
    case "chat":
      return (
        <span className="mini-chat">
          <i />
          <i className="is-mine" />
          <i />
        </span>
      );
    case "dailyQ":
      return (
        <span className="mini-q">
          <strong>Q</strong>
          <span>
            <i />
            <i />
          </span>
        </span>
      );
    case "jokeRegistry":
      return (
        <span className="mini-joke">
          <span>
            <i />
            <i />
          </span>
          <b>×12</b>
        </span>
      );
    case "messageWall":
      return (
        <span className="mini-wall">
          <i />
          <i />
          <i />
        </span>
      );
    case "photoWall":
    case "media":
      return (
        <span className="mini-photos">
          <i />
          <i />
          <i />
        </span>
      );
    case "availability":
      return (
        <span className="mini-cal">
          <i />
          <i className="is-on" />
          <i />
          <i className="is-on" />
          <i className="is-on" />
          <i />
          <i />
          <i />
        </span>
      );
    case "rsvp":
      return (
        <span className="mini-rsvp">
          <span>
            <i />
            <i />
            <i />
          </span>
          <b>3 yes</b>
        </span>
      );
    case "potluck":
      return (
        <span className="mini-check">
          <span className="is-done" />
          <span className="is-done" />
          <span />
        </span>
      );
    case "playlist":
      return (
        <span className="mini-play">
          <strong>♫</strong>
          <i />
        </span>
      );
    case "cozyColor":
      return (
        <span className="mini-swatch">
          <i />
          <i />
          <i />
          <i />
        </span>
      );
    case "itinerary":
      return (
        <span className="mini-route">
          <i />
          <i />
          <i />
        </span>
      );
    case "weather":
      return (
        <span className="mini-weather">
          <strong>72°</strong>
          <span>☀︎</span>
        </span>
      );
    default:
      return <span className="mini-generic">✦</span>;
  }
}

export function SpaceMaker({
  open,
  onClose,
  onMade,
}: {
  open: boolean;
  onClose: () => void;
  onMade: (slug: string) => void;
}) {
  const [pickedId, setPickedId] = useState<string>(SPACE_TEMPLATES[0].id);
  const [custom, setCustom] = useState<Draft>(() => draftFrom(SPACE_TEMPLATES[0]));
  const [name, setName] = useState("");
  // Two prongs. "build" is the board, the dock and the builder; "keep" is
  // the same board with only the email + code under it, and a way back.
  const [step, setStep] = useState<"build" | "keep">("build");
  const [draft, setDraft] = useState("");
  // Set once the code lands. The account query flips to `joined` a beat
  // later, and only then is the mutation sent with a registered identity.
  const [makeWhenJoined, setMakeWhenJoined] = useState(false);

  const account = useAccount();
  const identity = useIdentity();
  const join = useJoin();
  const maker = useCreateSpace();
  const madeRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const make = async () => {
    if (madeRef.current) return;
    madeRef.current = true;
    const slug = await maker.create(template, name);
    if (slug) onMade(slug);
    else madeRef.current = false;
  };

  useEffect(() => {
    if (makeWhenJoined && account.joined) {
      setMakeWhenJoined(false);
      void make();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeWhenJoined, account.joined]);

  if (!open) return null;

  const isCustom = pickedId === CUSTOM_ID;
  const preset = SPACE_TEMPLATES.find((item) => item.id === pickedId);
  // The board and the space that gets made both come from the draft, so a
  // tweaked preset is exactly what you saw.
  const template: SpaceTemplate = {
    id: pickedId,
    name: preset?.name ?? "our space",
    color: custom.color,
    icon: custom.icon,
    description: preset?.description ?? "",
    widgets: custom.types
      .map(widgetEntry)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
  const pick = (id: string) => {
    setPickedId(id);
    const next = SPACE_TEMPLATES.find((item) => item.id === id);
    setCustom(next ? draftFrom(next) : BLANK);
  };
  // A preset's own colour, mark and widgets always show as options, even
  // the ones the blank list doesn't carry (birthday's cake, trip's weather).
  const swatches = CUSTOM_COLORS.includes(custom.color)
    ? CUSTOM_COLORS
    : [custom.color, ...CUSTOM_COLORS];
  const marks = CUSTOM_MARKS.includes(custom.icon)
    ? CUSTOM_MARKS
    : [custom.icon, ...CUSTOM_MARKS];
  const types = [
    ...custom.types.filter((type) => !CUSTOM_TYPES.includes(type)),
    ...CUSTOM_TYPES,
  ];

  const toggleType = (type: WidgetType) =>
    setCustom((prev) => {
      if (prev.types.includes(type))
        return { ...prev, types: prev.types.filter((item) => item !== type) };
      if (prev.types.length >= CUSTOM_MAX) return prev;
      return { ...prev, types: [...prev.types, type] };
    });

  const shownName = name.trim() || template.name;
  const onCode = join.stage === "code";
  const settingUp = maker.busy || makeWhenJoined;

  return (
    <div className="widget-picker-backdrop" onClick={onClose} role="presentation">
      <div
        className={`widget-picker space-maker is-${step}`}
        style={{ "--maker-color": template.color } as CSSProperties}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Start a new space"
      >
        <header>
          <div>
            <h2>{step === "build" ? "start a new space" : "keep it"}</h2>
            <p>
              {step === "build"
                ? "pick a shape, name it on the board."
                : "one code to your email. no password, and it's yours on any browser."}
            </p>
          </div>
          <button
            type="button"
            className="widget-picker-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {/* The board: the new space at postage-stamp size. Keyed on the
            template so the tiles re-land on every pick. */}
        <div className="space-maker-board" key={pickedId}>
          <div className="space-maker-board-head">
            <span className="space-maker-board-icon">{`${template.icon}\uFE0E`}</span>
            <input
              className="space-maker-board-name"
              value={name}
              maxLength={28}
              placeholder={template.name}
              disabled={settingUp}
              aria-label="Name your space"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (account.joined) void make();
                else setStep("keep");
              }}
            />
            <span className="space-maker-board-pencil" aria-hidden="true">
              ✎
            </span>
            <span className="space-maker-faces" aria-hidden="true">
              <MemberFace
                name={identity.name}
                color={identity.color}
                avatarUrl={identity.avatarUrl}
                size="sm"
              />
              <i />
              <i />
            </span>
          </div>
          {template.widgets.map((item, i) => {
            const slots = template.widgets.length <= 3 ? SLOTS_THREE : SLOTS_FULL;
            const slot = slots[i % slots.length];
            return (
              <div
                key={item.type}
                className="space-maker-tile"
                style={
                  {
                    "--i": i,
                    "--tilt": `${slot.tilt}deg`,
                    left: `${slot.left}%`,
                    top: `${slot.top}%`,
                    width: `${slot.width}%`,
                  } as CSSProperties
                }
              >
                <span className="space-maker-tile-label">{item.label}</span>
                <MiniWidget type={item.type} />
              </div>
            );
          })}
          {custom.types.length === 0 && (
            <span className="space-maker-empty">
              tap a widget below to put it on the wall
            </span>
          )}
          <div
            className="space-maker-cursor"
            style={{ "--cursor-color": identity.color } as CSSProperties}
            aria-hidden="true"
          >
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M2 1.5 L13.5 8 L8.2 9.3 L5.6 14.5 Z" />
            </svg>
            <span>{identity.name}</span>
          </div>
          {settingUp && <span className="join-stamp space-maker-stamp">yours</span>}
        </div>

        <ul className="space-maker-shapes">
          {SPACE_TEMPLATES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === pickedId ? "is-picked" : ""}
                style={{ "--shape-color": item.color } as CSSProperties}
                disabled={settingUp}
                onClick={() => pick(item.id)}
              >
                <span aria-hidden="true">{`${item.icon}\uFE0E`}</span>
                {item.name}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={isCustom ? "is-picked" : ""}
              style={{ "--shape-color": custom.color } as CSSProperties}
              disabled={settingUp}
              onClick={() => pick(CUSTOM_ID)}
            >
              <span aria-hidden="true">✎</span>
              blank
            </button>
          </li>
        </ul>

        {/* Keyed on the step so the new prong slides in. */}
        <div className="space-maker-body" key={step}>
          {step === "build" ? (
            <>
          <div className="space-maker-custom">
              <div className="space-maker-custom-row">
                <span className="space-maker-custom-label">colour</span>
                <span className="space-maker-swatches">
                  {swatches.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={color === custom.color ? "is-picked" : ""}
                      style={{ background: color }}
                      aria-label="Pick a colour"
                      onClick={() => setCustom((prev) => ({ ...prev, color }))}
                    />
                  ))}
                </span>
                <span className="space-maker-custom-label">mark</span>
                <span className="space-maker-marks">
                  {marks.map((mark) => (
                    <button
                      key={mark}
                      type="button"
                      className={mark === custom.icon ? "is-picked" : ""}
                      onClick={() => setCustom((prev) => ({ ...prev, icon: mark }))}
                    >
                      {`${mark}\uFE0E`}
                    </button>
                  ))}
                </span>
              </div>
              <div className="space-maker-custom-row">
                <span className="space-maker-custom-label">
                  on the wall
                  <small>
                    {custom.types.length}/{CUSTOM_MAX}
                  </small>
                </span>
                <span className="space-maker-types">
                  {types.map((type) => {
                    const item = widgetEntry(type);
                    if (!item) return null;
                    const on = custom.types.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        className={on ? "is-on" : ""}
                        onClick={() => toggleType(type)}
                      >
                        <span aria-hidden="true">{item.emoji}</span>
                        {item.label}
                      </button>
                    );
                  })}
                </span>
              </div>
            </div>

              <div className="space-maker-foot">
                <span className="space-maker-hint">
                  {settingUp
                    ? "setting the room up…"
                    : account.joined
                      ? `${shownName} — yours, from today.`
                      : `${shownName}, with ${custom.types.length} things on the wall.`}
                </span>
                <button
                  type="button"
                  className="claim-done"
                  disabled={settingUp}
                  onClick={() => (account.joined ? void make() : setStep("keep"))}
                >
                  {account.joined ? "make it" : "keep it"} <span aria-hidden="true">→</span>
                </button>
              </div>
            </>
          ) : (
            <form
              className="join-form space-maker-keep"
              onSubmit={(event) => {
                event.preventDefault();
                if (join.busy || settingUp) return;
                void (onCode ? join.verify(draft) : join.sendCode(draft));
              }}
            >
              <span className="claim-card-kicker">
                {settingUp ? "you're in" : onCode ? "check your email" : "where should the code go?"}
              </span>
              <p className="join-form-reason">
                {settingUp
                  ? `setting ${shownName} up…`
                  : onCode
                    ? `six numbers, on their way to ${join.email}. the last one opens the room.`
                    : `${shownName} is yours the moment the code lands.`}
              </p>

              {onCode ? (
                <CodeSlots
                  value={draft}
                  onChange={setDraft}
                  onComplete={(code) => {
                    void join.verify(code).then((ok) => {
                      if (ok) setMakeWhenJoined(true);
                    });
                  }}
                  disabled={join.busy || settingUp}
                />
              ) : (
                <div className="space-maker-keep-row">
                  <input
                    className="claim-name-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={64}
                    placeholder="you@email.com"
                    aria-label="Your email"
                    autoFocus
                  />
                  <button type="submit" className="claim-done" disabled={join.busy}>
                    {join.busy ? "sending…" : "send me a code"}
                  </button>
                </div>
              )}

              {(join.error || maker.error) && (
                <span className="join-form-error">{join.error ?? maker.error}</span>
              )}

              {!settingUp && (
                <div className="space-maker-foot">
                  <button
                    type="button"
                    className="join-form-back"
                    onClick={() => setStep("build")}
                  >
                    <span aria-hidden="true">←</span> back to the board
                  </button>
                  {onCode && (
                    <button
                      type="button"
                      className="join-form-back"
                      onClick={() => {
                        setDraft("");
                        join.restart();
                      }}
                    >
                      use a different email
                    </button>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
