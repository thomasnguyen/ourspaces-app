import { useEffect, useRef, useState, type RefObject } from "react";

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";
const CHROME_SELECTOR = [
  ".space-rail",
  ".space-header",
  ".action-dock",
  ".canvas-navigator",
  ".canvas-focus-hud",
  ".global-chat-panel",
  ".global-chat-tab",
  ".widget-editor-panel",
  ".space-editor-panel",
  ".widget-picker",
  ".widget-thread-dock",
  ".invite-popover",
  ".claim-card",
].join(", ");

type PanSession = {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(EDITABLE_SELECTOR));
}

function isSpaceKey(event: KeyboardEvent) {
  return event.code === "Space" || event.key === " " || event.key === "Spacebar";
}

export function useCanvasSpacePan(
  viewportRef: RefObject<HTMLDivElement | null>,
  disabled = false,
) {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const spaceHeldRef = useRef(false);
  const panningRef = useRef(false);
  const disabledRef = useRef(disabled);
  const panRef = useRef<PanSession | null>(null);
  disabledRef.current = disabled;

  useEffect(() => {
    const armSpace = () => {
      if (spaceHeldRef.current) return;
      spaceHeldRef.current = true;
      setSpaceHeld(true);
    };
    const releaseSpace = () => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSpaceKey(event) || event.repeat) return;
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
        return;
      }
      if (disabledRef.current) return;
      event.preventDefault();
      armSpace();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!isSpaceKey(event)) return;
      releaseSpace();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", releaseSpace);
      releaseSpace();
    };
  }, []);

  useEffect(() => {
    const endPan = (pointerId?: number) => {
      const viewport = viewportRef.current;
      const pan = panRef.current;
      if (!pan) return;
      if (pointerId != null && pan.pointerId !== pointerId) return;
      if (viewport?.hasPointerCapture(pan.pointerId)) {
        viewport.releasePointerCapture(pan.pointerId);
      }
      panRef.current = null;
      if (panningRef.current) {
        panningRef.current = false;
        setPanning(false);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const viewport = viewportRef.current;
      if (!viewport || !spaceHeldRef.current || disabledRef.current) return;
      if (event.button !== 0 || event.pointerType === "touch") return;
      if (!viewport.contains(event.target as Node)) return;

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(CHROME_SELECTOR) || target?.closest(EDITABLE_SELECTOR)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      viewport.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      panningRef.current = true;
      setPanning(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      const viewport = viewportRef.current;
      const pan = panRef.current;
      if (!viewport || !pan || pan.pointerId !== event.pointerId) return;
      event.preventDefault();
      viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
      viewport.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      endPan(event.pointerId);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      endPan();
    };
  }, [viewportRef]);

  useEffect(() => {
    if (!disabled) return;
    spaceHeldRef.current = false;
    setSpaceHeld(false);
    const viewport = viewportRef.current;
    const pan = panRef.current;
    if (viewport && pan && viewport.hasPointerCapture(pan.pointerId)) {
      viewport.releasePointerCapture(pan.pointerId);
    }
    panRef.current = null;
    if (panningRef.current) {
      panningRef.current = false;
      setPanning(false);
    }
  }, [disabled, viewportRef]);

  return { spaceHeld, panning };
}
