import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery, usePaginatedQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ActionDock } from "../components/ActionDock";
import { Canvas, SpaceHeader } from "../components/Canvas";
import { ClaimCard, type InviteContext } from "../components/ClaimCard";
import { MemberFace } from "../components/MemberFace";
import { PhotoWallGallery } from "../components/PhotoWallGallery";
import { ReadingRoom, type RoomReply } from "../components/ReadingRoom";
import { ShipRoom } from "../components/ShipRoom";
import type { RoomOrigin } from "../components/CanvasRoom";
import { GhostCanvas } from "../components/GhostCanvas";
import { GlobalChatPanel } from "../components/GlobalChatPanel";
import { Rail } from "../components/Rail";
import { SpaceEditorPanel } from "../components/SpaceEditorPanel";
import { WidgetEditorPanel } from "../components/WidgetEditorPanel";
import { WidgetPicker } from "../components/WidgetPicker";
import {
  WidgetThreadDock,
  type ThreadDockPlacement,
  type ThreadDockSize,
} from "../components/WidgetThreadDock";
import { getSpace, SPACES_BY_ID } from "../data/spaces";
import { getStickerDefinition } from "../data/stickers";
import type { Widget, WidgetType } from "../data/types";
import { LinkQuestionStrip } from "../components/LinkQuestionStrip";
import { linkCardQuestions, questionThreadId } from "../lib/linkQuestions";
import { getSoundEnabled, playSound, setSoundEnabled } from "../lib/sounds";
import {
  defaultSpaceCustomization,
  spaceCustomizationStyle,
  type SpaceCustomization,
} from "../data/spaceThemes";
import { cleanRecapText, RECAP_THREAD_ID, type RecapLine, type RecapTurn } from "../data/recap";
import { flyWidgetIn } from "../lib/flipLanding";
import { pileInsideFrame } from "../lib/frameMembership";
import { relTime, toChatMessage } from "../live/adapt";
import type { RoundtableReply } from "../widgets/buildroom";
import {
  buildRoomFeedFrom,
  linkReplyCounts,
  pileLinks,
  readPileData,
  toggledVoters,
  type PileData,
} from "../lib/buildRoomFeed";
import type { BuildRoomLink } from "../data/buildroom";
import { cannedLinkQuestions } from "../lib/linkQuestions";
import type { PhotoComment } from "../components/PhotoWallGallery";
import { useIdentity } from "../live/identity";
import { useLiveHandlers } from "../live/useLiveHandlers";
import { useLivePoll } from "../live/useLivePoll";
import { useLiveSpace } from "../live/useLiveSpace";
import { usePresence } from "../live/usePresence";
import { useShowAfter } from "../lib/entrance";
import { freshWidgetData, getWidgetBlueprint, WIDGET_SIZES } from "../lib/widgetDefaults";
import { widgetLabel } from "../lib/widgetLabels";
import { widgetSupportsThread } from "../lib/widgetThreads";
import { RSVP_CHOICES, type RsvpStatus } from "../widgets/extras";
import type { CozyColorStroke } from "../widgets/CozyColorWidget";
import type { CanvasLayout, LivePeer } from "../live/presenceTypes";
import { DEFAULT_SPACE_SLUG, normalSpaceHash } from "../lib/routes";
import { useCanvasSpacePan } from "../lib/canvasSpacePan";
import {
  buildRoomOverviewScale,
  withBuildRoomCover,
} from "../lib/buildRoomPresentation";

const EMPTY_RECAP_LINES: RecapLine[] = [];

const emptyWidget = {
  id: "",
  type: "poll" as const,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  z: 0,
  data: { options: [] },
};

type CanvasCamera = {
  scale: number;
  scrollLeft: number;
  scrollTop: number;
};

type FocusedTarget = {
  kind: "frame" | "widget";
  id: string;
  type: WidgetType;
  label: string;
};

type FocusLayout = {
  camera: CanvasCamera;
  dockPlacement?: ThreadDockPlacement;
};

type PhotoGalleryState = {
  widgetId: string;
  origin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Screen rects of the pile's visible prints (photo index 0/1/2) so the
     gallery can FLIP them from the pile to their spread positions. */
  printOrigins?: Array<{ x: number; y: number; w: number; h: number } | null>;
};

/** The on-screen rect of a canvas card, as inset from each viewport edge —
 *  the room grows out of it and shrinks back into it. */
function roomOriginFor(widgetId: string): RoomOrigin {
  const element = Array.from(
    document.querySelectorAll<HTMLElement>(".widget-group[data-widget-id]"),
  ).find((candidate) => candidate.dataset.widgetId === widgetId);
  const rect = element?.getBoundingClientRect();
  if (!rect) {
    return {
      top: window.innerHeight * 0.25,
      right: window.innerWidth * 0.25,
      bottom: window.innerHeight * 0.25,
      left: window.innerWidth * 0.25,
    };
  }
  return {
    top: Math.max(0, rect.top),
    right: Math.max(0, window.innerWidth - rect.right),
    bottom: Math.max(0, window.innerHeight - rect.bottom),
    left: Math.max(0, rect.left),
  };
}

const CAMERA_MS = 360;
const CAMERA_EXIT_MS = 280;
const FRAME_FIT_GUTTER = 24;
const MIN_FRAME_SCALE = 0.8;
const MIN_EDIT_FRAME_SCALE = 0.5;
const MAX_FRAME_SCALE = 1.35;
const MIN_WIDGET_SCALE = 1;
const MAX_WIDGET_SCALE = 1.8;
const WIDGET_FOCUS_GUTTER = 48;
const THREAD_DOCK_GAP = 16;
const DEFAULT_THREAD_DOCK_SIZE: ThreadDockSize = {
  width: 680,
  height: 540,
};
const CLAIM_DISMISSED_KEY = "ourspaces:claim-dismissed";

type GhostLifecycle = "hidden" | "in" | "leaving";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function easeOutQuint(progress: number) {
  return 1 - Math.pow(1 - progress, 5);
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

function useGhostLifecycle(showGhosts: boolean, status: string): GhostLifecycle {
  const [lifecycle, setLifecycle] = useState<GhostLifecycle>("hidden");
  const lifecycleRef = useRef<GhostLifecycle>("hidden");

  useEffect(() => {
    const setNext = (next: GhostLifecycle) => {
      lifecycleRef.current = next;
      setLifecycle(next);
    };

    if (showGhosts) {
      setNext("in");
      return;
    }

    if (status === "loading") {
      if (lifecycleRef.current !== "hidden") setNext("hidden");
      return;
    }

    if (lifecycleRef.current !== "in") {
      if (lifecycleRef.current !== "hidden") setNext("hidden");
      return;
    }

    setNext("leaving");
    const timeout = window.setTimeout(() => setNext("hidden"), 280);
    return () => window.clearTimeout(timeout);
  }, [showGhosts, status]);

  return lifecycle;
}

export function LiveSpacePage({
  slug = DEFAULT_SPACE_SLUG,
  onSelectSpace,
  isInviteEntry = false,
}: {
  slug?: string;
  onSelectSpace?: (id: string) => void;
  isInviteEntry?: boolean;
}) {
  const { space, snapshot, widgets, status, mode } = useLiveSpace(slug);
  const showLoading = useShowAfter(status === "loading");
  const ghostLifecycle = useGhostLifecycle(showLoading, status);
  const identity = useIdentity();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const canvasScaleLayerRef = useRef<HTMLDivElement>(null);
  const canvasScaleRef = useRef(1);
  const canvasReturnView = useRef<CanvasCamera | null>(null);
  const chatReturnView = useRef<boolean | null>(null);
  const canvasCameraAnimation = useRef(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [entered, setEntered] = useState(
    () => !isInviteEntry && window.sessionStorage.getItem(CLAIM_DISMISSED_KEY) === "done",
  );
  const [arrivalPeer, setArrivalPeer] = useState<LivePeer | null>(null);
  const arrivalTimer = useRef<number | null>(null);
  const seenPeerIds = useRef<Set<string> | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapRunId, setRecapRunId] = useState(0);
  const [recapCites, setRecapCites] = useState<string[]>([]);
  const [recapHover, setRecapHover] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [canvasAwayFromHome, setCanvasAwayFromHome] = useState(false);
  const [customization, setCustomization] = useState<SpaceCustomization>(() =>
    defaultSpaceCustomization(getSpace(slug)),
  );
  const [spaceDraft, setSpaceDraft] = useState<SpaceCustomization | null>(null);
  const [editingWidgetId, setEditingWidgetId] = useState("");
  const [payoffFlashId, setPayoffFlashId] = useState("");
  const payoffScrollTimer = useRef<number | null>(null);
  const payoffFlashTimer = useRef<number | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState("");
  const [managedWidgetId, setManagedWidgetId] = useState("");
  const [photoGallery, setPhotoGallery] = useState<PhotoGalleryState | null>(null);
  /** The pile / a ship post opened full screen, with the rect it grew from. */
  const [openRoom, setOpenRoom] = useState<
    { kind: "pile" | "ship"; widgetId: string; origin: RoomOrigin } | null
  >(null);
  /** A hot-now row asked the reading room to open on one specific link. */
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);
  const [rsvpSelections, setRsvpSelections] = useState<Record<string, RsvpStatus>>({});
  const [dailyAnswers, setDailyAnswers] = useState<Record<string, string>>({});
  const [dailyReactions, setDailyReactions] = useState<Record<string, Record<string, string>>>({});
  const [focusedTarget, setFocusedTarget] = useState<FocusedTarget | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasCameraAnimating, setCanvasCameraAnimating] = useState(false);
  const [threadDockPlacement, setThreadDockPlacement] =
    useState<ThreadDockPlacement>("below");
  const [threadDockSize, setThreadDockSize] = useState<ThreadDockSize>(
    DEFAULT_THREAD_DOCK_SIZE,
  );
  const [soundEnabled, setSound] = useState(getSoundEnabled);
  const [moreRight, setMoreRight] = useState(false);

  const join = useMutation(api.spaces.joinDemoSpace);
  const generatePhotoUploadUrl = useMutation(api.photos.generateUploadUrl);
  const pinPhoto = useMutation(api.photos.addPhoto);
  const shipImageUrl = useMutation(api.photos.storageUrl);
  const addPaintStroke = useMutation(api.paint.addStroke);
  const clearPaint = useMutation(api.paint.clear);
  const ensureCozyColorWidget = useMutation(api.paint.ensureCozyColorWidget);
  const roomEntered = entered && !isInviteEntry;
  const closeClaim = useCallback(() => {
    setClaimOpen(false);
  }, []);

  const enterRoom = useCallback(() => {
    window.sessionStorage.setItem(CLAIM_DISMISSED_KEY, "done");
    setEntered(true);
    if (space) void join({ spaceId: space._id, ...identity });
    if (isInviteEntry) window.location.hash = normalSpaceHash(slug);
    playSound("place");
  }, [identity, isInviteEntry, join, slug, space]);

  const mockSpace = getSpace(slug);
  const isInvalidInvite = isInviteEntry && !SPACES_BY_ID[slug] && status === "missing";
  const gateOpen = !roomEntered && !isInvalidInvite;
  useEffect(() => {
    setCustomization(defaultSpaceCustomization(mockSpace));
    setSpaceDraft(null);
    setPhotoGallery(null);
    setOpenRoom(null);
  }, [mockSpace, slug]);
  const activeCustomization = spaceDraft ?? customization;
  const members = mockSpace.members;
  const presence = usePresence(
    roomEntered ? space?._id : undefined,
    identity,
    wrapperRef,
    canvasScaleLayerRef,
    { x: 72, y: 72 },
  );
  const liveCursors = presence.peers;
  // Real cursor pagination server-side; the page auto-loads-more so the demo
  // still sees full space history without an infinite-scroll UI.
  const messagesPage = usePaginatedQuery(
    api.messages.listBySpace,
    space ? { spaceId: space._id } : "skip",
    { initialNumItems: 200 },
  );
  useEffect(() => {
    if (messagesPage.status === "CanLoadMore") messagesPage.loadMore(200);
  }, [messagesPage.status, messagesPage.loadMore]);
  const allMessages =
    messagesPage.status === "LoadingFirstPage" ? undefined : messagesPage.results;
  const paintRows = useQuery(api.paint.listBySpace, space ? { spaceId: space._id } : "skip");
  const sparkQuestions = useAction(api.questions.sparkQuestions);
  /** Which web post conversation starter the thread dock is answering. */
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const handlers = useLiveHandlers(space?._id, identity, presence, widgets);
  /* Roundtable cards preview the tail of their own thread — same subscription
     the thread dock reads, grouped by widget. */
  const roundtableRepliesByWidget = useMemo(() => {
    const grouped: Record<string, RoundtableReply[]> = {};
    if (!allMessages) return grouped;
    for (const widget of widgets ?? []) {
      if (widget.type !== "roundtable") continue;
      grouped[widget.id] = allMessages
        .filter((message) => message.widgetId === widget.id)
        .map((message) => ({
          id: message._id,
          from: message.authorName,
          fromColor: message.authorColor,
          fromAvatarUrl: message.authorAvatarUrl,
          text: message.text,
          time: relTime(message.createdAt),
        }));
    }
    return grouped;
  }, [allMessages, widgets]);
  const paintStrokesByWidget = useMemo(() => {
    const grouped: Record<string, CozyColorStroke[]> = {};
    for (const row of paintRows ?? []) {
      const widgetId = String(row.widgetId);
      const stroke: CozyColorStroke = {
        id: String(row._id),
        userId: row.userId,
        authorName: row.authorName,
        authorColor: row.authorColor,
        tone: row.tone,
        size: row.size,
        points: row.points,
        regionId: row.regionId,
        preset: row.preset,
        createdAt: row.createdAt,
      };
      grouped[widgetId] = [...(grouped[widgetId] ?? []), stroke];
    }
    return grouped;
  }, [paintRows]);
  const paintStroke = useCallback(
    async (widgetId: string, stroke: Omit<CozyColorStroke, "id" | "createdAt">) => {
      if (!space) return null;
      return await addPaintStroke({
        spaceId: space._id,
        widgetId: widgetId as Id<"widgets">,
        ...stroke,
      });
    },
    [addPaintStroke, space],
  );
  const clearPaintWidget = useCallback(
    async (widgetId: string, regionPrefix?: string) => {
      if (!space) return 0;
      return await clearPaint({
        spaceId: space._id,
        widgetId: widgetId as Id<"widgets">,
        regionPrefix,
      });
    },
    [clearPaint, space],
  );
  const ensuredPaintSpaces = useRef(new Set<string>());
  useEffect(() => {
    if (slug !== "couple" || !space || widgets.some((widget) => widget.type === "cozyColor")) {
      return;
    }
    const spaceId = String(space._id);
    if (ensuredPaintSpaces.current.has(spaceId)) return;
    ensuredPaintSpaces.current.add(spaceId);
    void ensureCozyColorWidget({ spaceId: space._id, createdBy: identity.userId });
  }, [ensureCozyColorWidget, identity.userId, slug, space, widgets]);
  const poll = widgets.find((widget) => widget.type === "poll") ?? emptyWidget;
  const livePoll = useLivePoll(poll, identity.userId, members);
  const pollSelections = useMemo(
    () => livePoll.id
      ? { [livePoll.id]: String(livePoll.data.selectedOptionId ?? "") }
      : {},
    [livePoll.data.selectedOptionId, livePoll.id],
  );

  useEffect(() => {
    if (!roomEntered || !space) return;
    void join({ spaceId: space._id, ...identity });
  }, [identity, join, roomEntered, space]);

  useEffect(() => {
    seenPeerIds.current = null;
    setArrivalPeer(null);
  }, [roomEntered, slug, space?._id]);

  useEffect(() => {
    if (!roomEntered || !presence.queryReady) return;
    const currentIds = new Set(presence.peers.map((peer) => peer.userId));
    if (seenPeerIds.current === null) {
      seenPeerIds.current = currentIds;
      return;
    }

    const newcomer = presence.peers.find((peer) => !seenPeerIds.current?.has(peer.userId));
    seenPeerIds.current = currentIds;
    if (!newcomer) return;

    setArrivalPeer(newcomer);
    if (arrivalTimer.current !== null) window.clearTimeout(arrivalTimer.current);
    arrivalTimer.current = window.setTimeout(() => {
      setArrivalPeer(null);
      arrivalTimer.current = null;
    }, 2000);
    playSound("place");
  }, [presence.peers, presence.queryReady, roomEntered]);

  useEffect(() => {
    return () => {
      if (arrivalTimer.current !== null) window.clearTimeout(arrivalTimer.current);
    };
  }, []);

  const adaptedWidgets = useMemo(
    () => widgets.map((widget) => {
      const next = handlers.overrides[widget.id];
      const withOverride = next ? { ...widget, ...next } : widget;
      return withOverride.id === livePoll.id ? livePoll : withOverride;
    }),
    [handlers.overrides, livePoll, widgets],
  );
  const overviewWidgetsRef = useRef<Widget[]>(mockSpace.widgets);
  overviewWidgetsRef.current = adaptedWidgets.length
    ? adaptedWidgets
    : mockSpace.widgets;
  /* ── the build room ──────────────────────────────────────────────────────
     Link content comes from the fixtures; votes, pins, keeps and runtime drops
     live in the pile widget's own `data`, so the whole room is reactive and
     multiplayer over the existing `widgets.updateWidgetData` mutation. */
  const pileWidget = useMemo(
    () => adaptedWidgets.find((widget) => widget.type === "linkPile") ?? null,
    [adaptedWidgets],
  );
  const buildRoomLinks = useMemo(
    () => pileLinks(pileWidget).map(withBuildRoomCover),
    [pileWidget],
  );
  /** Every message in the space, bucketed by its thread id. */
  const messagesByThread = useMemo(() => {
    const grouped: Record<string, RoomReply[]> = {};
    for (const message of allMessages ?? []) {
      (grouped[message.widgetId] ??= []).push({
        id: message._id,
        from: message.authorName,
        color: message.authorColor,
        avatarUrl: message.authorAvatarUrl,
        text: message.text,
        time: relTime(message.createdAt),
      });
    }
    return grouped;
  }, [allMessages]);
  const buildRoomReplyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [threadId, list] of Object.entries(messagesByThread)) {
      counts[threadId] = list.length;
    }
    return linkReplyCounts(counts);
  }, [messagesByThread]);
  const openReadingRoom = useCallback(
    (linkId?: string) => {
      if (!pileWidget) return;
      playSound("tap");
      setManagedWidgetId("");
      setEditingWidgetId("");
      setSelectedWidgetId("");
      setPickerOpen(false);
      setRecapOpen(false);
      setChatOpen(false);
      setPendingLinkId(linkId ?? null);
      setOpenRoom({
        kind: "pile",
        widgetId: pileWidget.id,
        origin: roomOriginFor(pileWidget.id),
      });
    },
    [pileWidget],
  );
  const buildRoomFeed = useMemo(
    () =>
      pileWidget
        ? {
            ...buildRoomFeedFrom(buildRoomLinks, buildRoomReplyCounts, members),
            onOpenPile: openReadingRoom,
          }
        : undefined,
    [buildRoomLinks, buildRoomReplyCounts, members, openReadingRoom, pileWidget],
  );
  /* Every pile write is a patch of the pile widget's own data. Reads come from
     the live subscription, so two windows stay in step. */
  const pileWidgetRef = useRef<Widget | null>(null);
  pileWidgetRef.current = pileWidget;
  const patchPile = useCallback(
    (mutate: (data: PileData) => PileData) => {
      const pile = pileWidgetRef.current;
      if (!pile) return;
      const next = mutate(readPileData(pile));
      handlers.onUpdate(pile.id, { ...pile.data, ...next });
    },
    [handlers],
  );

  const voteOnLink = useCallback(
    (linkId: string) => {
      const link = buildRoomLinks.find((candidate) => candidate.id === linkId);
      if (!link) return;
      const voters = toggledVoters(link, identity.userId);
      patchPile((data) => ({
        ...data,
        linkState: {
          ...data.linkState,
          [linkId]: { ...data.linkState?.[linkId], voters },
        },
      }));
    },
    [buildRoomLinks, identity.userId, patchPile],
  );

  const pinLink = useCallback(
    (linkId: string) => {
      const link = buildRoomLinks.find((candidate) => candidate.id === linkId);
      if (!link) return;
      patchPile((data) => ({
        ...data,
        linkState: {
          ...data.linkState,
          [linkId]: { ...data.linkState?.[linkId], pinned: !link.pinned },
        },
      }));
    },
    [buildRoomLinks, patchPile],
  );

  /* The climax: a takeaway leaves the reading room and lands on the canvas as
     a pinned note inside the keepers frame. Idempotent — keeping twice is a
     no-op, so a double click can't spawn two cards. */
  const keepTakeaway = useCallback(
    async (linkId: string) => {
      const link = buildRoomLinks.find((candidate) => candidate.id === linkId);
      const pile = pileWidgetRef.current;
      if (!link || !pile || link.keptAt !== undefined) return;
      const keepers = widgets?.find(
        (widget) => widget.type === "frame" && widget.data.title === "keepers",
      );
      /* Every pinned note in the keepers frame, seeded or kept — new ones fan
         off the stack instead of landing on top of one. */
      const slot =
        widgets?.filter((widget) => widget.type === "note" && widget.data.pin).length ?? 0;
      /* Measured before the room closes — the note flies in from the card the
         takeaway was read on. */
      const from =
        document.querySelector(".rr-cover")?.getBoundingClientRect() ?? null;
      const created = await handlers.onCreate({
        type: "note",
        x: (keepers?.x ?? 850) + 36 + (slot % 2) * 336 + Math.floor(slot / 2) * 20,
        y: (keepers?.y ?? 470) + 42 + Math.floor(slot / 2) * 18,
        w: 320,
        h: 150,
        z: 1000 + slot,
        rotate: slot % 2 === 0 ? -1.2 : 1.4,
        data: {
          kicker: link.kind === "docs" ? "reference" : "rule of thumb",
          title: link.title,
          text: link.whyItMatters || link.description,
          author: identity.name,
          tone: "white",
          pin: true,
          keptLinkId: link.id,
        },
      });
      patchPile((data) => ({
        ...data,
        linkState: {
          ...data.linkState,
          [linkId]: {
            ...data.linkState?.[linkId],
            keptAt: Date.now(),
            keptWidgetId: created ? String(created) : undefined,
          },
        },
      }));
      /* After the room's 480ms exit cue plus its 300ms shrink. */
      if (created) {
        window.setTimeout(() => void flyWidgetIn(String(created), from), 860);
      }
    },
    [buildRoomLinks, handlers, identity.name, patchPile, widgets],
  );

  /* Paste 1–10 urls: placeholder rows appear immediately, then Firecrawl fills
     them in one at a time — the patches are read-modify-write on one document,
     so they must not race each other. */
  const dropLinks = useCallback(
    async (urls: string[]) => {
      const pile = pileWidgetRef.current;
      if (!pile) return;
      const existing = new Set(buildRoomLinks.map((link) => link.url));
      const fresh = urls.filter((url) => !existing.has(url));
      if (fresh.length === 0) return;
      const batchKey = `drop-${Date.now()}`;
      const pending: BuildRoomLink[] = fresh.map((url, index) => ({
        id: `${batchKey}-${index}`,
        url,
        domain: url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0],
        title: "",
        description: "",
        imageUrl: "",
        kind: "article",
        whyItMatters: "",
        questions: [],
        status: "pending",
        batchKey,
        droppedBy: identity.userId,
        droppedByName: identity.name,
        droppedAt: Date.now(),
        voters: [],
      }));
      patchPile((data) => ({ ...data, dropped: [...pending, ...(data.dropped ?? [])] }));

      for (const link of pending) {
        let patch: Partial<BuildRoomLink>;
        try {
          const scraped = await handlers.onResolveLink(link.url);
          patch = {
            title: scraped.title,
            description: scraped.description,
            imageUrl: scraped.imageUrl,
            domain: scraped.siteName || link.domain,
            whyItMatters: scraped.description,
            questions: cannedLinkQuestions(scraped.title || link.url),
            status: "ready",
          };
        } catch {
          patch = { status: "failed", title: link.domain };
        }
        patchPile((data) => ({
          ...data,
          dropped: (data.dropped ?? []).map((entry) =>
            entry.id === link.id ? { ...entry, ...patch } : entry,
          ),
        }));
      }
    },
    [buildRoomLinks, handlers, identity.name, identity.userId, patchPile],
  );

  const retryLink = useCallback(
    (linkId: string) => {
      const link = buildRoomLinks.find((candidate) => candidate.id === linkId);
      if (!link) return;
      patchPile((data) => ({
        ...data,
        dropped: (data.dropped ?? []).filter((entry) => entry.id !== linkId),
      }));
      void dropLinks([link.url]);
    },
    [buildRoomLinks, dropLinks, patchPile],
  );

  const shipRoomWidget = useMemo(
    () =>
      openRoom?.kind === "ship"
        ? adaptedWidgets.find((widget) => widget.id === openRoom.widgetId) ?? null
        : null,
    [adaptedWidgets, openRoom],
  );

  /** Same two-step upload the memory wall uses: bytes to storage, url to data. */
  const attachShipImage = useCallback(
    async (widgetId: string, file: File) => {
      const widget = widgets?.find((candidate) => candidate.id === widgetId);
      if (!widget) return;
      const uploadUrl = await generatePhotoUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      });
      if (!response.ok) throw new Error("ship image upload failed");
      const { storageId } = (await response.json()) as { storageId: string };
      const url = await shipImageUrl({ storageId: storageId as Id<"_storage"> });
      if (url) handlers.onUpdate(widgetId, { ...widget.data, imageUrl: url });
    },
    [generatePhotoUploadUrl, handlers, shipImageUrl, widgets],
  );

  const closeRoom = useCallback(() => {
    setOpenRoom(null);
    setPendingLinkId(null);
    setManagedWidgetId("");
  }, []);

  const photoGalleryWidget = useMemo(
    () => adaptedWidgets.find(
      (widget) => widget.id === photoGallery?.widgetId && widget.type === "photoWall",
    ) ?? null,
    [adaptedWidgets, photoGallery?.widgetId],
  );
  /* Notes written on the backs of the wall's prints — sub-threads riding the
     message pipes with `<widgetId>::photo:<photoKey>` keys, like the reading
     circle's `::q:` starters. */
  const photoGalleryComments = useMemo(() => {
    if (!photoGalleryWidget) return {};
    const prefix = `${photoGalleryWidget.id}::photo:`;
    const map: Record<string, PhotoComment[]> = {};
    for (const message of allMessages ?? []) {
      if (!message.widgetId.startsWith(prefix)) continue;
      (map[message.widgetId.slice(prefix.length)] ??= []).push({
        id: message._id,
        name: message.authorName,
        color: message.authorColor,
        text: message.text,
        time: relTime(message.createdAt),
      });
    }
    return map;
  }, [allMessages, photoGalleryWidget]);
  /* Stable callbacks for the memoized gallery — routed through refs so
     presence/chat re-renders don't hand it fresh function identities. */
  const galleryWidgetIdRef = useRef<string | null>(null);
  galleryWidgetIdRef.current = photoGalleryWidget?.id ?? null;
  const gallerySendRef = useRef(handlers.onSend);
  gallerySendRef.current = handlers.onSend;
  const addPhotoToWall = useCallback(
    async (file: File, caption: string) => {
      const widgetId = galleryWidgetIdRef.current;
      if (!widgetId) return;
      const uploadUrl = await generatePhotoUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!response.ok) throw new Error("photo upload failed");
      const { storageId } = (await response.json()) as { storageId: string };
      await pinPhoto({
        widgetId: widgetId as Id<"widgets">,
        storageId: storageId as Id<"_storage">,
        caption,
        by: identity.name,
      });
    },
    [generatePhotoUploadUrl, identity.name, pinPhoto],
  );
  const sendPhotoComment = useCallback((photoId: string, text: string) => {
    const widgetId = galleryWidgetIdRef.current;
    if (widgetId) gallerySendRef.current(`${widgetId}::photo:${photoId}`, text);
  }, []);
  const closePhotoGallery = useCallback(() => {
    setPhotoGallery(null);
    setManagedWidgetId("");
  }, []);
  const globalMessages = useMemo(
    () => (allMessages ?? [])
      .filter((message) => message.widgetId === "global")
      .map(toChatMessage),
    [allMessages],
  );
  const commentCounts = useMemo(
    () => Object.fromEntries(
      (allMessages ?? [])
        .filter((message) => message.widgetId !== "global" && message.widgetId !== RECAP_THREAD_ID)
        .reduce(
          // Question threads ("<widget>::q:<id>") count toward their widget's chip.
          (counts, message) => {
            const widgetId = message.widgetId.split("::")[0];
            return counts.set(widgetId, (counts.get(widgetId) ?? 0) + 1);
          },
          new Map<string, number>(),
        ),
    ),
    [allMessages],
  );
  const promotable = globalMessages.find((message) => message.promotable);
  const generateRecap = useAction(api.recap.generate);
  const askRecap = useAction(api.recap.ask);
  const latestRecap = useQuery(api.recap.latest, space ? { spaceId: space._id } : "skip");
  const recapLines = useMemo<RecapLine[]>(
    () =>
      latestRecap
        ? latestRecap.lines.map((line) => ({ ...line, text: cleanRecapText(line.text) }))
        : EMPTY_RECAP_LINES,
    [latestRecap],
  );
  const recapSince = latestRecap?.since ?? "cached";
  const recapTurns = useMemo<RecapTurn[]>(
    () =>
      (allMessages ?? [])
        .filter((message) => message.widgetId === RECAP_THREAD_ID)
        .map((message) => ({
          id: message._id,
          from: message.authorName,
          fromColor: message.authorColor,
          fromEmoji: message.authorEmoji,
          fromAvatarUrl: message.authorAvatarUrl,
          text: message.text,
          isRecap: message.userId === "recap",
        })),
    [allMessages],
  );
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapAsking, setRecapAsking] = useState(false);
  const recapGenerating = useRef(false);
  const promotePosition = slug === "crew"
    ? { x: 1072, y: 660 }
    : { x: 1080, y: 448 };
  const promotedMessageIds = useMemo(
    () => new Set(
      widgets
        .map((widget) => widget.data.promotedFromMessageId)
        .filter(Boolean)
        .map(String),
    ),
    [widgets],
  );
  const promotedWidgets = useMemo(
    () => widgets.filter((widget) => Boolean(widget.data.promotedFromMessageId)),
    [widgets],
  );
  const previousPromotedWidgetIds = useRef<Set<string> | null>(null);
  const previousPromotedSlug = useRef(slug);
  useEffect(() => {
    if (previousPromotedSlug.current !== slug) {
      previousPromotedSlug.current = slug;
      previousPromotedWidgetIds.current = null;
    }
    const widgetIds = new Set(promotedWidgets.map((widget) => widget.id));
    if (previousPromotedWidgetIds.current === null) {
      previousPromotedWidgetIds.current = widgetIds;
      return;
    }
    const newWidget = promotedWidgets.find(
      (widget) => !previousPromotedWidgetIds.current?.has(widget.id),
    );
    previousPromotedWidgetIds.current = widgetIds;
    if (!newWidget) return;
    setChatOpen(false);
    setPayoffFlashId(newWidget.id);
    if (payoffScrollTimer.current !== null) {
      window.clearTimeout(payoffScrollTimer.current);
    }
    if (payoffFlashTimer.current !== null) {
      window.clearTimeout(payoffFlashTimer.current);
    }
    payoffScrollTimer.current = window.setTimeout(() => {
      document
        .querySelector(`[data-widget-id="${newWidget.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      payoffScrollTimer.current = null;
    }, 120);
    payoffFlashTimer.current = window.setTimeout(() => {
      setPayoffFlashId("");
      payoffFlashTimer.current = null;
    }, 2200);
  }, [promotedWidgets, slug]);
  useEffect(() => () => {
    if (payoffScrollTimer.current !== null) {
      window.clearTimeout(payoffScrollTimer.current);
    }
    if (payoffFlashTimer.current !== null) {
      window.clearTimeout(payoffFlashTimer.current);
    }
  }, []);
  const hereCount = members.filter((member) => member.online).length + liveCursors.length + 1;
  const canvasWidth = space?.canvasW ?? snapshot?.canvasW ?? 1640;
  const canvasHeight = space?.canvasH ?? snapshot?.canvasH ?? 1080;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateMoreRight = () => {
      setMoreRight(
        viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 2,
      );
    };

    updateMoreRight();
    viewport.addEventListener("scroll", updateMoreRight, { passive: true });
    window.addEventListener("resize", updateMoreRight);
    const resizeObserver = new ResizeObserver(updateMoreRight);
    resizeObserver.observe(viewport);
    if (canvasStageRef.current) resizeObserver.observe(canvasStageRef.current);

    return () => {
      viewport.removeEventListener("scroll", updateMoreRight);
      window.removeEventListener("resize", updateMoreRight);
      resizeObserver.disconnect();
    };
  }, [canvasWidth, roomEntered, slug]);
  const editingWidget = editingWidgetId
    ? widgets.find((widget) => widget.id === editingWidgetId) ?? null
    : null;
  const activeThreadId =
    focusedTarget?.kind === "widget" ? focusedTarget.id : selectedWidgetId;
  const activeThreadWidget = adaptedWidgets.find((widget) => widget.id === activeThreadId) ?? null;
  /* A zoomed web post talks through its conversation starters — each one is
     its own thread under a namespaced id; other widgets keep the plain one. */
  const activeThreadQuestions = activeThreadWidget
    ? linkCardQuestions(activeThreadWidget)
    : [];
  const activeQuestion =
    activeThreadQuestions.find((question) => question.id === activeQuestionId) ??
    activeThreadQuestions[0] ??
    null;
  const activeThreadKey =
    activeThreadWidget && activeQuestion
      ? questionThreadId(activeThreadWidget.id, activeQuestion.id)
      : activeThreadId;
  const activeThreadMessages = (allMessages ?? [])
    .filter((message) => message.widgetId === activeThreadKey)
    .map(toChatMessage);
  const activeQuestionCounts = Object.fromEntries(
    activeThreadWidget
      ? activeThreadQuestions.map((question) => [
          question.id,
          (allMessages ?? []).filter(
            (message) =>
              message.widgetId ===
              questionThreadId(activeThreadWidget.id, question.id),
          ).length,
        ])
      : [],
  );
  useEffect(() => {
    setActiveQuestionId("");
  }, [activeThreadId]);
  const focusedFrame = (focusedTarget?.kind === "frame"
    ? adaptedWidgets.find((widget) => widget.id === focusedTarget.id && widget.type === "frame") ?? null
    : null) as Widget | null;

  const applyCanvasScale = useCallback((
    scale: number,
    reservedScale = scale,
    reserveSpace = true,
  ) => {
    const stage = canvasStageRef.current;
    const layer = canvasScaleLayerRef.current;
    canvasScaleRef.current = scale;
    if (stage && reserveSpace) {
      stage.style.width = `${Math.ceil(canvasWidth * reservedScale)}px`;
      stage.style.height = `${Math.ceil(canvasHeight * reservedScale)}px`;
    }
    if (layer) {
      if (reserveSpace) {
        layer.style.width = `${canvasWidth}px`;
        layer.style.height = `${canvasHeight}px`;
      }
      layer.style.transform = `scale(${scale})`;
    }
  }, [canvasHeight, canvasWidth]);

  const moveCanvasCamera = useCallback((target: CanvasCamera, duration: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    window.cancelAnimationFrame(canvasCameraAnimation.current);
    canvasCameraAnimation.current = 0;
    canvasScaleLayerRef.current?.style.removeProperty("will-change");

    const fromScale = canvasScaleRef.current;
    const fromScrollLeft = viewport.scrollLeft;
    const fromScrollTop = viewport.scrollTop;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animationDuration = reducedMotion ? 0 : duration;
    setCanvasScale(fromScale);

    if (animationDuration === 0) {
      applyCanvasScale(target.scale);
      viewport.scrollTo({ left: target.scrollLeft, top: target.scrollTop, behavior: "auto" });
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
      viewport.scrollLeft = fromScrollLeft + (target.scrollLeft - fromScrollLeft) * eased;
      viewport.scrollTop = fromScrollTop + (target.scrollTop - fromScrollTop) * eased;

      if (progress < 1) {
        canvasCameraAnimation.current = window.requestAnimationFrame(tick);
        return;
      }

      canvasCameraAnimation.current = 0;
      applyCanvasScale(target.scale);
      viewport.scrollTo({ left: target.scrollLeft, top: target.scrollTop, behavior: "auto" });
      setCanvasScale(target.scale);
      setCanvasCameraAnimating(false);
      canvasScaleLayerRef.current?.style.removeProperty("will-change");
    };

    canvasCameraAnimation.current = window.requestAnimationFrame(tick);
  }, [applyCanvasScale]);

  const focusCameraTarget = useCallback((
    target: FocusedTarget,
    dockSize: ThreadDockSize = DEFAULT_THREAD_DOCK_SIZE,
  ): FocusLayout | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;

    const targetElements = canvasScaleLayerRef.current?.querySelectorAll<HTMLElement>(
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

    const bounds = {
      x: targetElement.offsetLeft,
      y: targetElement.offsetTop,
      width: targetElement.offsetWidth,
      height: targetElement.offsetHeight,
    };
    const viewportRect = viewport.getBoundingClientRect();
    let visibleLeft = 24;
    let visibleTop = 72;
    let visibleRight = viewport.clientWidth - 24;
    const visibleBottom = viewport.clientHeight - 24;

    const rail = document.querySelector<HTMLElement>(".space-rail");
    if (rail && elementIsVisible(rail)) {
      const railRect = rail.getBoundingClientRect();
      visibleLeft = Math.max(
        visibleLeft,
        railRect.right - viewportRect.left + 16,
      );
    }

    const focusHud = document.querySelector<HTMLElement>(".canvas-focus-hud");
    if (focusHud && elementIsVisible(focusHud)) {
      const focusRect = focusHud.getBoundingClientRect();
      visibleTop = Math.max(
        visibleTop,
        focusRect.bottom - viewportRect.top + 12,
      );
    }

    document
      .querySelectorAll<HTMLElement>(".global-chat-panel, .widget-editor-panel")
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
        (availableHeight - THREAD_DOCK_GAP - dockSize.height) / bounds.height,
      );
      const sideScale = Math.min(
        MAX_WIDGET_SCALE,
        (availableWidth - THREAD_DOCK_GAP - dockSize.width) / bounds.width,
        availableHeight / bounds.height,
      );

      if (sideScale >= MIN_WIDGET_SCALE && dockSize.height <= availableHeight) {
        scale = clamp(sideScale, MIN_WIDGET_SCALE, MAX_WIDGET_SCALE);
        if (bounds.x + bounds.width / 2 > canvasWidth / 2) {
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
      paddingLeft + canvasWidth * scale + paddingRight - viewport.clientWidth,
    );
    const maxScrollTop = Math.max(
      0,
      paddingTop + canvasHeight * scale + paddingBottom - viewport.clientHeight,
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
  }, [canvasHeight, canvasWidth, editingWidgetId]);

  const refitFocusedTarget = useCallback((duration = CAMERA_MS) => {
    if (!focusedTarget) return;
    const layout = focusCameraTarget(focusedTarget, threadDockSize);
    if (!layout) return;
    if (layout.dockPlacement) setThreadDockPlacement(layout.dockPlacement);
    moveCanvasCamera(layout.camera, duration);
  }, [focusCameraTarget, focusedTarget, moveCanvasCamera, threadDockSize]);

  const leaveFocus = useCallback((withSound = true) => {
    if (!focusedTarget) return;
    const returnView = canvasReturnView.current;
    if (withSound) playSound("tap");
    setEditingWidgetId("");
    setManagedWidgetId("");
    setSelectedWidgetId("");
    setFocusedTarget(null);
    canvasReturnView.current = null;
    const previousChatOpen = chatReturnView.current;
    chatReturnView.current = null;
    if (previousChatOpen !== null) setChatOpen(previousChatOpen);
    if (returnView) moveCanvasCamera(returnView, CAMERA_EXIT_MS);
  }, [focusedTarget, moveCanvasCamera]);

  const focusFrame = useCallback((targetFrame: Widget) => {
    if (window.matchMedia("(max-width: 800px)").matches) return;
    /* The pile's frame has nothing to zoom into — the links live in the
       reading room, so opening the frame opens the room. */
    if (pileInsideFrame(targetFrame, adaptedWidgets)) {
      openReadingRoom();
      return;
    }
    if (focusedTarget?.kind === "frame" && focusedTarget.id === targetFrame.id) {
      leaveFocus();
      return;
    }
    const viewport = viewportRef.current;
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
    setSelectedWidgetId("");
    setPickerOpen(false);
    setChatOpen(false);
    setRecapOpen(false);
    setFocusedTarget({
      kind: "frame",
      id: targetFrame.id,
      type: "frame",
      label: String(targetFrame.data.title ?? "frame"),
    });
  }, [adaptedWidgets, focusedTarget, leaveFocus, openReadingRoom]);

  const focusWidgetThread = useCallback((widget: Widget) => {
    if (!widgetSupportsThread(widget)) return;

    if (widget.type === "photoWall") {
      if (focusedTarget) leaveFocus(false);
      const widgetElement = Array.from(
        document.querySelectorAll<HTMLElement>(".widget-group[data-widget-id]"),
      ).find((element) => element.dataset.widgetId === widget.id);
      const rect = widgetElement?.getBoundingClientRect();
      const origin = rect
        ? {
            top: Math.max(0, rect.top),
            right: Math.max(0, window.innerWidth - rect.right),
            bottom: Math.max(0, window.innerHeight - rect.bottom),
            left: Math.max(0, rect.left),
          }
        : {
            top: window.innerHeight * 0.25,
            right: window.innerWidth * 0.25,
            bottom: window.innerHeight * 0.25,
            left: window.innerWidth * 0.25,
          };
      const printOrigins = widgetElement
        ? [".photo-wall-cover", ".photo-wall-peek-1", ".photo-wall-peek-2"].map(
            (selector) => {
              const print = widgetElement.querySelector(selector);
              if (!print) return null;
              const printRect = print.getBoundingClientRect();
              return {
                x: printRect.x,
                y: printRect.y,
                w: printRect.width,
                h: printRect.height,
              };
            },
          )
        : undefined;
      playSound("tap");
      /* No managed toolbar behind the modal — it was invisible work at open
         and a stray toolbar if the close path ever missed clearing it. */
      setManagedWidgetId("");
      setEditingWidgetId("");
      setSelectedWidgetId("");
      setPickerOpen(false);
      setRecapOpen(false);
      setChatOpen(false);
      setPhotoGallery({ widgetId: widget.id, origin, printOrigins });
      return;
    }

    if (widget.type === "shipPost") {
      if (focusedTarget) leaveFocus(false);
      playSound("tap");
      setManagedWidgetId("");
      setEditingWidgetId("");
      setSelectedWidgetId("");
      setPickerOpen(false);
      setRecapOpen(false);
      setChatOpen(false);
      setOpenRoom({ kind: "ship", widgetId: widget.id, origin: roomOriginFor(widget.id) });
      return;
    }

    if (window.matchMedia("(max-width: 800px)").matches) {
      playSound("tap");
      setManagedWidgetId("");
      setEditingWidgetId("");
      setSelectedWidgetId(widget.id);
      return;
    }

    if (focusedTarget?.kind === "widget" && focusedTarget.id === widget.id) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!canvasReturnView.current) {
      canvasReturnView.current = {
        scale: canvasScaleRef.current,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
    }
    if (chatReturnView.current === null) chatReturnView.current = chatOpen;

    playSound("tap");
    setManagedWidgetId("");
    setEditingWidgetId("");
    setPickerOpen(false);
    setRecapOpen(false);
    setChatOpen(false);
    setSelectedWidgetId(widget.id);
    setThreadDockPlacement("below");
    setFocusedTarget({
      kind: "widget",
      id: widget.id,
      type: widget.type,
      label: widgetLabel(widget),
    });
  }, [chatOpen, focusedTarget, leaveFocus]);

  const updateThreadDockSize = useCallback((size: ThreadDockSize) => {
    setThreadDockSize((current) =>
      Math.abs(current.width - size.width) < 1 &&
      Math.abs(current.height - size.height) < 1
        ? current
        : size,
    );
  }, []);

  useEffect(() => () => {
    window.cancelAnimationFrame(canvasCameraAnimation.current);
    canvasScaleLayerRef.current?.style.removeProperty("will-change");
  }, []);

  useLayoutEffect(() => {
    window.cancelAnimationFrame(canvasCameraAnimation.current);
    canvasScaleLayerRef.current?.style.removeProperty("will-change");
    setEditingWidgetId("");
    setSelectedWidgetId("");
    setManagedWidgetId("");
    setFocusedTarget(null);
    setThreadDockPlacement("below");
    canvasReturnView.current = null;
    chatReturnView.current = null;

    const viewport = viewportRef.current;
    const scale = viewport
      ? buildRoomOverviewScale(slug, viewport, overviewWidgetsRef.current)
      : 1;
    applyCanvasScale(scale);
    setCanvasScale(scale);
    viewport?.scrollTo({ left: 0, top: 0, behavior: "auto" });
  }, [applyCanvasScale, slug]);

  useEffect(() => {
    if (slug !== "buildroom" || focusedTarget) return;
    let frame = 0;
    const refitOverview = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const scale = buildRoomOverviewScale(
          slug,
          viewport,
          overviewWidgetsRef.current,
        );
        applyCanvasScale(scale);
        setCanvasScale(scale);
        viewport.scrollTo({ left: 0, top: 0, behavior: "auto" });
      });
    };
    window.addEventListener("resize", refitOverview);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refitOverview);
    };
  }, [applyCanvasScale, focusedTarget, slug]);

  useEffect(() => {
    if (!focusedTarget) return;
    const frame = window.requestAnimationFrame(() => refitFocusedTarget());
    return () => window.cancelAnimationFrame(frame);
  }, [focusedTarget, refitFocusedTarget]);

  useEffect(() => {
    if (!focusedTarget) return;
    let frame = 0;
    const refit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        refitFocusedTarget(CAMERA_EXIT_MS);
      });
    };
    window.addEventListener("resize", refit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refit);
    };
  }, [focusedTarget, refitFocusedTarget]);

  useEffect(() => {
    if (!focusedTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || editingWidgetId || pickerOpen) return;
      event.preventDefault();
      leaveFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingWidgetId, focusedTarget, leaveFocus, pickerOpen]);

  const openRecap = () => {
    setRecapCites([]);
    setRecapHover(null);
    setRecapRunId((id) => id + 1);
    setRecapOpen(true);
  };
  const closeRecap = () => {
    setRecapOpen(false);
    setRecapCites([]);
    setRecapHover(null);
  };
  useEffect(() => {
    recapGenerating.current = false;
  }, [space?._id]);
  useEffect(() => {
    if (latestRecap?._id) setRecapRunId((id) => id + 1);
  }, [latestRecap?._id]);
  const refreshRecap = () => {
    if (!space || recapBusy) return;
    recapGenerating.current = true;
    setRecapBusy(true);
    setRecapCites([]);
    void generateRecap({ spaceId: space._id, kind: "ask" }).finally(() => {
      recapGenerating.current = false;
      setRecapBusy(false);
    });
  };
  const revealRecap = (count: number) => {
    const widgetId = recapLines[count - 1]?.widgetId;
    if (!widgetId) return;
    setRecapCites((current) => [...current, widgetId]);
    playSound("place");
    if (count === 1) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-widget-id="${widgetId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      });
    }
  };
  const jumpToRecapMessage = (messageId: string) => {
    playSound("tap");
    closeRecap();
    setChatOpen(true);
    setHighlightMessageId(messageId);
    window.setTimeout(() => setHighlightMessageId(""), 2600);
  };
  const onRecapAsk = (text: string) => {
    handlers.onSend(RECAP_THREAD_ID, text);
    if (!space) return;
    setRecapAsking(true);
    void askRecap({ spaceId: space._id, question: text })
      .then((result) => {
        if (result.widgetId) {
          setRecapCites((current) => [...current, result.widgetId!]);
          requestAnimationFrame(() => {
            document
              .querySelector(`[data-widget-id="${result.widgetId}"]`)
              ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          });
        }
      })
      .finally(() => setRecapAsking(false));
  };

  const selectSpace = (id: string) => {
    if (focusedTarget) leaveFocus(false);
    playSound("tap");
    onSelectSpace?.(id);
  };

  const openWidgetPicker = () => {
    if (focusedTarget) leaveFocus(false);
    playSound("tap");
    setManagedWidgetId("");
    setEditingWidgetId("");
    setSpaceDraft(null);
    setChatOpen(false);
    setPickerOpen(true);
  };

  const openWidgetEditor = useCallback((widgetId: string) => {
    if (focusedTarget?.kind === "widget") leaveFocus(false);
    playSound("tap");
    setManagedWidgetId(widgetId);
    setEditingWidgetId(widgetId);
    setSpaceDraft(null);
    setPickerOpen(false);
    setChatOpen(false);
    setRecapOpen(false);
  }, [focusedTarget?.kind, leaveFocus]);

  const openSpaceEditor = () => {
    playSound("tap");
    setSpaceDraft({ ...customization });
    setManagedWidgetId("");
    setEditingWidgetId("");
    setPickerOpen(false);
    setChatOpen(false);
    setRecapOpen(false);
  };

  const saveSpace = (nextCustomization: SpaceCustomization) => {
    playSound("place");
    setCustomization(nextCustomization);
    setSpaceDraft(null);
  };

  const respondToRsvp = useCallback((widgetId: string, status: RsvpStatus) => {
    setRsvpSelections((current) => {
      if (current[widgetId] === status) return current;
      playSound("place");
      return { ...current, [widgetId]: status };
    });
  }, []);

  const answerDailyQuestion = useCallback((widgetId: string, text: string) => {
    playSound("place");
    setDailyAnswers((current) => ({ ...current, [widgetId]: text }));
  }, []);

  const reactToDailyAnswer = useCallback((widgetId: string, answerName: string, emoji: string) => {
    playSound("tap");
    setDailyReactions((current) => {
      const reactions = { ...(current[widgetId] ?? {}) };
      if (reactions[answerName] === emoji) delete reactions[answerName];
      else reactions[answerName] = emoji;
      return { ...current, [widgetId]: reactions };
    });
  }, []);

  const addWidget = async (type: WidgetType) => {
    const blueprint = getWidgetBlueprint(type);
    if (!blueprint || !space) return;
    const size = WIDGET_SIZES[type] ?? { w: blueprint.w, h: blueprint.h };
    const { id: _blueprintId, ...blueprintData } = blueprint;
    const widget: Omit<Widget, "id"> = {
      ...blueprintData,
      x: Math.max(24, canvasWidth - size.w - 48),
      y: Math.max(24, canvasHeight - size.h - 48),
      w: size.w,
      h: size.h,
      z: 1000,
      data: freshWidgetData(type, type === "linkCard" ? {} : blueprint.data),
    };
    const createdId = await handlers.onCreate(widget);
    setPickerOpen(false);
    if (type === "linkCard" && createdId) {
      setManagedWidgetId(String(createdId));
      setEditingWidgetId(String(createdId));
    }
  };

  const addSticker = async (stickerId: string) => {
    const sticker = getStickerDefinition(stickerId);
    if (!sticker || !space) return;

    const widget: Omit<Widget, "id"> = {
      type: "sticker",
      x: Math.max(24, canvasWidth - sticker.width - 48),
      y: Math.max(24, canvasHeight - sticker.height - 48),
      w: sticker.width,
      h: sticker.height,
      z: 1000,
      rotate: sticker.rotate,
      data: { stickerId },
    };
    const createdId = await handlers.onCreate(widget);
    if (createdId) setManagedWidgetId(String(createdId));
  };

  const hasBoard = status === "ready" || status === "cached" || status === "empty";
  const boardKey = `${slug}:${roomEntered ? "in" : "gate"}`;
  const canvasRecapCites = useMemo(
    () => recapHover
      ? [recapHover]
      : recapCites.concat(payoffFlashId ? [payoffFlashId] : []),
    [payoffFlashId, recapCites, recapHover],
  );
  const finishCanvasGesture = useCallback((widgetId: string, layout: CanvasLayout) => {
    handlers.onGestureEnd(widgetId, layout);
    if (focusedTarget?.id === widgetId) {
      window.requestAnimationFrame(() => refitFocusedTarget(CAMERA_EXIT_MS));
    }
  }, [focusedTarget?.id, handlers.onGestureEnd, refitFocusedTarget]);
  const deleteCanvasWidget = useCallback((widgetId: string) => {
    const widget = widgets.find((item) => item.id === widgetId);
    if (!widget) return;
    if (focusedTarget?.id === widgetId) leaveFocus(false);
    handlers.onDelete(widget);
  }, [focusedTarget?.id, handlers.onDelete, leaveFocus, widgets]);
  const finishCanvasFrameLayout = useCallback((widgetId: string) => {
    handlers.onFrameLayoutCommit(widgetId);
    if (focusedTarget?.kind === "frame" && focusedTarget.id === widgetId) {
      window.requestAnimationFrame(() => refitFocusedTarget(CAMERA_EXIT_MS));
    }
  }, [focusedTarget, handlers.onFrameLayoutCommit, refitFocusedTarget]);
  const ignorePromote = useCallback(() => {}, []);
  const spacePan = useCanvasSpacePan(
    viewportRef,
    gateOpen ||
      focusedTarget?.kind === "widget" ||
      canvasCameraAnimating ||
      pickerOpen ||
      Boolean(spaceDraft) ||
      Boolean(editingWidgetId) ||
      Boolean(photoGallery),
  );

  return (
    <main className={`paper-bg space-theme-${activeCustomization.theme} relative h-dvh overflow-hidden ${chatOpen ? "has-chat-open" : ""} ${spaceDraft ? "has-editor-open is-room-editing" : ""} ${gateOpen ? "has-entry-gate" : ""} ${photoGalleryWidget ? "has-photo-gallery" : ""} ${focusedTarget?.kind === "frame" ? "has-frame-focus" : ""} ${focusedTarget?.kind === "widget" ? "has-widget-focus" : ""} ${canvasCameraAnimating ? "is-canvas-camera-animating" : ""} ${canvasAwayFromHome ? "is-canvas-away" : ""} ${spacePan.panning ? "is-canvas-panning" : ""} ${spacePan.spaceHeld ? "is-space-panning" : ""}`} style={spaceCustomizationStyle(activeCustomization)} ref={wrapperRef} data-data-mode={mode} data-space-id={slug}>
      <Rail activeId={slug} onSelectSpace={selectSpace} onCreateClick={openWidgetPicker} />
      <SpaceHeader
        key={boardKey}
        spaceId={slug}
        spaceMeta={activeCustomization}
        spaceName={activeCustomization.name}
        roomEditing={Boolean(spaceDraft)}
        onEditSpace={openSpaceEditor}
        members={members}
        hereCount={hereCount}
        self={identity}
        onSelfClick={() => setClaimOpen(true)}
        livePeers={liveCursors}
        arrivalPeerId={arrivalPeer?.userId}
        inboxAddress={space?.inboxAddress}
        addOpen={pickerOpen}
        onAddClick={() => {
          if (pickerOpen) {
            playSound("tap");
            setPickerOpen(false);
          } else {
            openWidgetPicker();
          }
        }}
        entrance={roomEntered}
      />
      {focusedTarget && (
        <nav className="canvas-focus-hud" aria-label="Focused canvas item">
          <button
            type="button"
            className="canvas-focus-hud-back"
            onClick={() => leaveFocus()}
            aria-label={`Back to ${mockSpace.name}`}
            aria-keyshortcuts="Escape"
          >
            <span className="canvas-focus-hud-arrow" aria-hidden="true">←</span>
            <span className="canvas-focus-hud-space">{mockSpace.name}</span>
            <span className="canvas-focus-hud-separator" aria-hidden="true">/</span>
            <strong>{focusedTarget.label}</strong>
          </button>
          {focusedFrame && (
            <button
              type="button"
              className={`canvas-focus-hud-edit ${editingWidgetId === focusedFrame.id ? "is-active" : ""}`}
              onClick={() => openWidgetEditor(focusedFrame.id)}
              aria-pressed={editingWidgetId === focusedFrame.id}
            >
              <span aria-hidden="true">✎</span>
              edit frame
            </button>
          )}
        </nav>
      )}
      <div
        ref={viewportRef}
        className={`space-scroll h-full overflow-auto ${
          spacePan.panning ? "is-canvas-panning" : ""
        } ${spacePan.spaceHeld ? "is-space-panning" : ""}`}
        onScroll={(event) => {
          const el = event.currentTarget;
          setCanvasAwayFromHome(el.scrollLeft > 48 || el.scrollTop > 72);
          // Scroll-linked header fade: 0 at home → 1 by ~150px down / ~260px right.
          const fade = Math.min(1, Math.max(el.scrollTop / 150, el.scrollLeft / 260));
          el.parentElement?.style.setProperty("--header-scroll-fade", fade.toFixed(3));
        }}
      >
        <div
          ref={canvasStageRef}
          className="canvas-stage"
          style={{
            width: Math.ceil(canvasWidth * canvasScale),
            height: Math.ceil(canvasHeight * canvasScale),
          }}
        >
          <div
            ref={canvasScaleLayerRef}
            className="canvas-scale-layer"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${canvasScale})`,
            }}
          >
            {hasBoard ? (
              <Canvas
                key={boardKey}
                spaceId={slug}
                widgets={adaptedWidgets}
                cursors={liveCursors}
                members={members}
                selectedWidgetId={
                  focusedTarget?.kind === "widget"
                    ? focusedTarget.id
                    : selectedWidgetId
                }
                onWidgetSelect={focusWidgetThread}
                managedWidgetId={managedWidgetId}
                onWidgetManage={setManagedWidgetId}
                onGestureStart={handlers.onGestureStart}
                onGestureChange={handlers.onGestureChange}
                onGestureEnd={finishCanvasGesture}
                onLayoutCommit={handlers.onLayoutCommit}
                onWidgetDelete={deleteCanvasWidget}
                onWidgetEdit={openWidgetEditor}
                editingWidgetId={editingWidgetId}
                focusedTargetId={focusedTarget?.id ?? ""}
                focusedTargetKind={focusedTarget?.kind}
                canvasScale={canvasScale}
                onFrameFocus={focusFrame}
                onFrameLayoutChange={handlers.onFrameLayoutChange}
                onFrameLayoutCommit={finishCanvasFrameLayout}
                onPollVote={handlers.onVote}
                onWheelSpin={handlers.onWheelSpin}
                onPlaylistTune={handlers.onPlaylistTune}
                buildRoomFeed={buildRoomFeed}
                roundtableRepliesByWidget={roundtableRepliesByWidget}
                paintStrokesByWidget={paintStrokesByWidget}
                paintIdentity={identity}
                onPaintStroke={paintStroke}
                onPaintClear={clearPaintWidget}
                onPaintCursor={presence.reportZone}
                pollSelections={pollSelections}
                onRsvp={respondToRsvp}
                rsvpSelections={rsvpSelections}
                onDailyAnswer={answerDailyQuestion}
                dailyAnswers={dailyAnswers}
                onDailyReact={reactToDailyAnswer}
                dailyReactions={dailyReactions}
                localCommentCounts={commentCounts}
                onClaim={handlers.onClaim}
                claimantId={identity.userId}
                promoted={promotedMessageIds.size > 0}
                onPromote={ignorePromote}
                recapCites={canvasRecapCites}
                entrance={roomEntered}
                arrivalPeerId={arrivalPeer?.userId}
              />
            ) : (
              <div className="space-loading-field" aria-hidden="true" />
            )}
            {ghostLifecycle !== "hidden" && (
              <GhostCanvas spaceId={slug} phase={ghostLifecycle === "leaving" ? "leaving" : "in"} />
            )}
            {status === "empty" && (
              <div className="space-state-pill">nothing here yet — run: npx convex run seed:demo</div>
            )}
            {status === "missing" && (
              <div className="space-state-pill">this room doesn't exist</div>
            )}
          </div>
        </div>
      </div>
      {moreRight && <div className="canvas-edge-fade" aria-hidden="true" />}
      {showLoading && (
        <div className="space-loading-pill">
          <span className="space-loading-pill-dot" aria-hidden="true" />
          opening <em>{mockSpace.name}</em>…
        </div>
      )}
      {photoGalleryWidget && (
        <PhotoWallGallery
          key={photoGalleryWidget.id}
          widget={photoGalleryWidget}
          spaceName={activeCustomization.name}
          origin={photoGallery?.origin}
          printOrigins={photoGallery?.printOrigins}
          comments={photoGalleryComments}
          onComment={sendPhotoComment}
          onAddPhoto={addPhotoToWall}
          onClose={closePhotoGallery}
        />
      )}
      {openRoom?.kind === "pile" && pileWidget && (
        <ReadingRoom
          key={pileWidget.id}
          pileId={pileWidget.id}
          links={buildRoomLinks}
          replyCounts={buildRoomReplyCounts}
          messagesByThread={messagesByThread}
          faces={members}
          userId={identity.userId}
          origin={openRoom.origin}
          initialLinkId={pendingLinkId ?? undefined}
          onDrop={dropLinks}
          onVote={voteOnLink}
          onPin={pinLink}
          onKeep={keepTakeaway}
          onReply={handlers.onSend}
          onRetry={retryLink}
          onZone={presence.reportZone}
          onClose={closeRoom}
        />
      )}
      {openRoom?.kind === "ship" && shipRoomWidget && (
        <ShipRoom
          key={shipRoomWidget.id}
          widget={shipRoomWidget}
          replies={messagesByThread[shipRoomWidget.id] ?? []}
          origin={openRoom.origin}
          onReply={(text) => handlers.onSend(shipRoomWidget.id, text)}
          onAddImage={(file) => attachShipImage(shipRoomWidget.id, file)}
          onClose={closeRoom}
        />
      )}
      {activeThreadWidget && (
        <WidgetThreadDock
          viewportRef={viewportRef}
          widgetId={activeThreadWidget.id}
          widgetType={activeThreadWidget.type}
          label={widgetLabel(activeThreadWidget)}
          messages={activeThreadMessages}
          placement={threadDockPlacement}
          onSend={(text) => handlers.onSend(activeThreadKey, text)}
          onSizeChange={
            focusedTarget?.kind === "widget"
              ? updateThreadDockSize
              : undefined
          }
          topper={
            activeThreadQuestions.length > 0 ? (
              <LinkQuestionStrip
                questions={activeThreadQuestions}
                activeId={activeQuestion?.id ?? ""}
                counts={activeQuestionCounts}
                onPick={setActiveQuestionId}
              />
            ) : undefined
          }
          placeholder={activeQuestion ? "your take…" : undefined}
          emptyText={activeQuestion ? "No takes yet — go first." : undefined}
          actions={
            activeThreadWidget.type === "rsvp" ? (
              <div className="thread-rsvp-chips">
                <span>going?</span>
                {RSVP_CHOICES.map((choice) => (
                  <button
                    key={choice.status}
                    type="button"
                    className={
                      rsvpSelections[activeThreadWidget.id] === choice.status
                        ? "is-picked"
                        : ""
                    }
                    onClick={() =>
                      respondToRsvp(activeThreadWidget.id, choice.status)
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
      {gateOpen && <div className="entry-gate-scrim" aria-hidden="true" />}
      {isInvalidInvite ? (
        <div className="invalid-invite-card" role="alert">
          <span className="invalid-invite-mark" aria-hidden="true">↗</span>
          <span className="claim-card-kicker">invite link</span>
          <h2>this door doesn&apos;t open anymore</h2>
          <p>That space may have moved or been closed.</p>
          <a href="#/home" className="invalid-invite-back">back to the block →</a>
        </div>
      ) : (
        <ClaimCard
          open={gateOpen || claimOpen}
          variant={roomEntered ? "popover" : "gate"}
          onClose={roomEntered ? closeClaim : enterRoom}
          inviteContext={isInviteEntry ? {
            spaceName: mockSpace.name,
            spaceColor: mockSpace.color,
            memberNames: members.filter((member) => member.online).map((member) => member.name),
            presenceCount: members.filter((member) => member.online).length,
          } satisfies InviteContext : undefined}
        />
      )}
      <WidgetPicker
        open={pickerOpen}
        onAddSticker={addSticker}
        onAddWidget={addWidget}
        onClose={() => setPickerOpen(false)}
      />
      <WidgetEditorPanel
        widget={editingWidget}
        onClose={() => setEditingWidgetId("")}
        onSave={(widgetId, data, layout) => {
          handlers.onUpdate(widgetId, data);
          if (layout) handlers.onResize(widgetId, layout.w, layout.h);
          // A saved link gets OpenAI conversation starters; canned ones from
          // the editor hold the spot until the action lands.
          const saved = widgets.find((item) => item.id === widgetId);
          if (saved?.type === "linkCard" && typeof data.url === "string" && data.url) {
            void sparkQuestions({
              widgetId: widgetId as Id<"widgets">,
              title: String(data.title ?? ""),
              description: String(data.description ?? ""),
            }).catch(() => {});
          }
          setEditingWidgetId("");
        }}
        onResolveLink={handlers.onResolveLink}
        onDelete={(widgetId) => {
          const widget = widgets.find((item) => item.id === widgetId);
          if (widget) handlers.onDelete(widget);
          setEditingWidgetId("");
        }}
        onFrameLayoutChange={handlers.onFrameLayoutChange}
        onFrameLayoutCommit={(widgetId) => {
          handlers.onFrameLayoutCommit(widgetId);
          if (focusedTarget?.kind === "frame" && focusedTarget.id === widgetId) {
            window.requestAnimationFrame(() => refitFocusedTarget(CAMERA_EXIT_MS));
          }
        }}
      />
      <SpaceEditorPanel
        value={spaceDraft}
        onChange={setSpaceDraft}
        onClose={() => setSpaceDraft(null)}
        onSave={saveSpace}
      />
      {handlers.deleted && (
        <div className="widget-undo-toast" role="status">
          <span><strong>{String(handlers.deleted.data.title ?? handlers.deleted.type)}</strong> deleted</span>
          <button type="button" onClick={handlers.onUndoDelete}>undo</button>
        </div>
      )}
      {arrivalPeer && (
        <div className="arrival-toast" role="status" aria-live="polite">
          <MemberFace
            name={arrivalPeer.name}
            emoji={arrivalPeer.emoji}
            color={arrivalPeer.color}
            avatarUrl={arrivalPeer.avatarUrl}
            size="sm"
            className="is-new-arrival"
          />
          <strong>{arrivalPeer.name} just walked in</strong>
        </div>
      )}
      <GlobalChatPanel
        spaceId={slug}
        open={chatOpen}
        activeThreadId="global"
        onToggle={() => { playSound("tap"); setChatOpen((open) => !open); }}
        onThreadChange={() => {}}
        onSendMessage={() => {}}
        title={activeCustomization.name}
        messages={globalMessages}
        onSend={(text) => handlers.onSend("global", text)}
        onPromote={promotable ? () => handlers.onPromote(promotable.id, promotePosition.x, promotePosition.y) : undefined}
        promoted={Boolean(promotable && promotedMessageIds.has(promotable.id))}
        highlightMessageId={highlightMessageId}
      />
      <ActionDock
        recapOpen={recapOpen}
        recapRunId={recapRunId}
        recapLines={recapLines}
        recapSince={recapSince}
        recapTurns={recapTurns}
        recapLoading={recapBusy || (recapOpen && latestRecap === undefined)}
        recapAsking={recapAsking}
        recapCached={latestRecap != null}
        recapTurnsReady={allMessages !== undefined}
        onRecapRefresh={refreshRecap}
        onRecapAsk={onRecapAsk}
        onRecapReveal={revealRecap}
        onRecapClose={closeRecap}
        onRecapHover={setRecapHover}
        onRecapJump={jumpToRecapMessage}
        chatOpen={chatOpen}
        messageCount={globalMessages.length}
        soundEnabled={soundEnabled}
        onRecapToggle={() => {
          playSound("tap");
          if (recapOpen) closeRecap();
          else {
            if (focusedTarget?.kind === "widget") leaveFocus(false);
            setChatOpen(false);
            openRecap();
          }
        }}
        onChatToggle={() => {
          if (focusedTarget?.kind === "widget") {
            leaveFocus(false);
            playSound("tap");
            setChatOpen(true);
            return;
          }
          playSound("tap");
          setChatOpen((open) => !open);
        }}
        onSoundToggle={() => {
          const next = !soundEnabled;
          setSound(next);
          setSoundEnabled(next);
          if (next) playSound("tap");
        }}
      />
    </main>
  );
}
