import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import type { Widget } from "../data/types";
import type {
  CanvasGestureKind,
  CanvasLayout,
  LiveGesture,
} from "../live/presenceTypes";
import { getThread } from "../data/chat";
import { MemberFace } from "./MemberFace";
import { WIDGET_CATALOG } from "../data/templates";
import { widgetLabel } from "../lib/widgetLabels";
import { widgetSupportsThread } from "../lib/widgetThreads";
import {
  ChatWidget,
  CountdownWidget,
  FrameWidget,
  MediaWidget,
  NoteWidget,
  PollWidget,
  PotluckWidget,
  StickerWidget,
} from "../widgets/core";
import {
  AvailabilityWidget,
  DailyQWidget,
  DecisionWidget,
  ExpenseSplitWidget,
  ItineraryWidget,
  JokeRegistryWidget,
  LinkCardWidget,
  LinkShelfWidget,
  MessageWallWidget,
  PhotoWallWidget,
  PlaylistWidget,
  QuoteWidget,
  RsvpWidget,
  SportsWidget,
  WeatherWidget,
  BackendLiveWidget,
  DualClockWidget,
  WheelWidget,
  type PlaylistTune,
  type RsvpStatus,
} from "../widgets/extras";

/* Daily question grows with its answers — seeded height is just the floor. */
function widgetGrows(widget: Widget) {
  return (
    widget.type === "dailyQ" ||
    widget.type === "availability" ||
    widget.type === "linkShelf" ||
    widget.type === "playlist"
  );
}

function innerStyle(widget: Widget): CSSProperties {
  return {
    width: "100%",
    height: widgetGrows(widget) ? "auto" : "100%",
    minHeight: widgetGrows(widget) ? widget.h : undefined,
    transform: widget.rotate ? `rotate(${widget.rotate}deg)` : undefined,
  };
}

/* Deterministic scrapbook tilt — hash the id so every client sees the same
   slight askew, damped on wide cards so long text stays scannable. Cards with
   a hand-placed data rotate, frames, and stickers keep their own angle. */
function widgetTilt(widget: Widget): string | undefined {
  if (widget.rotate || widget.type === "frame" || widget.type === "sticker") {
    return undefined;
  }
  let hash = 0;
  for (let i = 0; i < widget.id.length; i++) {
    hash = (hash * 31 + widget.id.charCodeAt(i)) | 0;
  }
  const step = (Math.abs(hash) % 5) - 2; // -2..2
  if (step === 0) return undefined;
  const damp = Math.min(1, Math.max(0.4, 240 / widget.w));
  return `${(step * 1.1 * damp).toFixed(2)}deg`;
}

function groupStyle(
  widget: Widget,
  enterDelay: number,
  remoteGesture?: LiveGesture,
): CSSProperties {
  const remoteX = remoteGesture?.x ?? widget.x;
  const remoteY = remoteGesture?.y ?? widget.y;
  return {
    "--enter-delay": `${Math.round(enterDelay)}ms`,
    "--tilt": widgetTilt(widget),
    left: widget.x,
    top: widget.y,
    width: remoteGesture?.w ?? widget.w,
    height: widgetGrows(widget)
      ? undefined
      : (remoteGesture?.h ?? widget.h),
    minHeight: widgetGrows(widget)
      ? (remoteGesture?.h ?? widget.h)
      : undefined,
    zIndex: remoteGesture?.z ?? widget.z,
    transform: remoteGesture
      ? `translate3d(${remoteX - widget.x}px, ${remoteY - widget.y}px, 0)`
      : undefined,
  } as CSSProperties;
}

type FrameResizeCorner = "nw" | "ne" | "sw" | "se";

type FrameGesture = {
  pointerId: number;
  kind: "move" | "resize";
  corner?: FrameResizeCorner;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  latest: CanvasLayout;
};

type GesturePreview = {
  kind: CanvasGestureKind;
  origin: CanvasLayout;
  layout: CanvasLayout;
};

const MIN_FRAME_WIDTH = 280;
const MIN_FRAME_HEIGHT = 140;
const MAX_FRAME_WIDTH = 1200;
const MAX_FRAME_HEIGHT = 800;

function liveCanvasScale(element: HTMLElement, fallback: number) {
  const layer = element.closest<HTMLElement>(".canvas-scale-layer");
  if (!layer) return fallback;
  const transform = window.getComputedStyle(layer).transform;
  if (!transform || transform === "none") return fallback;
  const scale = new DOMMatrix(transform).a;
  return Number.isFinite(scale) && scale > 0 ? scale : fallback;
}

function resizedFrame(
  gesture: FrameGesture,
  deltaX: number,
  deltaY: number,
) {
  let left = gesture.x;
  let top = gesture.y;
  let right = gesture.x + gesture.w;
  let bottom = gesture.y + gesture.h;
  const corner = gesture.corner ?? "se";

  if (corner.includes("w")) {
    left = Math.max(
      0,
      Math.min(
        right - MIN_FRAME_WIDTH,
        Math.max(right - MAX_FRAME_WIDTH, gesture.x + deltaX),
      ),
    );
  } else {
    right = Math.min(
      gesture.x + MAX_FRAME_WIDTH,
      Math.max(gesture.x + MIN_FRAME_WIDTH, right + deltaX),
    );
  }

  if (corner.includes("n")) {
    top = Math.max(
      0,
      Math.min(
        bottom - MIN_FRAME_HEIGHT,
        Math.max(bottom - MAX_FRAME_HEIGHT, gesture.y + deltaY),
      ),
    );
  } else {
    bottom = Math.min(
      gesture.y + MAX_FRAME_HEIGHT,
      Math.max(gesture.y + MIN_FRAME_HEIGHT, bottom + deltaY),
    );
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  };
}

function WidgetCardComponent({
  widget,
  spaceId,
  enterDelay = 0,
  selected = false,
  managed = false,
  frameFocused = false,
  frameEditing = false,
  widgetFocused = false,
  focusSoftened = false,
  canvasScale = 1,
  commentCount,
  commenters: commentersProp,
  threadRead = false,
  pollSelection,
  rsvpSelection,
  dailyAnswer,
  dailyReactions,
  recapCited = false,
  onSelect,
  onManage,
  onMove,
  onDragStart,
  onDragEnd,
  onGestureStart,
  onGestureChange,
  onGestureEnd,
  onLayoutCommit,
  remoteGesture,
  remoteLocked = false,
  onDelete,
  onEdit,
  onFrameFocus,
  onFrameLayoutChange,
  onFrameLayoutCommit,
  onPollVote,
  onRsvp,
  onDailyAnswer,
  onDailyReact,
  onPromote,
  promoted = false,
  onClaim,
  claimantId,
  onWheelSpin,
  onPlaylistTune,
}: {
  widget: Widget;
  spaceId: string;
  /** Where this widget sits in the space entrance wavefront, in ms. */
  enterDelay?: number;
  selected?: boolean;
  managed?: boolean;
  frameFocused?: boolean;
  frameEditing?: boolean;
  widgetFocused?: boolean;
  focusSoftened?: boolean;
  canvasScale?: number;
  commentCount?: number;
  commenters?: string[];
  /** You've opened this thread — its chip collapses to a quiet dot. */
  threadRead?: boolean;
  pollSelection?: string;
  rsvpSelection?: RsvpStatus;
  dailyAnswer?: string;
  dailyReactions?: Record<string, string>;
  /** Ringed because "catch me up" reported a change on this widget. */
  recapCited?: boolean;
  onSelect?: (widget: Widget) => void;
  onManage?: (widgetId: string) => void;
  onMove?: (widgetId: string, x: number, y: number) => void;
  onDragStart?: (widgetId: string) => void;
  onDragEnd?: (widgetId: string) => void;
  onGestureStart?: (widget: Widget, kind: CanvasGestureKind) => void;
  onGestureChange?: (widgetId: string, layout: Partial<CanvasLayout>) => void;
  onGestureEnd?: (widgetId: string, layout: CanvasLayout) => void;
  onLayoutCommit?: (widget: Widget, layout: CanvasLayout) => void;
  remoteGesture?: LiveGesture;
  remoteLocked?: boolean;
  onDelete?: (widgetId: string, label: string) => void;
  onEdit?: (widgetId: string) => void;
  onFrameFocus?: (widget: Widget) => void;
  onFrameLayoutChange?: (
    widgetId: string,
    layout: Partial<Pick<Widget, "x" | "y" | "w" | "h">>,
  ) => void;
  onFrameLayoutCommit?: (widgetId: string) => void;
  onPollVote?: (widgetId: string, optionId: string) => void;
  onRsvp?: (widgetId: string, status: RsvpStatus) => void;
  onDailyAnswer?: (widgetId: string, text: string) => void;
  onDailyReact?: (widgetId: string, answerName: string, emoji: string) => void;
  onPromote?: () => void;
  promoted?: boolean;
  onClaim?: (widgetId: string, itemName: string) => void;
  claimantId?: string;
  onWheelSpin?: (widgetId: string, spin: { spinNonce: number; resultIndex: number }) => void;
  onPlaylistTune?: (widgetId: string, tune: PlaylistTune) => void;
}) {
  const dragState = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    widgetX: number;
    widgetY: number;
    scale: number;
    latest: CanvasLayout;
  } | null>(null);
  /* Direct drag from the card body — armed on pointer-down over dead surface,
     becomes a real drag past a small threshold so clicks stay clicks. */
  const bodyDrag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    widgetX: number;
    widgetY: number;
    scale: number;
    started: boolean;
    latest: CanvasLayout;
  } | null>(null);
  const suppressBodyClick = useRef(false);
  const frameGesture = useRef<FrameGesture | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const previewFrame = useRef(0);
  const pendingPreview = useRef<GesturePreview | null>(null);
  const previewCleanupFrame = useRef(0);
  const [dragging, setDragging] = useState(false);
  const syncInert = useCallback((node: HTMLDivElement | null) => {
    groupRef.current = node;
    if (!node) return;
    if (focusSoftened) {
      node.setAttribute("inert", "");
    } else {
      node.removeAttribute("inert");
    }
  }, [focusSoftened]);

  const applyPreview = useCallback((preview: GesturePreview) => {
    const node = groupRef.current;
    if (!node) return;

    if (preview.kind === "resize") {
      node.style.left = `${preview.layout.x}px`;
      node.style.top = `${preview.layout.y}px`;
      node.style.width = `${preview.layout.w}px`;
      node.style.height = `${preview.layout.h}px`;
      return;
    }

    node.style.transform = `translate3d(${preview.layout.x - preview.origin.x}px, ${
      preview.layout.y - preview.origin.y
    }px, 0)`;
  }, []);

  const queuePreview = useCallback((preview: GesturePreview) => {
    pendingPreview.current = preview;
    if (previewFrame.current) return;
    previewFrame.current = window.requestAnimationFrame(() => {
      previewFrame.current = 0;
      const next = pendingPreview.current;
      if (!next) return;
      applyPreview(next);
      onGestureChange?.(widget.id, next.layout);
    });
  }, [applyPreview, onGestureChange, widget.id]);

  const flushPreview = useCallback((preview: GesturePreview) => {
    if (previewFrame.current) {
      window.cancelAnimationFrame(previewFrame.current);
      previewFrame.current = 0;
    }
    pendingPreview.current = preview;
    applyPreview(preview);
  }, [applyPreview]);

  const releasePreview = useCallback((kind: CanvasGestureKind) => {
    if (previewCleanupFrame.current) {
      window.cancelAnimationFrame(previewCleanupFrame.current);
    }
    previewCleanupFrame.current = window.requestAnimationFrame(() => {
      previewCleanupFrame.current = 0;
      pendingPreview.current = null;
      if (kind === "move" && groupRef.current) {
        groupRef.current.style.transform = "";
      }
    });
  }, []);

  useEffect(() => () => {
    if (previewFrame.current) window.cancelAnimationFrame(previewFrame.current);
    if (previewCleanupFrame.current) {
      window.cancelAnimationFrame(previewCleanupFrame.current);
    }
  }, []);

  const beginFrameGesture = (
    event: PointerEvent<HTMLButtonElement>,
    kind: FrameGesture["kind"],
    corner?: FrameResizeCorner,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    if (remoteLocked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    frameGesture.current = {
      pointerId: event.pointerId,
      kind,
      corner,
      clientX: event.clientX,
      clientY: event.clientY,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      scale: liveCanvasScale(event.currentTarget, canvasScale),
      latest: {
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        z: widget.z,
      },
    };
    setDragging(true);
    onManage?.(widget.id);
    onGestureStart?.(widget, kind);
  };

  const moveFrameGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = frameGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = (event.clientX - gesture.clientX) / gesture.scale;
    const deltaY = (event.clientY - gesture.clientY) / gesture.scale;
    if (gesture.kind === "move") {
      const layout: CanvasLayout = {
        x: Math.max(0, Math.round(gesture.x + deltaX)),
        y: Math.max(0, Math.round(gesture.y + deltaY)),
        w: gesture.w,
        h: gesture.h,
        z: gesture.latest.z,
      };
      gesture.latest = layout;
      queuePreview({ kind: "move", origin: {
        x: gesture.x,
        y: gesture.y,
        w: gesture.w,
        h: gesture.h,
        z: gesture.latest.z,
      }, layout });
      return;
    }

    const layout: CanvasLayout = {
      ...resizedFrame(gesture, deltaX, deltaY),
      z: gesture.latest.z,
    };
    gesture.latest = layout;
    queuePreview({ kind: "resize", origin: {
      x: gesture.x,
      y: gesture.y,
      w: gesture.w,
      h: gesture.h,
      z: gesture.latest.z,
    }, layout });
  };

  const finishFrameGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = frameGesture.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    frameGesture.current = null;
    setDragging(false);
    if (gesture?.pointerId === event.pointerId) {
      flushPreview({
        kind: gesture.kind,
        origin: {
          x: gesture.x,
          y: gesture.y,
          w: gesture.w,
          h: gesture.h,
          z: gesture.latest.z,
        },
        layout: gesture.latest,
      });
      if (onGestureEnd) onGestureEnd(widget.id, gesture.latest);
      else {
        onFrameLayoutChange?.(widget.id, gesture.latest);
        onFrameLayoutCommit?.(widget.id);
      }
      releasePreview(gesture.kind);
    }
  };

  const moveFrameWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const distance = event.shiftKey ? 24 : 8;
    const moves: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    if (remoteLocked) return;
    const layout: CanvasLayout = {
      x: Math.max(0, widget.x + move[0]),
      y: Math.max(0, widget.y + move[1]),
      w: widget.w,
      h: widget.h,
      z: widget.z,
    };
    if (onLayoutCommit) onLayoutCommit(widget, layout);
    else {
      onFrameLayoutChange?.(widget.id, layout);
      onFrameLayoutCommit?.(widget.id);
    }
  };

  const resizeFrameWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    corner: FrameResizeCorner,
  ) => {
    const distance = event.shiftKey ? 24 : 8;
    const deltas: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    if (remoteLocked) return;
    const resized = resizedFrame(
      {
        pointerId: 0,
        kind: "resize",
        corner,
        clientX: 0,
        clientY: 0,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        scale: 1,
        latest: {
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
          z: widget.z,
        },
      },
      delta[0],
      delta[1],
    );
    const layout: CanvasLayout = { ...resized, z: widget.z };
    if (onLayoutCommit) onLayoutCommit(widget, layout);
    else {
      onFrameLayoutChange?.(widget.id, resized);
      onFrameLayoutCommit?.(widget.id);
    }
  };

  const inner = useMemo(() => innerStyle(widget), [widget.h, widget.type]);
  const voteOnPoll = useCallback(
    (optionId: string) => onPollVote?.(widget.id, optionId),
    [onPollVote, widget.id],
  );
  let content: ReactElement | null = null;

  switch (widget.type) {
    case "frame":
      content = (
        <FrameWidget
          widget={widget}
          style={inner}
          focused={frameFocused}
          editing={frameEditing}
          onFocus={() => onFrameFocus?.(widget)}
          onMovePointerDown={
            remoteLocked
              ? undefined
              : (event) => beginFrameGesture(event, "move")
          }
          onMovePointerMove={remoteLocked ? undefined : moveFrameGesture}
          onMovePointerUp={remoteLocked ? undefined : finishFrameGesture}
          onMovePointerCancel={remoteLocked ? undefined : finishFrameGesture}
          onMoveKeyDown={remoteLocked ? undefined : moveFrameWithKeyboard}
        />
      );
      break;
    case "sticker":
      content = <StickerWidget widget={widget} style={inner} />;
      break;
    case "countdown":
      content = <CountdownWidget widget={widget} style={inner} />;
      break;
    case "poll":
      content = (
        <PollWidget
          widget={widget}
          style={inner}
          selectedOptionId={pollSelection}
          onVote={voteOnPoll}
        />
      );
      break;
    case "potluck":
      content = (
        <PotluckWidget
          widget={widget}
          style={inner}
          onClaim={onClaim ? (itemName) => onClaim(widget.id, itemName) : undefined}
          claimantId={claimantId}
        />
      );
      break;
    case "chat":
      content = (
        <ChatWidget
          widget={widget}
          style={inner}
          onPromote={onPromote}
          promoted={promoted}
        />
      );
      break;
    case "note":
      content = <NoteWidget widget={widget} style={inner} />;
      break;
    case "media":
      content = <MediaWidget widget={widget} style={inner} />;
      break;
    case "dailyQ":
      content = (
        <DailyQWidget
          widget={widget}
          style={inner}
          localAnswer={dailyAnswer}
          localReactions={dailyReactions}
          onAnswer={(text) => onDailyAnswer?.(widget.id, text)}
          onReact={(answerName, emoji) => onDailyReact?.(widget.id, answerName, emoji)}
        />
      );
      break;
    case "rsvp":
      content = (
        <RsvpWidget
          widget={widget}
          style={inner}
          focused={widgetFocused}
          rsvpSelection={rsvpSelection}
          onRsvp={onRsvp}
        />
      );
      break;
    case "decision":
      content = <DecisionWidget widget={widget} style={inner} />;
      break;
    case "availability":
      content = <AvailabilityWidget widget={widget} style={inner} />;
      break;
    case "photoWall":
      content = <PhotoWallWidget widget={widget} style={inner} />;
      break;
    case "linkShelf":
      content = <LinkShelfWidget widget={widget} style={inner} />;
      break;
    case "linkCard":
      content = <LinkCardWidget widget={widget} style={inner} />;
      break;
    case "playlist":
      content = (
        <PlaylistWidget
          widget={widget}
          style={inner}
          onTune={onPlaylistTune ? (tune) => onPlaylistTune(widget.id, tune) : undefined}
        />
      );
      break;
    case "jokeRegistry":
      content = <JokeRegistryWidget widget={widget} style={inner} />;
      break;
    case "expenseSplit":
      content = <ExpenseSplitWidget widget={widget} style={inner} />;
      break;
    case "itinerary":
      content = <ItineraryWidget widget={widget} style={inner} />;
      break;
    case "messageWall":
      content = <MessageWallWidget widget={widget} style={inner} />;
      break;
    case "quote":
      content = <QuoteWidget widget={widget} style={inner} />;
      break;
    case "weather":
      content = <WeatherWidget widget={widget} style={inner} />;
      break;
    case "sports":
      content = <SportsWidget widget={widget} style={inner} />;
      break;
    case "backendLive":
      content = <BackendLiveWidget widget={widget} style={inner} />;
      break;
    case "wheel":
      content = (
        <WheelWidget
          widget={widget}
          style={inner}
          onSpin={onWheelSpin ? (spin) => onWheelSpin(widget.id, spin) : undefined}
          disabled={!onWheelSpin && spaceId !== "widget-lab"}
        />
      );
      break;
    case "dualClock":
      content = <DualClockWidget widget={widget} style={inner} />;
      break;
    default:
      return null;
  }

  if (widget.type === "frame") {
    return (
      <div
        className={`widget-group widget-frame-group absolute ${
          managed ? "is-frame-managed" : ""
        } ${frameEditing ? "is-frame-editing" : ""} ${
          dragging ? "is-dragging" : ""
        } ${remoteGesture ? "is-remote-gesturing" : ""} ${
          remoteGesture?.kind === "resize" ? "is-remote-resizing" : ""
        } ${
          focusSoftened ? "is-focus-softened" : ""
        }`}
        ref={syncInert}
        style={{
          ...groupStyle(widget, enterDelay, remoteGesture),
          zIndex: remoteGesture?.z ?? (frameEditing ? 54 : widget.z),
        }}
        data-frame-id={widget.id}
        aria-hidden={focusSoftened || undefined}
      >
        {content}
        {frameEditing &&
          (["nw", "ne", "sw", "se"] as FrameResizeCorner[]).map(
            (corner) => (
              <button
                type="button"
                key={corner}
                className={`frame-resize-handle is-${corner}`}
                disabled={remoteLocked}
                onPointerDown={(event) =>
                  beginFrameGesture(event, "resize", corner)
                }
                onPointerMove={moveFrameGesture}
                onPointerUp={finishFrameGesture}
                onPointerCancel={finishFrameGesture}
                onKeyDown={(event) =>
                  resizeFrameWithKeyboard(event, corner)
                }
                aria-label={`Resize ${String(
                  widget.data.title ?? "frame",
                )} from the ${corner} corner. Use arrow keys for precise resizing.`}
              />
            ),
          )}
      </div>
    );
  }

  const thread = getThread(spaceId, widget.id);
  const count = commentCount ?? thread.messages.length;
  const commenters = commentersProp ?? [...new Set(thread.messages.map((message) => message.from))].slice(-2);
  const label = widgetLabel(widget);
  const controlLabel = WIDGET_CATALOG.find((item) => item.type === widget.type)?.label ?? label;
  const supportsThread = widgetSupportsThread(widget);

  const beginWidgetMove = () => {
    if (onGestureStart) onGestureStart(widget, "move");
    else onDragStart?.(widget.id);
  };

  const widgetMoveLayout = (x: number, y: number): CanvasLayout => ({
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    w: widget.w,
    h: widget.h,
    z: widget.z,
  });

  const previewWidgetMove = (layout: CanvasLayout) => {
    queuePreview({
      kind: "move",
      origin: {
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        z: widget.z,
      },
      layout,
    });
  };

  const endWidgetMove = (layout: CanvasLayout) => {
    flushPreview({
      kind: "move",
      origin: {
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        z: widget.z,
      },
      layout,
    });
    if (onGestureEnd) onGestureEnd(widget.id, layout);
    else {
      onMove?.(widget.id, layout.x, layout.y);
      onDragEnd?.(widget.id);
    }
    releasePreview("move");
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    let finalLayout = drag?.latest;
    if (drag && drag.pointerId === event.pointerId) {
      if (event.type !== "pointercancel") {
        finalLayout = widgetMoveLayout(
          drag.widgetX + (event.clientX - drag.clientX) / drag.scale,
          drag.widgetY + (event.clientY - drag.clientY) / drag.scale,
        );
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
    setDragging(false);
    if (drag?.pointerId === event.pointerId && finalLayout) {
      endWidgetMove(finalLayout);
    }
  };

  return (
    <div
      className={`widget-group absolute ${
        widget.type === "sticker" ? "widget-sticker-group" : ""
      } ${selected ? "is-thread-selected" : ""} ${
        widgetFocused ? "is-widget-focused" : ""
      } ${managed ? "is-managed" : ""} ${dragging ? "is-dragging" : ""} ${
        remoteGesture ? "is-remote-gesturing" : ""
      } ${
        focusSoftened ? "is-focus-softened" : ""
      } ${recapCited ? "is-recap-cited" : ""}`}
      style={{
        ...groupStyle(widget, enterDelay, remoteGesture),
        zIndex:
          widget.type === "sticker"
            ? (managed || dragging ? 100001 : 100000)
            : remoteGesture?.z ??
              (managed || dragging || widgetFocused ? 55 : recapCited ? 54 : widget.z),
      }}
      ref={syncInert}
      data-widget-id={widget.id}
      data-widget-type={widget.type}
      aria-hidden={focusSoftened || undefined}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest(".widget-management")) return;
        onManage?.(widget.id);
      }}
    >
      <div
        className="widget-group-body"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a")) {
            /* A click that ends a drag must not press the control under it
               (for the web post link, that means: don't open the article). */
            if (suppressBodyClick.current) {
              suppressBodyClick.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
            return;
          }
          if (suppressBodyClick.current) {
            suppressBodyClick.current = false;
            return;
          }
          if (widget.type === "photoWall" && !widgetFocused && supportsThread) {
            onSelect?.(widget);
            return;
          }
          onManage?.(widget.id);
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, textarea"))
            return;
          if (widgetFocused || !supportsThread) return;
          onSelect?.(widget);
        }}
        onPointerDown={(e) => {
          if (remoteLocked || widgetFocused || e.button !== 0) return;
          const interactive = (e.target as HTMLElement).closest(
            "button, input, a, textarea, select",
          );
          /* The web post is one big link — let it arm a body drag anyway.
             Capture is deferred until real movement so a plain click still
             opens the article. */
          if (interactive && !interactive.classList.contains("link-card-open"))
            return;
          suppressBodyClick.current = false;
          if (!interactive) e.currentTarget.setPointerCapture(e.pointerId);
          bodyDrag.current = {
            pointerId: e.pointerId,
            clientX: e.clientX,
            clientY: e.clientY,
            widgetX: widget.x,
            widgetY: widget.y,
            scale: liveCanvasScale(e.currentTarget, canvasScale),
            started: false,
            latest: widgetMoveLayout(widget.x, widget.y),
          };
        }}
        onPointerMove={(e) => {
          const drag = bodyDrag.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const dx = e.clientX - drag.clientX;
          const dy = e.clientY - drag.clientY;
          if (!drag.started) {
            if (Math.hypot(dx, dy) < 5) return;
            drag.started = true;
            suppressBodyClick.current = true;
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            setDragging(true);
            onManage?.(widget.id);
            beginWidgetMove();
          }
          const layout = widgetMoveLayout(
            drag.widgetX + dx / drag.scale,
            drag.widgetY + dy / drag.scale,
          );
          drag.latest = layout;
          previewWidgetMove(layout);
        }}
        onPointerUp={(e) => {
          const drag = bodyDrag.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const dx = e.clientX - drag.clientX;
          const dy = e.clientY - drag.clientY;
          if (!drag.started && Math.hypot(dx, dy) >= 5) {
            drag.started = true;
            setDragging(true);
            onManage?.(widget.id);
            beginWidgetMove();
          }
          if (drag.started) {
            suppressBodyClick.current = true;
            drag.latest = widgetMoveLayout(
              drag.widgetX + dx / drag.scale,
              drag.widgetY + dy / drag.scale,
            );
          }
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          const moved = drag.started;
          bodyDrag.current = null;
          if (moved) {
            suppressBodyClick.current = true;
            setDragging(false);
            endWidgetMove(drag.latest);
          }
        }}
        onPointerCancel={(e) => {
          const drag = bodyDrag.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const moved = drag.started;
          bodyDrag.current = null;
          if (moved) {
            suppressBodyClick.current = true;
            setDragging(false);
            endWidgetMove(drag.latest);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (widget.type === "photoWall" && !widgetFocused && supportsThread) {
              onSelect?.(widget);
            } else {
              onManage?.(widget.id);
            }
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={
          widget.type === "photoWall" && !widgetFocused
            ? `Open ${label}. Use the drag control to move it.`
            : `Select ${controlLabel} widget. Drag to move it.`
        }
        aria-pressed={managed}
      >
        {content}
      </div>
      <div className="widget-management" aria-label={`${controlLabel} widget controls`}>
        <button
          type="button"
          className="widget-drag-handle"
          disabled={remoteLocked}
          onPointerDown={(event) => {
            if (remoteLocked) return;
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragState.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              widgetX: widget.x,
              widgetY: widget.y,
              scale: liveCanvasScale(event.currentTarget, canvasScale),
              latest: widgetMoveLayout(widget.x, widget.y),
            };
            setDragging(true);
            onManage?.(widget.id);
            beginWidgetMove();
          }}
          onPointerMove={(event) => {
            const drag = dragState.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const layout = widgetMoveLayout(
              drag.widgetX + (event.clientX - drag.clientX) / drag.scale,
              drag.widgetY + (event.clientY - drag.clientY) / drag.scale,
            );
            drag.latest = layout;
            previewWidgetMove(layout);
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={(event) => {
            const distance = event.shiftKey ? 24 : 8;
            const moves: Partial<Record<string, [number, number]>> = {
              ArrowLeft: [-distance, 0],
              ArrowRight: [distance, 0],
              ArrowUp: [0, -distance],
              ArrowDown: [0, distance],
            };
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            if (remoteLocked) return;
            onManage?.(widget.id);
            const layout: CanvasLayout = {
              x: Math.max(0, widget.x + move[0]),
              y: Math.max(0, widget.y + move[1]),
              w: widget.w,
              h: widget.h,
              z: widget.z,
            };
            if (onLayoutCommit) onLayoutCommit(widget, layout);
            else {
              onDragStart?.(widget.id);
              onMove?.(widget.id, layout.x, layout.y);
              onDragEnd?.(widget.id);
            }
          }}
          aria-label={`Drag ${controlLabel}. Use arrow keys to move it.`}
        >
          <span aria-hidden="true">⠿</span>
          drag
        </button>
        {supportsThread && (
          <button
            type="button"
            className="widget-open-button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(widget);
            }}
            aria-label={`Zoom into ${label} and open its thread`}
            aria-pressed={widgetFocused}
          >
            <span aria-hidden="true">↗</span>
            zoom
          </button>
        )}
        {widget.type !== "sticker" && (
          <button
            type="button"
            className="widget-edit-button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.(widget.id);
            }}
            aria-label={`Edit ${controlLabel}`}
          >
            edit
          </button>
        )}
        <button
          type="button"
          className="widget-delete-button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.(widget.id, controlLabel);
          }}
          aria-label={`Delete ${controlLabel}`}
        >
          delete
        </button>
      </div>
      {supportsThread && (
        <button
          type="button"
          className={`widget-comment-chip ${count > 0 ? "has-comments" : ""} ${
            count > 0 && (!thread.unread || threadRead) ? "is-dot" : ""
          }`}
          onClick={() => onSelect?.(widget)}
          aria-label={`Open ${count} ${count === 1 ? "comment" : "comments"} on ${label}`}
          aria-pressed={widgetFocused}
        >
          <span aria-hidden="true">💬</span>
          {count > 0 && thread.unread && !threadRead && <span>{count}</span>}
          {count > 0 && thread.unread && !threadRead && commenters.length > 0 && (
            <span className="widget-comment-faces" aria-hidden="true">
              {commenters.map((name) => (
                <MemberFace key={name} name={name} size="xs" />
              ))}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export const WidgetCard = memo(WidgetCardComponent);
