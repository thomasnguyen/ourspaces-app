import { DECISION_WIDGET, getSpace } from "../data/spaces";
import type { Widget, WidgetType } from "../data/types";

export const WIDGET_BLUEPRINTS: Widget[] = [
  ...getSpace("crew").widgets,
  ...getSpace("league").widgets,
  ...getSpace("couple").widgets,
  DECISION_WIDGET,
  {
    id: "blueprint-backend-live",
    type: "backendLive",
    x: 32,
    y: 48,
    w: 420,
    h: 100,
    z: 5,
    data: {
      counts: [
        { label: "spaces", value: 1 },
        { label: "widgets", value: 0 },
        { label: "messages", value: 0 },
        { label: "here now", value: 1 },
      ],
    },
  },
  {
    id: "blueprint-link-pile",
    type: "linkPile",
    x: 120,
    y: 120,
    w: 470,
    h: 300,
    z: 6,
    data: { title: "the pile", cta: "open reading room" },
  },
  {
    id: "blueprint-hot-links",
    type: "hotLinks",
    x: 640,
    y: 120,
    w: 470,
    h: 300,
    z: 6,
    data: { title: "hot now", limit: 3 },
  },
  {
    id: "blueprint-ship-post",
    type: "shipPost",
    x: 120,
    y: 460,
    w: 250,
    h: 240,
    z: 6,
    data: { title: "what did you ship?", body: "", imageUrl: "", by: "you", date: "" },
  },
  {
    id: "blueprint-roundtable",
    type: "roundtable",
    x: 640,
    y: 460,
    w: 460,
    h: 250,
    z: 6,
    data: { category: "topic", title: "what should we talk about?", body: "" },
  },
  {
    id: "blueprint-link-card",
    type: "linkCard",
    x: 328,
    y: 204,
    w: 260,
    h: 220,
    z: 4,
    data: {
      url: "",
      title: "",
      description: "",
      imageUrl: "",
      siteName: "",
      author: "",
      publishedAt: "",
      savedBy: "you",
      savedAt: Date.now(),
    },
  },
];

export const WIDGET_SIZES: Partial<Record<WidgetType, { w: number; h: number }>> = {
  availability: { w: 460, h: 250 },
  backendLive: { w: 420, h: 100 },
  countdown: { w: 190, h: 250 },
  dailyQ: { w: 290, h: 235 },
  decision: { w: 320, h: 190 },
  expenseSplit: { w: 260, h: 205 },
  frame: { w: 680, h: 360 },
  itinerary: { w: 310, h: 190 },
  jokeRegistry: { w: 300, h: 200 },
  linkCard: { w: 260, h: 220 },
  linkShelf: { w: 320, h: 210 },
  media: { w: 300, h: 220 },
  messageWall: { w: 520, h: 110 },
  note: { w: 280, h: 165 },
  photoWall: { w: 300, h: 200 },
  playlist: { w: 320, h: 176 },
  poll: { w: 250, h: 230 },
  potluck: { w: 400, h: 160 },
  quote: { w: 230, h: 120 },
  rsvp: { w: 200, h: 260 },
  sports: { w: 420, h: 280 },
  weather: { w: 230, h: 110 },
  wheel: { w: 280, h: 330 },
  dualClock: { w: 340, h: 150 },
  cozyColor: { w: 560, h: 500 },
  linkPile: { w: 470, h: 300 },
  hotLinks: { w: 470, h: 300 },
  shipPost: { w: 250, h: 240 },
  roundtable: { w: 460, h: 250 },
};

export function getWidgetBlueprint(type: WidgetType): Widget | undefined {
  return WIDGET_BLUEPRINTS.find((widget) => widget.type === type);
}

export function freshWidgetData(type: WidgetType, source: Widget["data"]): Widget["data"] {
  switch (type) {
    case "frame":
      return {
        title: "new frame",
        subtitle: "a shared corner for related widgets",
      };
    case "note":
      return {
        text: "write something your people should remember",
        author: "You",
        tone: "warm",
        kicker: "new note",
      };
    case "poll":
      return {
        question: "what should we decide?",
        options: [
          { id: "a", label: "first option", votes: 0, total: 1 },
          { id: "b", label: "second option", votes: 0, total: 1 },
          { id: "c", label: "something else", votes: 0, total: 1 },
        ],
      };
    case "media":
      return { caption: "new photo", date: "just now" };
    case "dailyQ":
      return {
        question: "what's everyone thinking?",
        tone: "butter",
        streak: 1,
        answers: [],
        waitingOn: [],
      };
    case "chat":
      return {
        messages: [
          { from: "Maya", text: "who's bringing balloons?", time: "2:04p", promotable: true },
          { from: "Jules", text: "i got those", time: "2:06p" },
          { from: "Sam", text: "6pm still good?", time: "2:11p" },
        ],
      };
    case "rsvp":
      return { title: "who's in?", responses: [], waitingOn: [] };
    case "decision":
      return {
        ...source,
        title: String(source.title ?? "decision made"),
        detail: String(source.detail ?? "6pm · Sam's place"),
        author: String(source.author ?? "Sam"),
        source: String(source.source ?? "promoted from chat"),
        tone: String(source.tone ?? "lime"),
      };
    case "availability":
      return {
        ...source,
        title: String(source.title ?? "when can we all meet?"),
        days: Array.isArray(source.days) ? source.days : ["Fri", "Sat", "Sun"],
        members: Array.isArray(source.members)
          ? source.members
          : [
              { name: "Maya", slots: [true, false, true] },
              { name: "Jules", slots: [true, true, false] },
              { name: "Sam", slots: [false, true, true] },
            ],
        best: String(source.best ?? "Sat"),
        tone: String(source.tone ?? "sky"),
      };
    case "potluck":
      return {
        title: "who's bringing what",
        tone: "mint",
        items: [
          { name: "snacks", by: null, claimed: false },
          { name: "playlist", by: "Jules", claimed: true },
          { name: "ice", by: null, claimed: false },
          { name: "candles", by: "Sam", claimed: true },
        ],
      };
    case "linkShelf":
      return {
        ...source,
        title: String(source.title ?? "saved links"),
        links: Array.isArray(source.links) ? source.links : [],
        tone: String(source.tone ?? "sky"),
      };
    case "linkCard":
      return {
        url: String(source.url ?? ""),
        title: String(source.title ?? ""),
        description: String(source.description ?? ""),
        imageUrl: String(source.imageUrl ?? ""),
        siteName: String(source.siteName ?? ""),
        author: String(source.author ?? ""),
        publishedAt: String(source.publishedAt ?? ""),
        savedBy: String(source.savedBy ?? "you"),
        savedAt: Number(source.savedAt ?? Date.now()),
      };
    case "playlist":
      return {
        ...source,
        title: String(source.title ?? "shared soundtrack"),
        stationId: String(source.stationId ?? "indiepop"),
        playedBy: String(source.playedBy ?? source.pickedBy ?? "Jules"),
        playing: Boolean(source.playing),
        vibes: Array.isArray(source.vibes) ? source.vibes : ["Maya", "Sam"],
        tone: String(source.tone ?? "violet"),
      };
    case "backendLive":
      return {
        counts: [
          { label: "spaces", value: 1 },
          { label: "widgets", value: 0 },
          { label: "messages", value: 0 },
          { label: "here now", value: 1 },
        ],
      };
    case "wheel":
      return {
        title: "spin the wheel",
        tone: "mint",
        slices: [
          { id: "a", label: "first person" },
          { id: "b", label: "second person" },
          { id: "c", label: "third person" },
          { id: "d", label: "last person" },
        ],
        spinNonce: 0,
        resultIndex: 0,
        spunBy: "You",
      };
    case "dualClock":
      return {
        title: "two places",
        left: { label: "home", tz: "America/Los_Angeles" },
        right: { label: "away", tz: "Asia/Seoul" },
      };
    case "cozyColor":
      return {
        title: "same moon, both windows",
        src: "/assets/cozy-color-same-moon.png",
      };
    case "linkPile":
      return { title: "the pile", cta: "open reading room" };
    case "hotLinks":
      return { title: "hot now", limit: 3 };
    case "shipPost":
      return {
        title: "what did you ship?",
        body: "",
        imageUrl: "",
        by: "you",
        date: "",
        feedbackWanted: false,
      };
    case "roundtable":
      return {
        category: "topic",
        title: "what should we talk about?",
        body: "",
      };
    default:
      return { ...source };
  }
}

export function createDemoWidget(type: WidgetType, id = `lab-${type}`): Widget {
  const blueprint = getWidgetBlueprint(type);
  const size = WIDGET_SIZES[type] ?? {
    w: blueprint?.w ?? 280,
    h: blueprint?.h ?? 180,
  };

  return {
    id,
    type,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    z: 1,
    rotate: blueprint?.rotate,
    data: blueprint
      ? freshWidgetData(type, blueprint.data)
      : freshWidgetData(type, {}),
  };
}
