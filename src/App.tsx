import { myPartFor, readCheckIn, withLog } from "./lib/challenge";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionDock, radioRoomOf } from "./components/ActionDock";
import { Canvas, SpaceHeader } from "./components/Canvas";
import { CanvasEdgePan } from "./components/CanvasEdgePan";
import type { CanvasPoint } from "./components/FirstRunSticky";
import { GlobalChatPanel } from "./components/GlobalChatPanel";
import { Rail } from "./components/Rail";
import { SettingsSheet } from "./components/SettingsSheet";
import { MePage } from "./pages/Me";
import { useIdentity as useTabIdentity } from "./live/identity";
import { blobToDataUrl } from "./lib/avatarPhoto";
import { SpaceEditorPanel } from "./components/SpaceEditorPanel";
import {
  WidgetThreadDock,
  type ThreadDockPlacement,
  type ThreadDockSize,
} from "./components/WidgetThreadDock";
import { WidgetPicker } from "./components/WidgetPicker";
import type { PlacingItem } from "./components/PlacementGhost";
import { WidgetEditorPanel } from "./components/WidgetEditorPanel";
import { WelcomePill } from "./components/WelcomePill";
import {
  getGlobalThread,
  getThread,
  getThreadsForSpace,
  type ChatMessage,
} from "./data/chat";
import { RECAP_LINES, type RecapTurn } from "./data/recap";
import { DECISION_WIDGET, SPACES, SPACES_BY_ID, canvasSizeFor, getSpace, getWidgets } from "./data/spaces";
import { createLabPeerFeed, labPeersRequested } from "./live/labPeers";
import { dealDemo, deckLabRequested } from "./lib/deck/lab";
import { mockDeal } from "./lib/deck/mockDeal";
import { mockFacts } from "./lib/deck/mockFacts";
import type { MineAct } from "./lib/deck/verbs";
import { offersFor } from "./lib/deck/suggest";
import { setVoiceStageBoard, setVoiceStageOffers } from "./lib/voiceStage";
import { beat } from "./lib/voiceTimings";
import { boardItems } from "./lib/deck/existing";
import { useVoiceBuild } from "./live/useVoiceBuild";
import { EditSlips, VoiceBuildLayer } from "./components/VoiceBuildLayer";
import { HeldBack, RowGhosts, RowHalos, withGhosts } from "./components/RightOfWay";
import { useRowMock } from "./lib/rowMock";
import {
  MAIL_LAB_CAKE_ID,
  MAIL_LAB_HIDDEN,
  mailLabCakeCard,
  mailLabCakeSplit,
} from "./lib/mailLabCake";
import { MailArrival, type LabHooks } from "./components/MailArrival";
import { MOCK_MAIL_DECIDE_MS } from "./lib/mailArrival";
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
import { panToWidget, recapTargetsOf } from "./lib/recapBoard";
import {
  freshWidgetData,
  getWidgetBlueprint,
  WIDGET_SIZES,
} from "./lib/widgetDefaults";
import { widgetSupportsThread } from "./lib/widgetThreads";
import { linkCardQuestions, questionThreadId } from "./lib/linkQuestions";
import { LinkQuestionStrip } from "./components/LinkQuestionStrip";
import { LiveSpacePage } from "./pages/LiveSpace";
import { RoomKnowsDoor, RoomKnowsPage, type KnowsChange } from "./components/RoomKnows";
import { standing, type RoomKnows } from "./lib/roomKnows";
import { mockRoomKnows } from "./data/roomKnows";
import { getDataMode } from "./live/dataMode";
import { getIdentity } from "./live/identity";
import { useCanvasSpacePan } from "./lib/canvasSpacePan";
import {
  buildRoomOverviewScale,
  keeperNoteSlot,
  withBuildRoomCover,
} from "./lib/buildRoomPresentation";
import { flushSync } from "react-dom";
import { flyWidgetIn } from "./lib/flipLanding";
import { DEFAULT_SPACE_SLUG, knowsHash, lastSpaceSlug, normalSpaceHash, rememberSpaceSlug, slugOfSpaceHash } from "./lib/routes";
import { pileInsideFrame, widgetIsInsideFrame } from "./lib/frameMembership";
import {
  linkReplyCounts,
  mockBuildRoomFeed,
  mockRoundtableReplies,
  toggledVoters,
} from "./lib/buildRoomFeed";
import { ReadingRoom, type RoomReply } from "./components/ReadingRoom";
import { ShipRoom } from "./components/ShipRoom";
import type { RoomOrigin } from "./components/CanvasRoom";
import type { BuildRoomLink } from "./data/buildroom";
import { pendingLinkRows, scheduleMockResolve } from "./lib/mockArrival";
import { YourTurn, goToTurnWidget } from "./components/YourTurn";
import { GameInvite, GameSheet, GameSheetTab, GamesDev } from "./components/games/GameInvite";
import { gameSpots, GAME_CARD } from "./lib/games/place";
import { GAME_WIDGET_ID, GamesProvider, KEEPSAKE_WIDGET_ID, SCOREBOARD_WIDGET_ID, useMockGames, type CastPerson } from "./lib/games/useMockGames";
import { KEEPSAKE_SPOTS, hasGames } from "./data/games";
import { JigsawDev, JigsawInvite, JigsawSheet, JigsawWorld } from "./components/games/Jigsaw";
import { JigsawProvider, useMockJigsaw, withJigsaw, JIGSAW_WIDGET_ID } from "./lib/jigsaw/useMockJigsaw";
import { hasJigsaw, ROOM_JIGSAW } from "./data/jigsaw";
import { gameAsk } from "./lib/deck/verbs";
import { mockViewer, mockWaitingByRoom, playAsOverrides, yourTurn } from "./lib/yourTurn";

const CursorLab = lazy(() =>
  import("./pages/CursorLab").then((module) => ({ default: module.CursorLab })),
);
const WidgetLab = lazy(() =>
  import("./pages/WidgetLab").then((module) => ({ default: module.WidgetLab })),
);
const ArrivalLab = lazy(() =>
  import("./pages/ArrivalLab").then((module) => ({ default: module.ArrivalLab })),
);
const ColorLab = lazy(() =>
  import("./pages/ColorLab").then((module) => ({ default: module.ColorLab })),
);
const MailReel = lazy(() =>
  import("./pages/MailReel").then((module) => ({ default: module.MailReel })),
);
const CodexReel = lazy(() =>
  import("./pages/CodexReel").then((module) => ({ default: module.CodexReel })),
);
const FirecrawlReel = lazy(() =>
  import("./pages/FirecrawlReel").then((module) => ({ default: module.FirecrawlReel })),
);
const Outro = lazy(() =>
  import("./pages/Outro").then((module) => ({ default: module.Outro })),
);
const Admin = lazy(() =>
  import("./pages/Admin").then((module) => ({ default: module.Admin })),
);
const WidgetWall = lazy(() =>
  import("./pages/WidgetWall").then((module) => ({ default: module.WidgetWall })),
);
const Welcome = lazy(() => import("./pages/Welcome"));
const AboutPage = lazy(() =>
  import("./pages/About").then((module) => ({ default: module.About })),
);

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

type Route = "space" | "me" | "about" | "cursors" | "widgets" | "arrival" | "color" | "bothways" | "outro" | "codex" | "firecrawl" | "wall" | "live" | "join" | "test" | "admin";
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
  width: 680,
  height: 540,
};

function defaultCanvasSize(spaceId: string): CanvasSize {
  return canvasSizeFor(spaceId);
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

/** The on-screen rect of a canvas card, as inset from each viewport edge. */
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

function routeFromHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "test") return "test";
  if (hash === "about" || hash.startsWith("about/")) return "about";
  if (hash === "me") return "me";
  if (hash === "join" || hash.startsWith("join/")) return "join";
  if (hash === "live" || hash.startsWith("live/")) return "live";
  if (hash === "cursors" || hash.startsWith("cursors/")) return "cursors";
  if (hash === "widgets" || hash.startsWith("widgets/")) return "widgets";
  if (hash === "arrival") return "arrival";
  if (hash === "color") return "color";
  if (hash === "bothways") return "bothways";
  if (hash === "outro") return "outro";
  if (hash === "codex") return "codex";
  if (hash === "firecrawl") return "firecrawl";
  if (hash === "wall") return "wall";
  // Linked from nowhere and gated on ADMIN_KEY server-side (convex/admin.ts).
  if (hash === "admin") return "admin";
  return "space";
}

function mockModeRequested() {
  return getDataMode() === "mock";
}

/** A readable title for a mock-dropped url: the last path segment, de-slugged. */
function demoModeRequested() {
  return new URLSearchParams(window.location.search).get("demo") === "1" ||
    new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("demo") === "1" ||
    import.meta.env.VITE_DEMO === "1";
}

/** `#/mail` (the crew) or `#/mail/<slug>` — the mail arrival lab
    (docs/mail-arrival.md): not a page of its own but the real space with
    fixtures fired at it, mock or live. */
function mailLabRequested() {
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return hash === "mail" || hash.startsWith("mail/");
}

/** `#/play` — the play lab (docs/local/play-lab.md): a disposable copy of
    the crew (slug "play") with a director pill that runs the demo video's
    opening take. Unlisted. Only ever this slug, so the pill can never drop
    onto a real room. */
function playLabRequested() {
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return hash === "play";
}

function spaceFromHash(): string {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "home") return "crew";
  if (hash === "mail") return "crew";
  if (hash.startsWith("mail/")) return hash.slice("mail/".length) || "crew";
  if (hash.split("?")[0] === "play") return "play";
  // #/about is its own page, but it keeps a back door to the room you came
  // from, and spaceId has to still be that room when you take it.
  if (hash === "about" || hash.startsWith("about/")) return lastSpaceSlug();
  if (hash.startsWith("space/")) {
    const slug = slugOfSpaceHash(hash.slice("space/".length)) || DEFAULT_SPACE_SLUG;
    rememberSpaceSlug(slug);
    return slug;
  }
  if (hash === "join") return "__invalid_invite__";
  if (hash.startsWith("join/")) {
    const slug = hash.slice("join/".length);
    try {
      return decodeURIComponent(slug) || "__invalid_invite__";
    } catch {
      return slug || "__invalid_invite__";
    }
  }
  return DEFAULT_SPACE_SLUG;
}

/**
 * Look prototype — crew + league canvases, widget picker, cursor lab.
 * Hash routes: #/space/buildroom · #/space/crew · #/about · #/cursors · #/widgets
 * Old #/home and bare #/ links redirect to the crew.
 */
export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [spaceId, setSpaceId] = useState(spaceFromHash);
  const demoMode = demoModeRequested();
  /* `?peers=4` — the peers lab (src/live/labPeers.ts): the roster's online
     members get a cursor each and move like people do, for the demo video's
     "always live" beat. Mock only; nothing is written anywhere. */
  const labPeers = useMemo(() => {
    const wanted = labPeersRequested();
    if (!wanted || !mockModeRequested()) return null;
    return createLabPeerFeed(getSpace(spaceId).members, getWidgets(spaceId), wanted);
  }, [spaceId]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tabIdentity = useTabIdentity();
  /* What this space knows, mock: fixture lines (data/roomKnows.ts) plus the
     corrections made on this screen, per room. Nothing is stored. */
  const [mockKnowsEdits, setMockKnowsEdits] = useState<Record<string, Pick<RoomKnows, "told" | "forgot">>>({});
  const correctMockKnows = (change: KnowsChange) =>
    setMockKnowsEdits((all) => {
      const { told, forgot } = all[spaceId] ?? mockRoomKnows(spaceId, "");
      const who = { by: tabIdentity.name, color: tabIdentity.color, at: Date.now() };
      const next =
        change.kind === "tell"
          ? { told: [...told, { id: `t${who.at}`, text: change.text, ...who }], forgot }
          : change.kind === "untell"
            ? { told: told.filter((t) => t.id !== change.id), forgot }
            : change.kind === "forget"
              ? { told, forgot: [...forgot, { key: change.key, text: change.text, ...who }] }
              : { told, forgot: forgot.filter((f) => f.key !== change.key) };
      return { ...all, [spaceId]: next };
    });
  // Whatever you picked off the tray, riding the cursor until you click it down.
  const [placing, setPlacing] = useState<PlacingItem | null>(null);
  const [placingOrigin, setPlacingOrigin] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const [chatOpen, setChatOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapRunId, setRecapRunId] = useState(0);
  const [recapCites, setRecapCites] = useState<string[]>([]);
  const [recapHover, setRecapHover] = useState<string | null>(null);
  const [recapTurns, setRecapTurns] = useState<RecapTurn[]>([]);
  const [recapAsking, setRecapAsking] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState("");
  const [activeThreadId, setActiveThreadId] = useState("global");
  /** Mock-mode room state: which room is open, and local vote/keep overrides. */
  const [openRoom, setOpenRoom] = useState<
    { kind: "pile" | "ship"; widgetId: string; origin: RoomOrigin; linkId?: string } | null
  >(null);
  /* focusFrame fires long before visibleWidgets is derived — read it live. */
  const visibleWidgetsRef = useRef<Widget[]>([]);
  const [mockLinkState, setMockLinkState] = useState<
    Record<string, Partial<BuildRoomLink>>
  >({});
  /* Links dropped in mock mode — pending on arrival, "enriched" a beat later. */
  const [mockDropped, setMockDropped] = useState<BuildRoomLink[]>([]);
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
  /* `?deck=4` — the deck lab (src/lib/deck/lab.ts): a canned answer dealt
     through parseDeal → applyCard → placeCards into the view you're looking at. */
  useEffect(() => {
    const lab = mockModeRequested() ? deckLabRequested() : null;
    if (!lab) return;
    const timer = window.setTimeout(() => {
      const scroller = canvasViewportRef.current;
      const canvas = scroller?.querySelector<HTMLElement>(".space-canvas");
      if (!scroller || !canvas) return;
      const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth || 1;
      const c = canvas.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const dockTop = document.querySelector(".action-dock")?.getBoundingClientRect().top ?? s.bottom;
      const left = Math.max(s.left, c.left);
      const top = Math.max(s.top, c.top);
      const view = {
        x: (left - c.left) / scale,
        y: (top - c.top) / scale,
        w: (Math.min(s.right, window.innerWidth) - left) / scale,
        h: (Math.min(s.bottom, dockTop) - top) / scale,
      };
      // The board as drawn: tilt and content-grown heights included.
      const board = Array.from(canvas.querySelectorAll<HTMLElement>("[data-widget-id]"), (el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.widgetId ?? "", x: (r.left - c.left) / scale, y: (r.top - c.top) / scale, w: r.width / scale, h: r.height / scale };
      });
      const people = getSpace(spaceId).members.map((m) => m.name);
      const dealt = dealDemo(
        lab,
        { by: people[0] ?? "You", people, today: new Date().toISOString().slice(0, 10) },
        board,
        view,
        { x: 0, y: 0, w: canvasSizeFor(spaceId).width, h: canvasSizeFor(spaceId).height },
      );
      setAddedWidgets((current) => ({ ...current, [spaceId]: dealt }));
      // If the cluster landed outside the view, bring the camera to it.
      // Two frames later, so the new cards already extend the scroll area.
      const cardTop = Math.min(...dealt.map((w) => w.y));
      const cardLeft = Math.min(...dealt.map((w) => w.x));
      if (dealt.length && (cardTop < view.y || cardTop > view.y + view.h - 120 || cardLeft > view.x + view.w - 120)) {
        requestAnimationFrame(() => requestAnimationFrame(() => scroller.scrollTo({
          left: scroller.scrollLeft + (cardLeft - view.x - 24) * scale,
          top: scroller.scrollTop + (cardTop - view.y - 24) * scale,
        })));
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [spaceId]);
  const [widgetPlacements, setWidgetPlacements] = useState<
    Record<string, Record<string, WidgetPlacement>>
  >({});
  const [widgetDataOverrides, setWidgetDataOverrides] = useState<
    Record<string, Record<string, Widget["data"]>>
  >({});
  /** Which web post conversation starter the thread dock is answering. */
  const [activeQuestionId, setActiveQuestionId] = useState("");
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
  useEffect(() => {
    setActiveQuestionId("");
  }, [focusedTarget?.id]);
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
  /* A voice ask in mock mode: no backend, so a stand-in (lib/deck/mockDeal.ts)
     answers from the words on the measured clock and the room runs the real guess/skeleton/apply/place path on it. */
  const voiceMaker = getIdentity();
  const voiceCtx = () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const members = getSpace(spaceId).members;
    const people = [voiceMaker.name, ...members.map((m) => m.name)];
    return { by: voiceMaker.name, people: [...new Set(people)], today: iso, colors: Object.fromEntries(members.map((m) => [m.name, m.color])) };
  };
  // The room's facts, read off the mock board: the real route/resolve path runs on them.
  const voiceFacts = () => {
    const ctx = voiceCtx();
    // the room's people are its cast, as the live brief has them (a visitor isn't "the four of us")
    const cast = getSpace(spaceId).members.map((m) => m.name);
    return mockFacts({ room: getSpace(spaceId).name, widgets: visibleWidgetsRef.current, people: cast.length ? cast : ctx.people, today: ctx.today });
  };
  // What the room can offer for a card named with nothing in it (the voice stage asks).
  setVoiceStageOffers((card) => offersFor(voiceFacts(), card));
  setVoiceStageBoard((id) => visibleWidgetsRef.current.find((widget) => widget.id === id));
  // the mock writes, defined further down, for the voice router
  const voiceVerbRef = useRef<{ recap: () => void; act: (a: MineAct) => void; game: (said: string) => string }>({ recap: () => {}, act: () => {}, game: () => "" });
  const voiceBuild = useVoiceBuild({
    scrollerRef: canvasViewportRef,
    cardContext: voiceCtx,
    facts: voiceFacts,
    // "i did 40" (mock): the speaker's seat on the check-in, stored like a tap
    myPart: (said) => {
      const seat = new URLSearchParams(window.location.search).get("as") ?? voiceMaker.name;
      const mine = myPartFor(said, visibleWidgetsRef.current as never, seat);
      if (!mine) return null;
      const w = visibleWidgetsRef.current.find((x) => x.id === mine.widgetId);
      if (w) storeWidgetData(w.id, withLog(readCheckIn(w.data), mine.name, mine.day, mine.value) as unknown as Widget["data"]);
      return { item: { id: mine.widgetId, card: "checkin", title: mine.title, by: null }, text: `logged ${mine.value} for you · ${mine.title}` };
    },
    /* The other verbs in mock: answers from the mock board's facts are the
       real code path; there is no retrieval (the slip says stand-in), and
       do-my-part writes the mock overrides a tap would. */
    verbs: {
      widgets: () => visibleWidgetsRef.current as never,
      me: () => ({ name: new URLSearchParams(window.location.search).get("as") ?? voiceMaker.name }),
      people: () => getSpace(spaceId).members.map((m) => m.name),
      rooms: () => SPACES.map((sp) => ({ slug: sp.id, name: sp.name })),
      here: () => spaceId,
      frameOf: (w) => {
        const all = visibleWidgetsRef.current;
        const me = all.find((x) => x.id === w.id);
        const frame = me ? all.find((fr) => fr.type === "frame" && widgetIsInsideFrame(me, fr)) : undefined;
        return frame ? String(frame.data.title ?? "").toLowerCase() : "";
      },
      recap: () => voiceVerbRef.current.recap(),
      goRoom: (to) => {
        window.location.hash = normalSpaceHash(to);
      },
      goKnows: () => {
        window.location.hash = knowsHash(spaceId);
      },
      act: (a) => voiceVerbRef.current.act(a),
      game: (said) => voiceVerbRef.current.game(said),
    },
    deal: async (call, onPartial) => {
      // `?voiceHold=1` keeps the skeleton up for a still (drive voice-build:shell).
      if (new URLSearchParams(window.location.search).has("voiceHold")) await new Promise(() => {});
      // Simulated on the measured clock (lib/deck/mockDeal.ts): no model runs.
      const answer = await mockDeal(call, onPartial);
      return { dealId: null, model: null, context: null, answer, error: null };
    },
    /* "Already here" in mock: no model to ask, so code's match alone stands
       in (the drawer says so). */
    board: () => boardItems([...getSpace(spaceId).widgets, ...(addedWidgets[spaceId] ?? [])]),
    commit: async ({ cards }) => {
      await new Promise((r) => setTimeout(r, beat("commit")));
      const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      // a recipe's link, applied here as convex/links.ts does live (only "always" + "id" in mock)
      const dealt = cards.map((c, i) => ({ ...c.widget, id: `voice-standin-${stamp}-${i}`, ...(c.link?.value === "id" ? { data: { ...c.widget.data, [c.link.fill]: c.link.from } } : {}) }));
      setAddedWidgets((current) => ({ ...current, [spaceId]: [...(current[spaceId] ?? []), ...dealt] }));
      return dealt.map((w) => w.id);
    },
  });
  // a voice ask tucks catch me up (and its tickets) away: the card it builds lands where the panel was
  const voiceHooks = useMemo(
    () => ({ ...voiceBuild.voice, start: () => { setRecapOpen(false); voiceBuild.voice.start?.(); } }),
    [voiceBuild.voice],
  );
  const voiceAddedWidgets = useMemo(
    () => voiceBuild.withDrafts(addedWidgets[spaceId] ?? []),
    [voiceBuild.withDrafts, addedWidgets, spaceId],
  );
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
      const stageMargin = canvasStageRef.current
        ? cssPixels(window.getComputedStyle(canvasStageRef.current).marginLeft)
        : 0;
      const paddingLeft = cssPixels(viewportStyles.paddingLeft) + stageMargin;
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

      /* The pile's frame has nothing to zoom into — opening it opens the room. */
      const pile = pileInsideFrame(frame, visibleWidgetsRef.current);
      if (pile) {
        playSound("tap");
        setOpenRoom({
          kind: "pile",
          widgetId: pile.id,
          origin: roomOriginFor(pile.id),
        });
        return;
      }

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

  useEffect(() => {
    preloadSounds();
  }, []);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (hash === "home" || hash === "") {
        const slug = hash === "home" ? "crew" : DEFAULT_SPACE_SLUG;
        window.history.replaceState(window.history.state, "", normalSpaceHash(slug));
      }
      setRoute(routeFromHash());
      setSpaceId(spaceFromHash());
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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

  useLayoutEffect(() => {
    window.cancelAnimationFrame(canvasCameraAnimation.current);
    canvasCameraAnimation.current = 0;
    canvasScaleLayerRef.current?.style.removeProperty("will-change");
    const nextSize = defaultCanvasSize(spaceId);
    canvasWorldSizeRef.current = nextSize;
    canvasReturnView.current = null;
    chatReturnView.current = null;
    setCanvasWorldSize(nextSize);
    setFocusedTarget(null);
    setCanvasCameraAnimating(false);

    const viewport = canvasViewportRef.current;
    const scale = viewport
      ? buildRoomOverviewScale(spaceId, viewport, visibleWidgetsRef.current)
      : 1;
    applyCanvasScale(scale);
    setCanvasScale(scale);
    viewport?.scrollTo({ left: 0, top: 0 });
    setCanvasAwayFromHome(false);
  }, [applyCanvasScale, route, spaceId]);

  useEffect(() => {
    if (route !== "space" || spaceId !== "buildroom" || focusedTarget) return;
    let frame = 0;
    const refitOverview = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const viewport = canvasViewportRef.current;
        if (!viewport) return;
        const scale = buildRoomOverviewScale(
          spaceId,
          viewport,
          visibleWidgetsRef.current,
        );
        applyCanvasScale(scale);
        setCanvasScale(scale);
        viewport.scrollTo({ left: 0, top: 0, behavior: "auto" });
        setCanvasAwayFromHome(false);
      });
    };
    window.addEventListener("resize", refitOverview);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refitOverview);
    };
  }, [applyCanvasScale, focusedTarget, route, spaceId]);

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
    window.location.hash = normalSpaceHash(id);
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

  // Mock has no backend to make a space in, so the rail's "+" opens the
  // widget picker too. Live mounts SpaceMaker (LiveSpace.tsx).
  const openPicker = () => {
    if (focusedTarget) leaveFocus(false);
    playSound("tap");
    setPlacing(null);
    setManagedWidgetId("");
    setEditingWidgetId("");
    setSpaceDraft(null);
    setChatOpen(false);
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

  // Picking from the tray doesn't place anything — it puts the thing in your
  // hand. `placeItem` runs when you click the board, at that exact point.
  const addWidget = (type: WidgetType, origin?: { x: number; y: number }) => {
    if (!getWidgetBlueprint(type)) return;
    playSound("tap");
    setPlacing({ kind: "widget", type });
    setPlacingOrigin(origin);
  };

  const addSticker = (stickerId: string, origin?: { x: number; y: number }) => {
    if (!getStickerDefinition(stickerId)) return;
    playSound("tap");
    setPlacing({ kind: "sticker", stickerId });
    setPlacingOrigin(origin);
  };

  const placeItem = (point: CanvasPoint, keepPlacing: boolean) => {
    if (!placing) return;
    if (!keepPlacing) setPlacing(null);

    if (placing.kind === "sticker") {
      const sticker = getStickerDefinition(placing.stickerId);
      if (!sticker) return;
      addWidgetAt(
        "sticker",
        point,
        { stickerId: sticker.id },
        { w: sticker.width, h: sticker.height },
      );
      return;
    }

    const type = placing.type;
    const addedWidget = addWidgetAt(
      type,
      point,
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

  /* a card that keeps its own state (check-in logs) */
  const storeWidgetData = useCallback((widgetId: string, data: Widget["data"]) => {
    setWidgetDataOverrides((current) => ({
      ...current,
      [spaceId]: { ...(current[spaceId] ?? {}), [widgetId]: data },
    }));
  }, [spaceId]);

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

  /* "your turn" does these two from its pile; the cards read the same data. */
  const patchWidgetData = (widgetId: string, patch: (data: Widget["data"]) => Widget["data"]) => {
    setWidgetDataOverrides((current) => ({
      ...current,
      [spaceId]: {
        ...(current[spaceId] ?? {}),
        [widgetId]: patch(
          current[spaceId]?.[widgetId] ??
            getSpace(spaceId).widgets.find((widget) => widget.id === widgetId)?.data ??
            {},
        ),
      },
    }));
  };

  const claimSlot = (widgetId: string, itemName: string) => {
    playSound("place");
    const by = mockViewer(getSpace(spaceId).members.map((member) => member.name)).name;
    patchWidgetData(widgetId, (data) => ({
      ...data,
      items: (Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : []).map((item) =>
        item.name !== itemName
          ? item
          : item.byUserId === "you"
            ? { ...item, claimed: false, by: null, byUserId: undefined }
            : { ...item, claimed: true, by, byUserId: "you" },
      ),
    }));
  };

  const addMyDays = (widgetId: string, dayIndex: number) => {
    playSound("place");
    const name = mockViewer(getSpace(spaceId).members.map((member) => member.name)).name;
    patchWidgetData(widgetId, (data) => ({
      ...data,
      members: [
        ...(Array.isArray(data.members) ? data.members : []),
        { name, slots: (Array.isArray(data.days) ? data.days : []).map((_, index) => index === dayIndex) },
      ],
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

  voiceVerbRef.current = {
    ...voiceVerbRef.current,
    recap: () => openRecap(),
    act: (a) => {
      if (a.kind === "rsvp") respondToRsvp(a.widgetId, a.status);
      else if (a.kind === "vote") voteOnPoll(a.widgetId, a.optionId);
      else claimSlot(a.widgetId, a.item);
    },
  };
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

    if (count === 1) requestAnimationFrame(() => panToWidget(widgetId));
  }, []);

  const mockRecapReply = (text: string) => {
    const q = text.toLowerCase();
    if (/(cake|poll|vote|flavor|matcha)/.test(q)) return "matcha is still ahead, 3 to 1. ash hasn't voted.";
    if (/(potluck|bring|claim|balloon)/.test(q)) return "jules claimed balloons, so playlist and candles are still open.";
    if (/(rsvp|coming|who)/.test(q)) return "maya, jules, sam, and kenji are in. rio's the maybe.";
    if (/(chat|6pm|time|when)/.test(q)) return "sam said 6pm at their place — still only in chat.";
    return "the birthday cluster moved: cake poll, potluck, and sam's 6pm note in chat.";
  };

  const onMockRecapAsk = (text: string) => {
    // Same persisted persona live mode shows, so the face matches everywhere.
    const me = getIdentity();
    const you: RecapTurn = {
      id: `you-${Date.now()}`,
      from: me.name,
      fromColor: me.color,
      fromEmoji: me.emoji,
      fromAvatarUrl: me.avatarUrl,
      text,
      isRecap: false,
    };
    setRecapTurns((current) => [...current, you]);
    setRecapAsking(true);
    window.setTimeout(() => {
      setRecapTurns((current) => [
        ...current,
        {
          id: `recap-${Date.now()}`,
          from: "catch me up",
          text: mockRecapReply(text),
          isRecap: true,
        },
      ]);
      setRecapAsking(false);
    }, 700);
  };

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

  const spacePan = useCanvasSpacePan(
    canvasViewportRef,
    route !== "space" ||
      firstRunActive ||
      focusedTarget?.kind === "widget" ||
      canvasCameraAnimating ||
      pickerOpen ||
      Boolean(editingWidgetId) ||
      Boolean(spaceDraft),
  );

  /* Mock-mode derived state. These are hooks, so they must run on EVERY
     render — including the lab/home routes that return early below.
     Leaving them under the early returns changed the hook count between
     renders and React tore the whole tree down (blank page). */
  const currentLocalMessages = localThreadMessages[spaceId] ?? {};
  /* Mock mode gets the same rooms, with votes and keeps held in local state —
     the live path persists them into the pile widget instead. */
  const baseFeed = mockBuildRoomFeed(spaceId);
  const mockLinks = useMemo<BuildRoomLink[]>(
    () =>
      [...mockDropped, ...(baseFeed?.links ?? [])].map((link) => {
        const state = mockLinkState[link.id];
        return withBuildRoomCover(state ? { ...link, ...state } : link);
      }),
    [baseFeed?.links, mockDropped, mockLinkState],
  );
  const mockReplyCounts = useMemo(() => {
    const counts: Record<string, number> = { ...(baseFeed ? {} : {}) };
    for (const [threadId, list] of Object.entries(currentLocalMessages)) {
      counts[threadId] = (counts[threadId] ?? 0) + list.length;
    }
    for (const [threadId, count] of Object.entries(
      Object.fromEntries(
        Object.entries(getThreadsForSpace(spaceId)).map(([id, thread]) => [
          id,
          thread.messages.length,
        ]),
      ),
    )) {
      counts[threadId] = (counts[threadId] ?? 0) + count;
    }
    return linkReplyCounts(counts);
  }, [baseFeed, currentLocalMessages, spaceId]);
  const mockMessagesByThread = useMemo(() => {
    const grouped: Record<string, RoomReply[]> = {};
    for (const [threadId, thread] of Object.entries(getThreadsForSpace(spaceId))) {
      grouped[threadId] = thread.messages.map((message) => ({
        id: message.id,
        from: message.from,
        color: message.fromColor,
        text: message.text,
        time: message.time,
      }));
    }
    for (const [threadId, list] of Object.entries(currentLocalMessages)) {
      grouped[threadId] = [
        ...(grouped[threadId] ?? []),
        ...list.map((message) => ({
          id: message.id,
          from: message.from,
          color: message.fromColor,
          text: message.text,
          time: message.time,
        })),
      ];
    }
    return grouped;
  }, [currentLocalMessages, spaceId]);
  /* Right of Way, mock: a scripted second person holding a card (lib/rowMock.ts, ?row=held|ghost|land) */
  const rowMock = useRowMock(getSpace(spaceId).widgets, getSpace(spaceId).members);
  const rowGhostData = useMemo(
    () => Object.fromEntries(withGhosts(getSpace(spaceId).widgets.filter((w) => rowMock.ghosts.some((g) => g.thing === w.id)), rowMock.ghosts, rowMock.leases).map((w) => [w.id, w.data])),
    [rowMock, spaceId],
  );

  if (route === "cursors") {
    return <DeferredRoute><CursorLab /></DeferredRoute>;
  }

  if (route === "test") {
    return <DeferredRoute><Welcome /></DeferredRoute>;
  }

  if (route === "widgets") {
    return <DeferredRoute><WidgetLab /></DeferredRoute>;
  }

  if (route === "arrival") {
    return <DeferredRoute><ArrivalLab /></DeferredRoute>;
  }

  if (route === "color") {
    return <DeferredRoute><ColorLab /></DeferredRoute>;
  }

  if (route === "bothways") {
    return <DeferredRoute><MailReel /></DeferredRoute>;
  }

  if (route === "outro") {
    return <DeferredRoute><Outro /></DeferredRoute>;
  }

  if (route === "codex") {
    return <DeferredRoute><CodexReel /></DeferredRoute>;
  }

  if (route === "firecrawl") {
    return <DeferredRoute><FirecrawlReel /></DeferredRoute>;
  }

  if (route === "wall") {
    return <DeferredRoute><WidgetWall /></DeferredRoute>;
  }

  if (route === "about") {
    return <DeferredRoute><AboutPage /></DeferredRoute>;
  }
  if (route === "me") {
    return <MePage />;
  }

  /* The back room reads the real rooms, so it needs the Convex client —
     and main.tsx only mounts a provider on the live path. */
  if (route === "admin") {
    return mockModeRequested() ? (
      <main className="paper-bg" style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <p style={{ color: "var(--color-card)" }}>The back room reads live rooms — drop <code>?mock=1</code>.</p>
      </main>
    ) : (
      <DeferredRoute><Admin /></DeferredRoute>
    );
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
          window.location.hash = normalSpaceHash(id);
        }}
      />
    );
  }

  if (route === "space" && !mockModeRequested()) {
    return <LiveSpacePage slug={spaceId} mailLab={mailLabRequested()} playLab={playLabRequested()} onSelectSpace={(id) => { window.location.hash = normalSpaceHash(id); }} />;
  }

  const baseSpace = getSpace(spaceId);
  /* Games, mock: the room's game with simulated players (lib/games). The
     cast is the people on "what this space knows"; you play as `?as=`, as
     the second half of a room of two, or as yourself. */
  const gameCastOf = useCallback((room: string): CastPerson[] => {
    const people = mockRoomKnows(room, "").people;
    return people.length ? people : getSpace(room).members.map(({ name, color }) => ({ name, color }));
  }, []);
  const gameMeOf = useCallback(
    (room: string) => {
      const cast = gameCastOf(room);
      const viewer = mockViewer(cast.map((person) => person.name));
      const person = viewer.standing === "member" ? cast.find((p) => p.name === viewer.name) : cast.length === 2 ? cast[1] : undefined;
      return person ? { name: person.name, color: person.color } : { name: "You", color: tabIdentity.color };
    },
    [gameCastOf, tabIdentity.color],
  );
  const gamesOnly = useMockGames({ room: spaceId, meOf: gameMeOf, castOf: gameCastOf, flyTo: goToTurnWidget });
  /* the jigsaw: its own mat on the board; what it leaves joins the same scoreboard */
  const jigsaw = useMockJigsaw({ room: spaceId, meOf: gameMeOf, castOf: gameCastOf, flyTo: goToTurnWidget });
  const games = withJigsaw(gamesOnly, jigsaw);
  /* by voice, mock: the same starts a tap makes; the players who answer are simulated (the dev readout says so) */
  voiceVerbRef.current.game = (said) => {
    if (!hasGames(spaceId)) return "no games in this room";
    const ask = gameAsk(said, gameMeOf(spaceId).name);
    if (ask.kind === "jigsaw") {
      if (!hasJigsaw(spaceId)) return "no photo to make a puzzle of here";
      const photo = ROOM_JIGSAW[spaceId].photos.find((p) => ask.photo && p.caption.includes(ask.photo.split(" ")[0])) ?? ROOM_JIGSAW[spaceId].photos[0];
      jigsaw.start(photo.key);
      return `a puzzle of ${photo.caption}. pieces on the mat`;
    }
    if (ask.kind === "hot-seat") {
      games.startSeat(ask.about);
      return `started ${ask.about ? `how well do you know ${ask.about}` : games.seatName}. simulated players in mock`;
    }
    games.start();
    return `started ${games.gameName}. simulated players in mock`;
  };
  const jigsawOverlay = useMemo(() => <JigsawWorld />, []);
  /* the games corner is placed like any card, inside the board (lib/games/place.ts) */
  const gameSpot = gameSpots(spaceId, getSpace(spaceId).widgets, { w: canvasSizeFor(spaceId).width, h: canvasSizeFor(spaceId).height });
  const gameWidgets: Widget[] = hasGames(spaceId)
    ? [
        { id: SCOREBOARD_WIDGET_ID, type: "scoreboard", ...gameSpot.board, w: 300, h: 110 + 49 * Math.min(7, games.rows.length) + 96 + (hasJigsaw(spaceId) ? 44 : 0) + (games.seatName && !(games.game && games.game.phase !== "done") ? 48 : 0), z: 4, data: { title: "scoreboard" } },
        ...(games.game
          ? [
              {
                id: GAME_WIDGET_ID,
                type: "game" as const,
                ...gameSpot.card,
                ...GAME_CARD,
                z: 5,
                data: {
                  title: games.game.name,
                  name: games.game.name,
                  phase: games.game.phase,
                  startedBy: games.game.startedBy.name,
                  players: games.game.players.map((player) => player.name),
                  youIn: games.game.players.some((player) => player.name === games.me.name),
                  round: games.game.round + 1,
                  rounds: games.game.rounds.length,
                  /* the person a hot seat is about gets their own ticket */
                  ...(games.game.seat?.length === 1 && games.game.seat[0].name === games.me.name ? { ticket: "you're in the hot seat", waiting: `${games.game.startedBy.name.toLowerCase()} started a game about you. sit down` } : {}),
                },
              },
            ]
          : []),
        /* what a finished hot seat leaves on the board */
        ...(games.keepsake && KEEPSAKE_SPOTS[spaceId]
          ? [{ id: KEEPSAKE_WIDGET_ID, type: "keepsake" as const, ...KEEPSAKE_SPOTS[spaceId], w: 304, h: 112 + 37 * games.keepsake.rows.length, z: 6, data: { title: games.keepsake.title } }]
          : []),
      ]
    : [];
  const activeSpaceCustomization =
    spaceDraft ??
    spaceCustomizations[spaceId] ??
    defaultSpaceCustomization(baseSpace);
  const mockKnows: RoomKnows = { ...mockRoomKnows(spaceId, activeSpaceCustomization.name), ...(mockKnowsEdits[spaceId] ?? {}) };
  const visibleWidgets = [
    ...baseSpace.widgets,
    ...(addedWidgets[spaceId] ?? []),
    ...(promoted && spaceId === "crew" ? [DECISION_WIDGET] : []),
    ...gameWidgets,
  ]
    .filter((widget) => !(deletedWidgetIds[spaceId] ?? []).includes(widget.id))
    .map((widget) => ({
      ...widget,
      ...widgetPlacements[spaceId]?.[widget.id],
      data: widgetDataOverrides[spaceId]?.[widget.id] ?? widget.data,
    }));
  visibleWidgetsRef.current = visibleWidgets;
  const turnMembers = baseSpace.members.map((member) => member.name);
  const turnViewer = mockViewer(turnMembers);
  /* a puzzle you're not in is an invitation too: the same "your turn" ticket */
  const jigsawRun = jigsaw.run?.phase === "on" && !jigsaw.run.result && !jigsaw.run.joined ? jigsaw.run : undefined;
  const jigsawTicket: Widget[] = jigsawRun
    ? [{ id: JIGSAW_WIDGET_ID, type: "game", x: 0, y: 0, w: 0, h: 0, z: 0, data: { title: "a puzzle", name: "a puzzle", phase: "round", startedBy: jigsawRun.startedBy.name, players: jigsaw.sims.map((sim) => sim.name), youIn: false, waiting: `${jigsaw.placed} of ${jigsaw.options.pieces} pieces in. jump in` } }]
    : [];
  const turnItems = yourTurn({
    widgets: [...visibleWidgets, ...jigsawTicket],
    members: turnMembers,
    viewer: turnViewer,
    mine: {
      polls: pollSelections[spaceId] ?? {},
      rsvps: rsvpSelections[spaceId] ?? {},
      answers: dailyAnswers[spaceId] ?? {},
    },
  });

  /* #/mail, mock mode: no backend to do the filing, so the lab does it. The
     receipt stands its own empty "cake" card up before the envelope flies —
     FLIP measures the target at take-off, so it cannot appear on impact —
     and the split lands when it does. Both halves mirror applyExpense. */
  const mailLabHooks = useMemo<LabHooks>(
    () => ({
      onPrepare: (kind, scale) => {
        if (kind !== "receipt") return undefined;
        setWidgetDataOverrides((current) => {
          const here = { ...(current[spaceId] ?? {}) };
          delete here[MAIL_LAB_CAKE_ID];
          return { ...current, [spaceId]: here };
        });
        setDeletedWidgetIds((current) => {
          const here = current[spaceId] ?? [];
          const missing = MAIL_LAB_HIDDEN.filter((id) => !here.includes(id));
          return missing.length === 0
            ? current
            : { ...current, [spaceId]: [...here, ...missing] };
        });
        /* The card lands with the verdict, not with the envelope — the real
           router only creates a tracker once it has decided the mail is a
           receipt. It just has to exist before the flight measures it. */
        window.setTimeout(() => {
          setAddedWidgets((current) => {
            const here = current[spaceId] ?? [];
            if (here.some((widget) => widget.id === MAIL_LAB_CAKE_ID)) return current;
            return { ...current, [spaceId]: [...here, mailLabCakeCard()] };
          });
        }, (MOCK_MAIL_DECIDE_MS + 250) * scale);
        return MAIL_LAB_CAKE_ID;
      },
      onFile: (kind) => {
        if (kind !== "receipt") return;
        setWidgetDataOverrides((current) => ({
          ...current,
          [spaceId]: {
            ...(current[spaceId] ?? {}),
            [MAIL_LAB_CAKE_ID]: mailLabCakeSplit(spaceId),
          },
        }));
      },
    }),
    [spaceId],
  );
  const editingWidget = editingWidgetId
    ? visibleWidgets.find((widget) => widget.id === editingWidgetId) ?? null
    : null;
  const isCanvasPanning = canvasPanning || spacePan.panning;
  const activeThreadWidget =
    visibleWidgets.find((widget) => widget.id === activeThreadId) ?? null;
  const activeThreadLabel = activeThreadWidget
    ? widgetLabel(activeThreadWidget)
    : undefined;
  const mockPile = visibleWidgets.find((widget) => widget.type === "linkPile");
  const buildRoomFeed = baseFeed
    ? {
        ...baseFeed,
        links: mockLinks,
        replyCounts: mockReplyCounts,
        onOpenPile: (linkId?: string) => {
          if (!mockPile) return;
          playSound("tap");
          setOpenRoom({
            kind: "pile",
            widgetId: mockPile.id,
            origin: roomOriginFor(mockPile.id),
            linkId,
          });
        },
      }
    : undefined;
  const roundtableReplies = mockRoundtableReplies(spaceId);
  const shipRoomWidget =
    openRoom?.kind === "ship"
      ? visibleWidgets.find((widget) => widget.id === openRoom.widgetId) ?? null
      : null;
  const threadMessageCount = (threadId: string) =>
    getThread(spaceId, threadId).messages.length +
    (currentLocalMessages[threadId]?.length ?? 0);
  const commentCounts = Object.fromEntries(
    visibleWidgets.map((widget) => [
      widget.id,
      threadMessageCount(widget.id) +
        linkCardQuestions(widget).reduce(
          (sum, question) =>
            sum + threadMessageCount(questionThreadId(widget.id, question.id)),
          0,
        ),
    ]),
  );
  /* A zoomed web post talks through its conversation starters — each one is
     its own thread under a namespaced id; other widgets keep the plain one. */
  const focusedThreadWidget =
    focusedTarget?.kind === "widget"
      ? visibleWidgets.find((widget) => widget.id === focusedTarget.id) ?? null
      : null;
  const focusedQuestions = focusedThreadWidget
    ? linkCardQuestions(focusedThreadWidget)
    : [];
  const activeQuestion =
    focusedQuestions.find((question) => question.id === activeQuestionId) ??
    focusedQuestions[0] ??
    null;
  const focusedThreadId =
    focusedTarget?.kind === "widget"
      ? activeQuestion
        ? questionThreadId(focusedTarget.id, activeQuestion.id)
        : focusedTarget.id
      : null;
  const focusedThread = focusedThreadId
    ? getThread(spaceId, focusedThreadId)
    : null;
  const focusedThreadMessages = focusedThread
    ? [
        ...focusedThread.messages,
        ...(currentLocalMessages[focusedThread.widgetId] ?? []),
      ]
    : [];
  const focusedQuestionCounts = Object.fromEntries(
    focusedTarget?.kind === "widget"
      ? focusedQuestions.map((question) => [
          question.id,
          threadMessageCount(questionThreadId(focusedTarget.id, question.id)),
        ])
      : [],
  );

  return (
    <GamesProvider value={games}>
    <JigsawProvider value={jigsaw}>
    <main
      className={`paper-bg relative h-dvh overflow-hidden ${
        chatOpen ? "has-chat-open" : ""
      } ${editingWidget || spaceDraft ? "has-editor-open" : ""} ${
        spaceDraft ? "is-room-editing" : ""
      } ${canvasAwayFromHome ? "is-canvas-away" : ""} ${
        isCanvasPanning ? "is-canvas-panning" : ""
      } ${spacePan.spaceHeld ? "is-space-panning" : ""} ${
        focusedTarget?.kind === "frame" ? "has-frame-focus" : ""
      } ${
        focusedTarget?.kind === "widget" ? "has-widget-focus" : ""
      } ${
        canvasCameraAnimating ? "is-canvas-camera-animating" : ""
      } space-theme-${activeSpaceCustomization.theme}`}
      style={spaceCustomizationStyle(activeSpaceCustomization)}
      data-space-id={spaceId}
    >
      <Rail
        activeId={spaceId}
        activeSpaceOverride={{
          ...activeSpaceCustomization,
          color: activeSpaceCustomization.accent,
        }}
        onSelectSpace={selectSpace}
        onCreateClick={openPicker}
        waiting={mockWaitingByRoom(SPACES_BY_ID, { widgetDataOverrides, pollSelections, rsvpSelections, dailyAnswers })}
        gameOn={games.onIn}
        self={tabIdentity}
        settingsOpen={settingsOpen}
        onSettingsClick={() => setSettingsOpen((open) => !open)}
      />
      {/* Mock page: the same sheet, photo kept in this tab, no account. */}
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        uploadPhoto={blobToDataUrl}
      />
      <SpaceHeader
        // Keyed on the space so switching replays the entrance choreography.
        key={spaceId}
        spaceId={spaceId}
        addOpen={pickerOpen}
        onAddClick={openPicker}
        knowsDoor={
          <>
            <RoomKnowsDoor slug={spaceId} count={standing(mockKnows)} />
          </>
        }
        spaceMeta={activeSpaceCustomization}
        roomEditing={Boolean(spaceDraft)}
        onEditSpace={openSpaceEditor}
        visitorCount={spaceId === "buildclub" ? buildClubVisitors : undefined}
      />
      {/* Mock mode has no inbox to watch; the #/mail lab fires fixtures at
          the same envelope the live page mounts, and plays the router's hand
          on the board (stand the card up, fill it on impact). */}
      {mailLabRequested() && (
        <MailArrival widgets={visibleWidgets} lab hooks={mailLabHooks} />
      )}
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
          isCanvasPanning ? "is-canvas-panning" : ""
        } ${spacePan.spaceHeld ? "is-space-panning" : ""}`}
        onScroll={(event) => {
          const el = event.currentTarget;
          setCanvasAwayFromHome(el.scrollLeft > 48 || el.scrollTop > 72);
          // Scroll-linked header fade: 0 at home → 1 by ~150px down / ~260px right.
          const fade = Math.min(1, Math.max(el.scrollTop / 150, el.scrollLeft / 260));
          el.parentElement?.style.setProperty("--header-scroll-fade", fade.toFixed(3));
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
              buildRoomFeed={buildRoomFeed}
              roundtableRepliesByWidget={roundtableReplies}
              onPollVote={voteOnPoll}
              onWheelSpin={spinWheel}
              onWidgetData={storeWidgetData}
              onPlaylistTune={tunePlaylist}
              onRsvp={respondToRsvp}
              onDailyAnswer={answerDailyQ}
              onDailyReact={reactToDailyAnswer}
              promoted={promoted}
              onPromote={promoteMessage}
              addedWidgets={[...voiceAddedWidgets, ...gameWidgets]}
              overlay={jigsawOverlay}
              widgetPlacements={widgetPlacements[spaceId] ?? {}}
              widgetDataOverrides={{
                ...playAsOverrides(baseSpace.widgets, turnViewer),
                ...(widgetDataOverrides[spaceId] ?? {}),
                ...rowGhostData,
                ...rowMock.overrides,
              }}
              onClaim={claimSlot}
              claimantId="you"
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
              placingItem={placing}
              placingOrigin={placingOrigin}
              onPlaceItem={placeItem}
              onPlaceCancel={() => setPlacing(null)}
              viewportRef={canvasViewportRef}
              visitorCount={
                spaceId === "buildclub" ? buildClubVisitors : undefined
              }
              labPeers={labPeers}
            />
          </div>
        </div>
      </div>
      {openRoom?.kind === "pile" && mockPile && buildRoomFeed && (
        <ReadingRoom
          key={mockPile.id}
          pileId={mockPile.id}
          links={mockLinks}
          replyCounts={mockReplyCounts}
          messagesByThread={mockMessagesByThread}
          faces={baseSpace.members}
          userId="you"
          origin={openRoom.origin}
          initialLinkId={openRoom.linkId}
          onDrop={(urls) => {
            /* No Firecrawl in mock mode — the shared fake beat, see
               lib/mockArrival.ts. The lab at #/arrival plays the same one. */
            const rows = pendingLinkRows(urls, "you", "you");
            setMockDropped((current) => [...rows, ...current]);
            scheduleMockResolve(rows, (id, patch) =>
              setMockDropped((current) =>
                current.map((link) => (link.id === id ? { ...link, ...patch } : link)),
              ),
            );
          }}
          onVote={(linkId) => {
            const link = mockLinks.find((candidate) => candidate.id === linkId);
            if (!link) return;
            setMockLinkState((current) => ({
              ...current,
              [linkId]: { ...current[linkId], voters: toggledVoters(link, "you") },
            }));
          }}
          onPin={(linkId) => {
            const link = mockLinks.find((candidate) => candidate.id === linkId);
            if (!link) return;
            setMockLinkState((current) => ({
              ...current,
              [linkId]: { ...current[linkId], pinned: !link.pinned },
            }));
          }}
          onKeep={(linkId) => {
            const link = mockLinks.find((candidate) => candidate.id === linkId);
            if (!link || link.keptAt !== undefined) return;
            /* Same climax as live (pages/LiveSpace.tsx keepTakeaway): a pinned
               note lands in the keepers frame, flown in from the card it was
               read on. Measured before the room closes. */
            const from =
              document.querySelector(".rr-hero-snap")?.getBoundingClientRect() ?? null;
            setMockLinkState((current) => ({
              ...current,
              [linkId]: { ...current[linkId], keptAt: Date.now() },
            }));
            /* After the room's 480ms exit cue plus its 300ms shrink. The note
               is created and flown in the same tick (flushSync commits it
               before flyWidgetIn looks), so it never sits at its destination
               under the closing room. */
            window.setTimeout(() => {
              const keepers = visibleWidgets.find(
                (widget) => widget.type === "frame" && widget.data.title === "keepers",
              );
              const slot = visibleWidgets.filter(
                (widget) => widget.type === "note" && widget.data.pin,
              ).length;
              const place = keeperNoteSlot(keepers, slot);
              let created: Widget | undefined;
              flushSync(() => {
                created = addWidgetAt(
                  "note",
                  { x: place.x + place.w / 2, y: place.y + place.h / 2 },
                  {
                    kicker: link.kind === "docs" ? "reference" : "rule of thumb",
                    title: link.title,
                    text: link.whyItMatters || link.description,
                    author: "you",
                    tone: "white",
                    pin: true,
                    keptLinkId: link.id,
                  },
                  { w: place.w, h: place.h },
                );
              });
              setManagedWidgetId("");
              if (created) void flyWidgetIn(created.id, from);
            }, 860);
          }}
          onReply={sendThreadMessage}
          onClose={() => setOpenRoom(null)}
        />
      )}
      {openRoom?.kind === "ship" && shipRoomWidget && (
        <ShipRoom
          key={shipRoomWidget.id}
          widget={shipRoomWidget}
          replies={mockMessagesByThread[shipRoomWidget.id] ?? []}
          origin={openRoom.origin}
          onReply={(text) => sendThreadMessage(shipRoomWidget.id, text)}
          onClose={() => setOpenRoom(null)}
        />
      )}
      {focusedTarget?.kind === "widget" && (
        <WidgetThreadDock
          viewportRef={canvasViewportRef}
          widgetId={focusedTarget.id}
          widgetType={focusedTarget.type}
          label={focusedTarget.label}
          messages={focusedThreadMessages}
          placement={threadDockPlacement}
          onSend={(text) =>
            sendThreadMessage(focusedThreadId ?? focusedTarget.id, text)
          }
          onSizeChange={updateThreadDockSize}
          topper={
            focusedQuestions.length > 0 ? (
              <LinkQuestionStrip
                questions={focusedQuestions}
                activeId={activeQuestion?.id ?? ""}
                counts={focusedQuestionCounts}
                onPick={setActiveQuestionId}
              />
            ) : undefined
          }
          placeholder={activeQuestion ? "your take…" : undefined}
          emptyText={activeQuestion ? "No takes yet — go first." : undefined}
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
          isCanvasPanning ||
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
      <VoiceBuildLayer {...voiceBuild} color={voiceMaker.color} by={voiceMaker.name} />
      {rowMock.leases.length + rowMock.ghosts.length > 0 || rowMock.slip ? (
        <>
          <RowHalos host={canvasScaleLayerRef.current?.querySelector<HTMLElement>(".space-canvas") ?? null} leases={rowMock.leases} me="you" />
          <RowGhosts host={canvasScaleLayerRef.current?.querySelector<HTMLElement>(".space-canvas") ?? null} ghosts={rowMock.ghosts} leases={rowMock.leases} me="you" onCancel={() => {}} />
          <EditSlips
            slips={rowMock.slip ? [rowMock.slip] : []}
            host={canvasScaleLayerRef.current?.querySelector<HTMLElement>(".space-canvas") ?? null}
            at={(id) => {
              const w = visibleWidgets.find((x) => x.id === id);
              return w ? { x: w.x, y: w.y } : null;
            }}
          />
        </>
      ) : null}
      <YourTurn
        roomKey={spaceId}
        items={turnItems}
        viewer={turnViewer}
        onVote={voteOnPoll}
        onRsvp={respondToRsvp}
        onAnswer={answerDailyQ}
        onClaim={claimSlot}
        onDays={addMyDays}
        onJoin={jigsawRun && !(games.game && games.game.phase !== "done") ? jigsaw.join : games.join}
      />
      <GameInvite />
      <JigsawInvite />
      <JigsawSheet />
      <JigsawDev />
      <GamesDev />
      <GameSheetTab />
      <GameSheet />
      <ActionDock
        voice={voiceHooks}
        recapOpen={recapOpen}
        recapRunId={recapRunId}
        recapTurns={recapTurns}
        recapAsking={recapAsking}
        onRecapRefresh={() => {
          setRecapCites([]);
          setRecapRunId((id) => id + 1);
        }}
        onRecapAsk={onMockRecapAsk}
        recapTargets={recapTargetsOf(visibleWidgets)}
        onRecapJumpWidget={(widgetId) => {
          playSound("tap");
          setRecapCites([widgetId]);
          panToWidget(widgetId);
        }}
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
        radioRoom={radioRoomOf(visibleWidgets)}
        onRadioTune={tunePlaylist}
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
      <RoomKnowsPage slug={spaceId} roomName={activeSpaceCustomization.name} knows={mockKnows} self={tabIdentity} onChange={correctMockKnows} fixture heldBack={rowMock.heldBack ? <HeldBack rows={rowMock.heldBack} /> : undefined} />
    </main>
    </JigsawProvider>
    </GamesProvider>
  );
}
