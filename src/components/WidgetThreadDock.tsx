import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import type { ChatMessage } from "../data/chat";
import type { WidgetType } from "../data/types";
import { ThreadContent } from "./ThreadContent";

export type ThreadDockPlacement = "below" | "right" | "left";
export type ThreadDockSize = { width: number; height: number };

const DOCK_GAP = 16;
const VIEWPORT_GUTTER = 16;

export function WidgetThreadDock({
  viewportRef,
  widgetId,
  widgetType,
  label,
  messages,
  placement,
  onSend,
  onSizeChange,
  actions,
  topper,
  placeholder,
  emptyText,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  widgetId: string;
  widgetType: WidgetType;
  label: string;
  messages: ChatMessage[];
  placement: ThreadDockPlacement;
  onSend: (text: string) => void;
  onSizeChange?: (size: ThreadDockSize) => void;
  /** Widget quick actions (e.g. rsvp chips) shown above the composer. */
  actions?: ReactNode;
  /** Rendered between the header and the messages (e.g. question strip). */
  topper?: ReactNode;
  placeholder?: string;
  emptyText?: string;
}) {
  const dockRef = useRef<HTMLElement>(null);
  const isPhoto = widgetType === "media" || widgetType === "photoWall";

  useEffect(() => {
    const dock = dockRef.current;
    const viewport = viewportRef.current;
    const widget = Array.from(
      document.querySelectorAll<HTMLElement>(".widget-group[data-widget-id]"),
    ).find((element) => element.dataset.widgetId === widgetId);
    if (!dock || !viewport || !widget) return;

    let frame = 0;
    const position = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const targetRect = widget.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        let left = targetRect.left + targetRect.width / 2 - dockRect.width / 2;
        let top = targetRect.bottom + DOCK_GAP;

        if (placement === "right") {
          left = targetRect.right + DOCK_GAP;
          top = targetRect.top + targetRect.height / 2 - dockRect.height / 2;
        } else if (placement === "left") {
          left = targetRect.left - DOCK_GAP - dockRect.width;
          top = targetRect.top + targetRect.height / 2 - dockRect.height / 2;
        }

        left = Math.min(
          window.innerWidth - dockRect.width - VIEWPORT_GUTTER,
          Math.max(VIEWPORT_GUTTER, left),
        );
        top = Math.min(
          window.innerHeight - dockRect.height - VIEWPORT_GUTTER,
          Math.max(VIEWPORT_GUTTER, top),
        );

        dock.style.left = `${Math.round(left)}px`;
        dock.style.top = `${Math.round(top)}px`;
        dock.classList.add("is-positioned");

        const tailOffset =
          placement === "below"
            ? targetRect.left + targetRect.width / 2 - left
            : targetRect.top + targetRect.height / 2 - top;
        dock.style.setProperty(
          "--thread-tail-offset",
          `${Math.round(
            Math.min(
              (placement === "below" ? dockRect.width : dockRect.height) - 28,
              Math.max(28, tailOffset),
            ),
          )}px`,
        );
      });
    };

    position();
    viewport.addEventListener("scroll", position, { passive: true });
    window.addEventListener("resize", position);

    const resizeObserver = new ResizeObserver(() => {
      const rect = dock.getBoundingClientRect();
      onSizeChange?.({ width: rect.width, height: rect.height });
      position();
    });
    resizeObserver.observe(dock);
    resizeObserver.observe(widget);

    const mutationObserver = new MutationObserver(position);
    mutationObserver.observe(widget, { attributes: true });
    const scaleLayer = widget.closest(".canvas-scale-layer");
    if (scaleLayer) {
      mutationObserver.observe(scaleLayer, { attributes: true });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", position);
      window.removeEventListener("resize", position);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [onSizeChange, placement, viewportRef, widgetId]);

  return (
    <aside
      ref={dockRef}
      className={`widget-thread-dock is-${placement}`}
      aria-label={`Thread on ${label}`}
      style={
        {
          "--thread-tail-offset": "50%",
          left: -9999,
          top: -9999,
        } as CSSProperties
      }
    >
      <header className="widget-thread-dock-header">
        <span className="widget-thread-live">
          <i aria-hidden="true" />
          thread
        </span>
        <strong>{label}</strong>
        <span className="widget-thread-count">{messages.length}</span>
      </header>

      {topper}

      {isPhoto && (
        <div className="widget-thread-photo-hint" aria-label="Photo adding preview">
          <span aria-hidden="true">＋</span>
          <div>
            <strong>add photos</strong>
            <p>Drop images here or choose from your library.</p>
          </div>
        </div>
      )}

      <ThreadContent
        key={widgetId}
        messages={messages}
        label={label}
        onSend={onSend}
        actions={actions}
        placeholder={placeholder}
        emptyText={emptyText}
      />
    </aside>
  );
}
