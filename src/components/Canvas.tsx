import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LiveCursor } from "../cursors";
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
import { MemberFace } from "./MemberFace";
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
  gesture?: LiveGesture;
};

function widgetIsInsideFrame(widget: Widget, frame: Widget) {
  if (widget.id === frame.id) return true;
  if (widget.type === "frame") return false;

  const tolerance = 1;
  return (
    widget.x >= frame.x - tolerance &&
    widget.y >= frame.y - tolerance &&
    widget.x + widget.w <= frame.x + frame.w + tolerance &&
    widget.y + widget.h <= frame.y + frame.h + tolerance
  );
}

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
  viewportRef,
  visitorCount,
  entrance = true,
  widgets: widgetsProp,
  cursors: cursorsProp,
  onClaim,
  claimantId,
  onWheelSpin,
  onPlaylistTune,
  paintStrokesByWidget = {},
  paintIdentity,
  onPaintStroke,
  onPaintClear,
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
  paintStrokesByWidget?: Record<string, CozyColorStroke[]>;
  paintIdentity?: CozyColorIdentity;
  onPaintStroke?: (
    widgetId: string,
    stroke: Omit<CozyColorStroke, "id" | "createdAt">,
  ) => Promise<unknown> | void;
  onPaintClear?: (widgetId: string, regionPrefix?: string) => Promise<unknown> | void;
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
  const gestureSignature = cursors
    .map((cursor) => {
      const gesture = cursor.gesture;
      return gesture
        ? `${cursor.userId ?? cursor.name}:${gesture.sessionId}:${gesture.kind}:${
            gesture.x
          }:${gesture.y}:${gesture.w}:${gesture.h}:${gesture.z}:${gesture.updatedAt}`
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

  const entering = useSpaceEntrance(entrance);
  const enterDelays = useMemo(() => wavefrontDelays(widgets), [widgets]);

  const isLeague = spaceId === "league";
  const isBuildClub = spaceId === "buildclub";
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
        onDelete={onWidgetDelete}
        onEdit={onWidgetEdit}
        onFrameFocus={onFrameFocus}
        onFrameLayoutChange={onFrameLayoutChange}
        onFrameLayoutCommit={onFrameLayoutCommit}
        onPollVote={onPollVote}
        onWheelSpin={onWheelSpin}
        onPlaylistTune={onPlaylistTune}
        paintStrokes={paintStrokesByWidget[widget.id]}
        paintIdentity={paintIdentity}
        onPaintStroke={onPaintStroke}
        onPaintClear={onPaintClear}
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
      paintIdentity,
      paintStrokesByWidget,
      promoted,
      readThreadIds,
      recapCites,
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
      } ${isBuildClub ? "space-canvas-buildclub" : ""}`}
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
      {isBuildClub && (
        <>
          <div className="decor-sticker buildclub-join-sticker" aria-hidden="true">
            you&apos;re
            <br />
            invited
          </div>
          <div className="decor-sticker buildclub-visited-sticker" aria-hidden="true">
            {visitorCount ?? space.visitorCount ?? 312} visited
          </div>
        </>
      )}
      {widgetCards}

      {cursors.map((cursor) => (
        <LiveCursor
          key={`${spaceId}-${cursor.userId ?? cursor.name}`}
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
          x={cursor.x}
          y={cursor.y}
          className={cursor.userId === arrivalPeerId ? "is-new-arrival" : ""}
        />
      ))}

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
  visitorCount,
  entrance = true,
  members: membersProp,
  spaceName,
  hereCount,
  self,
  onSelfClick,
  livePeers = [],
  arrivalPeerId,
}: {
  spaceId: string;
  addOpen?: boolean;
  onAddClick?: () => void;
  spaceMeta?: Pick<SpaceMeta, "name" | "tagline" | "kind">;
  roomEditing?: boolean;
  onEditSpace?: () => void;
  visitorCount?: number;
  entrance?: boolean;
  members?: SpaceMember[];
  spaceName?: string;
  hereCount?: number;
  self?: { name: string; color: string; emoji: string; avatarUrl?: string };
  onSelfClick?: () => void;
  livePeers?: LivePeer[];
  arrivalPeerId?: string;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [invitePosition, setInvitePosition] = useState({ top: 120, right: 28 });
  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  const invitePopoverRef = useRef<HTMLElement>(null);
  const inviteUrlInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimeout = useRef<number | null>(null);
  const entering = useSpaceEntrance(entrance);
  const space = getSpace(spaceId);
  const online = (membersProp ?? space.members).filter((member) => member.online);
  const isBuildClub = spaceId === "buildclub";
  const name = spaceName ?? spaceMeta?.name ?? space.name;
  const tagline = spaceMeta?.tagline ?? space.tagline;
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
      <header className={`space-header ${entering ? "is-entering" : ""}`}>
        <div className="space-title-block">
          <div className="space-meta">
            <span className="space-kind">{kind}</span>
            <span className="space-meta-separator" aria-hidden="true">·</span>
            <span className="space-tagline">{tagline}</span>
          </div>
          <div className="space-title-row">
            <h1><span className="space-title-text">{name}</span></h1>
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
          {isBuildClub && (visitorCount ?? space.visitorCount) != null && (
            <span className="space-visitor-count">
              {visitorCount ?? space.visitorCount} people have been here
            </span>
          )}
          <div className="space-presence" aria-label={presenceDescription}>
            {(self || visibleLivePeers.length > 0 || visibleOnline.length > 0) && (
              <div className="header-faces">
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
              </div>
            )}
            <span className="space-presence-label">
              {displayCount > 0 && <span className="presence-pulse" aria-hidden="true" />}
              {presenceLabel}
            </span>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className={`add-widget-button ${addOpen ? "is-active" : ""}`}
              onClick={onAddClick}
              aria-expanded={addOpen}
            >
              <span className="add-widget-icon" aria-hidden="true">+</span>
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
              <span className="invite-button-icon" aria-hidden="true">↗</span>
              <span className="invite-button-label">invite</span>
            </button>
          </div>
        </div>
      </header>

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
