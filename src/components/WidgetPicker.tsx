import { useEffect, useId, useState, type CSSProperties } from "react";
import { STICKER_CATALOG } from "../data/stickers";
import { SPACE_TEMPLATES, WIDGET_CATALOG } from "../data/templates";
import type { WidgetTemplate, WidgetType } from "../data/types";

const QUICK_TYPES: WidgetType[] = [
  "note",
  "photoWall",
  "poll",
  "countdown",
  "linkCard",
  "dailyQ",
  "rsvp",
  "potluck",
];

function WidgetPreview({ item }: { item: WidgetTemplate }) {
  const previewClassName = `widget-picker-preview widget-picker-preview-${item.type}`;

  switch (item.type) {
    case "frame":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-frame-label">frame</span>
          <span className="preview-frame-card preview-frame-card-one" />
          <span className="preview-frame-card preview-frame-card-two" />
        </span>
      );
    case "note":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-pin" />
          <span className="preview-line preview-line-long" />
          <span className="preview-line" />
          <span className="preview-line preview-line-short" />
        </span>
      );
    case "photoWall":
      return (
        <span className="widget-picker-preview widget-picker-preview-media" aria-hidden="true">
          <span className="preview-photo-sun" />
          <span className="preview-photo-hill preview-photo-hill-back" />
          <span className="preview-photo-hill" />
        </span>
      );
    case "poll":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-poll-bar preview-poll-bar-one" />
          <span className="preview-poll-bar preview-poll-bar-two" />
          <span className="preview-poll-bar preview-poll-bar-three" />
        </span>
      );
    case "countdown":
      return (
        <span className={previewClassName} aria-hidden="true">
          <strong>12</strong>
          <span>days</span>
        </span>
      );
    case "linkShelf":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-link-mark">↗</span>
          <span className="preview-link-copy">
            <span />
            <span />
          </span>
        </span>
      );
    case "linkCard":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-link-card-cover" />
          <span className="preview-link-card-paper">
            <i />
            <i />
            <i />
          </span>
          <span className="preview-link-card-tab">↗</span>
        </span>
      );
    case "availability":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-calendar-head">best fit</span>
          <span className="preview-calendar-grid">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      );
    case "decision":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-decision-check">✓</span>
          <span className="preview-decision-lines"><i /><i /><i /></span>
        </span>
      );
    case "playlist":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-playlist-art">♫</span>
          <span className="preview-playlist-lines"><i /><i /></span>
        </span>
      );
    case "dailyQ":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-question">Q</span>
          <span className="preview-answer-lines">
            <span />
            <span />
          </span>
        </span>
      );
    case "rsvp":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-rsvp-count">3 yes</span>
          <span className="preview-avatar-row">
            <span />
            <span />
            <span />
          </span>
        </span>
      );
    case "potluck":
      return (
        <span className={previewClassName} aria-hidden="true">
          <span className="preview-potluck-progress">
            <strong>2/4</strong>
            <i />
          </span>
          <span className="preview-check-row">
            <span>✓</span>
            <i />
          </span>
          <span className="preview-check-row">
            <span>✓</span>
            <i />
          </span>
          <span className="preview-check-row">
            <span />
            <i />
          </span>
        </span>
      );
    default:
      return (
        <span className={`${previewClassName} widget-picker-preview-generic`} aria-hidden="true">
          <span>{item.emoji}</span>
        </span>
      );
  }
}

export function WidgetPicker({
  open,
  mode = "widgets",
  onAddSticker,
  onAddWidget,
  onClose,
}: {
  open: boolean;
  mode?: "widgets" | "spaces";
  onAddSticker?: (stickerId: string) => void;
  onAddWidget?: (type: WidgetType) => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const gridId = useId();
  const stickersTitleId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const frameItem = WIDGET_CATALOG.find((item) => item.type === "frame");
  const addableWidgets = WIDGET_CATALOG.filter(
    (item) => item.type !== "chat" && item.type !== "frame" && !item.pickerHidden,
  );
  const visibleWidgets = showAll
    ? addableWidgets
    : QUICK_TYPES.map((type) => addableWidgets.find((item) => item.type === type)).filter(
        (item): item is (typeof addableWidgets)[number] => Boolean(item),
      );

  return (
    <div
      className={`widget-picker-backdrop ${
        mode === "widgets" ? "widget-picker-backdrop-popover" : ""
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`widget-picker ${mode === "widgets" ? "widget-picker-popover" : ""}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={mode === "widgets" ? descriptionId : undefined}
      >
        <header>
          <div>
            <h2 id={titleId}>
              {mode === "widgets" ? "add to this space" : "start a new space"}
            </h2>
            {mode === "widgets" && (
              <p id={descriptionId}>add content, or mark off a corner</p>
            )}
          </div>
          <button
            type="button"
            className="widget-picker-close"
            onClick={onClose}
            aria-label="Close widget picker"
          >
            ×
          </button>
        </header>

        {mode === "widgets" ? (
          <section>
            {frameItem && (
              <button
                type="button"
                className="widget-picker-frame-option"
                onClick={() => {
                  onAddWidget?.(frameItem.type);
                  onClose();
                }}
              >
                <WidgetPreview item={frameItem} />
                <span className="widget-picker-frame-copy">
                  <strong>add a frame</strong>
                  <span>organize related widgets without making a new space</span>
                </span>
                <span className="widget-picker-frame-action" aria-hidden="true">
                  add&nbsp; ↗
                </span>
              </button>
            )}
            <div
              className="widget-picker-sticker-section"
              aria-labelledby={stickersTitleId}
            >
              <div className="widget-picker-sticker-heading">
                <h3 id={stickersTitleId}>stickers</h3>
                <span>peel one off</span>
              </div>
              <ul className="widget-picker-sticker-list">
                {STICKER_CATALOG.map((sticker, index) => (
                  <li
                    key={sticker.id}
                    style={{ "--i": index } as CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onAddSticker?.(sticker.id);
                        onClose();
                      }}
                      aria-label={`Add ${sticker.label} sticker`}
                      title={sticker.label}
                    >
                      <img
                        src={sticker.src}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        decoding="async"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="widget-picker-grid" id={gridId}>
              {visibleWidgets.map((item) => (
                <li key={item.type}>
                  <button
                    type="button"
                    onClick={() => {
                      onAddWidget?.(item.type);
                      onClose();
                    }}
                  >
                    <WidgetPreview item={item} />
                    <span className="widget-picker-label">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="widget-picker-more"
              onClick={() => setShowAll((value) => !value)}
              aria-expanded={showAll}
              aria-controls={gridId}
            >
              <span>
                {showAll ? "back to quick picks" : "browse all widgets"}
                {!showAll && <small> · {addableWidgets.length + 1}</small>}
              </span>
              <span aria-hidden="true">{showAll ? "←" : "›"}</span>
            </button>
          </section>
        ) : (
          <section>
            <ul className="template-list">
              {SPACE_TEMPLATES.map((template) => (
                <li key={template.id}>
                  <button type="button" style={{ borderColor: template.color }}>
                    <span className="template-icon" style={{ background: template.color }}>
                      {template.icon}
                    </span>
                    <span className="template-copy">
                      <strong>{template.name}</strong>
                      <span>{template.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
