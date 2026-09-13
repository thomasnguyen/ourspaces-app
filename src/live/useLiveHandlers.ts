import { useAction, useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
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

/**
 * Optimistically move one widget's box inside the `getSpaceWithWidgets`
 * envelope, keeping the `{ space, widgets }` shape intact.
 *
 * The query is keyed by slug and this hook only knows the space id, so we walk
 * `getAllQueries` and match on each envelope's own space rather than guessing
 * the args — an args mismatch would make the whole update a silent no-op.
 */
function patchWidgetBox(
  store: OptimisticLocalStore,
  spaceId: Id<"spaces">,
  widgetId: Id<"widgets">,
  box: Partial<Pick<Doc<"widgets">, "x" | "y" | "w" | "h" | "z">>,
) {
  for (const { args, value } of store.getAllQueries(api.spaces.getSpaceWithWidgets)) {
    if (!value || value.space === null || value.space._id !== spaceId) continue;
    store.setQuery(api.spaces.getSpaceWithWidgets, args, {
      ...value,
      widgets: value.widgets.map((widget) =>
        widget._id === widgetId ? { ...widget, ...box } : widget,
      ),
    });
  }
}

export function useLiveHandlers(
  spaceId: string | undefined,
  identity: LiveIdentity,
  presence: PresenceController,
  widgets: Widget[],
) {
  const moveWidget = useMutation(api.widgets.moveWidget);
  const resizeWidget = useMutation(api.widgets.resizeWidget);
  /* Why these two get `withOptimisticUpdate` and the gesture path does not:
     `moveWidget` / `resizeWidget` are unconditional server patches — the only
     guard is a cross-space id check this call site cannot trip — so the client
     already knows the answer and Convex can roll it back for free if the write
     ever fails. The gesture path is *arbitrated*: `presence.claimGesture` /
     `finishGesture` can refuse a commit (stale lock, competing peer, TTL) and
     return a verdict the client branches on. An optimistic update can neither
     read a mutation's return value nor roll back conditionally, so gestures
     keep the hand-rolled `overrides` / `latest` / `pendingCommits` below. */
  const move = useMemo(
    () => moveWidget.withOptimisticUpdate((store, { spaceId, id, x, y, z }) =>
      patchWidgetBox(store, spaceId, id, z === undefined ? { x, y } : { x, y, z }),
    ),
    [moveWidget],
  );
  const resize = useMemo(
    () => resizeWidget.withOptimisticUpdate((store, { spaceId, id, w, h }) =>
      patchWidgetBox(store, spaceId, id, { w, h }),
    ),
    [resizeWidget],
  );
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

  /**
   * Hand a widget over to `withOptimisticUpdate`: drop every hand-rolled local
   * claim on it so the optimistic value is what shows. Replaces the blind
   * 350ms timer the layout commits used to lean on.
   */
  const dropLocalClaim = useCallback((widgetId: string) => {
    delete pendingCommits.current[widgetId];
    removeOverride(widgetId);
  }, [removeOverride]);

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
      dropLocalClaim(widget.id);
      void resize({ spaceId: spaceId as never, id: widget.id as never, w: layout.w, h: layout.h });
      void move({ spaceId: spaceId as never,
        id: widget.id as never,
        x: layout.x,
        y: layout.y,
        z: layout.z,
      });
    },
    [dropLocalClaim, move, resize, spaceId],
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
      void resize({ spaceId: spaceId as never, id: id as never, w: patch.w, h: patch.h });
    }
    if (spaceId && patch.x != null && patch.y != null) {
      void move({ spaceId: spaceId as never, id: id as never, x: patch.x, y: patch.y, z: 0 });
    }
    // The drag-time override `onFrameLayoutChange` left behind has done its
    // job; the optimistic update holds the box from here.
    dropLocalClaim(id);
  }, [dropLocalClaim, move, resize, spaceId]);

  const onVote = useCallback((widgetId: string, optionId: string) => {
    if (!spaceId) return;
    playSound("tap");
    void vote({
      widgetId: widgetId as never,
      spaceId: spaceId as never,
      userId: identity.userId,
      optionId,
    });
  }, [identity.userId, spaceId, vote]);

  const onClaim = useCallback((widgetId: string, itemName: string) => {
    if (!spaceId) return;
    playSound("place");
    void claim({ spaceId: spaceId as never,
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
    void spinWheel({ spaceId: spaceId as never,
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
    void updateData({ spaceId: spaceId as never,
      id: widgetId as never,
      data: { ...widget.data, ...tune, playedBy: identity.name },
    });
  }, [identity.name, spaceId, updateData]);

  /* A letter opened on one phone opens on every screen: `sealed` is the
     widget's own data, not tab state (docs/mail.md goal 3). */
  const onLetterOpen = useCallback((widgetId: string, open: boolean) => {
    if (!spaceId) return;
    const widget = widgetsRef.current.find((row) => row.id === widgetId);
    if (!widget) return;
    void updateData({ spaceId: spaceId as never,
      id: widgetId as never,
      data: { ...widget.data, sealed: !open },
    });
  }, [spaceId, updateData]);

  const onDelete = useCallback((widget: Widget) => {
    if (!spaceId) return;
    playSound("tap");
    setDeleted(widget);
    void remove({ spaceId: spaceId as never, id: widget.id as never });
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
        void promote({ spaceId: spaceId as never,
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
    onLetterOpen,
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
      void updateData({ spaceId: spaceId as never, id: widgetId as never, data });
    },
    onResize: (widgetId: string, w: number, h: number) => {
      if (!spaceId) return;
      void resize({ spaceId: spaceId as never, id: widgetId as never, w, h });
    },
  };
}
