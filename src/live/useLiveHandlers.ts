import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { LiveIdentity } from "./identity";
import type { PresenceController } from "./usePresence";
import type {
  CanvasGestureKind,
  CanvasLayout,
  GestureClaim,
} from "./presenceTypes";
import type { LinkCardScrape, Widget } from "../data/types";
import { playSound } from "../lib/sounds";

type GesturePhase = "claiming" | "accepted" | "rejected";

type ActiveGesture = {
  sessionId: string;
  widgetId: string;
  kind: CanvasGestureKind;
  latest: CanvasLayout;
  phase: GesturePhase;
  ended: boolean;
  finishing: boolean;
  claim: Promise<GestureClaim>;
};

function layoutOf(widget: Widget): CanvasLayout {
  return {
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    z: widget.z,
  };
}

function layoutMatches(widget: Widget | undefined, layout: CanvasLayout) {
  return Boolean(
    widget &&
      widget.x === layout.x &&
      widget.y === layout.y &&
      widget.w === layout.w &&
      widget.h === layout.h &&
      widget.z === layout.z,
  );
}

export function useLiveHandlers(
  spaceId: string | undefined,
  identity: LiveIdentity,
  presence: PresenceController,
  widgets: Widget[],
) {
  const move = useMutation(api.widgets.moveWidget);
  const resize = useMutation(api.widgets.resizeWidget);
  const vote = useMutation(api.votes.vote);
  const send = useMutation(api.messages.sendMessage);
  const promote = useMutation(api.messages.promoteMessage);
  const claim = useMutation(api.widgets.claimItem);
  const spinWheel = useMutation(api.widgets.spinWheel);
  const create = useMutation(api.widgets.createWidget);
  const remove = useMutation(api.widgets.deleteWidget);
  const updateData = useMutation(api.widgets.updateWidgetData);
  const scrapeLink = useAction(api.firecrawl.scrapeLink);
  const searchTopic = useAction(api.firecrawl.searchTopic);
  const crawlSite = useAction(api.firecrawl.crawlSite);
  const [overrides, setOverrides] = useState<Record<string, Partial<Widget>>>({});
  const [deleted, setDeleted] = useState<Widget | null>(null);
  const latest = useRef<Record<string, Partial<Widget>>>({});
  const activeGesture = useRef<ActiveGesture | null>(null);
  const pendingCommits = useRef<Record<string, CanvasLayout>>({});
  const widgetsRef = useRef(widgets);
  const nextZ = useRef(1000);
  widgetsRef.current = widgets;
  for (const widget of widgets) nextZ.current = Math.max(nextZ.current, widget.z);
  const {
    claimGesture,
    updateGesture,
    finishGesture,
    cancelGesture,
  } = presence;

  const removeOverride = useCallback((widgetId: string) => {
    delete latest.current[widgetId];
    setOverrides((current) => {
      if (!(widgetId in current)) return current;
      const next = { ...current };
      delete next[widgetId];
      return next;
    });
  }, []);

  useEffect(() => {
    const completed = Object.entries(pendingCommits.current)
      .filter(([widgetId, layout]) =>
        layoutMatches(
          widgets.find((widget) => widget.id === widgetId),
          layout,
        ),
      )
      .map(([widgetId]) => widgetId);
    if (!completed.length) return;
    for (const widgetId of completed) {
      delete pendingCommits.current[widgetId];
      delete latest.current[widgetId];
    }
    setOverrides((current) => {
      const next = { ...current };
      for (const widgetId of completed) delete next[widgetId];
      return next;
    });
  }, [widgets]);

  const finishActiveGesture = useCallback(
    async (sessionId: string) => {
      const active = activeGesture.current;
      if (
        !active ||
        active.sessionId !== sessionId ||
        active.phase !== "accepted" ||
        active.finishing
      ) {
        return;
      }
      active.finishing = true;
      const layout = active.latest;
      const committed = await finishGesture({
        sessionId: active.sessionId,
        widgetId: active.widgetId,
        kind: active.kind,
        ...layout,
      });

      if (committed) {
        if (
          layoutMatches(
            widgetsRef.current.find((widget) => widget.id === active.widgetId),
            layout,
          )
        ) {
          removeOverride(active.widgetId);
        } else {
          pendingCommits.current[active.widgetId] = layout;
        }
      } else {
        removeOverride(active.widgetId);
      }

      if (activeGesture.current?.sessionId === sessionId) {
        activeGesture.current = null;
      }
    },
    [finishGesture, removeOverride],
  );

  const onGestureStart = useCallback(
    (widget: Widget, kind: CanvasGestureKind) => {
      const previous = activeGesture.current;
      if (previous) {
        void cancelGesture(previous.sessionId);
        removeOverride(previous.widgetId);
      }

      const sessionId = crypto.randomUUID();
      const initial = layoutOf(widget);
      if (kind === "move" && widget.type !== "frame") {
        initial.z = ++nextZ.current;
      } else if (widget.type === "frame") {
        initial.z = 0;
      }
      latest.current[widget.id] = initial;
      setOverrides((current) => ({
        ...current,
        [widget.id]: { ...(current[widget.id] ?? {}), ...initial },
      }));

      const claimPromise = claimGesture({
          sessionId,
          widgetId: widget.id,
          kind,
          ...initial,
        })
        .catch(
          (): GestureClaim => ({ accepted: false, reason: "missing" }),
        );
      const active: ActiveGesture = {
        sessionId,
        widgetId: widget.id,
        kind,
        latest: initial,
        phase: "claiming",
        ended: false,
        finishing: false,
        claim: claimPromise,
      };
      activeGesture.current = active;

      void claimPromise.then((result) => {
        const current = activeGesture.current;
        if (!current || current.sessionId !== sessionId) {
          if (result.accepted) void cancelGesture(sessionId);
          return;
        }
        if (!result.accepted) {
          current.phase = "rejected";
          removeOverride(current.widgetId);
          if (current.ended) activeGesture.current = null;
          return;
        }
        current.phase = "accepted";
        updateGesture({
          sessionId: current.sessionId,
          widgetId: current.widgetId,
          kind: current.kind,
          ...current.latest,
        });
        if (current.ended) void finishActiveGesture(sessionId);
      });
    },
    [cancelGesture, claimGesture, finishActiveGesture, removeOverride, updateGesture],
  );

  const onGestureChange = useCallback(
    (widgetId: string, layout: Partial<CanvasLayout>) => {
      const active = activeGesture.current;
      if (!active || active.widgetId !== widgetId || active.phase === "rejected") {
        return;
      }
      active.latest = { ...active.latest, ...layout, z: active.latest.z };
      latest.current[widgetId] = active.latest;
      if (active.phase === "accepted") {
        updateGesture({
          sessionId: active.sessionId,
          widgetId: active.widgetId,
          kind: active.kind,
          ...active.latest,
        });
      }
    },
    [updateGesture],
  );

  const onGestureEnd = useCallback(
    (widgetId: string, layout: CanvasLayout) => {
      const active = activeGesture.current;
      if (!active || active.widgetId !== widgetId) return;
      if (active.phase === "rejected") {
        activeGesture.current = null;
        removeOverride(widgetId);
        return;
      }
      active.latest = {
        ...active.latest,
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h,
      };
      latest.current[widgetId] = active.latest;
      setOverrides((current) => ({
        ...current,
        [widgetId]: { ...(current[widgetId] ?? {}), ...active.latest },
      }));
      active.ended = true;
      if (active.phase === "accepted") {
        void finishActiveGesture(active.sessionId);
      }
    },
    [finishActiveGesture, removeOverride],
  );

  const onLayoutCommit = useCallback(
    (widget: Widget, layout: CanvasLayout) => {
      if (!spaceId) return;
      latest.current[widget.id] = layout;
      setOverrides((current) => ({
        ...current,
        [widget.id]: { ...(current[widget.id] ?? {}), ...layout },
      }));
      void resize({ id: widget.id as never, w: layout.w, h: layout.h });
      void move({
        id: widget.id as never,
        x: layout.x,
        y: layout.y,
        z: layout.z,
      });
      window.setTimeout(() => removeOverride(widget.id), 350);
    },
    [move, removeOverride, resize, spaceId],
  );

  const onFrameLayoutChange = useCallback((
    id: string,
    layout: Partial<Pick<Widget, "x" | "y" | "w" | "h">>,
  ) => {
    latest.current[id] = { ...(latest.current[id] ?? {}), ...layout, z: 0 };
    setOverrides((current) => ({
      ...current,
      [id]: { ...(current[id] ?? {}), ...layout, z: 0 },
    }));
  }, []);

  const onFrameLayoutCommit = useCallback((id: string) => {
    const patch = latest.current[id];
    if (!patch) return;
    if (spaceId && patch.w != null && patch.h != null) {
      void resize({ id: id as never, w: patch.w, h: patch.h });
    }
    if (spaceId && patch.x != null && patch.y != null) {
      void move({ id: id as never, x: patch.x, y: patch.y, z: 0 });
    }
    window.setTimeout(() => removeOverride(id), 350);
  }, [move, removeOverride, resize, spaceId]);

  const onVote = useCallback((widgetId: string, optionId: string) => {
    if (!spaceId) return;
    playSound("tap");
    void vote({ widgetId: widgetId as never, userId: identity.userId, optionId });
  }, [identity.userId, spaceId, vote]);

  const onClaim = useCallback((widgetId: string, itemName: string) => {
    if (!spaceId) return;
    playSound("place");
    void claim({
      widgetId: widgetId as never,
      itemName,
      claimantName: identity.name,
      claimantUserId: identity.userId,
    });
  }, [claim, identity.name, identity.userId, spaceId]);

  const onWheelSpin = useCallback((
    widgetId: string,
    spin: { spinNonce: number; resultIndex: number },
  ) => {
    if (!spaceId) return;
    void spinWheel({
      widgetId: widgetId as never,
      ...spin,
      spunBy: identity.name,
    });
  }, [identity.name, spaceId, spinWheel]);

  const onPlaylistTune = useCallback((
    widgetId: string,
    tune: { stationId: string; playing: boolean },
  ) => {
    if (!spaceId) return;
    const widget = widgetsRef.current.find((row) => row.id === widgetId);
    if (!widget) return;
    void updateData({
      id: widgetId as never,
      data: { ...widget.data, ...tune, playedBy: identity.name },
    });
  }, [identity.name, spaceId, updateData]);

  const onDelete = useCallback((widget: Widget) => {
    if (!spaceId) return;
    playSound("tap");
    setDeleted(widget);
    void remove({ id: widget.id as never });
  }, [remove, spaceId]);

  const onResolveLink = useCallback(
    async (url: string): Promise<LinkCardScrape> => await scrapeLink({ url }),
    [scrapeLink],
  );

  // Firecrawl web search → link-card-shaped hits for the pile.
  const onSearchTopic = useCallback(
    async (query: string) => await searchTopic({ query }),
    [searchTopic],
  );

  // Firecrawl durable crawl → a crawlId the UI subscribes to for live pages.
  const onCrawlSite = useCallback(
    async (url: string): Promise<{ crawlId: string }> => await crawlSite({ url }),
    [crawlSite],
  );

  return {
    overrides,
    deleted,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    onLayoutCommit,
    onFrameLayoutChange,
    onFrameLayoutCommit,
    onVote,
    onSend: (widgetId: string, text: string) => {
      if (spaceId) {
        void send({
          spaceId: spaceId as never,
          widgetId,
          userId: identity.userId,
          text,
          authorName: identity.name,
          authorColor: identity.color,
          authorEmoji: identity.emoji,
          authorAvatarUrl: identity.avatarUrl,
        });
      }
    },
    onPromote: (messageId: string, x: number, y: number) => {
      if (spaceId) {
        playSound("promote");
        void promote({
          messageId: messageId as never,
          userId: identity.userId,
          x,
          y,
        });
      }
    },
    onClaim,
    onWheelSpin,
    onPlaylistTune,
    onResolveLink,
    onSearchTopic,
    onCrawlSite,
    onCreate: async (widget: Omit<Widget, "id">) => {
      if (!spaceId) return undefined;
      playSound("place");
      return await create({
        spaceId: spaceId as never,
        ...widget,
        createdBy: identity.userId,
      });
    },
    onDelete,
    onUndoDelete: () => {
      if (!spaceId || !deleted) return;
      playSound("place");
      void create({
        spaceId: spaceId as never,
        type: deleted.type,
        x: deleted.x,
        y: deleted.y,
        w: deleted.w,
        h: deleted.h,
        z: deleted.z,
        rotate: deleted.rotate,
        data: deleted.data,
        createdBy: identity.userId,
      });
      setDeleted(null);
    },
    onUpdate: (widgetId: string, data: Widget["data"]) => {
      if (!spaceId) return;
      playSound("place");
      void updateData({ id: widgetId as never, data });
    },
    onResize: (widgetId: string, w: number, h: number) => {
      if (!spaceId) return;
      void resize({ id: widgetId as never, w, h });
    },
  };
}
