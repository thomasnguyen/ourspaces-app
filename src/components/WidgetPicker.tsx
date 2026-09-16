import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { STICKER_CATALOG } from "../data/stickers";
import { WIDGET_CATALOG } from "../data/templates";
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

const WIDGET_DETAILS: Partial<Record<WidgetType, { description: string; category: string }>> = {
  note: { description: "Leave a little reminder", category: "Share" },
  photoWall: { description: "Keep the good moments", category: "Share" },
  poll: { description: "Let the group decide", category: "Plan" },
  countdown: { description: "Count down to a good day", category: "Plan" },
  linkCard: { description: "Turn a URL into a post", category: "Share" },
  dailyQ: { description: "Get everyone talking", category: "Play" },
  rsvp: { description: "See who's coming", category: "Plan" },
  potluck: { description: "Pick what you're bringing", category: "Plan" },
  availability: { description: "Find a time that works", category: "Plan" },
  linkShelf: { description: "Save links worth keeping", category: "Share" },
  playlist: { description: "Put something on together", category: "Play" },
  jokeRegistry: { description: "Keep the inside jokes alive", category: "Play" },
  expenseSplit: { description: "Work out who owes what", category: "Plan" },
  itinerary: { description: "Give the trip a plan", category: "Plan" },
  weather: { description: "Check the forecast", category: "Plan" },
  sports: { description: "Follow the game together", category: "Play" },
  backendLive: { description: "See the space's live activity", category: "Build" },
  wheel: { description: "Leave the choice to chance", category: "Play" },
  cozyColor: { description: "Color a picture together", category: "Play" },
  linkPile: { description: "Collect finds from the web", category: "Build" },
  hotLinks: { description: "See what everyone's into", category: "Build" },
  shipPost: { description: "Show the thing you made", category: "Build" },
  roundtable: { description: "Start a shared discussion", category: "Build" },
};
const CATEGORIES = ["All", "Share", "Plan", "Play", "Build"];

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
    case "wheel":
      return <span className={`${previewClassName} preview-mini-wheel`} aria-hidden="true"><i /><i /><i /><i /><b>↗</b></span>;
    case "cozyColor":
      return <span className={`${previewClassName} preview-mini-paint`} aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>;
    case "weather":
      return <span className={`${previewClassName} preview-mini-weather`} aria-hidden="true"><i /><strong>24°</strong></span>;
    case "sports":
      return <span className={`${previewClassName} preview-mini-score`} aria-hidden="true"><small>live</small><strong>2 : 1</strong></span>;
    case "expenseSplit":
      return <span className={`${previewClassName} preview-mini-receipt`} aria-hidden="true"><strong>$24</strong><i /><i /><i /></span>;
    case "itinerary":
      return <span className={`${previewClassName} preview-mini-route`} aria-hidden="true"><i /><i /><i /></span>;
    case "jokeRegistry":
    case "roundtable":
      return <span className={`${previewClassName} preview-mini-talk`} aria-hidden="true"><b>{item.type === "jokeRegistry" ? "ha!" : "..."}</b><i /></span>;
    case "backendLive":
      return <span className={`${previewClassName} preview-mini-pulse`} aria-hidden="true"><i /><i /><i /><i /><i /></span>;
    default:
      return <span className={`${previewClassName} preview-mini-post`} aria-hidden="true"><b>{item.type === "shipPost" ? "✦" : "↗"}</b><i /><i /></span>;
  }
}

export function WidgetPicker({
  open,
  onAddSticker,
  onAddWidget,
  onClose,
}: {
  open: boolean;
  onAddSticker?: (stickerId: string, origin?: { x: number; y: number }) => void;
  onAddWidget?: (type: WidgetType, origin?: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickersRef = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      setShowAll(false);
      setSearch("");
      setCategory("All");
      return;
    }
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
    ? addableWidgets.filter((item) => {
        const details = WIDGET_DETAILS[item.type];
        return (category === "All" || details?.category === category) &&
          `${item.label} ${details?.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
      })
    : QUICK_TYPES.map((type) => addableWidgets.find((item) => item.type === type)).filter(
        (item): item is WidgetTemplate => Boolean(item),
      );
  const switchView = () => {
    setShowAll(!showAll);
    setSearch("");
    setCategory("All");
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div className="widget-picker-backdrop widget-picker-backdrop-popover" onClick={onClose} role="presentation">
      <div className={`widget-picker widget-picker-popover widget-picker-tray${showAll ? " is-browsing" : ""}`}
        onClick={(event) => event.stopPropagation()} role="dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <header>
          <div>
            {showAll && <button type="button" className="widget-picker-back" onClick={switchView}>← quick picks</button>}
            <h2 id={titleId}>{showAll ? "find your next widget" : "add to this space"}</h2>
            <p id={descriptionId}>{showAll ? "A little something for whatever you're doing." : "Make a plan, share a moment, start something."}</p>
          </div>
          <button type="button" className="widget-picker-close" onClick={onClose} aria-label="Close widget picker">×</button>
        </header>

        {showAll && <div className="widget-picker-tools">
          <label className="widget-picker-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input value={search} onChange={(event) => { setSearch(event.target.value); scrollRef.current?.scrollTo({ top: 0 }); }} placeholder="Find a widget…" aria-label="Find a widget" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
          </label>
          <div className="widget-picker-categories">
            {CATEGORIES.map((name) => <button type="button" key={name} className={category === name ? "is-selected" : ""}
              onClick={() => { setCategory(name); scrollRef.current?.scrollTo({ top: 0 }); }}>{name.toLowerCase()}</button>)}
          </div>
        </div>}

        <div className="widget-picker-content" ref={scrollRef}>
          <div className="widget-picker-section-heading"><h3>{showAll ? (category === "All" ? "all widgets" : category.toLowerCase()) : "the go-tos"}</h3><span>{showAll ? `${visibleWidgets.length} widgets` : "pick one, place it anywhere"}</span></div>
          <ul className="widget-picker-grid">
            {visibleWidgets.map((item) => <li key={item.type}>
              <button type="button" onClick={(event) => { onAddWidget?.(item.type, { x: event.clientX, y: event.clientY }); onClose(); }}>
                <span className="widget-picker-art"><WidgetPreview item={item} /></span>
                <span className="widget-picker-copy"><span className="widget-picker-label">{item.label}</span><span className="widget-picker-description">{WIDGET_DETAILS[item.type]?.description}</span></span>
                <span className="widget-picker-tile-add" aria-hidden="true">+</span>
              </button>
            </li>)}
          </ul>
          {visibleWidgets.length === 0 && <div className="widget-picker-empty"><strong>No widgets found</strong><p>Try “photo”, “plan”, or another word.</p><button type="button" onClick={() => { setSearch(""); setCategory("All"); }}>show all widgets ↗</button></div>}
          {!showAll && <button type="button" className="widget-picker-more" onClick={switchView}><span>browse all widgets <small>{addableWidgets.length}</small></span><span aria-hidden="true">↗</span></button>}
          {frameItem && <button type="button" className="widget-picker-frame-option" onClick={(event) => { onAddWidget?.("frame", { x: event.clientX, y: event.clientY }); onClose(); }}>
            <WidgetPreview item={frameItem} /><span className="widget-picker-frame-copy"><strong>give it a corner</strong><span>Group your widgets in a frame.</span></span><span className="widget-picker-frame-action">+ frame</span>
          </button>}
        </div>

        <div className="widget-picker-sticker-section">
          <div className="widget-picker-sticker-heading"><h3>stickers <span>just for fun</span></h3><div className="widget-picker-sticker-controls"><button type="button" aria-label="Previous stickers" onClick={() => stickersRef.current?.scrollBy({ left: -240, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>←</button><button type="button" aria-label="More stickers" onClick={() => stickersRef.current?.scrollBy({ left: 240, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>→</button></div></div>
          <ul className="widget-picker-sticker-list" ref={stickersRef}>
            {STICKER_CATALOG.map((sticker, index) => <li key={sticker.id} style={{ "--i": index } as CSSProperties}>
              <button type="button" onClick={(event) => { onAddSticker?.(sticker.id, { x: event.clientX, y: event.clientY }); onClose(); }} aria-label={`Add ${sticker.label} sticker`} title={sticker.label}>
                <img src={sticker.src} alt="" aria-hidden="true" draggable={false} decoding="async" />
              </button>
            </li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
