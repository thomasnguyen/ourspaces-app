/**
 * "your turn" — what on this board is waiting on one person.
 *
 * Computed, never stored: a pure function over the widgets the room already
 * loaded and who is looking. Doing the thing changes the widget's own data,
 * so the item is simply not there on the next pass. Nothing here writes,
 * remembers or counts anything.
 */
import type { Widget } from "../data/types";
import { widgetIsInsideFrame } from "./frameMembership";

export type TurnStanding =
  /** part of the room: things can wait on them */
  | "member"
  /** looking in (silent guest, or brand new): nothing waits on them yet */
  | "guest";

export type TurnViewer = {
  /** the name the room's data uses for this person */
  name: string;
  userId?: string;
  standing: TurnStanding;
};

/** What this person has already done that the widget data doesn't carry —
    both room pages lift "your" row out of the card and hand it back as a
    selection, so the function takes the same split. */
export type TurnMine = {
  polls: Record<string, string | undefined>;
  rsvps: Record<string, string | undefined>;
  answers: Record<string, string | undefined>;
};

export type TurnKind = "rsvp" | "poll" | "question" | "days" | "signup" | "wheel" | "letter" | "game";

/** How the item is done from the stack: one choice, a typed line, or a trip. */
export type TurnAct = "vote" | "rsvp" | "claim" | "days" | "answer" | "go" | "join";

export type TurnChoice = { id: string; label: string };

export type TurnItem = {
  key: string;
  widgetId: string;
  kind: TurnKind;
  /** the ask, in two or three letters of the room's voice: "vote", "you in?" */
  verb: string;
  /** the widget in its own words */
  title: string;
  /** who's waiting, where the board knows */
  waiting: string;
  /** "in 5 days" when the card sits in a frame with a date */
  when?: string;
  act: TurnAct;
  choices: TurnChoice[];
  /** open to anyone rather than waiting on you — ranked last, said softer */
  soft: boolean;
  urgency: number;
};

export type TurnInput = {
  widgets: Widget[];
  /** names of the people in the room */
  members: string[];
  viewer: TurnViewer;
  mine: TurnMine;
  /** polls whose votes are loaded; omit when every poll carries its voters */
  knownPolls?: string[];
  /** a letter's seal is shared state (live) rather than one tab's */
  sharedSeals?: boolean;
  now?: number;
};

const DAY = 86_400_000;
export const TURN_SHOWN = 3;

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();

function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** "ash" · "ash and kenji" · "ash and 3 more" */
function namesLine(names: string[]) {
  const shown = names.map((name) => name.toLowerCase());
  if (shown.length <= 2) return shown.join(" and ");
  return `${shown[0]} and ${shown.length - 1} more`;
}

function waitingLine(done: string, others: string[], viewer: TurnViewer) {
  if (viewer.standing === "guest") return done;
  if (others.length === 0) return `${done}, just you left`;
  return `${done}, waiting on you and ${namesLine(others)}`;
}

function daysUntil(iso: unknown, now: number) {
  const target = new Date(String(iso ?? ""));
  if (Number.isNaN(target.getTime())) return undefined;
  const midnight = (time: number) => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  return Math.round((midnight(target.getTime()) - midnight(now)) / DAY);
}

function whenLine(days: number | undefined) {
  if (days === undefined || days < 0 || days > 21) return undefined;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * Everything on the board that's waiting on this person, most urgent first.
 * A guest gets the same list read differently: nothing is on them, so it's
 * the two or three things most of the room has already answered.
 */
export function yourTurn(input: TurnInput): TurnItem[] {
  const { widgets, viewer, mine } = input;
  const now = input.now ?? Date.now();
  const me = lower(viewer.name);
  /* With a user id (live) the id decides: two people can share a name, and a
     seeded "Maya" is not the guest who picked that name. */
  const isMe = (name: unknown, userId?: unknown) =>
    lower(name) === "you" ||
    (viewer.userId ? userId === viewer.userId : lower(name) === me);
  const guest = viewer.standing === "guest";
  const others = input.members.filter((name) => !isMe(name));
  const roomSize = Math.max(others.length + 1, 1);

  const frames = widgets.filter((widget) => widget.type === "frame");
  const frameOf = (widget: Widget) => frames.find((frame) => widgetIsInsideFrame(widget, frame));
  /* A card inherits the date of the countdown it shares a frame with: the
     cake poll matters more five days out than the comfort-show question. */
  const dateOf = (widget: Widget) => {
    const frame = frameOf(widget);
    if (!frame) return undefined;
    const countdown = widgets.find(
      (other) => other.type === "countdown" && widgetIsInsideFrame(other, frame),
    );
    return countdown ? daysUntil(countdown.data.targetDate, now) : undefined;
  };
  /* Nobody is asked to bring candles to their own birthday. */
  const isFor = (widget: Widget) => {
    if (me === "you" || viewer.userId) return false;
    const frame = frameOf(widget);
    const words = `${lower(frame?.data.title)} ${lower(widget.data.title)}`.split(/[^a-z0-9]+/);
    return words.includes(me) || words.includes(`${me}s`);
  };
  const notYet = (names: string[]) =>
    others.filter((name) => !names.some((done) => lower(done) === lower(name)));

  const items: TurnItem[] = [];
  const push = (
    widget: Widget,
    item: Omit<TurnItem, "key" | "widgetId" | "when" | "urgency" | "soft"> & {
      base: number;
      answered?: number;
      soft?: boolean;
    },
  ) => {
    const days = dateOf(widget);
    const { base, answered = 0, soft = false, ...rest } = item;
    const soon = days !== undefined && days >= 0 && days <= 14 ? (14 - days) * 3 : 0;
    const crowd = Math.round((Math.min(answered, roomSize) / roomSize) * 30);
    items.push({
      ...rest,
      key: `${rest.kind}:${widget.id}`,
      widgetId: widget.id,
      when: whenLine(days),
      soft,
      urgency: base + soon + crowd + (answered >= roomSize - 1 && !soft && !guest ? 15 : 0),
    });
  };

  for (const widget of widgets) {
    const data = widget.data;

    if (widget.type === "poll") {
      if (input.knownPolls && !input.knownPolls.includes(widget.id)) continue;
      const options = listOf<{ id: string; label: string; voters?: string[] }>(data.options);
      const voters = options.flatMap((option) => listOf<string>(option.voters));
      if (options.length < 2 || mine.polls[widget.id] || data.selectedOptionId || voters.some((name) => isMe(name))) continue;
      // every member has voted: the room is done with it, a guest's vote settles nothing
      if (guest && voters.length > 0 && notYet(voters).length === 0) continue;
      push(widget, {
        kind: "poll",
        verb: "vote",
        title: lower(data.question) || "a poll",
        waiting: voters.length
          ? waitingLine(`${voters.length} voted`, notYet(voters), viewer)
          : "no votes yet, go first",
        act: options.length <= 4 ? "vote" : "go",
        choices: options.slice(0, 4).map((option) => ({ id: option.id, label: lower(option.label) })),
        base: 40,
        answered: voters.length,
      });
      continue;
    }

    if (widget.type === "rsvp") {
      const responses = listOf<{ name: string; status: string; userId?: string }>(data.responses);
      if (mine.rsvps[widget.id] || responses.some((row) => isMe(row.name, row.userId)) || isFor(widget)) continue;
      const yes = responses.filter((row) => row.status === "yes").length;
      const frame = frameOf(widget);
      push(widget, {
        kind: "rsvp",
        verb: "you in?",
        title: lower(frame?.data.title) || lower(data.title) || "who's coming",
        waiting: responses.length
          ? waitingLine(`${yes} in`, notYet(responses.map((row) => row.name)), viewer)
          : "nobody's said yet",
        act: "rsvp",
        choices: [
          { id: "yes", label: "in" },
          { id: "maybe", label: "maybe" },
          { id: "no", label: "can't" },
        ],
        base: 50,
        answered: responses.length,
      });
      continue;
    }

    if (widget.type === "dailyQ") {
      const answers = listOf<{ name: string; userId?: string }>(data.answers);
      if (mine.answers[widget.id] || data.youAnswered || answers.some((row) => isMe(row.name, row.userId))) continue;
      push(widget, {
        kind: "question",
        verb: "answer",
        title: lower(data.question) || "today's question",
        // give to get: the card keeps the answers scribbled out until yours is in
        waiting: answers.length
          ? `${answers.length} answered, yours unlocks theirs`
          : "nobody's answered yet",
        act: "answer",
        choices: [],
        base: 30,
        answered: answers.length,
      });
      continue;
    }

    if (widget.type === "availability") {
      const days = listOf<string>(data.days);
      const rows = listOf<{ name: string; userId?: string }>(data.members);
      if (days.length === 0 || rows.length === 0 || rows.some((row) => isMe(row.name, row.userId))) continue;
      push(widget, {
        kind: "days",
        verb: "your days",
        title: lower(data.title) || "when can we meet?",
        waiting: waitingLine(`${rows.length} filled in`, notYet(rows.map((row) => row.name)), viewer),
        act: days.length <= 4 ? "days" : "go",
        choices: days.slice(0, 4).map((day, index) => ({ id: String(index), label: lower(day) })),
        base: 28,
        answered: rows.length,
      });
      continue;
    }

    if (widget.type === "potluck") {
      const slots = listOf<{ name: string; by?: string | null; claimed?: boolean; byUserId?: string }>(data.items);
      const open = slots.filter((slot) => !slot.claimed);
      if (open.length === 0 || isFor(widget)) continue;
      if (slots.some((slot) => slot.claimed && isMe(slot.by, slot.byUserId))) continue;
      push(widget, {
        kind: "signup",
        verb: "grab one",
        title: lower(data.title) || "sign-up list",
        waiting:
          open.length === 1
            ? `${lower(open[0].name)} still needs someone`
            : `${open.length} things still unclaimed`,
        act: "claim",
        choices: open.slice(0, 3).map((slot) => ({ id: slot.name, label: lower(slot.name) })),
        base: 14,
        answered: slots.length - open.length,
        soft: true,
      });
      continue;
    }

    if (widget.type === "wheel") {
      const slices = listOf<{ label: string }>(data.slices);
      const landed = slices[Number(data.resultIndex)];
      if (!data.spunBy || !landed || lower(landed.label) !== me || viewer.standing === "guest") continue;
      push(widget, {
        kind: "wheel",
        verb: "it's you",
        title: lower(data.title) || "the wheel",
        // activity that invites a move, not a feed line
        waiting: isMe(data.spunBy)
          ? "you spun it yourself. best of three?"
          : `${lower(data.spunBy)} spun it and it landed on you. spin back?`,
        act: "go",
        choices: [],
        base: 26,
      });
      continue;
    }

    /* a game someone started and you're not in: an invitation is a ticket,
       and it stays until the game ends */
    if (widget.type === "game") {
      const players = listOf<string>(data.players);
      if (!data.phase || data.phase === "done" || data.youIn || players.some((name) => isMe(name))) continue;
      push(widget, {
        kind: "game",
        verb: "join",
        title: typeof data.ticket === "string" ? data.ticket : `${lower(data.startedBy)} started ${lower(data.name)}`,
        waiting:
          typeof data.waiting === "string"
            ? data.waiting
            : data.phase === "invite"
            ? `${players.length} in, starting any second`
            : `${players.length} playing, round ${Number(data.round)} of ${Number(data.rounds)}. jump in`,
        act: "join",
        choices: [{ id: "join", label: "join" }],
        base: 200,
        answered: players.length,
      });
      continue;
    }

    if (widget.type === "letter" && input.sharedSeals && data.sealed === true && viewer.standing === "member") {
      push(widget, {
        kind: "letter",
        verb: "open it",
        title: lower(data.subject) || "a letter",
        waiting: data.from ? `from ${lower(data.from)}, still sealed` : "still sealed",
        act: "go",
        choices: [],
        base: 34,
      });
    }
  }

  items.sort((a, b) => Number(a.soft) - Number(b.soft) || b.urgency - a.urgency);
  if (!guest) return items;
  /* a guest sees where to start, not a backlog: three at most, one of each
     kind before a second of any */
  const firsts = items.filter((item, index) => items.findIndex((other) => other.kind === item.kind) === index);
  const seconds = items.filter((item) => !firsts.includes(item));
  return [...firsts, ...seconds].slice(0, TURN_SHOWN);
}

/** `?as=Rio` — mock mode plays the room as one of its fixture people. */
export function playAsFromUrl(): string | undefined {
  const name = new URLSearchParams(window.location.search).get("as")?.trim();
  return name || undefined;
}

/** The mock viewer: a named fixture person is a member; plain "You" is new. */
export function mockViewer(members: string[], as = playAsFromUrl()): TurnViewer {
  const match = as && members.find((name) => lower(name) === lower(as));
  return match ? { name: match, standing: "member" } : { name: "You", standing: "guest" };
}

/** Playing as someone: the cards stop listing that person as "waiting on",
    since the pile says it and their answer lands as "you". Returned as data
    overrides, the shape the mock canvas already merges. */
export function playAsOverrides(widgets: Widget[], viewer: TurnViewer): Record<string, Widget["data"]> {
  const out: Record<string, Widget["data"]> = {};
  if (viewer.name === "You") return out;
  for (const widget of widgets) {
    const waitingOn = widget.data.waitingOn;
    if (!Array.isArray(waitingOn) || !waitingOn.some((name) => lower(name) === lower(viewer.name))) continue;
    out[widget.id] = {
      ...widget.data,
      waitingOn: waitingOn.filter((name) => lower(name) !== lower(viewer.name)),
    };
  }
  return out;
}

/** The rail's quiet count: rooms where this fixture person is a member and
    something waits on them. Hard items only — a list anyone could pick from
    isn't worth a number on a door. */
export function mockWaitingByRoom(
  rooms: Record<string, { widgets: Widget[]; members: { name: string }[] }>,
  local: {
    widgetDataOverrides: Record<string, Record<string, Widget["data"]>>;
    pollSelections: Record<string, Record<string, string>>;
    rsvpSelections: Record<string, Record<string, string>>;
    dailyAnswers: Record<string, Record<string, string>>;
  },
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!playAsFromUrl()) return out;
  for (const [id, room] of Object.entries(rooms)) {
    const members = room.members.map((member) => member.name);
    const viewer = mockViewer(members);
    if (viewer.standing !== "member") continue;
    out[id] = yourTurn({
      widgets: room.widgets.map((widget) => ({
        ...widget,
        data: local.widgetDataOverrides[id]?.[widget.id] ?? widget.data,
      })),
      members,
      viewer,
      mine: {
        polls: local.pollSelections[id] ?? {},
        rsvps: local.rsvpSelections[id] ?? {},
        answers: local.dailyAnswers[id] ?? {},
      },
    }).filter((item) => !item.soft).length;
  }
  return out;
}
