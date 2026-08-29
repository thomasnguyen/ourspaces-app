import { useEffect, useId, useState } from "react";
import { WIDGET_CATALOG } from "../data/templates";
import type { Widget } from "../data/types";
import { DEFAULT_STATION_ID, RADIO_STATIONS } from "../lib/radio";

type PollOption = {
  id: string;
  label: string;
  votes: number;
  total: number;
};

type GenericField = {
  key: string;
  label: string;
  multiline: boolean;
};

type WidgetLayoutUpdate = Pick<Widget, "w" | "h">;

const FRAME_SIZE_PRESETS: Array<
  WidgetLayoutUpdate & { id: string; label: string }
> = [
  { id: "compact", label: "compact", w: 420, h: 260 },
  { id: "wide", label: "wide", w: 680, h: 360 },
  { id: "roomy", label: "roomy", w: 920, h: 520 },
];

const POLL_TONES = [
  { id: "blush", label: "blush", swatch: "#ffc5df" },
  { id: "butter", label: "butter", swatch: "#ffdf7e" },
  { id: "mint", label: "mint", swatch: "#beefd4" },
  { id: "sky", label: "sky", swatch: "#bfdcff" },
  { id: "violet", label: "violet", swatch: "#7853ff" },
];

/* the countdown is the loud flat card, so its swatches are the saturated set */
const COUNTDOWN_TONES = [
  { id: "blush", label: "blush", swatch: "#e9369d" },
  { id: "butter", label: "butter", swatch: "#ffb800" },
  { id: "mint", label: "mint", swatch: "#13b8a6" },
  { id: "sky", label: "sky", swatch: "#3f70ff" },
  { id: "violet", label: "violet", swatch: "#7853ff" },
];

const NOTE_STYLES = [
  { id: "white", label: "paper", swatch: "#fffaf7" },
  { id: "warm", label: "butter", swatch: "#ffd377" },
  { id: "crew", label: "blush", swatch: "#ef3d99" },
];

const TARGET_TONES = [
  { id: "lime", label: "lime", swatch: "#c9ff3d" },
  { id: "blush", label: "blush", swatch: "#e9369d" },
  { id: "butter", label: "butter", swatch: "#ffb800" },
  { id: "mint", label: "mint", swatch: "#13b8a6" },
  { id: "sky", label: "sky", swatch: "#3f70ff" },
  { id: "violet", label: "violet", swatch: "#7853ff" },
];

function ToneSwatches({
  value,
  onChange,
  legend = "Tone",
}: {
  value: string;
  onChange: (tone: string) => void;
  legend?: string;
}) {
  return (
    <fieldset className="widget-editor-swatches">
      <legend>{legend}</legend>
      <div className="widget-editor-swatch-row">
        {TARGET_TONES.map((toneOption) => (
          <button
            type="button"
            key={toneOption.id}
            className={value === toneOption.id ? "is-active" : ""}
            style={{ background: toneOption.swatch }}
            onClick={() => onChange(toneOption.id)}
            aria-pressed={value === toneOption.id}
            aria-label={`${toneOption.label} tone`}
            title={toneOption.label}
          />
        ))}
      </div>
    </fieldset>
  );
}

function genericFieldFor(widget: Widget | null): GenericField | null {
  if (!widget) return null;

  if (
    widget.type === "decision" ||
    widget.type === "availability" ||
    widget.type === "linkShelf" ||
    widget.type === "playlist"
  ) {
    return null;
  }

  if (widget.type === "photoWall") {
    return { key: "title", label: "Wall title", multiline: false };
  }

  if (typeof widget.data.title === "string") {
    return { key: "title", label: "Title", multiline: false };
  }
  if (typeof widget.data.text === "string") {
    return { key: "text", label: "Text", multiline: true };
  }
  if (typeof widget.data.caption === "string") {
    return { key: "caption", label: "Caption", multiline: false };
  }
  if (typeof widget.data.question === "string") {
    return { key: "question", label: "Question", multiline: true };
  }
  if (typeof widget.data.label === "string") {
    return { key: "label", label: "Label", multiline: false };
  }

  return null;
}

function countdownData(
  widget: Widget,
  targetDate: string,
  event: string,
  tone: string,
): Widget["data"] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(today.getDate()).padStart(2, "0")}`;

  return {
    ...widget.data,
    targetDate,
    // the day strip starts counting from when the countdown was (re)pointed
    startDate:
      typeof widget.data.startDate === "string" && widget.data.targetDate === targetDate
        ? widget.data.startDate
        : todayIso,
    event: event.trim(),
    tone,
  };
}

export function WidgetEditorPanel({
  widget,
  onClose,
  onSave,
  onDelete,
  onFrameLayoutChange,
  onFrameLayoutCommit,
}: {
  widget: Widget | null;
  onClose: () => void;
  onSave: (
    widgetId: string,
    data: Widget["data"],
    layout?: WidgetLayoutUpdate,
  ) => void;
  onDelete?: (widgetId: string, label: string) => void;
  onFrameLayoutChange?: (
    widgetId: string,
    layout: WidgetLayoutUpdate,
  ) => void;
  onFrameLayoutCommit?: (widgetId: string) => void;
}) {
  const titleId = useId();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<PollOption[]>([]);
  const [pollTone, setPollTone] = useState("blush");
  const [noteTone, setNoteTone] = useState("warm");
  const [targetDate, setTargetDate] = useState("");
  const [countdownEvent, setCountdownEvent] = useState("");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionDetail, setDecisionDetail] = useState("");
  const [decisionSource, setDecisionSource] = useState("");
  const [decisionTone, setDecisionTone] = useState("lime");
  const [availabilityTitle, setAvailabilityTitle] = useState("");
  const [availabilityBest, setAvailabilityBest] = useState("");
  const [availabilityTone, setAvailabilityTone] = useState("sky");
  const [linkShelfTitle, setLinkShelfTitle] = useState("");
  const [linkShelfTone, setLinkShelfTone] = useState("sky");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistStationId, setPlaylistStationId] = useState(DEFAULT_STATION_ID);
  const [playlistTone, setPlaylistTone] = useState("violet");
  const [genericValue, setGenericValue] = useState("");
  const [frameTitle, setFrameTitle] = useState("");
  const [frameSubtitle, setFrameSubtitle] = useState("");
  const [frameWidth, setFrameWidth] = useState(680);
  const [frameHeight, setFrameHeight] = useState(360);
  const [attemptedSave, setAttemptedSave] = useState(false);

  useEffect(() => {
    if (!widget) return;

    setQuestion(String(widget.data.question ?? ""));
    setPollTone(
      String(widget.data.tone ?? (widget.type === "countdown" ? "violet" : "blush")),
    );
    setNoteTone(String(widget.data.tone ?? "warm"));
    setOptions(
      Array.isArray(widget.data.options)
        ? (widget.data.options as PollOption[]).map((option) => ({ ...option }))
        : [],
    );
    setTargetDate(String(widget.data.targetDate ?? ""));
    setCountdownEvent(String(widget.data.event ?? ""));
    setDecisionTitle(String(widget.data.title ?? "decision made"));
    setDecisionDetail(String(widget.data.detail ?? ""));
    setDecisionSource(String(widget.data.source ?? "promoted from chat"));
    setDecisionTone(String(widget.data.tone ?? "lime"));
    setAvailabilityTitle(String(widget.data.title ?? "when can we all meet?"));
    setAvailabilityBest(String(widget.data.best ?? ""));
    setAvailabilityTone(String(widget.data.tone ?? "sky"));
    setLinkShelfTitle(String(widget.data.title ?? "saved links"));
    setLinkShelfTone(String(widget.data.tone ?? "sky"));
    setPlaylistTitle(String(widget.data.title ?? "shared soundtrack"));
    setPlaylistStationId(String(widget.data.stationId || DEFAULT_STATION_ID));
    setPlaylistTone(String(widget.data.tone ?? "violet"));
    setFrameTitle(String(widget.data.title ?? "frame"));
    setFrameSubtitle(String(widget.data.subtitle ?? ""));
    setFrameWidth(widget.w);
    setFrameHeight(widget.h);

    const genericField = genericFieldFor(widget);
    setGenericValue(genericField ? String(widget.data[genericField.key] ?? "") : "");
    setAttemptedSave(false);
  }, [widget?.id]);

  useEffect(() => {
    if (widget?.type !== "frame") return;
    setFrameWidth(widget.w);
    setFrameHeight(widget.h);
  }, [widget?.h, widget?.id, widget?.type, widget?.w]);

  useEffect(() => {
    if (!widget) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, widget]);

  if (!widget) return null;

  const widgetLabel =
    WIDGET_CATALOG.find((item) => item.type === widget.type)?.label ?? widget.type;
  const isFrame = widget.type === "frame";
  const isPoll = widget.type === "poll";
  const isDailyQ = widget.type === "dailyQ";
  const isCountdown = widget.type === "countdown";
  const isRsvp = widget.type === "rsvp";
  const isPotluck = widget.type === "potluck";
  const isNote = widget.type === "note";
  const isPhotoWall = widget.type === "photoWall";
  const isDecision = widget.type === "decision";
  const isAvailability = widget.type === "availability";
  const isLinkShelf = widget.type === "linkShelf";
  const isPlaylist = widget.type === "playlist";
  const genericField = genericFieldFor(widget);
  const pollIsValid =
    question.trim().length > 0 &&
    options.length >= 2 &&
    options.every((option) => option.label.trim().length > 0);
  const countdownIsValid = targetDate.length > 0;
  const genericIsValid = Boolean(genericField && genericValue.trim().length > 0);
  const decisionIsValid = decisionTitle.trim().length > 0;
  const availabilityIsValid = availabilityTitle.trim().length > 0;
  const linkShelfIsValid = linkShelfTitle.trim().length > 0;
  const playlistIsValid = playlistTitle.trim().length > 0;
  const frameIsValid =
    frameTitle.trim().length > 0 &&
    frameWidth >= 280 &&
    frameWidth <= 1200 &&
    frameHeight >= 140 &&
    frameHeight <= 800;
  const isValid = isFrame
    ? frameIsValid
    : isPoll
      ? pollIsValid
      : isDailyQ
        ? question.trim().length > 0
        : isCountdown
          ? countdownIsValid
          : isDecision
            ? decisionIsValid
            : isAvailability
              ? availabilityIsValid
              : isLinkShelf
                ? linkShelfIsValid
                : isPlaylist
                  ? playlistIsValid
                  : genericIsValid;

  const save = () => {
    setAttemptedSave(true);
    if (!isValid) return;

    if (isFrame) {
      onSave(
        widget.id,
        {
          ...widget.data,
          title: frameTitle.trim(),
          subtitle: frameSubtitle.trim() || "shared corner",
        },
        { w: frameWidth, h: frameHeight },
      );
      return;
    }

    if (isPoll) {
      onSave(widget.id, {
        ...widget.data,
        question: question.trim(),
        tone: pollTone,
        options: options.map((option) => ({
          ...option,
          label: option.label.trim(),
          total: option.total || 1,
        })),
      });
      return;
    }

    if (isDailyQ) {
      onSave(widget.id, {
        ...widget.data,
        question: question.trim(),
        tone: pollTone,
      });
      return;
    }

    if (isCountdown) {
      onSave(widget.id, countdownData(widget, targetDate, countdownEvent, pollTone));
      return;
    }

    if (isDecision) {
      onSave(widget.id, {
        ...widget.data,
        title: decisionTitle.trim(),
        detail: decisionDetail.trim(),
        source: decisionSource.trim() || "promoted from chat",
        tone: decisionTone,
      });
      return;
    }

    if (isAvailability) {
      onSave(widget.id, {
        ...widget.data,
        title: availabilityTitle.trim(),
        best: availabilityBest.trim(),
        tone: availabilityTone,
      });
      return;
    }

    if (isLinkShelf) {
      onSave(widget.id, {
        ...widget.data,
        title: linkShelfTitle.trim(),
        tone: linkShelfTone,
      });
      return;
    }

    if (isPlaylist) {
      onSave(widget.id, {
        ...widget.data,
        title: playlistTitle.trim(),
        stationId: playlistStationId,
        tone: playlistTone,
      });
      return;
    }

    if (isNote && genericField) {
      onSave(widget.id, {
        ...widget.data,
        [genericField.key]: genericValue.trim(),
        tone: noteTone,
      });
      return;
    }

    if ((isPotluck || isPhotoWall) && genericField) {
      onSave(widget.id, {
        ...widget.data,
        [genericField.key]: genericValue.trim(),
        tone: pollTone,
      });
      return;
    }

    if (genericField) {
      onSave(widget.id, {
        ...widget.data,
        [genericField.key]: genericValue.trim(),
        ...(isRsvp ? { tone: pollTone } : {}),
      });
    }
  };

  return (
    <aside className="widget-editor-panel" aria-labelledby={titleId}>
      <header className="widget-editor-header">
        <div>
          <span className="widget-editor-type">
            {isFrame ? "frame settings" : `${widgetLabel} widget`}
          </span>
          <h2 id={titleId}>edit {widgetLabel}</h2>
        </div>
        <button
          type="button"
          className="widget-editor-close"
          onClick={onClose}
          aria-label="Close widget editor"
        >
          ×
        </button>
      </header>

      <form
        className="widget-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="widget-editor-fields">
          {isFrame && (
            <>
              <div className="frame-editor-guide">
                <span className="frame-editor-guide-preview" aria-hidden="true">
                  <i>frame</i>
                  <b />
                  <b />
                  <b />
                </span>
                <div>
                  <strong>Adjust it on the canvas.</strong>
                  <p>
                    Drag the title to move. Drag any corner to resize. Widgets
                    light up when they’re included.
                  </p>
                </div>
              </div>

              <label className="widget-editor-field">
                <span>Frame name</span>
                <input
                  type="text"
                  value={frameTitle}
                  onChange={(event) => setFrameTitle(event.target.value)}
                  placeholder="reading table"
                  autoFocus
                />
              </label>

              <label className="widget-editor-field">
                <span>Edge note</span>
                <input
                  type="text"
                  value={frameSubtitle}
                  onChange={(event) => setFrameSubtitle(event.target.value)}
                  placeholder="what belongs in this corner?"
                />
                <small>This stays quiet on the frame’s opposite edge.</small>
              </label>

              <fieldset className="frame-editor-size">
                <legend>Quick sizes</legend>
                <div className="frame-editor-presets">
                  {FRAME_SIZE_PRESETS.map((preset) => {
                    const active =
                      frameWidth === preset.w && frameHeight === preset.h;
                    return (
                      <button
                        type="button"
                        key={preset.id}
                        className={active ? "is-active" : ""}
                        onClick={() => {
                          setFrameWidth(preset.w);
                          setFrameHeight(preset.h);
                          onFrameLayoutChange?.(widget.id, {
                            w: preset.w,
                            h: preset.h,
                          });
                          onFrameLayoutCommit?.(widget.id);
                        }}
                        aria-pressed={active}
                      >
                        <span
                          className={`frame-size-shape frame-size-shape-${preset.id}`}
                          aria-hidden="true"
                        />
                        <strong>{preset.label}</strong>
                        <small>
                          {preset.w} × {preset.h}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <small>
                  Overlap is okay—a widget can sit in more than one frame.
                  Frames never move widgets.
                </small>
              </fieldset>
            </>
          )}

          {isPoll && (
            <>
              <label className="widget-editor-field">
                <span>Question</span>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={3}
                  autoFocus
                />
              </label>

              <fieldset className="widget-editor-swatches">
                <legend>Color</legend>
                <div className="widget-editor-swatch-row">
                  {POLL_TONES.map((toneOption) => (
                    <button
                      type="button"
                      key={toneOption.id}
                      className={pollTone === toneOption.id ? "is-active" : ""}
                      style={{ background: toneOption.swatch }}
                      onClick={() => setPollTone(toneOption.id)}
                      aria-pressed={pollTone === toneOption.id}
                      aria-label={`${toneOption.label} color`}
                      title={toneOption.label}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset className="widget-editor-options">
                <legend>Answer options</legend>
                <div className="widget-editor-option-list">
                  {options.map((option, index) => (
                    <div className="widget-editor-option" key={option.id}>
                      <span aria-hidden="true">{index + 1}</span>
                      <label>
                        <span className="sr-only">Option {index + 1}</span>
                        <input
                          type="text"
                          value={option.label}
                          onChange={(event) =>
                            setOptions((current) =>
                              current.map((item) =>
                                item.id === option.id
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((current) =>
                            current.filter((item) => item.id !== option.id),
                          )
                        }
                        disabled={options.length <= 2}
                        aria-label={`Delete option ${index + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="widget-editor-add-option"
                  onClick={() =>
                    setOptions((current) => [
                      ...current,
                      {
                        id: `local-option-${Date.now()}`,
                        label: "",
                        votes: 0,
                        total: 1,
                      },
                    ])
                  }
                >
                  + add an option
                </button>
              </fieldset>
            </>
          )}

          {isDailyQ && (
            <>
              <label className="widget-editor-field">
                <span>Question</span>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={3}
                  autoFocus
                />
                <small>Answers stay scribbled until each person posts theirs.</small>
              </label>

              <fieldset className="widget-editor-swatches">
                <legend>Color</legend>
                <div className="widget-editor-swatch-row">
                  {POLL_TONES.map((toneOption) => (
                    <button
                      type="button"
                      key={toneOption.id}
                      className={pollTone === toneOption.id ? "is-active" : ""}
                      style={{ background: toneOption.swatch }}
                      onClick={() => setPollTone(toneOption.id)}
                      aria-pressed={pollTone === toneOption.id}
                      aria-label={`${toneOption.label} color`}
                      title={toneOption.label}
                    />
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {isCountdown && (
            <>
              <label className="widget-editor-field">
                <span>Target date</span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  autoFocus
                />
                <small>We’ll calculate the days automatically.</small>
              </label>
              <label className="widget-editor-field">
                <span>What for?</span>
                <input
                  type="text"
                  value={countdownEvent}
                  onChange={(event) => setCountdownEvent(event.target.value)}
                  placeholder="maya's bday 🎂"
                />
                <small>Shows as a sticker on the card. Leave blank to skip it.</small>
              </label>

              <fieldset className="widget-editor-swatches">
                <legend>Color</legend>
                <div className="widget-editor-swatch-row">
                  {COUNTDOWN_TONES.map((toneOption) => (
                    <button
                      type="button"
                      key={toneOption.id}
                      className={pollTone === toneOption.id ? "is-active" : ""}
                      style={{ background: toneOption.swatch }}
                      onClick={() => setPollTone(toneOption.id)}
                      aria-pressed={pollTone === toneOption.id}
                      aria-label={`${toneOption.label} color`}
                      title={toneOption.label}
                    />
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {isDecision && (
            <>
              <label className="widget-editor-field">
                <span>Status</span>
                <input
                  type="text"
                  value={decisionTitle}
                  onChange={(event) => setDecisionTitle(event.target.value)}
                  placeholder="decision made"
                  autoFocus
                />
                <small>The receipt headline—keep it short and clear.</small>
              </label>
              <label className="widget-editor-field">
                <span>Outcome</span>
                <textarea
                  value={decisionDetail}
                  onChange={(event) => setDecisionDetail(event.target.value)}
                  rows={3}
                  placeholder="6pm · Sam's place"
                />
                <small>Leave this blank to show the missing-outcome state.</small>
              </label>
              <label className="widget-editor-field">
                <span>Source</span>
                <input
                  type="text"
                  value={decisionSource}
                  onChange={(event) => setDecisionSource(event.target.value)}
                  placeholder="promoted from chat"
                />
              </label>
              <ToneSwatches value={decisionTone} onChange={setDecisionTone} legend="Receipt tone" />
            </>
          )}

          {isAvailability && (
            <>
              <label className="widget-editor-field">
                <span>Title</span>
                <input
                  type="text"
                  value={availabilityTitle}
                  onChange={(event) => setAvailabilityTitle(event.target.value)}
                  placeholder="when can we all meet?"
                  autoFocus
                />
              </label>
              <label className="widget-editor-field">
                <span>Best fit label</span>
                <input
                  type="text"
                  value={availabilityBest}
                  onChange={(event) => setAvailabilityBest(event.target.value)}
                  placeholder="Sat"
                />
                <small>Use the same day label as the schedule when possible.</small>
              </label>
              <ToneSwatches value={availabilityTone} onChange={setAvailabilityTone} legend="Schedule tone" />
              <p className="widget-editor-note">Dates and member rows stay seeded for this prototype.</p>
            </>
          )}

          {isLinkShelf && (
            <>
              <label className="widget-editor-field">
                <span>Shelf title</span>
                <input
                  type="text"
                  value={linkShelfTitle}
                  onChange={(event) => setLinkShelfTitle(event.target.value)}
                  placeholder="saved links"
                  autoFocus
                />
              </label>
              <ToneSwatches value={linkShelfTone} onChange={setLinkShelfTone} legend="Shelf tone" />
              <p className="widget-editor-note">Link rows are seeded content in this wave.</p>
            </>
          )}

          {isPlaylist && (
            <>
              <label className="widget-editor-field">
                <span>Title</span>
                <input
                  type="text"
                  value={playlistTitle}
                  onChange={(event) => setPlaylistTitle(event.target.value)}
                  placeholder="shared soundtrack"
                  autoFocus
                />
              </label>
              <fieldset className="widget-editor-swatches">
                <legend>SomaFM station</legend>
                <div className="widget-editor-station-row">
                  {RADIO_STATIONS.map((station) => (
                    <button
                      type="button"
                      key={station.id}
                      className={playlistStationId === station.id ? "is-active" : ""}
                      onClick={() => setPlaylistStationId(station.id)}
                      aria-pressed={playlistStationId === station.id}
                    >
                      {station.chip}
                    </button>
                  ))}
                </div>
              </fieldset>
              <ToneSwatches value={playlistTone} onChange={setPlaylistTone} legend="Radio tone" />
            </>
          )}

          {isNote && (
            <fieldset className="widget-editor-swatches">
              <legend>Style</legend>
              <div className="widget-editor-swatch-row">
                {NOTE_STYLES.map((styleOption) => (
                  <button
                    type="button"
                    key={styleOption.id}
                    className={noteTone === styleOption.id ? "is-active" : ""}
                    style={{ background: styleOption.swatch }}
                    onClick={() => setNoteTone(styleOption.id)}
                    aria-pressed={noteTone === styleOption.id}
                    aria-label={`${styleOption.label} note style`}
                    title={styleOption.label}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {(isPotluck || isPhotoWall) && (
            <fieldset className="widget-editor-swatches">
              <legend>Color</legend>
              <div className="widget-editor-swatch-row">
                {POLL_TONES.map((toneOption) => (
                  <button
                    type="button"
                    key={toneOption.id}
                    className={pollTone === toneOption.id ? "is-active" : ""}
                    style={{ background: toneOption.swatch }}
                    onClick={() => setPollTone(toneOption.id)}
                    aria-pressed={pollTone === toneOption.id}
                    aria-label={`${toneOption.label} color`}
                    title={toneOption.label}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {!isFrame &&
            !isPoll &&
            !isDailyQ &&
            !isCountdown &&
            !isDecision &&
            !isAvailability &&
            !isLinkShelf &&
            !isPlaylist &&
            genericField && (
            <label className="widget-editor-field">
              <span>{genericField.label}</span>
              {genericField.multiline ? (
                <textarea
                  value={genericValue}
                  onChange={(event) => setGenericValue(event.target.value)}
                  rows={5}
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  value={genericValue}
                  onChange={(event) => setGenericValue(event.target.value)}
                  autoFocus
                />
              )}
            </label>
          )}

          {isRsvp && (
            <fieldset className="widget-editor-swatches">
              <legend>Color</legend>
              <div className="widget-editor-swatch-row">
                {POLL_TONES.map((toneOption) => (
                  <button
                    type="button"
                    key={toneOption.id}
                    className={pollTone === toneOption.id ? "is-active" : ""}
                    style={{ background: toneOption.swatch }}
                    onClick={() => setPollTone(toneOption.id)}
                    aria-pressed={pollTone === toneOption.id}
                    aria-label={`${toneOption.label} color`}
                    title={toneOption.label}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {!isFrame &&
            !isPoll &&
            !isDailyQ &&
            !isCountdown &&
            !isDecision &&
            !isAvailability &&
            !isLinkShelf &&
            !isPlaylist &&
            !genericField && (
            <div className="widget-editor-empty">
              <strong>Nothing to edit here yet.</strong>
              <p>This widget already uses the shared editor. Its fields can be added later.</p>
            </div>
          )}

          {attemptedSave && !isValid && (
            <p className="widget-editor-error" role="alert">
              {isPoll
                ? "Add a question and at least two complete options."
                : isFrame
                  ? "Add a frame name."
                : isDailyQ
                  ? "Add a question before saving."
                : isCountdown
                  ? "Choose the date you’re counting down to."
                  : isDecision
                    ? "Add a status before saving."
                    : isAvailability
                      ? "Add a schedule title before saving."
                      : isLinkShelf
                        ? "Add a shelf title before saving."
                        : isPlaylist
                          ? "Add a playlist title before saving."
                  : "Add some text before saving."}
            </p>
          )}
        </div>

        <footer className="widget-editor-actions">
          {isFrame && onDelete && (
            <button
              type="button"
              className="widget-editor-delete"
              onClick={() =>
                onDelete(widget.id, frameTitle.trim() || "frame")
              }
            >
              delete frame
            </button>
          )}
          <button type="button" className="widget-editor-cancel" onClick={onClose}>
            {isFrame ? "cancel" : "keep as-is"}
          </button>
          <button
            type="submit"
            className="widget-editor-save"
            disabled={
              !isFrame &&
              !genericField &&
              !isPoll &&
              !isCountdown &&
              !isDecision &&
              !isAvailability &&
              !isLinkShelf &&
              !isPlaylist
            }
          >
            {isFrame ? "done" : "save changes"}
          </button>
        </footer>
      </form>
    </aside>
  );
}
