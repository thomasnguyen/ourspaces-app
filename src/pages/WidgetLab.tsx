import { useCallback, useEffect, useMemo, useState } from "react";
import "./labs.css";
import { WidgetCard } from "../components/WidgetCard";
import { WidgetEditorPanel } from "../components/WidgetEditorPanel";
import { WIDGET_CATALOG } from "../data/templates";
import type { Widget, WidgetType } from "../data/types";
import { createDemoWidget } from "../lib/widgetDefaults";
import { widgetLabel } from "../lib/widgetLabels";

const LAB_SPACE_ID = "widget-lab";

function typeFromHash(): WidgetType {
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (hash.startsWith("widgets/")) {
    const type = hash.slice("widgets/".length) as WidgetType;
    if (WIDGET_CATALOG.some((item) => item.type === type)) return type;
  }
  return WIDGET_CATALOG[0]?.type ?? "poll";
}

function emptyFixtureEnabled() {
  const search = new URLSearchParams(window.location.search);
  if (search.get("empty") === "1") return true;
  const hashQuery = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(hashQuery).get("empty") === "1";
}

function emptyFixture(widget: Widget): Widget {
  switch (widget.type) {
    case "decision":
      return {
        ...widget,
        data: {
          ...widget.data,
          title: "decision made",
          detail: "",
          source: "promoted from chat",
          author: "You",
        },
      };
    case "availability":
      return {
        ...widget,
        data: { ...widget.data, days: [], members: [], best: "" },
      };
    case "linkShelf":
      return { ...widget, data: { ...widget.data, links: [] } };
    case "playlist":
      return {
        ...widget,
        data: { ...widget.data, stationId: "", song: "", artist: "", pickedBy: "", playedBy: "" },
      };
    default:
      return widget;
  }
}

/**
 * Widget lab — browse every widget type, preview at full size, edit content.
 * Hash route: /#/widgets  ·  /#/widgets/poll
 *
 * Architecture for AI / iteration:
 * - Components live in src/widgets/
 * - Styles live in index.css under .widget-*
 * - Pick a type here, tweak in the editor, then tell an agent to refine the look
 */
export function WidgetLab() {
  const [activeType, setActiveType] = useState<WidgetType>(typeFromHash);
  const [overrides, setOverrides] = useState<Partial<Record<WidgetType, Widget>>>({});
  const [editingOpen, setEditingOpen] = useState(false);
  const [emptyMode, setEmptyMode] = useState(emptyFixtureEnabled);
  const [pollSelection, setPollSelection] = useState<string | undefined>();
  const [dailyAnswer, setDailyAnswer] = useState<string | undefined>();
  const [dailyReactions, setDailyReactions] = useState<Record<string, string>>({});

  const baseWidget = useMemo(() => {
    const widget = createDemoWidget(activeType);
    return emptyMode ? emptyFixture(widget) : widget;
  }, [activeType, emptyMode]);
  const activeWidget = useMemo(() => {
    const override = overrides[activeType];
    if (!override) return baseWidget;
    return {
      ...baseWidget,
      ...override,
      data: override.data ?? baseWidget.data,
    };
  }, [activeType, baseWidget, overrides]);

  const catalogEntry = WIDGET_CATALOG.find((item) => item.type === activeType);

  useEffect(() => {
    const onHash = () => {
      setActiveType(typeFromHash());
      setEmptyMode(emptyFixtureEnabled());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const selectType = useCallback((type: WidgetType) => {
    setActiveType(type);
    setEditingOpen(false);
    setPollSelection(undefined);
    setDailyAnswer(undefined);
    setDailyReactions({});
    const suffix = emptyFixtureEnabled() ? "?empty=1" : "";
    window.location.hash =
      (type === WIDGET_CATALOG[0]?.type ? "#/widgets" : `#/widgets/${type}`) + suffix;
  }, []);

  const patchWidget = useCallback(
    (patch: Partial<Widget>) => {
      setOverrides((current) => ({
        ...current,
        [activeType]: {
          ...baseWidget,
          ...current[activeType],
          ...patch,
          data: patch.data ?? current[activeType]?.data ?? baseWidget.data,
        },
      }));
    },
    [activeType, baseWidget],
  );

  const saveWidget = useCallback(
    (widgetId: string, data: Widget["data"], layout?: Pick<Widget, "w" | "h">) => {
      void widgetId;
      patchWidget({
        data,
        ...(layout ?? {}),
      });
      setEditingOpen(false);
    },
    [patchWidget],
  );

  const resetWidget = useCallback(() => {
    setOverrides((current) => {
      const next = { ...current };
      delete next[activeType];
      return next;
    });
    setPollSelection(undefined);
    setEditingOpen(false);
  }, [activeType]);

  return (
    <main className={`widget-lab paper-bg space-theme-blush ${editingOpen ? "has-editor-open" : ""}`}>
      <header className="widget-lab-header">
        <div className="widget-lab-nav">
          <a href="#/" className="widget-lab-back">
            ← space
          </a>
          <a href="#/cursors" className="widget-lab-back">
            cursor lab →
          </a>
        </div>
        <div>
          <p className="widget-lab-kicker">prototype</p>
          <h1>widget lab</h1>
          <p className="widget-lab-lede">
            Every widget type in one place. Pick one, preview it at full size,
            edit the content, then tell an agent to refine styles in{" "}
            <code>src/widgets/</code> and <code>index.css</code>.
          </p>
          {emptyMode && <p className="widget-lab-fixture-note">empty fixture mode · target widget states are intentionally blank</p>}
        </div>
      </header>

      <section className="widget-lab-stage-wrap">
        <div className="widget-lab-stage-meta">
          <div>
            <h2>
              {catalogEntry?.emoji} {catalogEntry?.label ?? activeType}
            </h2>
            <p>{widgetLabel(activeWidget)} · {activeWidget.w}×{activeWidget.h}</p>
          </div>
          <div className="widget-lab-stage-actions">
            <button
              type="button"
              className={`widget-lab-edit ${editingOpen ? "is-active" : ""}`}
              onClick={() => setEditingOpen((open) => !open)}
              aria-pressed={editingOpen}
            >
              ✎ edit
            </button>
            {overrides[activeType] && (
              <button type="button" className="widget-lab-reset" onClick={resetWidget}>
                reset
              </button>
            )}
          </div>
        </div>

        <div className="widget-lab-stage space-theme-default">
          <div className="widget-lab-stage-canvas">
            <WidgetCard
              widget={activeWidget}
              spaceId={LAB_SPACE_ID}
              canvasScale={1}
              pollSelection={pollSelection}
              onPollVote={(_, optionId) => setPollSelection(optionId)}
              dailyAnswer={dailyAnswer}
              dailyReactions={dailyReactions}
              onDailyAnswer={(_, text) => setDailyAnswer(text)}
              onDailyReact={(_, answerName, emoji) =>
                setDailyReactions((current) =>
                  current[answerName] === emoji
                    ? Object.fromEntries(
                        Object.entries(current).filter(([name]) => name !== answerName),
                      )
                    : { ...current, [answerName]: emoji },
                )
              }
              onPlaylistTune={(_, tune) =>
                patchWidget({
                  data: {
                    ...activeWidget.data,
                    ...tune,
                    playedBy: "You",
                  },
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="widget-lab-grid" aria-label="Widget types">
        {WIDGET_CATALOG.map((item) => (
          <WidgetTypeCard
            key={item.type}
            item={item}
            selected={item.type === activeType}
            widget={
              overrides[item.type] ??
              (emptyMode
                ? emptyFixture(createDemoWidget(item.type, `lab-card-${item.type}`))
                : createDemoWidget(item.type, `lab-card-${item.type}`))
            }
            onSelect={() => selectType(item.type)}
          />
        ))}
      </section>

      <footer className="widget-lab-footer">
        <p>
          Widgets are registered in <code>WIDGET_CATALOG</code>. Add a component
          in <code>src/widgets/</code>, wire it in <code>WidgetCard</code>, and
          it shows up here automatically.
        </p>
      </footer>

      <WidgetEditorPanel
        widget={editingOpen ? activeWidget : null}
        onClose={() => setEditingOpen(false)}
        onSave={saveWidget}
        onFrameLayoutChange={(widgetId, layout) => {
          void widgetId;
          patchWidget(layout);
        }}
        onFrameLayoutCommit={() => undefined}
      />
    </main>
  );
}

function WidgetTypeCard({
  item,
  widget,
  selected,
  onSelect,
}: {
  item: (typeof WIDGET_CATALOG)[number];
  widget: Widget;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`widget-lab-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="widget-lab-card-preview" aria-hidden>
        <WidgetCard widget={widget} spaceId={LAB_SPACE_ID} canvasScale={1} />
      </div>
      <div className="widget-lab-card-copy">
        <strong>
          {item.emoji} {item.label}
        </strong>
        <span>{item.type}</span>
      </div>
    </button>
  );
}
