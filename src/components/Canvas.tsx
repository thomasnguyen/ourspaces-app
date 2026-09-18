import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PeerCursor } from "./PeerCursor";
import {
  CURSOR_MOTION,
  WIDGET_MOTION,
  usePeerMotion,
} from "../live/peerMotion";
import { DECISION_WIDGET, getSpace, SPACE_CURSORS } from "../data/spaces";
import type { BackendCount } from "../lib/backendCounts";
import type { SpaceMember, SpaceMeta, Widget } from "../data/types";
import { useSpaceEntrance, wavefrontDelays } from "../lib/entrance";
import type {
  CanvasGestureKind,
  CanvasLayout,
  LiveGesture,
  LivePeer,
} from "../live/presenceTypes";
import { FirstRunSticky, type CanvasPoint } from "./FirstRunSticky";
import { PlacementGhost, type PlacingItem } from "./PlacementGhost";
import { MemberFace } from "./MemberFace";
import type { BuildRoomFeed, RoundtableReply } from "../widgets/buildroom";
import { widgetIsInsideFrame } from "../lib/frameMembership";
import { WidgetCard } from "./WidgetCard";
import type { RsvpStatus, PlaylistTune } from "../widgets/extras";
import type {
  CozyColorIdentity,
  CozyColorStroke,
} from "../widgets/CozyColorWidget";
import { playSound } from "../lib/sounds";
import { inviteUrlForSpace } from "../lib/routes";

type WidgetPlacement = Partial<Pick<Widget, "x" | "y" | "z" | "w" | "h">>;
type CanvasCursor = {
  userId?: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  x: number;
  y: number;
  zone?: string;
  /** server clock on the sample — peerMotion reads velocity off it */
  updatedAt?: number;
  gesture?: LiveGesture;
};

export function Canvas({
  spaceId,
  selectedWidgetId,
  onWidgetSelect,
  managedWidgetId,
  onWidgetManage,
  onWidgetMove,
  onWidgetDragStart,
  onWidgetDragEnd,
  onGestureStart,
  onGestureChange,
  onGestureEnd,
  onLayoutCommit,
  onWidgetDelete,
  onWidgetEdit,
  editingWidgetId = "",
  focusedTargetId = "",
  focusedTargetKind,
  canvasScale = 1,
  onFrameFocus,
  onFrameLayoutChange,
  onFrameLayoutCommit,
  onPollVote,
  onRsvp,
  onDailyAnswer,
  onDailyReact,
  promoted,
  onPromote,
  addedWidgets = [],
  widgetPlacements = {},
  widgetDataOverrides = {},
  localCommentCounts = {},
  pollSelections = {},
  rsvpSelections = {},
  readThreadIds = [],
  dailyAnswers = {},
  dailyReactions = {},
  recapCites = [],
  deletedWidgetIds = [],
  backendLiveCounts,
  firstRunActive = false,
  onFirstRunPlace,
  placingItem,
  placingOrigin,
  onPlaceItem,
  onPlaceCancel,
  viewportRef,
  entrance = true,
  widgets: widgetsProp,
  cursors: cursorsProp,
  onClaim,
  claimantId,
  onWheelSpin,
  onPlaylistTune,
  onLetterOpen,
  buildRoomFeed,
  roundtableRepliesByWidget = {},
  paintStrokesByWidget = {},
  paintIdentity,
  onPaintStroke,
  onPaintClear,
  onPaintCursor,
  arrivalPeerId,
}: {
  spaceId: string;
  selectedWidgetId: string;
  onWidgetSelect: (widget: Widget) => void;
  managedWidgetId: string;
  onWidgetManage: (widgetId: string) => void;
  onWidgetMove?: (widgetId: string, x: number, y: number) => void;
  onWidgetDragStart?: (widgetId: string) => void;
  onWidgetDragEnd?: (widgetId: string) => void;
  onGestureStart?: (widget: Widget, kind: CanvasGestureKind) => void;
  onGestureChange?: (widgetId: string, layout: Partial<CanvasLayout>) => void;
  onGestureEnd?: (widgetId: string, layout: CanvasLayout) => void;
  onLayoutCommit?: (widget: Widget, layout: CanvasLayout) => void;
  onWidgetDelete: (widgetId: string, label: string) => void;
  onWidgetEdit: (widgetId: string) => void;
  editingWidgetId?: string;
  focusedTargetId?: string;
  focusedTargetKind?: "frame" | "widget";
  canvasScale?: number;
  onFrameFocus?: (frame: Widget) => void;
  onFrameLayoutChange?: (
    widgetId: string,
    layout: Partial<Pick<Widget, "x" | "y" | "w" | "h">>,
  ) => void;
  onFrameLayoutCommit?: (widgetId: string) => void;
  onPollVote?: (widgetId: string, optionId: string) => void;
  onRsvp?: (widgetId: string, status: RsvpStatus) => void;
  onDailyAnswer?: (widgetId: string, text: string) => void;
  onDailyReact?: (widgetId: string, answerName: string, emoji: string) => void;
  promoted: boolean;
  onPromote: () => void;
  addedWidgets?: Widget[];
  widgetPlacements?: Record<string, WidgetPlacement>;
  widgetDataOverrides?: Record<string, Widget["data"]>;
  localCommentCounts?: Record<string, number>;
  pollSelections?: Record<string, string>;
  rsvpSelections?: Record<string, RsvpStatus>;
  readThreadIds?: string[];
  dailyAnswers?: Record<string, string>;
  dailyReactions?: Record<string, Record<string, string>>;
  /** Widget ids "catch me up" reported changes on. */
  recapCites?: string[];
  deletedWidgetIds?: string[];
  backendLiveCounts?: BackendCount[];
  firstRunActive?: boolean;
  onFirstRunPlace?: (point: CanvasPoint) => void;
  /** Something picked off the tray, riding the cursor until it's clicked down. */
  placingItem?: PlacingItem | null;
  placingOrigin?: { x: number; y: number };
  onPlaceItem?: (point: CanvasPoint, keepPlacing: boolean) => void;
  onPlaceCancel?: () => void;
  viewportRef?: RefObject<HTMLDivElement | null>;
  visitorCount?: number;
  entrance?: boolean;
  widgets?: Widget[];
  cursors?: CanvasCursor[];
  members?: SpaceMember[];
  spaceName?: string;
  hereCount?: number;
  onClaim?: (widgetId: string, itemName: string) => void;
  claimantId?: string;
  onWheelSpin?: (widgetId: string, spin: { spinNonce: number; resultIndex: number }) => void;
  onPlaylistTune?: (widgetId: string, tune: PlaylistTune) => void;
  onLetterOpen?: (widgetId: string, open: boolean) => void;
  buildRoomFeed?: BuildRoomFeed;
  roundtableRepliesByWidget?: Record<string, RoundtableReply[]>;
  paintStrokesByWidget?: Record<string, CozyColorStroke[]>;
  paintIdentity?: CozyColorIdentity;
  onPaintStroke?: (
    widgetId: string,
    stroke: Omit<CozyColorStroke, "id" | "createdAt">,
  ) => Promise<unknown> | void;
  onPaintClear?: (widgetId: string, regionPrefix?: string) => Promise<unknown> | void;
  onPaintCursor?: (x: number, y: number, zone?: string) => void;
  arrivalPeerId?: string;
}) {
  const space = getSpace(spaceId);
  const widgets = useMemo(
    () => widgetsProp ?? [
      ...space.widgets,
      ...addedWidgets,
      ...(promoted && spaceId === "crew" ? [DECISION_WIDGET] : []),
    ]
      .filter((widget) => !deletedWidgetIds.includes(widget.id))
      .map((widget) => ({
        ...widget,
        ...widgetPlacements[widget.id],
        data:
          widget.type === "backendLive" && backendLiveCounts
            ? { counts: backendLiveCounts }
            : (widgetDataOverrides[widget.id] ?? widget.data),
      })),
    [
      addedWidgets,
      backendLiveCounts,
      deletedWidgetIds,
      promoted,
      space.widgets,
      spaceId,
      widgetDataOverrides,
      widgetPlacements,
      widgetsProp,
    ],
  );
  const cursors: CanvasCursor[] =
    cursorsProp ?? SPACE_CURSORS[spaceId] ?? [];
  const motion = usePeerMotion();
  /* No x/y/updatedAt in here on purpose. Those move 20x a second, and if they
     were part of what React compares, every widget on the board would
     re-render on every frame of somebody else's drag. The moving parts go to
     the motion engine below instead; React only hears a gesture start, change
     shape, or stop. */
  const gestureSignature = cursors
    .map((cursor) => {
      const gesture = cursor.gesture;
      return gesture
        ? `${cursor.userId ?? cursor.name}:${gesture.sessionId}:${gesture.kind}:${
            gesture.w
          }:${gesture.h}:${gesture.z}`
        : "";
    })
    .join("|");
  const remoteGestures = useMemo(() => {
    const next = new Map<
      string,
      { gesture: LiveGesture; userId: string }
    >();
    for (const cursor of cursors) {
      const gesture = cursor.gesture;
      if (!gesture) continue;
      const current = next.get(gesture.widgetId);
      if (
        !current ||
        gesture.updatedAt > current.gesture.updatedAt ||
        (gesture.updatedAt === current.gesture.updatedAt &&
          (cursor.userId ?? cursor.name).localeCompare(current.userId) < 0)
      ) {
        next.set(gesture.widgetId, {
          gesture,
          userId: cursor.userId ?? cursor.name,
        });
      }
    }
    return next;
  }, [gestureSignature]);

  /* Sampling in render rather than an effect is on purpose: an effect lands a
     frame later, and that frame is the one where the cursor would still be
     painted at the previous position. `sample` only touches refs, so it is
     safe to call here. */
  for (const cursor of cursors) {
    const key = cursor.userId ?? cursor.name;
    if (!cursor.zone) {
      motion.sample(
        `cursor:${spaceId}:${key}`,
        cursor.x,
        cursor.y,
        CURSOR_MOTION,
        cursor.updatedAt,
      );
    }
    const gesture = cursor.gesture;
    if (!gesture) continue;
    const held = widgets.find((widget) => widget.id === gesture.widgetId);
    if (!held) continue;
    motion.sample(
      `widget:${gesture.widgetId}`,
      gesture.x,
      gesture.y,
      WIDGET_MOTION,
      gesture.updatedAt,
      { x: held.x, y: held.y },
    );
  }

  /* The coloring room is rendered inside the widgetCards memo, which
     deliberately does not re-run on cursor movement. It reads this ref on its
     own rAF instead — before, it got whatever `cursors` happened to be when
     the memo last ran, which is to say a frozen one. */
  const cursorsRef = useRef<CanvasCursor[]>(cursors);
  cursorsRef.current = cursors;

  const entering = useSpaceEntrance(entrance);
  const enterDelays = useMemo(() => wavefrontDelays(widgets), [widgets]);

  const isLeague = spaceId === "league";
  const focusedFrame =
    widgets.find(
      (widget) =>
        focusedTargetKind === "frame" &&
        widget.id === focusedTargetId &&
        widget.type === "frame",
    ) ?? null;
  const focusedWidgetId =
    focusedTargetKind === "widget" ? focusedTargetId : "";
  const widgetCards = useMemo(
    () => widgets.map((widget) => (
      <WidgetCard
        key={widget.id}
        widget={widget}
        spaceId={spaceId}
        enterDelay={enterDelays[widget.id] ?? 0}
        selected={selectedWidgetId === widget.id}
        managed={managedWidgetId === widget.id}
        frameFocused={focusedFrame?.id === widget.id}
        frameEditing={
          widget.type === "frame" && editingWidgetId === widget.id
        }
        widgetFocused={focusedWidgetId === widget.id}
        focusSoftened={
          focusedFrame
            ? !widgetIsInsideFrame(widget, focusedFrame)
            : Boolean(focusedWidgetId && widget.id !== focusedWidgetId)
        }
        canvasScale={canvasScale}
        commentCount={
          localCommentCounts[widget.id] == null
            ? undefined
            : localCommentCounts[widget.id]
        }
        onClaim={onClaim}
        claimantId={claimantId}
        pollSelection={pollSelections[widget.id]}
        rsvpSelection={rsvpSelections[widget.id]}
        threadRead={readThreadIds.includes(widget.id)}
        dailyAnswer={dailyAnswers[widget.id]}
        dailyReactions={dailyReactions[widget.id]}
        recapCited={recapCites.includes(widget.id)}
        onSelect={onWidgetSelect}
        onManage={onWidgetManage}
        onMove={onWidgetMove}
        onDragStart={onWidgetDragStart}
        onDragEnd={onWidgetDragEnd}
        onGestureStart={onGestureStart}
        onGestureChange={onGestureChange}
        onGestureEnd={onGestureEnd}
        onLayoutCommit={onLayoutCommit}
        remoteGesture={remoteGestures.get(widget.id)?.gesture}
        remoteLocked={remoteGestures.has(widget.id)}
        motion={motion}
        onDelete={onWidgetDelete}
        onEdit={onWidgetEdit}
        onFrameFocus={onFrameFocus}
        onFrameLayoutChange={onFrameLayoutChange}
        onFrameLayoutCommit={onFrameLayoutCommit}
        onPollVote={onPollVote}
        onWheelSpin={onWheelSpin}
        onPlaylistTune={onPlaylistTune}
        onLetterOpen={onLetterOpen}
        buildRoomFeed={buildRoomFeed}
        roundtableReplies={roundtableRepliesByWidget[widget.id]}
        paintStrokes={paintStrokesByWidget[widget.id]}
        paintIdentity={paintIdentity}
        onPaintStroke={onPaintStroke}
        onPaintClear={onPaintClear}
        paintPeersRef={cursorsRef}
        onPaintCursor={onPaintCursor}
        onRsvp={onRsvp}
        onDailyAnswer={onDailyAnswer}
        onDailyReact={onDailyReact}
        onPromote={onPromote}
        promoted={promoted}
      />
    )),
    [
      canvasScale,
      claimantId,
      dailyAnswers,
      dailyReactions,
      editingWidgetId,
      enterDelays,
      focusedFrame,
      focusedWidgetId,
      localCommentCounts,
      managedWidgetId,
      onClaim,
      onDailyAnswer,
      onDailyReact,
      onFrameFocus,
      onFrameLayoutChange,
      onFrameLayoutCommit,
      onGestureChange,
      onGestureEnd,
      onGestureStart,
      onLayoutCommit,
      onPollVote,
      onPromote,
      onRsvp,
      onWheelSpin,
      onPlaylistTune,
      onLetterOpen,
      onPaintClear,
      onPaintStroke,
      onWidgetDelete,
      onWidgetDragEnd,
      onWidgetDragStart,
      onWidgetEdit,
      onWidgetManage,
      onWidgetMove,
      onWidgetSelect,
      pollSelections,
      buildRoomFeed,
      roundtableRepliesByWidget,
      paintIdentity,
      paintStrokesByWidget,
      promoted,
      readThreadIds,
      recapCites,
      cursorsRef,
      motion,
      remoteGestures,
      rsvpSelections,
      selectedWidgetId,
      spaceId,
      widgets,
    ],
  );

  return (
    <div
      className={`space-canvas ${entering ? "is-entering" : ""} ${
        focusedFrame ? "has-frame-focus" : ""
      } ${focusedWidgetId ? "has-widget-focus" : ""} ${
        isLeague ? "space-canvas-league" : ""
      } ${placingItem ? "is-placing" : ""}`}
      style={{
        minWidth: space.canvasSize?.width,
        minHeight: space.canvasSize?.height,
      }}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest(".widget-group")) {
          onWidgetManage("");
        }
      }}
    >
      {widgetCards}

      {cursors.filter((cursor) => !cursor.zone).map((cursor) => (
        <PeerCursor
          key={`${spaceId}-${cursor.userId ?? cursor.name}`}
          motion={motion}
          motionKey={`cursor:${spaceId}:${cursor.userId ?? cursor.name}`}
          name={cursor.name}
          color={cursor.color}
          emoji={cursor.emoji}
          avatarUrl={cursor.avatarUrl}
          label={
            cursor.gesture
              ? `${cursor.name} is ${
                  cursor.gesture.kind === "resize" ? "resizing" : "moving"
                } this`
              : cursor.name
          }
          active={Boolean(cursor.gesture)}
          className={cursor.userId === arrivalPeerId ? "is-new-arrival" : ""}
        />
      ))}

      {placingItem && viewportRef && onPlaceItem && onPlaceCancel && (
        <PlacementGhost
          item={placingItem}
          origin={placingOrigin}
          viewportRef={viewportRef}
          canvasScale={canvasScale}
          onPlace={onPlaceItem}
          onCancel={onPlaceCancel}
        />
      )}

      {firstRunActive && viewportRef && onFirstRunPlace && (
        <FirstRunSticky
          active={firstRunActive}
          viewportRef={viewportRef}
          onPlace={onFirstRunPlace}
          canvasScale={canvasScale}
        />
      )}
    </div>
  );
}

export function SpaceHeader({
  spaceId,
  addOpen = false,
  onAddClick,
  spaceMeta,
  roomEditing = false,
  onEditSpace,
  entrance = true,
  members: membersProp,
  spaceName,
  hereCount,
  self,
  onSelfClick,
  livePeers = [],
  arrivalPeerId,
  inboxAddress,
}: {
  spaceId: string;
  addOpen?: boolean;
  onAddClick?: () => void;
  spaceMeta?: Pick<SpaceMeta, "name" | "tagline" | "kind">;
  inboxAddress?: string;
  roomEditing?: boolean;
  onEditSpace?: () => void;
  visitorCount?: number;
  entrance?: boolean;
  members?: SpaceMember[];
  spaceName?: string;
  hereCount?: number;
  self?: { name: string; color: string; emoji: string; avatarUrl?: string };
  /** Gets the click point so the identity popover can show your cursor right there. */
  onSelfClick?: (event: { clientX: number; clientY: number }) => void;
  livePeers?: LivePeer[];
  arrivalPeerId?: string;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [mailCopied, setMailCopied] = useState(false);
  const [invitePosition, setInvitePosition] = useState({ top: 120, right: 28 });
  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  const invitePopoverRef = useRef<HTMLElement>(null);
  const inviteUrlInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimeout = useRef<number | null>(null);
  const entering = useSpaceEntrance(entrance);
  const space = getSpace(spaceId);
  /* A seeded roster's `online` flag is a mock-mode truth and nothing more.
     The live page passes a real hereCount (room occupancy from the presence
     component), and once it does, the fixtures stop being people: they must
     not be counted, named, or drawn as faces next to a live number. */
  const online = hereCount == null
    ? (membersProp ?? space.members).filter((member) => member.online)
    : [];
  const name = spaceName ?? spaceMeta?.name ?? space.name;
  const tagline = spaceMeta?.tagline ?? space.tagline;
  const mailAddress = inboxAddress ?? space.inboxAddress;
  const kind = spaceMeta?.kind ?? space.kind;
  const visibleLivePeers = livePeers.slice(0, 3);
  const visibleOnline = online.slice(0, Math.max(0, 4 - visibleLivePeers.length));
  const hiddenOnlineCount = Math.max(
    0,
    livePeers.length + online.length - visibleLivePeers.length - visibleOnline.length,
  );
  const displayCount = hereCount ?? online.length;
  const presenceLabel =
    displayCount === 0
      ? "quiet right now"
      : displayCount === 1
        ? "1 here now"
        : `${displayCount} here now`;
  const presenceDescription =
    livePeers.length + online.length === 0
      ? presenceLabel
      : `${presenceLabel}: ${[
          ...livePeers.map((peer) => peer.name),
          ...online.map((member) => member.name),
        ].join(", ")}`;
  const inviteUrl = inviteUrlForSpace(spaceId);
  const inviteFaces = [
    ...(self ? [{ key: "self", name: self.name, emoji: self.emoji, color: self.color, avatarUrl: self.avatarUrl }] : []),
    ...livePeers.map((peer) => ({
      key: peer.userId,
      name: peer.name,
      emoji: peer.emoji,
      color: peer.color,
      avatarUrl: peer.avatarUrl,
    })),
    ...online.map((member) => ({
      key: `seed-${member.name}`,
      name: member.name,
      emoji: undefined,
      color: undefined,
      avatarUrl: undefined,
    })),
  ];

  useEffect(() => {
    return () => {
      if (copyResetTimeout.current !== null) {
        window.clearTimeout(copyResetTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!inviteOpen) return;

    const updatePosition = () => {
      const button = inviteButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setInvitePosition({
        top: rect.bottom + 12,
        right: Math.max(16, window.innerWidth - rect.right),
      });
    };
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (invitePopoverRef.current?.contains(target) || inviteButtonRef.current?.contains(target)) {
        return;
      }
      setInviteOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setInviteOpen(false);
      inviteButtonRef.current?.focus();
    };

    updatePosition();
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [inviteOpen]);

  const toggleInvite = () => {
    setInviteOpen((open) => {
      if (open) return false;
      setCopyState("idle");
      return true;
    });
  };

  const copyInvite = async () => {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (!copied && inviteUrlInputRef.current) {
      const input = inviteUrlInputRef.current;
      const previousFocus = document.activeElement;
      input.focus();
      input.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      input.setSelectionRange(input.value.length, input.value.length);
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus({ preventScroll: true });
      }
    }

    setCopyState(copied ? "copied" : "failed");
    if (copyResetTimeout.current !== null) {
      window.clearTimeout(copyResetTimeout.current);
    }
    copyResetTimeout.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimeout.current = null;
    }, copied ? 1600 : 2200);
    if (copied) playSound("tap");
  };

  const shareInvite = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: `join ${name}`,
        text: `come hang in ${name}`,
        url: inviteUrl,
      });
    } catch {
      // Native share cancellation is intentionally quiet.
    }
  };

  return (
    <>
      {/* A <div>, not a <header>: this bar is the room's live state — who is
          here now, what the room is called — not site chrome. Text extractors
          (link previews, search snippets, crawlers) drop <header> as
          boilerplate, which silently hid "N here now" from every reader that
          isn't a browser. Styling is class-based, so the tag is free to change. */}
      <div className={`space-header ${entering ? "is-entering" : ""}`}>
        <div className="space-title-block">
          <div className="space-meta">
            <span className="space-kind">{kind}</span>
            <span className="space-meta-separator" aria-hidden="true">·</span>
            <span className="space-tagline">{tagline}</span>
          </div>
          <div className="space-title-row">
            <h1><span className="space-title-text">{name}</span></h1>
          </div>
          {/* One plain line under the name: what this is and that it moves for
              everyone at once. A first-time visitor lands inside someone else's
              room with no orientation otherwise, and a text-only reader (link
              preview, crawler, images off) gets nothing but widget names. */}
          <p className="space-what">
            this is the live shared board — vote, claim, post, upload or move anything, and every open tab updates with you.
          </p>
          {/* The name's handles: the inbox address first (mail in → widgets
              out is a demo beat), then the pencil. Two quiet chips in the
              room's ink, one family. */}
          <div className="space-title-handles">
            {mailAddress && (
              <button
                type="button"
                className={`space-mail-chip ${mailCopied ? "is-copied" : ""}`}
                title="email this space — mail becomes widgets"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(mailAddress)
                    .then(() => {
                      setMailCopied(true);
                      window.setTimeout(() => setMailCopied(false), 1600);
                    })
                    .catch(() => {});
                }}
              >
                <span className="space-mail-mark" aria-hidden="true">✉</span>
                <span className="space-mail-address">
                  {mailCopied ? "copied!" : mailAddress}
                </span>
              </button>
            )}
            <button
              type="button"
              className={`space-edit-button ${roomEditing ? "is-active" : ""}`}
              onClick={onEditSpace}
              aria-expanded={roomEditing}
              aria-label={`Edit ${name}`}
            >
              <span className="space-edit-mark" aria-hidden="true">✎</span>
              <span className="space-edit-label">edit</span>
            </button>
          </div>
        </div>

        <div className="space-header-side">
          <div className="space-presence" aria-label={presenceDescription}>
            {(self || visibleLivePeers.length > 0 || visibleOnline.length > 0) && (
              <div className={`header-faces ${displayCount > 0 ? "is-live" : ""}`}>
                {self && (
                  <button
                    type="button"
                    className="self-chip"
                    onClick={onSelfClick}
                    aria-label="Edit your identity"
                  >
                    <MemberFace name={self.name} emoji={self.emoji} color={self.color} avatarUrl={self.avatarUrl} size="md" />
                  </button>
                )}
                {visibleLivePeers.length > 0 && (
                  <div className="header-live-faces" aria-hidden="true">
                    {visibleLivePeers.map((peer) => (
                      <MemberFace
                        key={peer.userId}
                        name={peer.name}
                        emoji={peer.emoji}
                        color={peer.color}
                        avatarUrl={peer.avatarUrl}
                        size="md"
                        className={arrivalPeerId === peer.userId ? "is-new-arrival" : ""}
                      />
                    ))}
                  </div>
                )}
                {visibleOnline.length > 0 && (
                  <div className="header-seed-faces" aria-hidden="true">
                    {visibleOnline.map((member) => (
                      <MemberFace key={member.name} name={member.name} size="md" />
                    ))}
                    {hiddenOnlineCount > 0 && (
                      <span className="header-face-overflow">+{hiddenOnlineCount}</span>
                    )}
                  </div>
                )}
                {/* The live badge sits on the stack: these faces are the
                    ones here. The label's own dot only shows when the faces
                    are hidden (phones). */}
                {displayCount > 0 && <i className="header-live-dot" aria-hidden="true" />}
              </div>
            )}
            <span className="space-presence-label">
              {displayCount > 0 && <span className="presence-pulse" aria-hidden="true" />}
              {displayCount > 0 ? (
                <>
                  {/* keyed so a change of count rolls the number in */}
                  <b key={displayCount} className="presence-count">{displayCount}</b>
                  <span className="presence-words">here now</span>
                </>
              ) : (
                <span className="presence-words">{presenceLabel}</span>
              )}
            </span>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className={`add-widget-button ${addOpen ? "is-active" : ""}`}
              onClick={onAddClick}
              aria-expanded={addOpen}
            >
              <svg className="add-widget-icon header-key-glyph" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 1.75v8.5M1.75 6h8.5" />
              </svg>
              add
            </button>
            <button
              ref={inviteButtonRef}
              type="button"
              className={`invite-button ${inviteOpen ? "is-active" : ""}`}
              onClick={toggleInvite}
              aria-expanded={inviteOpen}
              aria-controls="invite-popover"
              aria-label="Open invite options"
            >
              <svg className="invite-button-icon header-key-glyph" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.75 9.25l6.5-6.5M4.25 2.75h5v5" />
              </svg>
              <span className="invite-button-label">invite</span>
            </button>
          </div>
        </div>
      </div>

      {inviteOpen && (
        <div className="invite-popover-layer">
          <button
            type="button"
            className="invite-popover-backdrop"
            onClick={() => setInviteOpen(false)}
            aria-label="Close invite options"
          />
          <section
            id="invite-popover"
            ref={invitePopoverRef}
            className="invite-popover"
            style={{ top: invitePosition.top, right: invitePosition.right }}
            aria-label={`Invite people into ${name}`}
          >
            <div className="invite-popover-heading">
              <div>
                <span className="invite-popover-kicker">bring people in</span>
                <h2>bring people into {name}</h2>
                <p>anyone with this link can walk in</p>
              </div>
              <button
                type="button"
                className="invite-popover-close"
                onClick={() => setInviteOpen(false)}
                aria-label="Close invite options"
              >×</button>
            </div>

            <label className="invite-url-label">
              invite link
              <input
                ref={inviteUrlInputRef}
                className="invite-url-input"
                value={inviteUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Invite URL"
              />
            </label>

            <div className="invite-popover-actions">
              <button type="button" className="invite-copy-button" onClick={() => void copyInvite()}>
                {copyState === "copied"
                  ? "copied ✓"
                  : copyState === "failed"
                    ? "couldn’t copy — select link"
                    : "copy link"}
              </button>
              {typeof navigator.share === "function" && (
                <button type="button" className="invite-share-button" onClick={() => void shareInvite()}>
                  share…
                </button>
              )}
            </div>

            <div className="invite-popover-presence">
              <div className="invite-face-stack" aria-label={presenceDescription}>
                {inviteFaces.slice(0, 6).map((face) => (
                  <MemberFace
                    key={face.key}
                    name={face.name}
                    emoji={face.emoji}
                    color={face.color}
                    avatarUrl={face.avatarUrl}
                    size="sm"
                    className={face.key === arrivalPeerId ? "is-new-arrival" : ""}
                  />
                ))}
                {inviteFaces.length > 6 && (
                  <span className="invite-face-overflow">+{inviteFaces.length - 6}</span>
                )}
              </div>
              <strong>{displayCount} here right now</strong>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
