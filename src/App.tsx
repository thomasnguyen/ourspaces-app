import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionDock } from "./components/ActionDock";
import { Canvas, SpaceHeader } from "./components/Canvas";
import { CanvasEdgePan } from "./components/CanvasEdgePan";
import { CanvasNavigator } from "./components/CanvasNavigator";
import type { CanvasPoint } from "./components/FirstRunSticky";
import { GlobalChatPanel } from "./components/GlobalChatPanel";
import { Rail } from "./components/Rail";
import { SpaceEditorPanel } from "./components/SpaceEditorPanel";
import {
  WidgetThreadDock,
  type ThreadDockPlacement,
  type ThreadDockSize,
} from "./components/WidgetThreadDock";
import { WidgetPicker } from "./components/WidgetPicker";
import { WidgetEditorPanel } from "./components/WidgetEditorPanel";
import { WelcomePill } from "./components/WelcomePill";
import {
  getCommentCount,
  getGlobalThread,
  getThread,
  type ChatMessage,
} from "./data/chat";
import { RECAP_LINES } from "./data/recap";
import { DECISION_WIDGET, canvasSizeFor, getSpace } from "./data/spaces";
import { getStickerDefinition } from "./data/stickers";
import {
  defaultSpaceCustomization,
  spaceCustomizationStyle,
  type SpaceCustomization,
} from "./data/spaceThemes";
import type { Widget, WidgetType } from "./data/types";
import { RSVP_CHOICES, type RsvpStatus } from "./widgets/extras";
import {
  getSoundEnabled,
  playSound,
  preloadSounds,
  setSoundEnabled as persistSoundEnabled,
} from "./lib/sounds";
import { computeBackendCounts } from "./lib/backendCounts";
import {
  completeBuildClubFirstRun,
  getBuildClubFirstRunPending,
  getBuildClubVisitorCount,
  incrementBuildClubVisitorCount,
} from "./lib/onboarding";
import { widgetLabel } from "./lib/widgetLabels";
import {
  freshWidgetData,
  getWidgetBlueprint,
  WIDGET_SIZES,
} from "./lib/widgetDefaults";
import { widgetSupportsThread } from "./lib/widgetThreads";
import { LiveSpacePage } from "./pages/LiveSpace";
import {
  ZOOM_LANDING_MS,
  useBlockZoom,
  type BlockZoomMode,
} from "./lib/blockZoom";
import { getDataMode } from "./live/dataMode";

const CursorLab = lazy(() =>
  import("./pages/CursorLab").then((module) => ({ default: module.CursorLab })),
);
const WidgetLab = lazy(() =>
  import("./pages/WidgetLab").then((module) => ({ default: module.WidgetLab })),
);
const BlockPage = lazy(() =>
  import("./pages/Block").then((module) => ({ default: module.BlockPage })),
);
const LiveBlockPage = lazy(() =>
  import("./pages/LiveBlock").then((module) => ({ default: module.LiveBlockPage })),
);
const Welcome = lazy(() => import("./pages/Welcome"));

function DeferredRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={(
        <main className="paper-bg relative h-dvh overflow-hidden">
          <div className="space-loading-pill">opening…</div>
        </main>
      )}
    >
      {children}
    </Suspense>
  );
}

type Route = "space" | "home" | "cursors" | "widgets" | "live" | "join" | "test";
type PickerMode = "widgets" | "spaces";
type WidgetPlacement = Partial<Pick<Widget, "x" | "y" | "z" | "w" | "h">>;
type FrameLayout = Pick<Widget, "x" | "y" | "w" | "h">;
type CanvasSize = { width: number; height: number };
type CanvasCameraTarget = {
  scale: number;
  scrollLeft: number;
  scrollTop: number;
};
type CanvasViewSnapshot = CanvasCameraTarget;
type FocusedTarget = {
  kind: "frame" | "widget";
  id: string;
  type: WidgetType;
  label: string;
};
type ChatViewSnapshot = {
  open: boolean;
  threadId: string;
};
type FocusBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type FocusLayout = {
  camera: CanvasCameraTarget;
  dockPlacement?: ThreadDockPlacement;
};

type DeletedWidget = {
  spaceId: string;
  widgetId: string;
  label: string;
};

const CAMERA_DURATION_MS = 360;
const CAMERA_EXIT_DURATION_MS = 280;
const FRAME_FIT_GUTTER = 24;
const MIN_FRAME_SCALE = 0.8;
const MIN_EDIT_FRAME_SCALE = 0.5;
const MAX_FRAME_SCALE = 1.35;
const MIN_WIDGET_SCALE = 1;
const MAX_WIDGET_SCALE = 1.8;
const WIDGET_FOCUS_GUTTER = 48;
const THREAD_DOCK_GAP = 16;
const DEFAULT_THREAD_DOCK_SIZE: ThreadDockSize = {
  width: 348,
  height: 276,
};

function defaultCanvasSize(spaceId: string): CanvasSize {
  return canvasSizeFor(spaceId);
}

function visibleCanvasCenter(
  size: { w: number; h: number },
  scale: number,
  nudge: number,
): CanvasPoint {
  const canvas = document.querySelector<HTMLElement>(".space-canvas");
  const viewport = document.querySelector<HTMLElement>(".space-scroll");
  const canvasRect = canvas?.getBoundingClientRect();
  const viewportRect = viewport?.getBoundingClientRect();

  if (canvasRect && viewportRect) {
    return {
      x:
        (viewportRect.left + viewportRect.width / 2 - canvasRect.left) / scale +
        nudge,
      y:
        (viewportRect.top + viewportRect.height / 2 - canvasRect.top) / scale +
        nudge,
    };
  }

  return {
    x: 420 + size.w / 2 + nudge,
    y: 180 + size.h / 2 + nudge,
  };
}

function easeOutQuint(progress: number) {
  return 1 - Math.pow(1 - progress, 5);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cssPixels(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function elementIsVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

function routeFromHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "test") return "test";
  if (hash === "home") return "home";
  if (hash === "join" || hash.startsWith("join/")) return "join";
  if (hash === "live" || hash.startsWith("live/")) return "live";
  if (hash === "cursors" || hash.startsWith("cursors/")) return "cursors";
  if (hash === "widgets" || hash.startsWith("widgets/")) return "widgets";
  return "space";
}

function mockModeRequested() {
  return getDataMode() === "mock";
}

function demoModeRequested() {
  return new URLSearchParams(window.location.search).get("demo") === "1" ||
    new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("demo") === "1" ||
    import.meta.env.VITE_DEMO === "1";
}

function spaceFromHash(): string {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash.startsWith("space/")) return hash.slice("space/".length) || "crew";
  if (hash === "join") return "__invalid_invite__";
  if (hash.startsWith("join/")) {
    const slug = hash.slice("join/".length);
    try {
      return decodeURIComponent(slug) || "__invalid_invite__";
    } catch {
      return slug || "__invalid_invite__";
    }
  }
  return "crew";
}

/**
 * Look prototype — crew + league canvases, widget picker, cursor lab.
 * Hash routes: #/  ·  #/home  ·  #/space/league  ·  #/cursors  ·  #/widgets
 */
export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [spaceId, setSpaceId] = useState(spaceFromHash);
  const demoMode = demoModeRequested();
  const zoom = useBlockZoom();
  const zoomPhaseRef = useRef(zoom.phase);
  zoomPhaseRef.current = zoom.phase;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>("widgets");
  const [chatOpen, setChatOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapRunId, setRecapRunId] = useState(0);
  const [recapCites, setRecapCites] = useState<string[]>([]);
  const [recapHover, setRecapHover] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState("");
  const [activeThreadId, setActiveThreadId] = useState("global");
  const [localThreadMessages, setLocalThreadMessages] = useState<
    Record<string, Record<string, ChatMessage[]>>
  >({});
  const [pollSelections, setPollSelections] = useState<
    Record<string, Record<string, string>>
  >({});
  const [rsvpSelections, setRsvpSelections] = useState<
    Record<string, Record<string, RsvpStatus>>
  >({});
  const [readThreadIds, setReadThreadIds] = useState<string[]>([]);
  const [dailyAnswers, setDailyAnswers] = useState<
    Record<string, Record<string, string>>
  >({});
  const [dailyReactions, setDailyReactions] = useState<
    Record<string, Record<string, Record<string, string>>>
  >({});
  const [managedWidgetId, setManagedWidgetId] = useState("");
  const [editingWidgetId, setEditingWidgetId] = useState("");
  const [promoted, setPromoted] = useState(false);
  const [addedWidgets, setAddedWidgets] = useState<Record<string, Widget[]>>({});
  const [widgetPlacements, setWidgetPlacements] = useState<
    Record<string, Record<string, WidgetPlacement>>
  >({});
  const [widgetDataOverrides, setWidgetDataOverrides] = useState<
    Record<string, Record<string, Widget["data"]>>
  >({});
  const [spaceCustomizations, setSpaceCustomizations] = useState<
    Record<string, SpaceCustomization>
  >({});
  const [spaceDraft, setSpaceDraft] = useState<SpaceCustomization | null>(null);
  const [deletedWidgetIds, setDeletedWidgetIds] = useState<Record<string, string[]>>({});
  const [lastDeletedWidget, setLastDeletedWidget] = useState<DeletedWidget | null>(null);
  const [canvasPanning, setCanvasPanning] = useState(false);
  const [canvasAwayFromHome, setCanvasAwayFromHome] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasWorldSize, setCanvasWorldSize] = useState<CanvasSize>(() =>
    defaultCanvasSize(spaceFromHash()),
  );
  const [focusedTarget, setFocusedTarget] = useState<FocusedTarget | null>(null);
  const [threadDockPlacement, setThreadDockPlacement] =
    useState<ThreadDockPlacement>("below");
  const [threadDockSize, setThreadDockSize] = useState<ThreadDockSize>(
    DEFAULT_THREAD_DOCK_SIZE,
  );
  const [canvasCameraAnimating, setCanvasCameraAnimating] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(getSoundEnabled);
  const [buildClubFirstRun, setBuildClubFirstRun] = useState(
    () => getBuildClubFirstRunPending(),
  );
  const [buildClubVisitors, setBuildClubVisitors] = useState(getBuildClubVisitorCount);
  const nextWidgetZ = useRef(1000);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const canvasScaleLayerRef = useRef<HTMLDivElement>(null);
  const canvasScaleRef = useRef(1);
  const canvasWorldSizeRef = useRef<CanvasSize>(defaultCanvasSize(spaceFromHash()));
  const canvasCameraAnimation = useRef(0);
  const canvasReturnView = useRef<CanvasViewSnapshot | null>(null);
  const chatReturnView = useRef<ChatViewSnapshot | null>(null);
  const frameEditSnapshot = useRef<{
    spaceId: string;
    widgetId: string;
    layout: FrameLayout;
  } | null>(null);
  const canvasPan = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const restoreFrameEdit = useCallback(() => {
    const snapshot = frameEditSnapshot.current;
    if (!snapshot) return;

    frameEditSnapshot.current = null;
    setWidgetPlacements((current) => ({
      ...current,
      [snapshot.spaceId]: {
        ...(current[snapshot.spaceId] ?? {}),
        [snapshot.widgetId]: {
          ...(current[snapshot.spaceId]?.[snapshot.widgetId] ?? {}),
          ...snapshot.layout,
        },
      },
    }));
  }, []);

  const applyCanvasScale = useCallback(
    (scale: number, reservedScale = scale, reserveSpace = true) => {
      const stage = canvasStageRef.current;
      const layer = canvasScaleLayerRef.current;
      const world = canvasWorldSizeRef.current;

      canvasScaleRef.current = scale;

      if (stage && reserveSpace) {
        stage.style.width = `${Math.ceil(world.width * reservedScale)}px`;
        stage.style.height = `${Math.ceil(world.height * reservedScale)}px`;
      }

      if (layer) {
        if (reserveSpace) {
          layer.style.width = `${world.width}px`;
          layer.style.height = `${world.height}px`;
        }
        layer.style.transform = `scale(${scale})`;
      }
    },
    [],
  );

  const animateCanvasCamera = useCallback(
    (target: CanvasCameraTarget, duration = CAMERA_DURATION_MS) => {
      const viewport = canvasViewportRef.current;
      if (!viewport) return;

      window.cancelAnimationFrame(canvasCameraAnimation.current);
      canvasCameraAnimation.current = 0;
      canvasScaleLayerRef.current?.style.removeProperty("will-change");

      const fromScale = canvasScaleRef.current;
      const fromScrollLeft = viewport.scrollLeft;
      const fromScrollTop = viewport.scrollTop;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const animationDuration = reducedMotion ? 0 : duration;

      setCanvasScale(fromScale);

      if (animationDuration === 0) {
        applyCanvasScale(target.scale);
        viewport.scrollTo({
          left: target.scrollLeft,
          top: target.scrollTop,
          behavior: "auto",
        });
        setCanvasScale(target.scale);
        setCanvasCameraAnimating(false);
        return;
      }

      const reservedScale = Math.max(fromScale, target.scale);
      const startedAt = performance.now();
      applyCanvasScale(fromScale, reservedScale);
      canvasScaleLayerRef.current?.style.setProperty("will-change", "transform");
      setCanvasCameraAnimating(true);

      const tick = (time: number) => {
        const progress = clamp((time - startedAt) / animationDuration, 0, 1);
        const eased = easeOutQuint(progress);
        const scale = fromScale + (target.scale - fromScale) * eased;

        applyCanvasScale(scale, reservedScale, false);
        viewport.scrollLeft =
          fromScrollLeft + (target.scrollLeft - fromScrollLeft) * eased;
        viewport.scrollTop =
          fromScrollTop + (target.scrollTop - fromScrollTop) * eased;

        if (progress < 1) {
          canvasCameraAnimation.current = window.requestAnimationFrame(tick);
          return;
        }

        canvasCameraAnimation.current = 0;
        applyCanvasScale(target.scale);
        viewport.scrollTo({
          left: target.scrollLeft,
          top: target.scrollTop,
          behavior: "auto",
        });
        setCanvasScale(target.scale);
        setCanvasCameraAnimating(false);
        canvasScaleLayerRef.current?.style.removeProperty("will-change");
      };

      canvasCameraAnimation.current = window.requestAnimationFrame(tick);
    },
    [applyCanvasScale],
  );

  const focusCameraTarget = useCallback(
    (
      target: FocusedTarget,
      dockSize: ThreadDockSize = DEFAULT_THREAD_DOCK_SIZE,
    ): FocusLayout | null => {
      const viewport = canvasViewportRef.current;
      if (!viewport) return null;

      const targetElements =
        canvasScaleLayerRef.current?.querySelectorAll<HTMLElement>(
          target.kind === "frame"
            ? ".widget-group[data-frame-id]"
            : ".widget-group[data-widget-id]",
        );
      const targetElement = Array.from(targetElements ?? []).find((element) =>
        target.kind === "frame"
          ? element.dataset.frameId === target.id
          : element.dataset.widgetId === target.id,
      );
      if (!targetElement) return null;

      const bounds: FocusBounds = {
        x: targetElement.offsetLeft,
        y: targetElement.offsetTop,
        width: targetElement.offsetWidth,
        height: targetElement.offsetHeight,
      };
      const viewportRect = viewport.getBoundingClientRect();
      let visibleLeft = 24;
      let visibleTop = 72;
      let visibleRight = viewport.clientWidth - 24;
      let visibleBottom = viewport.clientHeight - 24;

      const rail = document.querySelector<HTMLElement>(".space-rail");
      if (rail && elementIsVisible(rail)) {
        const railRect = rail.getBoundingClientRect();
        visibleLeft = Math.max(
          visibleLeft,
          railRect.right - viewportRect.left + 16,
        );
      }

      const focusHud =
        document.querySelector<HTMLElement>(".canvas-focus-hud");
      if (focusHud && elementIsVisible(focusHud)) {
        const focusRect = focusHud.getBoundingClientRect();
        visibleTop = Math.max(
          visibleTop,
          focusRect.bottom - viewportRect.top + 12,
        );
      }

      document
        .querySelectorAll<HTMLElement>(
          ".global-chat-panel, .widget-editor-panel",
        )
        .forEach((panel) => {
          if (!elementIsVisible(panel)) return;
          const panelRect = panel.getBoundingClientRect();
          visibleRight = Math.min(
            visibleRight,
            panelRect.left - viewportRect.left - 16,
          );
        });

      const visibleWidth = Math.max(260, visibleRight - visibleLeft);
      const visibleHeight = Math.max(260, visibleBottom - visibleTop);
      const viewCenterX = visibleLeft + visibleWidth / 2;
      const viewCenterY = visibleTop + visibleHeight / 2;
      const world = canvasWorldSizeRef.current;
      let scale: number;
      let desiredTargetCenterX = viewCenterX;
      let desiredTargetCenterY = viewCenterY;
      let dockPlacement: ThreadDockPlacement | undefined;

      if (target.kind === "frame") {
        const fitScale = Math.min(
          visibleWidth / (bounds.width + FRAME_FIT_GUTTER * 2),
          visibleHeight / (bounds.height + FRAME_FIT_GUTTER * 2),
        );
        scale = clamp(
          fitScale,
          editingWidgetId === target.id
            ? MIN_EDIT_FRAME_SCALE
            : MIN_FRAME_SCALE,
          MAX_FRAME_SCALE,
        );
      } else {
        const availableWidth = Math.max(
          1,
          visibleWidth - WIDGET_FOCUS_GUTTER * 2,
        );
        const availableHeight = Math.max(
          1,
          visibleHeight - WIDGET_FOCUS_GUTTER * 2,
        );
        const belowScale = Math.min(
          MAX_WIDGET_SCALE,
          availableWidth / bounds.width,
          (availableHeight - THREAD_DOCK_GAP - dockSize.height) /
            bounds.height,
        );
        const sideScale = Math.min(
          MAX_WIDGET_SCALE,
          (availableWidth - THREAD_DOCK_GAP - dockSize.width) / bounds.width,
          availableHeight / bounds.height,
        );

        /* The thread floats beside the card like a passed note — side-first,
           below only when the viewport is too narrow to seat them together. */
        if (
          sideScale >= MIN_WIDGET_SCALE &&
          dockSize.height <= availableHeight
        ) {
          scale = clamp(sideScale, MIN_WIDGET_SCALE, MAX_WIDGET_SCALE);
          if (bounds.x + bounds.width / 2 > world.width / 2) {
            dockPlacement = "left";
            desiredTargetCenterX =
              viewCenterX + (THREAD_DOCK_GAP + dockSize.width) / 2;
          } else {
            dockPlacement = "right";
            desiredTargetCenterX =
              viewCenterX - (THREAD_DOCK_GAP + dockSize.width) / 2;
          }
        } else {
          dockPlacement = "below";
          scale = clamp(belowScale, MIN_WIDGET_SCALE, MAX_WIDGET_SCALE);
          desiredTargetCenterY =
            viewCenterY - (THREAD_DOCK_GAP + dockSize.height) / 2;
        }
      }

      const viewportStyles = window.getComputedStyle(viewport);
      const paddingLeft = cssPixels(viewportStyles.paddingLeft);
      const paddingRight = cssPixels(viewportStyles.paddingRight);
      const paddingTop = cssPixels(viewportStyles.paddingTop);
      const paddingBottom = cssPixels(viewportStyles.paddingBottom);
      const maxScrollLeft = Math.max(
        0,
        paddingLeft + world.width * scale + paddingRight - viewport.clientWidth,
      );
      const maxScrollTop = Math.max(
        0,
        paddingTop +
          world.height * scale +
          paddingBottom -
          viewport.clientHeight,
      );

      return {
        dockPlacement,
        camera: {
          scale,
          scrollLeft: clamp(
            paddingLeft +
              (bounds.x + bounds.width / 2) * scale -
              desiredTargetCenterX,
            0,
            maxScrollLeft,
          ),
          scrollTop: clamp(
            paddingTop +
              (bounds.y + bounds.height / 2) * scale -
              desiredTargetCenterY,
            0,
            maxScrollTop,
          ),
        },
      };
    },
    [editingWidgetId],
  );

  const leaveFocus = useCallback((withSound = true) => {
    const returnView = canvasReturnView.current;
    if (!focusedTarget) return;

    if (withSound) playSound("tap");
    restoreFrameEdit();
    setEditingWidgetId("");
    setManagedWidgetId("");
    setFocusedTarget(null);
    canvasReturnView.current = null;
    const chatView = chatReturnView.current;
    chatReturnView.current = null;
    if (chatView) {
      setActiveThreadId(chatView.threadId);
      setChatOpen(chatView.open);
    }
    if (returnView) {
      animateCanvasCamera(returnView, CAMERA_EXIT_DURATION_MS);
    }
  }, [animateCanvasCamera, focusedTarget, restoreFrameEdit]);

  const focusFrame = useCallback(
    (frame: Widget) => {
      if (window.matchMedia("(max-width: 800px)").matches) return;

      if (focusedTarget?.kind === "frame" && focusedTarget.id === frame.id) {
        leaveFocus();
        return;
      }

      const viewport = canvasViewportRef.current;
      if (!viewport) return;

      if (!canvasReturnView.current) {
        canvasReturnView.current = {
          scale: canvasScaleRef.current,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        };
      }
      playSound("tap");
      setManagedWidgetId("");
      setFocusedTarget({
        kind: "frame",
        id: frame.id,
        type: "frame",
        label: String(frame.data.title ?? "frame"),
      });
    },
    [focusedTarget, leaveFocus],
  );

  const focusWidgetThread = useCallback(
    (widget: Widget) => {
      if (!widgetSupportsThread(widget)) return;
      restoreFrameEdit();
      setReadThreadIds((current) =>
        current.includes(widget.id) ? current : [...current, widget.id],
      );

      if (window.matchMedia("(max-width: 800px)").matches) {
        playSound("tap");
        setManagedWidgetId("");
        setEditingWidgetId("");
        setSpaceDraft(null);
        setActiveThreadId(widget.id);
        setChatOpen(true);
        return;
      }

      if (focusedTarget?.kind === "widget" && focusedTarget.id === widget.id) {
        return;
      }

      const viewport = canvasViewportRef.current;
      if (!viewport) return;

      if (!canvasReturnView.current) {
        canvasReturnView.current = {
          scale: canvasScaleRef.current,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        };
      }
      if (!chatReturnView.current) {
        chatReturnView.current = {
          open: chatOpen,
          threadId: activeThreadId,
        };
      }

      playSound("tap");
      setManagedWidgetId("");
      setEditingWidgetId("");
      setSpaceDraft(null);
      setPickerOpen(false);
      setRecapOpen(false);
      setChatOpen(false);
      setActiveThreadId(widget.id);
      setThreadDockPlacement("below");
      setFocusedTarget({
        kind: "widget",
        id: widget.id,
        type: widget.type,
        label: widgetLabel(widget),
      });
    },
    [activeThreadId, chatOpen, focusedTarget, restoreFrameEdit],
  );

  const resetRoomHome = useCallback(() => {
    playSound("tap");
    setFocusedTarget(null);
    canvasReturnView.current = null;
    const chatView = chatReturnView.current;
    chatReturnView.current = null;
    if (chatView) {
      setActiveThreadId(chatView.threadId);
      setChatOpen(chatView.open);
    }
    animateCanvasCamera(
      { scale: 1, scrollLeft: 0, scrollTop: 0 },
      CAMERA_EXIT_DURATION_MS,
    );
  }, [animateCanvasCamera]);

  const prepareRoomNavigation = useCallback(() => {
    if (!focusedTarget && canvasScaleRef.current === 1) return;

    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const viewportStyles = window.getComputedStyle(viewport);
    const paddingLeft = cssPixels(viewportStyles.paddingLeft);
    const paddingTop = cssPixels(viewportStyles.paddingTop);
    const scale = canvasScaleRef.current;
    const worldCenterX =
      (viewport.scrollLeft + viewport.clientWidth / 2 - paddingLeft) / scale;
    const worldCenterY =
      (viewport.scrollTop + viewport.clientHeight / 2 - paddingTop) / scale;

    setFocusedTarget(null);
    canvasReturnView.current = null;
    const chatView = chatReturnView.current;
    chatReturnView.current = null;
    if (chatView) {
      setActiveThreadId(chatView.threadId);
      setChatOpen(chatView.open);
    }
    animateCanvasCamera(
      {
        scale: 1,
        scrollLeft: Math.max(
          0,
          paddingLeft + worldCenterX - viewport.clientWidth / 2,
        ),
        scrollTop: Math.max(
          0,
          paddingTop + worldCenterY - viewport.clientHeight / 2,
        ),
      },
      0,
    );
  }, [animateCanvasCamera, focusedTarget]);

  const refitFocusedTarget = useCallback(
    (duration = CAMERA_DURATION_MS) => {
      if (!focusedTarget) return;
      const layout = focusCameraTarget(focusedTarget, threadDockSize);
      if (!layout) return;
      if (layout.dockPlacement) {
        setThreadDockPlacement(layout.dockPlacement);
      }
      animateCanvasCamera(layout.camera, duration);
    },
    [
      animateCanvasCamera,
      focusCameraTarget,
      focusedTarget,
      threadDockSize,
    ],
  );

  const startBlockZoomIn = useCallback(
    (id: string, mode: BlockZoomMode, blockScroll: { left: number; top: number }) => {
      if (route !== "home") return;
      zoom.beginZoomIn(id, mode, blockScroll);
    },
    [route, zoom.beginZoomIn],
  );

  const completeBlockZoomIn = useCallback(
    (id: string) => {
      zoom.completeZoomIn(id);
      restoreFrameEdit();
      frameEditSnapshot.current = null;
      setFocusedTarget(null);
      canvasReturnView.current = null;
      chatReturnView.current = null;
      setPickerOpen(false);
      setChatOpen(false);
      setRecapOpen(false);
      setManagedWidgetId("");
      setEditingWidgetId("");
      setSpaceDraft(null);
      setCanvasScale(1);
      canvasScaleRef.current = 1;
      setCanvasAwayFromHome(false);
      setRoute("space");
      setSpaceId(id);
      window.location.hash = id === "crew" ? "#/" : `#/space/${id}`;
    },
    [restoreFrameEdit, zoom.completeZoomIn],
  );

  const beginZoomOut = useCallback(() => {
    if (route !== "space" || zoomPhaseRef.current !== "idle") return false;

    const mobile = window.matchMedia("(max-width: 800px)").matches;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const viewport = canvasViewportRef.current;
    const exitCamera = {
      scale: canvasScaleRef.current,
      scrollLeft: viewport?.scrollLeft ?? 0,
      scrollTop: viewport?.scrollTop ?? 0,
    };

    if (mobile) {
      playSound("tap");
      setRoute("home");
      window.location.hash = "#/home";
      return true;
    }

    const mode: BlockZoomMode = reducedMotion ? "fade" : "fly";
    if (!zoom.beginZoomOut(spaceId, mode, exitCamera)) return false;
    zoomPhaseRef.current = "zooming-out";

    playSound("tap");
    restoreFrameEdit();
    frameEditSnapshot.current = null;
    setFocusedTarget(null);
    canvasReturnView.current = null;
    chatReturnView.current = null;
    setPickerOpen(false);
    setChatOpen(false);
    setRecapOpen(false);
    setManagedWidgetId("");
    setEditingWidgetId("");
    setSpaceDraft(null);
    setCanvasScale(1);
    canvasScaleRef.current = 1;
    applyCanvasScale(1);
    setCanvasAwayFromHome(false);
    setRoute("home");
    window.location.hash = "#/home";
    return true;
  }, [applyCanvasScale, restoreFrameEdit, route, spaceId, zoom.beginZoomOut]);

  const completeBlockZoomOut = useCallback(() => {
    playSound("place");
    zoomPhaseRef.current = "idle";
    zoom.finishZoomOut();
  }, [zoom.finishZoomOut]);

  useEffect(() => {
    if (zoom.phase !== "landing") return;
    const timer = window.setTimeout(() => zoom.finishLanding(), ZOOM_LANDING_MS);
    return () => window.clearTimeout(timer);
  }, [zoom.finishLanding, zoom.phase]);

  useEffect(() => {
    preloadSounds();
  }, []);

  useEffect(() => {
    const onHash = () => {
      const nextRoute = routeFromHash();
      if (
        nextRoute === "home" &&
        route === "space" &&
        zoomPhaseRef.current === "idle" &&
        !window.matchMedia("(max-width: 800px)").matches &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        if (beginZoomOut()) return;
      }

      setRoute(nextRoute);
      if (zoom.phase !== "zooming-out") {
        setSpaceId(spaceFromHash());
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [beginZoomOut, route, zoom.phase]);

  useEffect(() => {
    if (!lastDeletedWidget) return;
    const timeout = window.setTimeout(() => setLastDeletedWidget(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [lastDeletedWidget]);

  useEffect(() => {
    const canvas =
      canvasScaleLayerRef.current?.querySelector<HTMLElement>(".space-canvas");
    if (!canvas) return;

    let measureFrame = 0;
    const measure = () => {
      window.cancelAnimationFrame(measureFrame);
      measureFrame = window.requestAnimationFrame(() => {
        const nextSize = {
          width: Math.max(canvas.offsetWidth, canvas.scrollWidth),
          height: Math.max(canvas.offsetHeight, canvas.scrollHeight),
        };
        const current = canvasWorldSizeRef.current;
        if (
          nextSize.width === current.width &&
          nextSize.height === current.height
        ) {
          return;
        }

        canvasWorldSizeRef.current = nextSize;
        setCanvasWorldSize(nextSize);
        applyCanvasScale(canvasScaleRef.current);
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    const mutationObserver = new MutationObserver(measure);
    resizeObserver.observe(canvas);
    mutationObserver.observe(canvas, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      window.cancelAnimationFrame(measureFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [applyCanvasScale, route, spaceId]);

  useEffect(() => {
    if (!focusedTarget) return;
    const frame = window.requestAnimationFrame(() => refitFocusedTarget());
    return () => window.cancelAnimationFrame(frame);
  }, [
    chatOpen,
    editingWidgetId,
    focusedTarget,
    refitFocusedTarget,
    spaceDraft,
  ]);

  useEffect(() => {
    if (route !== "space") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (focusedTarget || pickerOpen || editingWidgetId || spaceDraft) return;

      if (recapOpen) {
        event.preventDefault();
        setRecapOpen(false);
        return;
      }
      if (chatOpen) {
        event.preventDefault();
        setChatOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    chatOpen,
    editingWidgetId,
    focusedTarget,
    pickerOpen,
    recapOpen,
    route,
    spaceDraft,
  ]);

  useEffect(() => {
    if (!focusedTarget) return;

    let resizeFrame = 0;
    const refit = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        refitFocusedTarget(CAMERA_EXIT_DURATION_MS);
      });
    };

    window.addEventListener("resize", refit);
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", refit);
    };
  }, [focusedTarget, refitFocusedTarget]);

  useEffect(() => {
    if (!focusedTarget) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        pickerOpen ||
        editingWidgetId ||
        spaceDraft
      ) {
        return;
      }
      event.preventDefault();
      leaveFocus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    editingWidgetId,
    focusedTarget,
    leaveFocus,
    pickerOpen,
    spaceDraft,
  ]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 800px)");
    const ensureMobileCamera = () => {
      if (!mobile.matches || (!focusedTarget && canvasScaleRef.current === 1)) {
        return;
      }
      setFocusedTarget(null);
      canvasReturnView.current = null;
      const chatView = chatReturnView.current;
      chatReturnView.current = null;
      if (chatView) {
        setActiveThreadId(chatView.threadId);
        setChatOpen(chatView.open);
      }
      animateCanvasCamera({ scale: 1, scrollLeft: 0, scrollTop: 0 }, 0);
    };

    ensureMobileCamera();
    mobile.addEventListener("change", ensureMobileCamera);
    return () => mobile.removeEventListener("change", ensureMobileCamera);
  }, [animateCanvasCamera, focusedTarget]);

  useEffect(() => {
    window.cancelAnimationFrame(canvasCameraAnimation.current);
    canvasCameraAnimation.current = 0;
    canvasScaleLayerRef.current?.style.removeProperty("will-change");
    const nextSize = defaultCanvasSize(spaceId);
    canvasWorldSizeRef.current = nextSize;
    canvasScaleRef.current = 1;
    canvasReturnView.current = null;
    chatReturnView.current = null;
    setCanvasWorldSize(nextSize);
    setCanvasScale(1);
    setFocusedTarget(null);
    setCanvasCameraAnimating(false);

    const frame = window.requestAnimationFrame(() => {
      applyCanvasScale(1);
      canvasViewportRef.current?.scrollTo({ left: 0, top: 0 });
      setCanvasAwayFromHome(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [applyCanvasScale, route, spaceId]);

  useEffect(() => () => {
    window.cancelAnimationFrame(canvasCameraAnimation.current);
    canvasScaleLayerRef.current?.style.removeProperty("will-change");
  }, []);

  const selectSpace = (id: string) => {
    playSound("tap");
    restoreFrameEdit();
    frameEditSnapshot.current = null;
    setFocusedTarget(null);
    canvasReturnView.current = null;
    chatReturnView.current = null;
    setSpaceId(id);
    setActiveThreadId("global");
    setManagedWidgetId("");
    setEditingWidgetId("");
    setSpaceDraft(null);
    window.location.hash = id === "crew" ? "#/" : `#/space/${id}`;
  };

  const openWidgetThread = (widget: Widget) => {
    focusWidgetThread(widget);
  };

  const currentWidgetFor = (widgetId: string): Widget | null => {
    const widget = [
      ...getSpace(spaceId).widgets,
      ...(addedWidgets[spaceId] ?? []),
    ].find((item) => item.id === widgetId);
    if (!widget) return null;
    return {
      ...widget,
      ...widgetPlacements[spaceId]?.[widgetId],
      data: widgetDataOverrides[spaceId]?.[widgetId] ?? widget.data,
    };
  };

  const closeWidgetEditor = useCallback(() => {
    restoreFrameEdit();
    setEditingWidgetId("");
    setManagedWidgetId("");
  }, [restoreFrameEdit]);

  const openPicker = (mode: PickerMode) => {
    if (focusedTarget) leaveFocus(false);
    playSound("tap");
    setManagedWidgetId("");
    setEditingWidgetId("");
    setSpaceDraft(null);
    setChatOpen(false);
    setPickerMode(mode);
    setPickerOpen(true);
  };

  const openWidgetEditor = (widgetId: string) => {
    if (focusedTarget?.kind === "widget") leaveFocus(false);
    const widget = currentWidgetFor(widgetId);
    if (
      widget?.type === "frame" &&
      frameEditSnapshot.current?.widgetId !== widgetId
    ) {
      restoreFrameEdit();
      frameEditSnapshot.current = {
        spaceId,
        widgetId,
        layout: {
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
        },
      };
    }
    playSound("tap");
    setManagedWidgetId(widgetId);
    setEditingWidgetId(widgetId);
    setSpaceDraft(null);
    setPickerOpen(false);
    setChatOpen(false);
    setRecapOpen(false);
  };

  const openSpaceEditor = () => {
    if (focusedTarget?.kind === "widget") leaveFocus(false);
    restoreFrameEdit();
    playSound("tap");
    setSpaceDraft({
      ...(spaceCustomizations[spaceId] ??
        defaultSpaceCustomization(getSpace(spaceId))),
    });
    setManagedWidgetId("");
    setEditingWidgetId("");
    setPickerOpen(false);
    setChatOpen(false);
    setRecapOpen(false);
  };

  const saveSpace = (customization: SpaceCustomization) => {
    playSound("place");
    setSpaceCustomizations((current) => ({
      ...current,
      [spaceId]: customization,
    }));
    setSpaceDraft(null);
  };

  useEffect(() => {
    if (spaceId !== "buildclub") return;
    setBuildClubFirstRun(getBuildClubFirstRunPending());
    setBuildClubVisitors(getBuildClubVisitorCount());
  }, [spaceId]);

  const firstRunActive = spaceId === "buildclub" && buildClubFirstRun;

  const backendLiveCounts = useMemo(
    () =>
      computeBackendCounts({
        addedWidgets,
        deletedWidgetIds,
      }),
    [addedWidgets, deletedWidgetIds],
  );

  const addWidgetAt = useCallback(
    (
      type: WidgetType,
      point: CanvasPoint,
      dataOverride?: Widget["data"],
      sizeOverride?: { w: number; h: number },
    ) => {
      const blueprint = getWidgetBlueprint(type);
      if (!blueprint) return;

      const size =
        sizeOverride ?? WIDGET_SIZES[type] ?? { w: blueprint.w, h: blueprint.h };
      const count = addedWidgets[spaceId]?.length ?? 0;
      const sticker =
        type === "sticker"
          ? getStickerDefinition(dataOverride?.stickerId)
          : undefined;

      const widget: Widget = {
        ...blueprint,
        id: `added-${type}-${Date.now()}`,
        x: Math.max(24, Math.round(point.x - size.w / 2)),
        y: Math.max(24, Math.round(point.y - size.h / 2)),
        w: size.w,
        h: size.h,
        z: type === "frame" ? 0 : 30 + count,
        rotate:
          sticker?.rotate ??
          (type === "note" ? -2 : type === "media" ? 1 : undefined),
        data: dataOverride ?? freshWidgetData(type, blueprint.data),
      };

      setAddedWidgets((current) => ({
        ...current,
        [spaceId]: [...(current[spaceId] ?? []), widget],
      }));
      playSound("place");
      setManagedWidgetId(widget.id);
      return widget;
    },
    [addedWidgets, spaceId],
  );

  const handleFirstRunPlace = useCallback(
    (point: CanvasPoint) => {
      addWidgetAt("note", point, {
        text: "",
        author: "You",
        tone: "warm",
        kicker: "new note",
      });
      completeBuildClubFirstRun();
      setBuildClubFirstRun(false);
      setBuildClubVisitors(incrementBuildClubVisitorCount());
    },
    [addWidgetAt],
  );

  const addWidget = (type: WidgetType) => {
    const blueprint = getWidgetBlueprint(type);
    if (!blueprint) return;

    const size = WIDGET_SIZES[type] ?? { w: blueprint.w, h: blueprint.h };
    const count = addedWidgets[spaceId]?.length ?? 0;
    const nudge = (count % 4) * 18;
    const addedWidget = addWidgetAt(
      type,
      visibleCanvasCenter(size, canvasScaleRef.current, nudge),
      type === "linkCard" ? freshWidgetData(type, {}) : undefined,
    );

    if (addedWidget?.type === "linkCard") {
      setManagedWidgetId(addedWidget.id);
      setEditingWidgetId(addedWidget.id);
      setChatOpen(false);
      setRecapOpen(false);
    }

    if (addedWidget?.type === "frame") {
      frameEditSnapshot.current = {
        spaceId,
        widgetId: addedWidget.id,
        layout: {
          x: addedWidget.x,
          y: addedWidget.y,
          w: addedWidget.w,
          h: addedWidget.h,
        },
      };
      focusFrame(addedWidget);
      setEditingWidgetId(addedWidget.id);
      setChatOpen(false);
      setRecapOpen(false);
    }

    if (firstRunActive && type === "note") {
      completeBuildClubFirstRun();
      setBuildClubFirstRun(false);
      setBuildClubVisitors(incrementBuildClubVisitorCount());
    }
  };

  const addSticker = (stickerId: string) => {
    const sticker = getStickerDefinition(stickerId);
    if (!sticker) return;

    const size = { w: sticker.width, h: sticker.height };
    const count = addedWidgets[spaceId]?.length ?? 0;
    const nudge = (count % 4) * 18;

    addWidgetAt(
      "sticker",
      visibleCanvasCenter(size, canvasScaleRef.current, nudge),
      { stickerId },
      size,
    );
  };

  const moveWidget = (widgetId: string, x: number, y: number) => {
    setWidgetPlacements((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: {
          ...(current[spaceId]?.[widgetId] ?? { x, y, z: nextWidgetZ.current }),
          x,
          y,
        },
      },
    }));
  };

  const updateFrameLayout = (
    widgetId: string,
    layout: Partial<FrameLayout>,
  ) => {
    setWidgetPlacements((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: {
          ...(current[spaceId]?.[widgetId] ?? {}),
          ...layout,
          z: 0,
        },
      },
    }));
  };

  const startWidgetDrag = (widgetId: string) => {
    const z = ++nextWidgetZ.current;
    setManagedWidgetId(widgetId);
    setWidgetPlacements((current) => {
      const existing = current[spaceId]?.[widgetId];
      if (!existing) return current;
      return {
        ...current,
        [spaceId]: {
          ...current[spaceId],
          [widgetId]: { ...existing, z },
        },
      };
    });
  };

  const finishWidgetDrag = (widgetId: string) => {
    if (focusedTarget?.kind !== "widget" || focusedTarget.id !== widgetId) {
      return;
    }
    window.requestAnimationFrame(() => {
      refitFocusedTarget(CAMERA_EXIT_DURATION_MS);
    });
  };

  const finishFrameLayout = (widgetId: string) => {
    if (focusedTarget?.kind !== "frame" || focusedTarget.id !== widgetId) {
      return;
    }
    window.requestAnimationFrame(() => {
      refitFocusedTarget(CAMERA_EXIT_DURATION_MS);
    });
  };

  const voteOnPoll = (widgetId: string, optionId: string) => {
    playSound("tap");
    setPollSelections((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: optionId,
      },
    }));
  };

  const spinWheel = (widgetId: string, spin: { spinNonce: number; resultIndex: number }) => {
    setWidgetDataOverrides((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: {
          ...getSpace(spaceId).widgets.find((widget) => widget.id === widgetId)?.data,
          ...(current[spaceId]?.[widgetId] ?? {}),
          ...spin,
          spunBy: "You",
        },
      },
    }));
  };

  const tunePlaylist = (widgetId: string, tune: { stationId: string; playing: boolean }) => {
    setWidgetDataOverrides((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: {
          ...getSpace(spaceId).widgets.find((widget) => widget.id === widgetId)?.data,
          ...(current[spaceId]?.[widgetId] ?? {}),
          ...tune,
          playedBy: "You",
        },
      },
    }));
  };

  const respondToRsvp = (widgetId: string, status: RsvpStatus) => {
    const previous = rsvpSelections[spaceId]?.[widgetId];
    if (previous === status) return;
    playSound("place");
    setRsvpSelections((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: status,
      },
    }));
    sendThreadMessage(
      widgetId,
      status === "yes"
        ? "you're in 🎉"
        : status === "maybe"
          ? "you're a maybe 🤔"
          : "you can't make it 😭",
      "system",
    );
  };

  const answerDailyQ = (widgetId: string, text: string) => {
    playSound("place");
    setDailyAnswers((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: text,
      },
    }));
  };

  const reactToDailyAnswer = (widgetId: string, answerName: string, emoji: string) => {
    playSound("tap");
    setDailyReactions((current) => {
      const forWidget = { ...(current[spaceId]?.[widgetId] ?? {}) };
      if (forWidget[answerName] === emoji) {
        delete forWidget[answerName];
      } else {
        forWidget[answerName] = emoji;
      }
      return {
        ...current,
        [spaceId]: {
          ...(current[spaceId] ?? {}),
          [widgetId]: forWidget,
        },
      };
    });
  };

  const sendThreadMessage = useCallback(
    (threadId: string, text: string, kind?: "system") => {
      const message: ChatMessage = {
        id: `local-${threadId}-${Date.now()}`,
        from: "You",
        text,
        time: "now",
        kind,
      };
      setLocalThreadMessages((current) => ({
        ...current,
        [spaceId]: {
          ...(current[spaceId] ?? {}),
          [threadId]: [
            ...(current[spaceId]?.[threadId] ?? []),
            message,
          ],
        },
      }));
    },
    [spaceId],
  );

  const updateThreadDockSize = useCallback((size: ThreadDockSize) => {
    setThreadDockSize((current) =>
      Math.abs(current.width - size.width) < 1 &&
      Math.abs(current.height - size.height) < 1
        ? current
        : size,
    );
  }, []);

  const deleteWidget = (widgetId: string, label: string) => {
    if (frameEditSnapshot.current?.widgetId === widgetId) {
      frameEditSnapshot.current = null;
    }
    if (focusedTarget?.id === widgetId) {
      leaveFocus(false);
    }
    setDeletedWidgetIds((current) => ({
      ...current,
      [spaceId]: Array.from(new Set([...(current[spaceId] ?? []), widgetId])),
    }));
    setLastDeletedWidget({ spaceId, widgetId, label });
    setManagedWidgetId("");
    if (editingWidgetId === widgetId) setEditingWidgetId("");

    if (activeThreadId === widgetId) {
      setActiveThreadId("global");
    }
  };

  const undoDelete = () => {
    if (!lastDeletedWidget) return;
    playSound("place");
    const deleted = lastDeletedWidget;
    setDeletedWidgetIds((current) => ({
      ...current,
      [deleted.spaceId]: (current[deleted.spaceId] ?? []).filter(
        (widgetId) => widgetId !== deleted.widgetId,
      ),
    }));
    if (deleted.spaceId === spaceId) setManagedWidgetId(deleted.widgetId);
    setLastDeletedWidget(null);
  };

  const saveWidgetData = (
    widgetId: string,
    data: Widget["data"],
    layout?: Pick<Widget, "w" | "h">,
  ) => {
    if (frameEditSnapshot.current?.widgetId === widgetId) {
      frameEditSnapshot.current = null;
    }
    playSound("place");
    setWidgetDataOverrides((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: data,
      },
    }));
    if (
      focusedTarget?.id === widgetId &&
      typeof data.title === "string"
    ) {
      setFocusedTarget((current) =>
        current?.id === widgetId
          ? { ...current, label: data.title as string }
          : current,
      );
    }
    if (layout) {
      setWidgetPlacements((current) => ({
        ...current,
        [spaceId]: {
          ...(current[spaceId] ?? {}),
          [widgetId]: {
            ...(current[spaceId]?.[widgetId] ?? {}),
            ...layout,
          },
        },
      }));
    }
    setEditingWidgetId("");
    if (layout) setManagedWidgetId("");
  };

  const promoteMessage = () => {
    if (promoted) return;
    playSound("promote");
    setPromoted(true);
  };

  /* ── catch me up (scripted, no model behind it) ──
     Reports what moved and rings where it moved. Never writes to the canvas. */

  // Rings belong to an open panel, and plenty of flows close it.
  useEffect(() => {
    if (recapOpen) return;
    setRecapCites([]);
    setRecapHover(null);
  }, [recapOpen]);

  const openRecap = () => {
    setRecapRunId((id) => id + 1);
    setRecapOpen(true);
  };

  const closeRecap = () => setRecapOpen(false);

  // Each line lights its own widget as it lands, so the board reads in order.
  const revealRecap = useCallback((count: number) => {
    const widgetId = RECAP_LINES[count - 1]?.widgetId;
    if (!widgetId) return;

    setRecapCites((current) => [...current, widgetId]);
    playSound("place");

    if (count === 1) {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-widget-id="${widgetId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      });
    }
  }, []);

  // The one change nobody rescued — walk them to it so they can promote it.
  const jumpToRecapMessage = (messageId: string) => {
    playSound("tap");
    setRecapOpen(false);
    setActiveThreadId("global");
    setChatOpen(true);
    setHighlightMessageId(messageId);
    // Released so a second trip back replays the flash.
    window.setTimeout(() => setHighlightMessageId(""), 2600);
  };

  const toggleSound = () => {
    const nextEnabled = !soundEnabled;
    persistSoundEnabled(nextEnabled);
    setSoundEnabled(nextEnabled);
    if (nextEnabled) playSound("tap");
  };

  if (route === "cursors") {
    return <DeferredRoute><CursorLab /></DeferredRoute>;
  }

  if (route === "test") {
    return <DeferredRoute><Welcome /></DeferredRoute>;
  }

  if (route === "widgets") {
    return <DeferredRoute><WidgetLab /></DeferredRoute>;
  }

  if (route === "live" && !mockModeRequested()) {
    return <LiveSpacePage />;
  }

  if (route === "join" && !mockModeRequested()) {
    return (
      <LiveSpacePage
        slug={spaceId}
        isInviteEntry
        onSelectSpace={(id) => {
          window.location.hash = id === "crew" ? "#/" : `#/space/${id}`;
        }}
      />
    );
  }

  if (route === "space" && !mockModeRequested()) {
    return <LiveSpacePage slug={spaceId} onSelectSpace={(id) => { window.location.hash = id === "crew" ? "#/" : `#/space/${id}`; }} />;
  }

  if (route === "home") {
    if (!mockModeRequested()) {
      return (
        <DeferredRoute>
        <LiveBlockPage
          onEnterSpace={selectSpace}
          zoomPhase={zoom.phase}
          zoomSpaceId={zoom.spaceId}
          zoomMode={zoom.mode}
          blockScroll={zoom.blockScroll}
          exitCamera={zoom.exitCamera}
          onZoomInStart={startBlockZoomIn}
          onZoomInComplete={completeBlockZoomIn}
          onZoomOutComplete={completeBlockZoomOut}
        />
        </DeferredRoute>
      );
    }
    return (
      <DeferredRoute>
      <BlockPage
        onEnterSpace={selectSpace}
        addedWidgets={addedWidgets}
        widgetPlacements={widgetPlacements}
        widgetDataOverrides={widgetDataOverrides}
        deletedWidgetIds={deletedWidgetIds}
        pollSelections={pollSelections}
        rsvpSelections={rsvpSelections}
        dailyAnswers={dailyAnswers}
        dailyReactions={dailyReactions}
        promoted={promoted}
        spaceCustomizations={spaceCustomizations}
        backendLiveCounts={backendLiveCounts}
        visitorCount={buildClubVisitors}
        zoomPhase={zoom.phase}
        zoomSpaceId={zoom.spaceId}
        zoomMode={zoom.mode}
        blockScroll={zoom.blockScroll}
        exitCamera={zoom.exitCamera}
        onZoomInStart={startBlockZoomIn}
        onZoomInComplete={completeBlockZoomIn}
        onZoomOutComplete={completeBlockZoomOut}
      />
      </DeferredRoute>
    );
  }

  const baseSpace = getSpace(spaceId);
  const activeSpaceCustomization =
    spaceDraft ??
    spaceCustomizations[spaceId] ??
    defaultSpaceCustomization(baseSpace);
  const visibleWidgets = [
    ...baseSpace.widgets,
    ...(addedWidgets[spaceId] ?? []),
    ...(promoted && spaceId === "crew" ? [DECISION_WIDGET] : []),
  ]
    .filter((widget) => !(deletedWidgetIds[spaceId] ?? []).includes(widget.id))
    .map((widget) => ({
      ...widget,
      ...widgetPlacements[spaceId]?.[widget.id],
      data: widgetDataOverrides[spaceId]?.[widget.id] ?? widget.data,
    }));
  const editingWidget = editingWidgetId
    ? visibleWidgets.find((widget) => widget.id === editingWidgetId) ?? null
    : null;
  const activeThreadWidget =
    visibleWidgets.find((widget) => widget.id === activeThreadId) ?? null;
  const activeThreadLabel = activeThreadWidget
    ? widgetLabel(activeThreadWidget)
    : undefined;
  const currentLocalMessages = localThreadMessages[spaceId] ?? {};
  const commentCounts = Object.fromEntries(
    visibleWidgets.map((widget) => [
      widget.id,
      getCommentCount(spaceId, widget.id) +
        (currentLocalMessages[widget.id]?.length ?? 0),
    ]),
  );
  const focusedThread =
    focusedTarget?.kind === "widget"
      ? getThread(spaceId, focusedTarget.id)
      : null;
  const focusedThreadMessages = focusedThread
    ? [
        ...focusedThread.messages,
        ...(currentLocalMessages[focusedThread.widgetId] ?? []),
      ]
    : [];

  return (
    <main
      className={`paper-bg relative h-dvh overflow-hidden ${
        chatOpen ? "has-chat-open" : ""
      } ${editingWidget || spaceDraft ? "has-editor-open" : ""} ${
        spaceDraft ? "is-room-editing" : ""
      } ${canvasAwayFromHome ? "is-canvas-away" : ""} ${
        canvasPanning ? "is-canvas-panning" : ""
      } ${focusedTarget?.kind === "frame" ? "has-frame-focus" : ""} ${
        focusedTarget?.kind === "widget" ? "has-widget-focus" : ""
      } ${
        canvasCameraAnimating ? "is-canvas-camera-animating" : ""
      } ${zoom.phase === "landing" ? "is-zoom-landing" : ""} space-theme-${activeSpaceCustomization.theme}`}
      style={spaceCustomizationStyle(activeSpaceCustomization)}
    >
      <Rail
        activeId={spaceId}
        activeSpaceOverride={{
          ...activeSpaceCustomization,
          color: activeSpaceCustomization.accent,
        }}
        onSelectSpace={selectSpace}
        onCreateClick={() => openPicker("spaces")}
      />
      <SpaceHeader
        // Keyed on the space so switching replays the entrance choreography.
        key={spaceId}
        spaceId={spaceId}
        addOpen={pickerOpen && pickerMode === "widgets"}
        onAddClick={() => openPicker("widgets")}
        spaceMeta={activeSpaceCustomization}
        roomEditing={Boolean(spaceDraft)}
        onEditSpace={openSpaceEditor}
        visitorCount={spaceId === "buildclub" ? buildClubVisitors : undefined}
        entrance={zoom.phase !== "landing"}
      />
      {focusedTarget && (
        <nav className="canvas-focus-hud" aria-label="Focused canvas item">
          <button
            type="button"
            className="canvas-focus-hud-back"
            onClick={() => leaveFocus()}
            aria-keyshortcuts="Escape"
            aria-label={`Back to ${activeSpaceCustomization.name}`}
          >
            <span className="canvas-focus-hud-arrow" aria-hidden="true">
              ←
            </span>
            <span className="canvas-focus-hud-space">
              {activeSpaceCustomization.name}
            </span>
            <span className="canvas-focus-hud-separator" aria-hidden="true">
              /
            </span>
            <strong>{focusedTarget.label}</strong>
          </button>
          {focusedTarget.kind === "frame" && (
            <button
              type="button"
              className={`canvas-focus-hud-edit ${
                editingWidgetId === focusedTarget.id ? "is-active" : ""
              }`}
              onClick={() => openWidgetEditor(focusedTarget.id)}
              aria-pressed={editingWidgetId === focusedTarget.id}
            >
              <span aria-hidden="true">✎</span>
              edit frame
            </button>
          )}
        </nav>
      )}
      {!demoMode && (
        <nav className="lab-links" aria-label="Prototype labs">
          <a href="#/widgets" className="lab-link">
            widget lab
          </a>
          <a href="#/cursors" className="lab-link">
            cursor lab
          </a>
        </nav>
      )}
      <div
        ref={canvasViewportRef}
        className={`space-scroll h-full overflow-auto ${
          spaceId === "league" ? "space-scroll-league" : ""
        } ${spaceId === "buildclub" ? "space-scroll-buildclub" : ""} ${
          canvasPanning ? "is-canvas-panning" : ""
        }`}
        onScroll={(event) => {
          setCanvasAwayFromHome(
            event.currentTarget.scrollLeft > 48 || event.currentTarget.scrollTop > 72,
          );
        }}
        onPointerDown={(event) => {
          if (firstRunActive || focusedTarget?.kind === "widget") return;

          const target = event.target as HTMLElement;
          if (
            event.button !== 0 ||
            event.pointerType === "touch" ||
            target.closest(
              ".widget-group[data-widget-id], button, a, input, textarea, select, [contenteditable='true']",
            )
          ) {
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          canvasPan.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            scrollLeft: event.currentTarget.scrollLeft,
            scrollTop: event.currentTarget.scrollTop,
          };
          setCanvasPanning(true);
        }}
        onPointerMove={(event) => {
          const pan = canvasPan.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.currentTarget.scrollLeft =
            pan.scrollLeft - (event.clientX - pan.clientX);
          event.currentTarget.scrollTop =
            pan.scrollTop - (event.clientY - pan.clientY);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          canvasPan.current = null;
          setCanvasPanning(false);
        }}
        onPointerCancel={() => {
          canvasPan.current = null;
          setCanvasPanning(false);
        }}
        onLostPointerCapture={() => {
          canvasPan.current = null;
          setCanvasPanning(false);
        }}
      >
        <div
          ref={canvasStageRef}
          className="canvas-stage"
          style={{
            width: Math.ceil(canvasWorldSize.width * canvasScale),
            height: Math.ceil(canvasWorldSize.height * canvasScale),
          }}
        >
          <div
            ref={canvasScaleLayerRef}
            className="canvas-scale-layer"
            style={{
              width: canvasWorldSize.width,
              height: canvasWorldSize.height,
              transform: `scale(${canvasScale})`,
            }}
          >
            <Canvas
              key={spaceId}
              spaceId={spaceId}
              selectedWidgetId={
                focusedTarget?.kind === "widget"
                  ? focusedTarget.id
                  : chatOpen && activeThreadId !== "global"
                    ? activeThreadId
                    : ""
              }
              onWidgetSelect={openWidgetThread}
              managedWidgetId={managedWidgetId}
              onWidgetManage={setManagedWidgetId}
              onWidgetMove={moveWidget}
              onWidgetDragStart={startWidgetDrag}
              onWidgetDragEnd={finishWidgetDrag}
              onWidgetDelete={deleteWidget}
              onWidgetEdit={openWidgetEditor}
              editingWidgetId={editingWidgetId}
              focusedTargetId={focusedTarget?.id ?? ""}
              focusedTargetKind={focusedTarget?.kind}
              canvasScale={canvasScale}
              onFrameFocus={focusFrame}
              onFrameLayoutChange={updateFrameLayout}
              onFrameLayoutCommit={finishFrameLayout}
              onPollVote={voteOnPoll}
              onWheelSpin={spinWheel}
              onPlaylistTune={tunePlaylist}
              onRsvp={respondToRsvp}
              onDailyAnswer={answerDailyQ}
              onDailyReact={reactToDailyAnswer}
              promoted={promoted}
              onPromote={promoteMessage}
              addedWidgets={addedWidgets[spaceId] ?? []}
              widgetPlacements={widgetPlacements[spaceId] ?? {}}
              widgetDataOverrides={widgetDataOverrides[spaceId] ?? {}}
              localCommentCounts={commentCounts}
              pollSelections={pollSelections[spaceId] ?? {}}
              rsvpSelections={rsvpSelections[spaceId] ?? {}}
              readThreadIds={readThreadIds}
              dailyAnswers={dailyAnswers[spaceId] ?? {}}
              dailyReactions={dailyReactions[spaceId] ?? {}}
              recapCites={recapHover ? [recapHover] : recapCites}
              deletedWidgetIds={deletedWidgetIds[spaceId] ?? []}
              backendLiveCounts={
                spaceId === "buildclub" ? backendLiveCounts : undefined
              }
              firstRunActive={firstRunActive}
              onFirstRunPlace={handleFirstRunPlace}
              viewportRef={canvasViewportRef}
              visitorCount={
                spaceId === "buildclub" ? buildClubVisitors : undefined
              }
              entrance={zoom.phase !== "landing"}
            />
          </div>
        </div>
      </div>
      {focusedTarget?.kind === "widget" && (
        <WidgetThreadDock
          viewportRef={canvasViewportRef}
          widgetId={focusedTarget.id}
          widgetType={focusedTarget.type}
          label={focusedTarget.label}
          messages={focusedThreadMessages}
          placement={threadDockPlacement}
          onSend={(text) => sendThreadMessage(focusedTarget.id, text)}
          onSizeChange={updateThreadDockSize}
          actions={
            focusedTarget.type === "rsvp" ? (
              <div className="thread-rsvp-chips">
                <span>going?</span>
                {RSVP_CHOICES.map((choice) => (
                  <button
                    key={choice.status}
                    type="button"
                    className={
                      rsvpSelections[spaceId]?.[focusedTarget.id] ===
                      choice.status
                        ? "is-picked"
                        : ""
                    }
                    onClick={() =>
                      respondToRsvp(focusedTarget.id, choice.status)
                    }
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      )}
      <CanvasEdgePan
        viewportRef={canvasViewportRef}
        disabled={
          canvasPanning ||
          canvasCameraAnimating ||
          focusedTarget?.kind === "widget" ||
          pickerOpen ||
          Boolean(editingWidget) ||
          Boolean(spaceDraft)
        }
      />
      <GlobalChatPanel
        spaceId={spaceId}
        open={chatOpen}
        activeThreadId={activeThreadId}
        onToggle={() => setChatOpen((v) => !v)}
        onThreadChange={setActiveThreadId}
        extraMessages={currentLocalMessages[activeThreadId] ?? []}
        activeThreadLabel={activeThreadLabel}
        onSendMessage={sendThreadMessage}
        onPromote={promoteMessage}
        promoted={promoted}
        highlightMessageId={highlightMessageId}
      />
      <WidgetEditorPanel
        widget={editingWidget}
        onClose={closeWidgetEditor}
        onSave={saveWidgetData}
        onDelete={deleteWidget}
        onFrameLayoutChange={updateFrameLayout}
        onFrameLayoutCommit={finishFrameLayout}
      />
      <SpaceEditorPanel
        value={spaceDraft}
        onChange={setSpaceDraft}
        onClose={() => setSpaceDraft(null)}
        onSave={saveSpace}
      />
      <ActionDock
        nav={
          <CanvasNavigator
            key={spaceId}
            viewportRef={canvasViewportRef}
            spaceName={activeSpaceCustomization.name}
            focusedTargetId={focusedTarget?.id ?? ""}
            onHome={resetRoomHome}
            onRoomNavigate={prepareRoomNavigation}
          />
        }
        recapOpen={recapOpen}
        recapRunId={recapRunId}
        onRecapReveal={revealRecap}
        onRecapClose={closeRecap}
        onRecapHover={setRecapHover}
        onRecapJump={jumpToRecapMessage}
        chatOpen={chatOpen}
        messageCount={
          getGlobalThread(spaceId).messages.length +
          (currentLocalMessages.global?.length ?? 0)
        }
        soundEnabled={soundEnabled}
        onRecapToggle={() => {
          if (recapOpen) {
            playSound("tap");
            closeRecap();
            return;
          }
          if (focusedTarget?.kind === "widget") leaveFocus(false);
          playSound("tap");
          closeWidgetEditor();
          setSpaceDraft(null);
          setChatOpen(false);
          openRecap();
        }}
        onChatToggle={() => {
          if (focusedTarget?.kind === "widget") {
            leaveFocus(false);
            playSound("tap");
            closeWidgetEditor();
            setSpaceDraft(null);
            setActiveThreadId("global");
            setChatOpen(true);
            return;
          }
          playSound("tap");
          closeWidgetEditor();
          setSpaceDraft(null);
          setChatOpen((value) => !value);
        }}
        onSoundToggle={toggleSound}
      />
      {spaceId === "crew" && <WelcomePill />}
      <WidgetPicker
        open={pickerOpen}
        mode={pickerMode}
        onAddSticker={addSticker}
        onAddWidget={addWidget}
        onClose={() => setPickerOpen(false)}
      />
      {lastDeletedWidget && (
        <div className="widget-undo-toast" role="status" aria-live="polite">
          <span>
            <strong>{lastDeletedWidget.label}</strong> deleted
          </span>
          <button type="button" onClick={undoDelete}>
            undo
          </button>
        </div>
      )}
      {spaceDraft && (
        <div className="room-mode-ring" aria-hidden="true">
          <span>editing this space</span>
        </div>
      )}
    </main>
  );
}
