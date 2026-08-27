import { useMutation, useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { api } from "../../convex/_generated/api";
import type { LiveIdentity } from "./identity";
import type {
  CanvasLayout,
  GestureClaim,
  LiveGesture,
  LivePeer,
  LocalGesture,
} from "./presenceTypes";

const SEND_INTERVAL_MS = 90;
const KEEPALIVE_MS = 10_000;
const PRESENCE_TTL_MS = 30_000;
const GESTURE_TTL_MS = 1_500;

type GestureInput = Omit<LocalGesture, "sessionId"> & { sessionId: string };
type PresencePoint = { x: number; y: number };

export type PresenceController = {
  peers: LivePeer[];
  queryReady: boolean;
  claimGesture: (gesture: GestureInput) => Promise<GestureClaim>;
  updateGesture: (gesture: GestureInput) => void;
  finishGesture: (gesture: GestureInput) => Promise<boolean>;
  cancelGesture: (sessionId: string) => Promise<boolean>;
};

export function usePresence(
  spaceId: string | undefined,
  identity: LiveIdentity,
  pointerSurfaceRef: RefObject<HTMLElement | null>,
  canvasLayerRef: RefObject<HTMLElement | null>,
  entrancePoint: PresencePoint = { x: 72, y: 72 },
): PresenceController {
  const heartbeatMutation = useMutation(api.presence.heartbeat);
  const claimMutation = useMutation(api.presence.claimGesture);
  const updateMutation = useMutation(api.presence.updateGesture);
  const finishMutation = useMutation(api.presence.finishGesture);
  const cancelMutation = useMutation(api.presence.cancelGesture);
  const rows = useQuery(
    api.presence.listHereNow,
    spaceId ? { spaceId: spaceId as never } : "skip",
  );
  const [expiryTick, setExpiryTick] = useState(0);
  const point = useRef({ x: 0, y: 0 });
  const hasPoint = useRef(false);
  const lastHeartbeatSent = useRef(0);
  const lastGestureSent = useRef(0);
  const heartbeatTimer = useRef<number | null>(null);
  const gestureTimer = useRef<number | null>(null);
  const pendingGesture = useRef<GestureInput | null>(null);
  const latestGesture = useRef<GestureInput | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const gestureClaimed = useRef(false);

  const mutationIdentity = useCallback(
    () => ({
      spaceId: spaceId as never,
      ...identity,
      cursorX: point.current.x,
      cursorY: point.current.y,
    }),
    [identity, spaceId],
  );

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimer.current === null) return;
    window.clearTimeout(heartbeatTimer.current);
    heartbeatTimer.current = null;
  }, []);

  const clearGestureTimer = useCallback(() => {
    if (gestureTimer.current === null) return;
    window.clearTimeout(gestureTimer.current);
    gestureTimer.current = null;
  }, []);

  const sendHeartbeat = useCallback(() => {
    clearHeartbeatTimer();
    if (
      !spaceId ||
      !hasPoint.current ||
      document.hidden ||
      activeSessionId.current
    ) {
      return;
    }
    lastHeartbeatSent.current = performance.now();
    void heartbeatMutation({
      spaceId: spaceId as never,
      ...identity,
      ...point.current,
    });
  }, [clearHeartbeatTimer, heartbeatMutation, identity, spaceId]);

  const queueHeartbeat = useCallback(() => {
    if (!spaceId || document.hidden || activeSessionId.current) return;
    const elapsed = performance.now() - lastHeartbeatSent.current;
    if (elapsed >= SEND_INTERVAL_MS) {
      sendHeartbeat();
      return;
    }
    if (heartbeatTimer.current !== null) return;
    heartbeatTimer.current = window.setTimeout(
      sendHeartbeat,
      SEND_INTERVAL_MS - elapsed,
    );
  }, [sendHeartbeat, spaceId]);

  const sendGestureUpdate = useCallback(() => {
    clearGestureTimer();
    const gesture = pendingGesture.current;
    if (
      !spaceId ||
      !gesture ||
      activeSessionId.current !== gesture.sessionId
    ) {
      return;
    }
    pendingGesture.current = null;
    lastGestureSent.current = performance.now();
    void updateMutation({
      ...mutationIdentity(),
      ...gesture,
      widgetId: gesture.widgetId as never,
    });
  }, [clearGestureTimer, mutationIdentity, spaceId, updateMutation]);

  const queueGestureUpdate = useCallback(
    (gesture: GestureInput) => {
      if (activeSessionId.current !== gesture.sessionId) return;
      pendingGesture.current = gesture;
      const elapsed = performance.now() - lastGestureSent.current;
      if (elapsed >= SEND_INTERVAL_MS) {
        sendGestureUpdate();
        return;
      }
      if (gestureTimer.current !== null) return;
      gestureTimer.current = window.setTimeout(
        sendGestureUpdate,
        SEND_INTERVAL_MS - elapsed,
      );
    },
    [sendGestureUpdate],
  );

  useEffect(() => {
    hasPoint.current = false;
    if (!spaceId) return;

    const frame = window.requestAnimationFrame(() => {
      point.current = entrancePoint;
      hasPoint.current = true;
      sendHeartbeat();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [entrancePoint.x, entrancePoint.y, sendHeartbeat, spaceId]);

  useEffect(() => {
    const surface = pointerSurfaceRef.current;
    if (!surface || !spaceId) return;

    const updatePoint = (event: PointerEvent) => {
      const layer = canvasLayerRef.current;
      if (!layer) return;
      const rect = layer.getBoundingClientRect();
      const worldWidth = layer.offsetWidth;
      const worldHeight = layer.offsetHeight;
      if (!rect.width || !rect.height || !worldWidth || !worldHeight) return;

      point.current = {
        x: Math.min(
          worldWidth,
          Math.max(0, ((event.clientX - rect.left) / rect.width) * worldWidth),
        ),
        y: Math.min(
          worldHeight,
          Math.max(0, ((event.clientY - rect.top) / rect.height) * worldHeight),
        ),
      };
      hasPoint.current = true;
      const gesture = latestGesture.current;
      if (
        gesture &&
        gestureClaimed.current &&
        activeSessionId.current === gesture.sessionId
      ) {
        queueGestureUpdate(gesture);
      } else {
        queueHeartbeat();
      }
    };

    surface.addEventListener("pointerdown", updatePoint, { capture: true });
    surface.addEventListener("pointermove", updatePoint, { capture: true });
    surface.addEventListener("pointerup", updatePoint, { capture: true });
    return () => {
      surface.removeEventListener("pointerdown", updatePoint, { capture: true });
      surface.removeEventListener("pointermove", updatePoint, { capture: true });
      surface.removeEventListener("pointerup", updatePoint, { capture: true });
    };
  }, [
    canvasLayerRef,
    pointerSurfaceRef,
    queueGestureUpdate,
    queueHeartbeat,
    spaceId,
  ]);

  useEffect(() => {
    if (!spaceId) return;
    sendHeartbeat();
    const keepalive = window.setInterval(() => {
      if (!document.hidden) sendHeartbeat();
    }, KEEPALIVE_MS);
    const onVisibility = () => {
      if (!document.hidden) sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(keepalive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sendHeartbeat, spaceId]);

  useEffect(() => {
    if (!(rows ?? []).length) return;
    const now = Date.now();
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const row of rows ?? []) {
      if (row.userId === identity.userId) continue;
      const presenceExpiry = row.updatedAt + PRESENCE_TTL_MS;
      if (presenceExpiry > now) nextExpiry = Math.min(nextExpiry, presenceExpiry);
      const gestureExpiry = row.gesture?.updatedAt
        ? row.gesture.updatedAt + GESTURE_TTL_MS
        : 0;
      if (gestureExpiry > now) nextExpiry = Math.min(nextExpiry, gestureExpiry);
    }
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(
      () => setExpiryTick((current) => current + 1),
      Math.max(1, nextExpiry - now + 1),
    );
    return () => window.clearTimeout(timer);
  }, [expiryTick, identity.userId, rows]);

  useEffect(
    () => () => {
      clearHeartbeatTimer();
      clearGestureTimer();
      const sessionId = activeSessionId.current;
      if (spaceId && sessionId) {
        void cancelMutation({
          spaceId: spaceId as never,
          userId: identity.userId,
          sessionId,
        });
      }
      activeSessionId.current = null;
      gestureClaimed.current = false;
      pendingGesture.current = null;
      latestGesture.current = null;
    },
    [cancelMutation, clearGestureTimer, clearHeartbeatTimer, identity.userId, spaceId],
  );

  const claimGesture = useCallback(
    async (gesture: GestureInput): Promise<GestureClaim> => {
      if (!spaceId) return { accepted: false, reason: "missing" };
      clearHeartbeatTimer();
      clearGestureTimer();
      activeSessionId.current = gesture.sessionId;
      gestureClaimed.current = false;
      pendingGesture.current = gesture;
      latestGesture.current = gesture;
      const result = (await claimMutation({
        ...mutationIdentity(),
        ...gesture,
        widgetId: gesture.widgetId as never,
      })) as GestureClaim;
      if (result.accepted && activeSessionId.current === gesture.sessionId) {
        gestureClaimed.current = true;
      }
      if (!result.accepted && activeSessionId.current === gesture.sessionId) {
        activeSessionId.current = null;
        gestureClaimed.current = false;
        pendingGesture.current = null;
        latestGesture.current = null;
        queueHeartbeat();
      }
      return result;
    },
    [
      claimMutation,
      clearGestureTimer,
      clearHeartbeatTimer,
      mutationIdentity,
      queueHeartbeat,
      spaceId,
    ],
  );

  const updateGesture = useCallback(
    (gesture: GestureInput) => {
      latestGesture.current = gesture;
      queueGestureUpdate(gesture);
    },
    [queueGestureUpdate],
  );

  const finishGesture = useCallback(
    async (gesture: GestureInput) => {
      if (!spaceId || activeSessionId.current !== gesture.sessionId) {
        return false;
      }
      clearGestureTimer();
      pendingGesture.current = null;
      let committed = false;
      for (let attempt = 0; attempt < 2 && !committed; attempt += 1) {
        try {
          committed = await finishMutation({
            ...mutationIdentity(),
            ...gesture,
            widgetId: gesture.widgetId as never,
          });
        } catch {
          if (attempt === 1) committed = false;
        }
      }
      if (activeSessionId.current === gesture.sessionId) {
        activeSessionId.current = null;
        gestureClaimed.current = false;
      }
      if (latestGesture.current?.sessionId === gesture.sessionId) {
        latestGesture.current = null;
      }
      queueHeartbeat();
      return committed;
    },
    [
      clearGestureTimer,
      finishMutation,
      mutationIdentity,
      queueHeartbeat,
      spaceId,
    ],
  );

  const cancelGesture = useCallback(
    async (sessionId: string) => {
      if (!spaceId) return false;
      clearGestureTimer();
      pendingGesture.current = null;
      if (latestGesture.current?.sessionId === sessionId) {
        latestGesture.current = null;
      }
      const cancelled = await cancelMutation({
        spaceId: spaceId as never,
        userId: identity.userId,
        sessionId,
      });
      if (activeSessionId.current === sessionId) {
        activeSessionId.current = null;
        gestureClaimed.current = false;
      }
      queueHeartbeat();
      return cancelled;
    },
    [
      cancelMutation,
      clearGestureTimer,
      identity.userId,
      queueHeartbeat,
      spaceId,
    ],
  );

  const peers = useMemo<LivePeer[]>(() => {
    const now = Date.now();
    return (rows ?? [])
      .filter(
        (row) =>
          row.userId !== identity.userId &&
          now - row.updatedAt < PRESENCE_TTL_MS,
      )
      .map((row) => {
        const gesture =
          row.gesture && now - row.gesture.updatedAt < GESTURE_TTL_MS
            ? ({
                ...row.gesture,
                widgetId: String(row.gesture.widgetId),
              } satisfies LiveGesture)
            : undefined;
        return {
          userId: row.userId,
          name: row.name,
          color: row.color,
          emoji: row.emoji,
          avatarUrl: row.avatarUrl,
          x: row.x,
          y: row.y,
          updatedAt: row.updatedAt,
          gesture,
        };
      });
  }, [expiryTick, identity.userId, rows]);

  return {
    peers,
    queryReady: Boolean(spaceId && rows !== undefined),
    claimGesture,
    updateGesture,
    finishGesture,
    cancelGesture,
  };
}

export type { CanvasLayout };
