import { useCallback, useState } from "react";

export const SPACE_ARRIVAL_X = 118;
export const SPACE_ARRIVAL_Y = 132;
export const BLOCK_ZOOM_MS = 500;
export const ZOOM_LANDING_MS = 360;
export const ZOOM_FADE_MS = 160;
export const ZOOM_FLEE_PX = 180;
export const ZOOM_HANDOFF = "seamless" as const;

export type BlockZoomPhase = "idle" | "zooming-in" | "landing" | "zooming-out";
export type BlockZoomMode = "fly" | "fade";

export type BlockExitCamera = {
  scale: number;
  scrollLeft: number;
  scrollTop: number;
};

export type BlockZoomState = {
  phase: BlockZoomPhase;
  spaceId: string | null;
  mode: BlockZoomMode;
  blockScroll: { left: number; top: number } | null;
  exitCamera: BlockExitCamera | null;
};

export type BlockPose = {
  translateX: number;
  translateY: number;
  scale: number;
};

const IDLE_STATE: BlockZoomState = {
  phase: "idle",
  spaceId: null,
  mode: "fly",
  blockScroll: null,
  exitCamera: null,
};

export function zoomInPose(slotRect: DOMRect, scale0: number): BlockPose {
  return {
    translateX: SPACE_ARRIVAL_X - slotRect.left,
    translateY: SPACE_ARRIVAL_Y - slotRect.top,
    scale: 1 / scale0,
  };
}

export function zoomOutPose(
  slotRect: DOMRect,
  scale0: number,
  camera: BlockExitCamera,
): BlockPose {
  return {
    translateX:
      SPACE_ARRIVAL_X - camera.scrollLeft - slotRect.left,
    translateY:
      SPACE_ARRIVAL_Y - camera.scrollTop - slotRect.top,
    scale: camera.scale / scale0,
  };
}

export function fleeVector(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  distance = ZOOM_FLEE_PX,
) {
  const sourceX = sourceRect.left + sourceRect.width / 2;
  const sourceY = sourceRect.top + sourceRect.height / 2;
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const deltaX = sourceX - targetX;
  const deltaY = sourceY - targetY;
  const length = Math.hypot(deltaX, deltaY) || 1;

  return {
    x: (deltaX / length) * distance,
    y: (deltaY / length) * distance,
  };
}

export function clampBlockScroll(
  scroll: { left: number; top: number },
  targetRect: DOMRect,
  viewportRect: DOMRect,
  maxScroll: { left: number; top: number },
  gutter = 32,
) {
  let left = scroll.left;
  let top = scroll.top;

  if (targetRect.left < viewportRect.left + gutter) {
    left -= viewportRect.left + gutter - targetRect.left;
  } else if (targetRect.right > viewportRect.right - gutter) {
    left += targetRect.right - (viewportRect.right - gutter);
  }

  if (targetRect.top < viewportRect.top + gutter) {
    top -= viewportRect.top + gutter - targetRect.top;
  } else if (targetRect.bottom > viewportRect.bottom - gutter) {
    top += targetRect.bottom - (viewportRect.bottom - gutter);
  }

  return {
    left: Math.min(maxScroll.left, Math.max(0, left)),
    top: Math.min(maxScroll.top, Math.max(0, top)),
  };
}

export function useBlockZoom() {
  const [state, setState] = useState<BlockZoomState>(IDLE_STATE);

  const beginZoomIn = useCallback(
    (
      spaceId: string,
      mode: BlockZoomMode,
      blockScroll: { left: number; top: number },
    ) => {
      if (state.phase !== "idle") return false;
      setState({
        phase: "zooming-in",
        spaceId,
        mode,
        blockScroll,
        exitCamera: null,
      });
      return true;
    },
    [state.phase],
  );

  const completeZoomIn = useCallback((spaceId: string) => {
    setState((current) =>
      current.phase === "zooming-in" && current.spaceId === spaceId
        ? { ...current, phase: "landing" }
        : current,
    );
  }, []);

  const beginZoomOut = useCallback(
    (spaceId: string, mode: BlockZoomMode, exitCamera: BlockExitCamera) => {
      if (state.phase !== "idle") return false;
      setState({
        phase: "zooming-out",
        spaceId,
        mode,
        blockScroll: null,
        exitCamera,
      });
      return true;
    },
    [state.phase],
  );

  const finishZoomOut = useCallback(() => {
    setState(IDLE_STATE);
  }, []);

  const finishLanding = useCallback(() => {
    setState((current) =>
      current.phase === "landing" ? { ...current, phase: "idle" } : current,
    );
  }, []);

  return {
    ...state,
    beginZoomIn,
    completeZoomIn,
    beginZoomOut,
    finishZoomOut,
    finishLanding,
  };
}
