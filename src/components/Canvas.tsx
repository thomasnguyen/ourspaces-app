import { useRef, useState, type PointerEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import type { Widget } from "../lib/widgets";
import { WidgetCard } from "../widgets/WidgetCard";

type Drag = { id: Id<"widgets">; startX: number; startY: number; x: number; y: number; group: Widget[] };
type Resize = { id: Id<"widgets">; startX: number; startY: number; w: number; h: number };

export function Canvas({ spaceId }: { spaceId: Id<"spaces"> }) {
  const widgets = (useQuery(api.widgets.listWidgets, { spaceId }) ?? []) as Widget[];
  const moveWidget = useMutation(api.widgets.moveWidget);
  const resizeWidget = useMutation(api.widgets.resizeWidget);
  const bringToFront = useMutation(api.widgets.bringToFront);
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  const farthestX = Math.max(2400, ...widgets.map((widget) => widget.x + widget.w + 260));
  const farthestY = Math.max(1600, ...widgets.map((widget) => widget.y + widget.h + 260));

  const point = (event: PointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>, widget: Widget) => {
    if ((event.target as HTMLElement).dataset.resize) return;
    const position = point(event);
    const group = widget.type === "frame"
      ? widgets.filter((item) => item.type !== "frame" && item.x + item.w / 2 >= widget.x && item.x + item.w / 2 <= widget.x + widget.w && item.y + item.h / 2 >= widget.y && item.y + item.h / 2 <= widget.y + widget.h)
      : [widget];
    event.currentTarget.setPointerCapture(event.pointerId);
    void bringToFront({ id: widget._id });
    setDrag({ id: widget._id, startX: position.x, startY: position.y, x: widget.x, y: widget.y, group: [widget, ...group.filter((item) => item._id !== widget._id)] });
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag) {
      const position = point(event);
      setDrag({ ...drag, x: Math.max(0, drag.x + position.x - drag.startX), y: Math.max(0, drag.y + position.y - drag.startY), startX: position.x, startY: position.y });
    }
    if (resize) {
      const position = point(event);
      setResize({ ...resize, w: Math.max(140, resize.w + position.x - resize.startX), h: Math.max(100, resize.h + position.y - resize.startY), startX: position.x, startY: position.y });
    }
  };

  const finish = () => {
    if (drag) {
      const source = widgets.find((widget) => widget._id === drag.id);
      if (source) {
        const deltaX = drag.x - source.x;
        const deltaY = drag.y - source.y;
        drag.group.forEach((item) => void moveWidget({ id: item._id, x: Math.max(0, item.x + deltaX), y: Math.max(0, item.y + deltaY) }));
      }
      setDrag(null);
    }
    if (resize) {
      void resizeWidget({ id: resize.id, w: resize.w, h: resize.h });
      setResize(null);
    }
  };

  const renderedPosition = (widget: Widget) => {
    if (drag) {
      const source = widgets.find((item) => item._id === drag.id);
      if (source && drag.group.some((item) => item._id === widget._id)) return { x: widget.x + drag.x - source.x, y: widget.y + drag.y - source.y };
    }
    return { x: widget.x, y: widget.y };
  };

  return <div className="h-full overflow-auto bg-base p-6 md:p-10" ref={boardRef} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
    <div className="relative rounded-card bg-base" style={{ width: farthestX, height: farthestY }}>
      <div className="pointer-events-none absolute left-0 top-0 flex items-center gap-3 text-sm font-bold text-muted"><i className="h-2.5 w-2.5 rounded-full bg-lime" /> live canvas</div>
      {widgets.map((widget) => {
        const position = renderedPosition(widget);
        const activeResize = resize?.id === widget._id ? resize : null;
        return <div key={widget._id} onPointerDown={(event) => startDrag(event, widget)} className="absolute touch-none select-none" style={{ left: position.x, top: position.y, width: activeResize?.w ?? widget.w, height: activeResize?.h ?? widget.h, zIndex: widget.z }}>
          <WidgetCard widget={widget} />
          {widget.type !== "frame" && <button data-resize aria-label="Resize widget" className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-full border-2 border-base bg-lime" onPointerDown={(event) => { event.stopPropagation(); const position = point(event); event.currentTarget.setPointerCapture(event.pointerId); setResize({ id: widget._id, startX: position.x, startY: position.y, w: widget.w, h: widget.h }); }} />}
        </div>;
      })}
    </div>
  </div>;
}
