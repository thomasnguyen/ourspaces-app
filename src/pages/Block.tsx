import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Rail } from "../components/Rail";
import { Canvas } from "../components/Canvas";
import { SPACES_BY_ID, canvasSizeFor } from "../data/spaces";
import {
  defaultSpaceCustomization,
  spaceCustomizationStyle,
  type SpaceCustomization,
} from "../data/spaceThemes";
import type { Widget } from "../data/types";
import type { BackendCount } from "../lib/backendCounts";
import {
  BLOCK_ZOOM_MS,
  ZOOM_FADE_MS,
  clampBlockScroll,
  fleeVector,
  type BlockExitCamera,
  type BlockZoomMode,
  type BlockZoomPhase,
  zoomInPose,
  zoomOutPose,
} from "../lib/blockZoom";
import { useSpaceEntrance } from "../lib/entrance";
import { playSound } from "../lib/sounds";

type WidgetPlacement = Partial<Pick<Widget, "x" | "y" | "z" | "w" | "h">>;

export type BlockSlot = {
  spaceId: string;
  x: number;
  y: number;
  scale: number;
  tilt: number;
  tier: "near" | "far";
  pillTilt: number;
  enterDelay: number;
};

export const BLOCK_SLOTS: BlockSlot[] = [
  { spaceId: "crew", x: 8, y: 96, scale: 0.21, tilt: -1.2, tier: "near", pillTilt: -1, enterDelay: 40 },
  { spaceId: "league", x: 468, y: 76, scale: 0.19, tilt: 1.6, tier: "near", pillTilt: 1.6, enterDelay: 90 },
  { spaceId: "couple", x: 60, y: 830, scale: 0.13, tilt: -3.5, tier: "far", pillTilt: -3.5, enterDelay: 240 },
  { spaceId: "house", x: 420, y: 856, scale: 0.13, tilt: 2.5, tier: "far", pillTilt: 2.5, enterDelay: 290 },
];

type BlockSessionState = {
  addedWidgets: Record<string, Widget[]>;
  widgetPlacements: Record<string, Record<string, WidgetPlacement>>;
  widgetDataOverrides: Record<string, Record<string, Widget["data"]>>;
  deletedWidgetIds: Record<string, string[]>;
  pollSelections: Record<string, Record<string, string>>;
  rsvpSelections: Record<string, Record<string, "yes" | "maybe" | "no">>;
  dailyAnswers: Record<string, Record<string, string>>;
  dailyReactions: Record<string, Record<string, Record<string, string>>>;
  promoted: boolean;
  spaceCustomizations: Record<string, SpaceCustomization>;
  backendLiveCounts: BackendCount[];
  visitorCount: number;
  liveWidgets?: Record<string, Widget[] | undefined>;
};

export type BlockPageProps = BlockSessionState & {
  onEnterSpace: (id: string) => void;
  zoomPhase?: BlockZoomPhase;
  zoomSpaceId?: string | null;
  zoomMode?: BlockZoomMode;
  blockScroll?: { left: number; top: number } | null;
  exitCamera?: BlockExitCamera | null;
  onZoomInStart?: (
    id: string,
    mode: BlockZoomMode,
    blockScroll: { left: number; top: number },
  ) => void;
  onZoomInComplete?: (id: string) => void;
  onZoomOutComplete?: () => void;
};

function daysUntil(widget: Widget | undefined) {
  const targetDate = widget?.data.targetDate;
  if (typeof targetDate !== "string") return 0;
  const target = new Date(`${targetDate}T00:00:00`).getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

function boardFact(spaceId: string, liveWidgets?: Record<string, Widget[] | undefined>) {
  const space = SPACES_BY_ID[spaceId];
  if (!space) return "space";

  const widgets = liveWidgets?.[spaceId] ?? space.widgets;
  if (spaceId === "crew") {
    return `the crew · maya's bday in ${daysUntil(widgets.find((widget) => widget.type === "countdown"))} days`;
  }
  if (spaceId === "league") return "game day · 49ers 24 · q4";
  if (spaceId === "couple") return "us two · playlist live";
  if (spaceId === "house") return "the house · chore wheel live";
  return space.name;
}

function noop() {}

function BlockBoard({
  slot,
  onEnterSpace,
  onBoardClick,
  ...session
}: {
  slot: BlockSlot;
  onEnterSpace: (id: string) => void;
  onBoardClick?: (id: string, board: HTMLDivElement, slot: HTMLDivElement) => void;
} & BlockSessionState) {
  const space = SPACES_BY_ID[slot.spaceId];
  if (!space) return null;

  const customization =
    session.spaceCustomizations[slot.spaceId] ?? defaultSpaceCustomization(space);
  const canvasSize = canvasSizeFor(slot.spaceId);
  const boardStyle = {
    ...spaceCustomizationStyle(customization),
    "--tilt": `${slot.tilt}deg`,
    "--s0": slot.scale,
  } as CSSProperties & Record<string, string | number>;

  return (
    <div
      className={`block-slot block-board-${slot.tier}`}
      data-space-id={slot.spaceId}
      style={{
        left: slot.x,
        top: slot.y,
        width: canvasSize.width * slot.scale,
        height: canvasSize.height * slot.scale,
        "--enter-delay": `${slot.enterDelay}ms`,
        "--s0": slot.scale,
      } as CSSProperties & Record<string, string | number>}
    >
      <span
        className="block-pill"
        style={{ rotate: `${slot.pillTilt}deg` }}
      >
          <span className="block-pill-title">{boardFact(slot.spaceId, session.liveWidgets)}</span>
        <span className="block-pill-detail">{space.showcase ?? space.tagline}</span>
      </span>
      <div
        className={`block-board paper-bg space-theme-${customization.theme}`}
        data-space-id={slot.spaceId}
        role="button"
        tabIndex={0}
        aria-label={`Enter ${space.name}: ${space.showcase ?? space.tagline}`}
        style={boardStyle}
        onClick={(event) => {
          const slotElement = event.currentTarget.parentElement as HTMLDivElement | null;
          if (onBoardClick && slotElement) {
            onBoardClick(slot.spaceId, event.currentTarget, slotElement);
            return;
          }
          onEnterSpace(slot.spaceId);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          const slotElement = event.currentTarget.parentElement as HTMLDivElement | null;
          if (onBoardClick && slotElement) {
            onBoardClick(slot.spaceId, event.currentTarget, slotElement);
          } else {
            onEnterSpace(slot.spaceId);
          }
        }}
      >
        <div className="block-board-clip">
          <div
            className="block-board-scale"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `scale(${slot.scale})`,
            }}
          >
            <Canvas
              spaceId={slot.spaceId}
              widgets={session.liveWidgets ? session.liveWidgets[slot.spaceId] : undefined}
              entrance={false}
              selectedWidgetId=""
              onWidgetSelect={noop}
              managedWidgetId=""
              onWidgetManage={noop}
              onWidgetMove={noop}
              onWidgetDragStart={noop}
              onWidgetDragEnd={noop}
              onWidgetDelete={noop}
              onWidgetEdit={noop}
              promoted={session.promoted}
              onPromote={noop}
              addedWidgets={session.addedWidgets[slot.spaceId] ?? []}
              widgetPlacements={session.widgetPlacements[slot.spaceId] ?? {}}
              widgetDataOverrides={session.widgetDataOverrides[slot.spaceId] ?? {}}
              pollSelections={session.pollSelections[slot.spaceId] ?? {}}
              rsvpSelections={session.rsvpSelections[slot.spaceId] ?? {}}
              dailyAnswers={session.dailyAnswers[slot.spaceId] ?? {}}
              dailyReactions={session.dailyReactions[slot.spaceId] ?? {}}
              deletedWidgetIds={session.deletedWidgetIds[slot.spaceId] ?? []}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BlockPage({
  onEnterSpace,
  zoomPhase = "idle",
  zoomSpaceId = null,
  zoomMode = "fly",
  blockScroll = null,
  exitCamera = null,
  onZoomInStart,
  onZoomInComplete,
  onZoomOutComplete,
  ...session
}: BlockPageProps) {
  const entering = useSpaceEntrance(zoomPhase !== "zooming-out");
  const pageRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomTimerRef = useRef(0);
  const zoomOutHandledRef = useRef(false);
  const handleBoardClick = (
    id: string,
    board: HTMLDivElement,
    slot: HTMLDivElement,
  ) => {
    if (zoomPhase !== "idle" || !onZoomInStart || !onZoomInComplete) return;

    if (window.matchMedia("(max-width: 800px)").matches) {
      onEnterSpace(id);
      return;
    }

    const page = pageRef.current;
    const scroll = scrollRef.current;
    if (!page || !scroll) return;

    const mode: BlockZoomMode = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "fade"
      : "fly";
    const blockScroll = {
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
    };
    const surface = page.querySelector<HTMLElement>(".block-surface");

    page.classList.remove("is-entering");
    surface?.classList.remove("is-entering");
    page.classList.add("is-zooming-in");
    if (mode === "fade") page.classList.add("is-zoom-fade");
    const slotRect = slot.getBoundingClientRect();
    const targetBackground = window.getComputedStyle(board);
    page.style.backgroundColor = targetBackground.backgroundColor;
    page.style.backgroundImage = targetBackground.backgroundImage;
    page.getBoundingClientRect();

    if (mode === "fade") {
      page.style.transition = `opacity ${ZOOM_FADE_MS}ms ease-out`;
      page.style.opacity = "0";
    } else {
      const s0 = Number.parseFloat(
        window.getComputedStyle(slot).getPropertyValue("--s0"),
      );
      const resolvedPose = zoomInPose(slotRect, Number.isFinite(s0) && s0 > 0 ? s0 : 1);
      const targetBoard = resolvedPose;
      board.style.transition = [
        `${"translate"} ${BLOCK_ZOOM_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        `scale ${BLOCK_ZOOM_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        `rotate ${BLOCK_ZOOM_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        `border-radius ${BLOCK_ZOOM_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        `box-shadow ${BLOCK_ZOOM_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
      ].join(", ");
      board.style.setProperty(
        "translate",
        `${targetBoard.translateX}px ${targetBoard.translateY}px`,
      );
      board.style.setProperty("scale", String(targetBoard.scale));
      board.style.setProperty("rotate", "0deg");
      board.style.borderRadius = "0";
      board.style.boxShadow = "none";

      page.querySelectorAll<HTMLElement>(".block-slot").forEach((sibling) => {
        if (sibling === slot) return;
        const vector = fleeVector(sibling.getBoundingClientRect(), slotRect);
        sibling.style.transition =
          "translate 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out 80ms";
        sibling.style.setProperty("translate", `${vector.x}px ${vector.y}px`);
        sibling.style.opacity = "0";
        const pill = sibling.querySelector<HTMLElement>(".block-pill");
        if (pill) {
          pill.style.transition = "opacity 160ms ease-out";
          pill.style.opacity = "0";
        }
      });
    }

    playSound("tap");
    onZoomInStart(id, mode, blockScroll);
    window.clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = window.setTimeout(
      () => onZoomInComplete(id),
      mode === "fade" ? ZOOM_FADE_MS : BLOCK_ZOOM_MS,
    );
  };

  useLayoutEffect(() => {
    if (zoomPhase !== "zooming-out" || !zoomSpaceId) {
      zoomOutHandledRef.current = false;
      return;
    }
    if (zoomOutHandledRef.current) return;
    zoomOutHandledRef.current = true;

    const page = pageRef.current;
    const scroll = scrollRef.current;
    const slot = page?.querySelector<HTMLElement>(
      `.block-slot[data-space-id="${zoomSpaceId}"]`,
    );
    const board = slot?.querySelector<HTMLElement>(".block-board");
    if (!page || !scroll || !slot || !board) {
      onZoomOutComplete?.();
      return;
    }

    if (zoomMode === "fade") {
      return;
    }

    page.classList.add("is-zooming-out", "is-zoom-pre");
    const viewportRect = scroll.getBoundingClientRect();
    const currentScroll = blockScroll ?? {
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
    };
    scroll.scrollTo({ left: currentScroll.left, top: currentScroll.top, behavior: "auto" });
    const clamped = clampBlockScroll(
      currentScroll,
      slot.getBoundingClientRect(),
      viewportRect,
      {
        left: Math.max(0, scroll.scrollWidth - scroll.clientWidth),
        top: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
      },
    );
    scroll.scrollTo({ left: clamped.left, top: clamped.top, behavior: "auto" });

    const targetRect = slot.getBoundingClientRect();
    const camera = exitCamera ?? { scale: 1, scrollLeft: 0, scrollTop: 0 };
    const scale0 = Number.parseFloat(
      window.getComputedStyle(slot).getPropertyValue("--s0"),
    );
    const pose = zoomOutPose(
      targetRect,
      Number.isFinite(scale0) && scale0 > 0 ? scale0 : 1,
      camera,
    );
    const targetBackground = window.getComputedStyle(board);
    page.style.backgroundColor = targetBackground.backgroundColor;
    page.style.backgroundImage = targetBackground.backgroundImage;
    board.style.transition = "none";
    board.style.setProperty("translate", `${pose.translateX}px ${pose.translateY}px`);
    board.style.setProperty("scale", String(pose.scale));
    board.style.setProperty("rotate", "0deg");
    board.style.borderRadius = "0";
    board.style.boxShadow = "none";

    page.querySelectorAll<HTMLElement>(".block-slot").forEach((sibling) => {
      if (sibling === slot) return;
      const vector = fleeVector(sibling.getBoundingClientRect(), targetRect);
      sibling.style.transition = "none";
      sibling.style.setProperty("translate", `${vector.x}px ${vector.y}px`);
      sibling.style.opacity = "0";
      const pill = sibling.querySelector<HTMLElement>(".block-pill");
      if (pill) pill.style.opacity = "0";
    });

    page.getBoundingClientRect();
    let releaseFrame = window.requestAnimationFrame(() => {
      releaseFrame = window.requestAnimationFrame(() => {
        page.classList.remove("is-zoom-pre");
        board.style.transition = "";
        board.style.removeProperty("translate");
        board.style.removeProperty("scale");
        board.style.removeProperty("rotate");
        board.style.borderRadius = "";
        board.style.boxShadow = "";
        page.style.backgroundColor = "";
        page.style.backgroundImage = "";

        page.querySelectorAll<HTMLElement>(".block-slot").forEach((sibling) => {
          if (sibling === slot) return;
          sibling.style.transition = "";
          sibling.style.removeProperty("translate");
          sibling.style.opacity = "";
          const pill = sibling.querySelector<HTMLElement>(".block-pill");
          if (pill) {
            pill.style.transition = "";
            pill.style.opacity = "";
          }
        });
      });
    });
    return () => window.cancelAnimationFrame(releaseFrame);
  }, [blockScroll, exitCamera, onZoomOutComplete, zoomMode, zoomPhase, zoomSpaceId]);

  useLayoutEffect(() => {
    if (zoomPhase !== "zooming-out") return;
    const duration = zoomMode === "fade" ? ZOOM_FADE_MS : BLOCK_ZOOM_MS;
    const timer = window.setTimeout(() => onZoomOutComplete?.(), duration);
    return () => window.clearTimeout(timer);
  }, [onZoomOutComplete, zoomMode, zoomPhase]);

  useLayoutEffect(
    () => () => window.clearTimeout(zoomTimerRef.current),
    [],
  );

  return (
    <main
      ref={pageRef}
      className={`block-page paper-bg space-theme-blush ${
        zoomPhase === "zooming-out" ? "is-zooming-out" : ""
      } ${zoomPhase === "zooming-in" ? "is-zooming-in" : ""} ${
        zoomMode === "fade" && zoomPhase !== "idle" ? "is-zoom-fade" : ""
      }`}
    >
      <Rail activeId="" onSelectSpace={onEnterSpace} />
      <div ref={scrollRef} className="block-scroll">
        <div className={`block-surface${entering ? " is-entering" : ""}`}>
          <p
            className="block-line block-line-near"
            style={{ "--enter-delay": "0ms" } as CSSProperties}
          >
            <span className="block-line-kicker">the showcase</span>
            <span className="block-line-main">
              one canvas, a lot of ways to be together
            </span>
          </p>
          <p
            className="block-line block-line-far"
            style={{ "--enter-delay": "190ms" } as CSSProperties}
          >
            <span className="block-line-kicker">the everyday rooms</span>
            <span className="block-line-main">
              plans, playlists, and everything in between
            </span>
          </p>
          {BLOCK_SLOTS.map((slot) => (
            <BlockBoard
              key={slot.spaceId}
              slot={slot}
              onEnterSpace={onEnterSpace}
              onBoardClick={
                onZoomInStart && onZoomInComplete ? handleBoardClick : undefined
              }
              {...session}
            />
          ))}
        </div>
      </div>
      <p className="block-mobile-note">the block wants a desktop</p>
    </main>
  );
}
