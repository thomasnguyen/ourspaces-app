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

const CATEGORY_TITLES: Record<string, string> = {
  Share: "a little of you",
  Plan: "make a plan",
  Play: "just for fun",
  Build: "make something together",
};

function CatalogPreview({ item }: { item: WidgetTemplate }) {
  return (
    <span className={`catalog-art catalog-art-${item.type}`} aria-hidden="true">
      {item.type === "note" ? (
        <span className="catalog-note"><i /><small>little reminder</small><strong>bring the<br />good snacks.</strong><span>♡</span></span>
      ) : item.type === "photoWall" ? (
        <span className="catalog-photos"><span><WidgetPreview item={item} /><small>the good days</small></span><span><WidgetPreview item={item} /><small>us, lately ♡</small></span></span>
      ) : item.type === "poll" ? (
        <span className="catalog-paper catalog-poll"><strong>friday dinner?</strong><span>pizza <b>3</b></span><span>tacos <b>2</b></span><small>everyone gets a say</small></span>
      ) : item.type === "countdown" ? (
        <span className="catalog-countdown"><small>next adventure</small><strong>12<span>days!</span></strong><i>✦</i></span>
      ) : item.type === "dailyQ" ? (
        <span className="catalog-question"><small>today's question</small><strong>what's your<br />comfort show?</strong><span>your turn ↗</span></span>
      ) : item.type === "potluck" ? (
        <span className="catalog-paper catalog-list"><strong>who's bringing what</strong><span>✓ <b>snacks</b><i>maya</i></span><span>✓ <b>drinks</b><i>sam</i></span><span>○ <b>something sweet</b></span></span>
      ) : item.type === "rsvp" ? (
        <span className="catalog-rsvp"><small>see you friday</small><strong>3 <span>in!</span></strong><span className="catalog-faces"><i>M</i><i>J</i><i>S</i></span></span>
      ) : item.type === "expenseSplit" ? (
        <span className="catalog-paper catalog-receipt"><small>weekend split</small><strong>$48.00</strong><span>pizza night <b>$36</b></span><span>snacks <b>$12</b></span><small>we're even ♡</small></span>
      ) : item.type === "itinerary" ? (
        <span className="catalog-paper catalog-list"><small>the weekend away</small><strong>a little adventure</strong><span>01 <b>hit the road</b></span><span>02 <b>find good coffee</b></span><span>03 <b>see where we end up</b></span></span>
      ) : item.type === "linkCard" ? (
        <span className="catalog-web"><span className="catalog-web-cover">↗</span><strong>found this.<br />thought of you.</strong><small>something worth sharing</small></span>
      ) : item.type === "linkShelf" || item.type === "linkPile" || item.type === "hotLinks" || item.type === "shipPost" ? (
        <span className="catalog-stack"><span /><span /><span><WidgetPreview item={item} /><strong>{item.type === "shipPost" ? "look what I made" : item.type === "hotLinks" ? "worth a look" : "the good finds"}</strong></span></span>
      ) : (
        <span className="catalog-icon-preview"><WidgetPreview item={item} /></span>
      )}
    </span>
  );
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
  const catalogGroups = CATEGORIES.slice(1).map((name) => ({
    name,
    items: visibleWidgets.filter((item) => WIDGET_DETAILS[item.type]?.category === name),
  })).filter((group) => group.items.length > 0);
  const switchView = () => {
    setShowAll(!showAll);
    setSearch("");
    setCategory("All");
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div className={`widget-picker-backdrop widget-picker-backdrop-popover${showAll ? " is-catalog-open" : ""}`} onClick={onClose} role="presentation">
      <div className={`widget-picker widget-picker-popover widget-picker-tray${showAll ? " is-browsing" : ""}`}
        onClick={(event) => event.stopPropagation()} role="dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <header>
          <div>
            {showAll && <button type="button" className="widget-picker-back" onClick={switchView}>← quick picks</button>}
            <h2 id={titleId}>{showAll ? "little things, shared." : "add to this space"}</h2>
            <p id={descriptionId}>{showAll ? "Pick something to make this space yours." : "Make a plan, share a moment, start something."}</p>
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
              onClick={() => { setCategory(name); scrollRef.current?.scrollTo({ top: 0 }); }}>{name.toLowerCase()}<span>{name === "All" ? addableWidgets.length : addableWidgets.filter((item) => WIDGET_DETAILS[item.type]?.category === name).length}</span></button>)}
          </div>
        </div>}

        <div className="widget-picker-content" ref={scrollRef}>
          {showAll ? (
            <div className="widget-catalog">
              {catalogGroups.map((group) => (
                <section className="catalog-group" key={group.name}>
                  <div className="catalog-group-heading"><h3>{CATEGORY_TITLES[group.name]}</h3><span>{group.items.length} widgets</span></div>
                  <ul className="catalog-grid">
                    {group.items.map((item) => (
                      <li key={item.type}>
                        <button type="button" className="catalog-tile" onClick={(event) => {
                          onAddWidget?.(item.type, { x: event.clientX, y: event.clientY });
                          onClose();
                        }}>
                          <CatalogPreview item={item} />
                          <span className="catalog-tile-caption"><strong>{item.label}</strong><span className="catalog-add" aria-hidden="true">+</span></span>
                          <span className="catalog-tile-description">{WIDGET_DETAILS[item.type]?.description}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : <>
            <div className="widget-picker-section-heading"><h3>the go-tos</h3><span>pick one, place it anywhere</span></div>
            <ul className="widget-picker-grid">
              {visibleWidgets.map((item) => <li key={item.type}>
                <button type="button" onClick={(event) => { onAddWidget?.(item.type, { x: event.clientX, y: event.clientY }); onClose(); }}>
                  <span className="widget-picker-art"><WidgetPreview item={item} /></span>
                  <span className="widget-picker-copy"><span className="widget-picker-label">{item.label}</span><span className="widget-picker-description">{WIDGET_DETAILS[item.type]?.description}</span></span>
                  <span className="widget-picker-tile-add" aria-hidden="true">+</span>
                </button>
              </li>)}
            </ul>
          </>}
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
                <img src={sticker.src} alt={sticker.label} draggable={false} decoding="async" />
              </button>
            </li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
