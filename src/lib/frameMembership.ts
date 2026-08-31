import type { Widget } from "../data/types";

/**
 * Frame membership is geometric — a widget belongs to the frame its center
 * sits in. Center containment, not full containment: collage pieces
 * deliberately breach the frame border (the bday cake sticker) and still
 * belong to it. Frames never nest.
 */
export function widgetIsInsideFrame(widget: Widget, frame: Widget) {
  if (widget.id === frame.id) return true;
  if (widget.type === "frame") return false;

  const cx = widget.x + widget.w / 2;
  const cy = widget.y + widget.h / 2;
  return (
    cx >= frame.x &&
    cy >= frame.y &&
    cx <= frame.x + frame.w &&
    cy <= frame.y + frame.h
  );
}

/** The link pile living inside this frame, if it holds one. */
export function pileInsideFrame(frame: Widget, widgets: Widget[]) {
  if (frame.type !== "frame") return undefined;
  return widgets.find(
    (widget) => widget.type === "linkPile" && widgetIsInsideFrame(widget, frame),
  );
}
