import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Widget } from "../data/types";
import { flyEnvelopeTo } from "../lib/flipLanding";
import {
  MAIL_COPY,
  mailKind,
  mailReadingLine,
  mailSender,
  mailSlow,
  mailStage,
  mockMailEvent,
  relMailTime,
  scheduleMockMail,
  type MailArrivalEvent,
  type MailKind,
} from "../lib/mailArrival";
import { playSound } from "../lib/sounds";

const MailLabBar = lazy(() =>
  import("../pages/MailLabBar").then((module) => ({ default: module.MailLabBar })),
);

/**
 * Mail arrival — the envelope that thinks out loud (docs/mail-arrival.md).
 *
 * Mounted in every mail-enabled space, page-level (a sibling of the header,
 * not a canvas object). An inbound email lands as a kraft envelope beside the
 * space's address chip with a slip under it that narrates the wait — opening
 * · reading · deciding — clocked off the event's own `createdAt`, holds until
 * the router's verdict (`label`) lands, stamps it, prints the reason, then
 * FLIPs to the widget it filed into. The reply tick waits for `repliedAt`.
 * Every tick is a field on the `emailEvents` row; the #/mail lab feeds the
 * same component fixtures on timers (lib/mailArrival.ts).
 */

const FRESH_MS = 3000; // younger than this at mount → it lands, with sound
const SHOW_FOR_MS = 60_000;
const UNREPLIED_FOR_MS = 5 * 60_000;
const TICK_FOR_MS = 4500;
const STACK = 3;

type Phase =
  | "landing"
  | "reading"
  | "decided"
  | "filing"
  | "flying"
  | "stay"
  | "tossing"
  | "done";

type Landed = { widgetId?: string; at: number };

/** The client's `since` for the subscription, bucketed to 30s so the query
    args (and its cache key) don't change every render. */
function sinceBucket() {
  return Math.floor((Date.now() - 2 * 60_000) / 30_000) * 30_000;
}

/** The mail slot: right of the nameplate — clear of the title's last word
    and of the handles row (address chip + edit), so the envelope reads as
    "beside the address" and covers no chrome. */
function measureSlot() {
  const title = document.querySelector<HTMLElement>(".space-title-text");
  const handles = document.querySelector<HTMLElement>(".space-title-handles");
  if (title || handles) {
    let right = 0;
    let top = Number.POSITIVE_INFINITY;
    for (const element of [title, handles]) {
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) continue;
      right = Math.max(right, rect.right);
      top = Math.min(top, rect.top);
    }
    if (right > 0) return { left: right + 26, top: Math.max(24, top - 4) };
  }
  return { left: 520, top: 40 };
}

function findWidget(widgetId: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(".widget-group[data-widget-id]")).find(
      (node) => node.dataset.widgetId === widgetId,
    ) ?? null
  );
}

function measureWidgetFoot(widgetId: string) {
  const element = findWidget(widgetId);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0) return null;
  return { left: rect.left + 10, top: rect.bottom - 10 };
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/* ── the lab: fixtures on timers, same component ─────────────────────────── */

const LAB_TARGET: Partial<Record<MailKind, Widget["type"]>> = {
  receipt: "expenseSplit",
  booking: "itinerary",
  links: "linkPile",
  letter: "letter",
  unfiled: "letter",
};

function useMailLab(widgets: Widget[], hooks: LabHooks) {
  const [events, setEvents] = useState<MailArrivalEvent[]>([]);
  const [slow, setSlow] = useState(false);
  const scale = slow ? 4 : 1;
  const cancels = useRef<(() => void)[]>([]);
  const lastKind = useRef<MailKind>("receipt");

  /* Slow-mo: the CSS side reads `--arrival-slow`, the stage clock reads
     `scale`. Both stretch together or the beat desyncs. */
  useEffect(() => {
    document.documentElement.style.setProperty("--arrival-slow", String(scale));
    return () => {
      document.documentElement.style.removeProperty("--arrival-slow");
    };
  }, [scale]);

  useEffect(() => () => cancels.current.forEach((cancel) => cancel()), []);

  const fire = useCallback(
    (kind: MailKind) => {
      lastKind.current = kind;
      const targetType = LAB_TARGET[kind];
      /* The lab can stand a widget up before the flight — the real router
         creates one when nothing matches, and the receipt beat needs its own
         card rather than landing in a seeded tracker. It has to exist now,
         not on impact: FLIP measures the target when the flight starts. */
      const prepared = hooks.onPrepare?.(kind, scale);
      const target =
        prepared ??
        (targetType ? widgets.find((widget) => widget.type === targetType)?.id : undefined);
      const event = mockMailEvent(kind);
      setEvents((current) => [event, ...current].slice(0, STACK));
      cancels.current.push(
        scheduleMockMail(
          event,
          kind,
          (id, patch) =>
            setEvents((current) =>
              current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
            ),
          { scale, widgetId: target },
        ),
      );
    },
    [scale, widgets, hooks],
  );

  const clear = useCallback(() => {
    cancels.current.forEach((cancel) => cancel());
    cancels.current = [];
    setEvents([]);
  }, []);

  const replay = useCallback(() => {
    clear();
    window.setTimeout(() => fire(lastKind.current), 60);
  }, [clear, fire]);

  return { events, scale, slow, setSlow, fire, clear, replay };
}

/* ── the component ───────────────────────────────────────────────────────── */

/** Lab-only: mock mode has no Convex, so the board has to be moved by hand. */
export type LabHooks = {
  /** fired when an envelope is sent — return a widget id to fly at. The id is
      reserved now; the widget itself only has to exist by the time the
      envelope flies, which is what lets the card appear on the verdict. */
  onPrepare?: (kind: MailKind, scale: number) => string | undefined;
  /** fired when it lands — write whatever the router would have written */
  onFile?: (kind: MailKind, widgetId?: string) => void;
};

export function MailArrival({
  spaceId,
  widgets,
  lab = false,
  hooks,
}: {
  /** the live space's Convex id — absent in mock mode */
  spaceId?: string;
  /** the board, for the lab to pick flight targets by type */
  widgets?: Widget[];
  /** #/mail: fixtures + the pill instead of the subscription */
  lab?: boolean;
  /** #/mail: let the page stand up and fill the widget the fixture files into */
  hooks?: LabHooks;
}) {
  if (lab) return <MailArrivalLab widgets={widgets ?? []} hooks={hooks ?? {}} />;
  if (spaceId) return <MailArrivalLive spaceId={spaceId} />;
  return null;
}

/** Live: the subscription. Its own component so mock mode (no Convex
    provider) never renders the hook. */
function MailArrivalLive({ spaceId }: { spaceId: string }) {
  const [since, setSince] = useState(sinceBucket);
  useEffect(() => {
    const timer = window.setInterval(() => setSince(sinceBucket()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const rows = useQuery(api.mailArrival.recentInbound, {
    spaceId: spaceId as Id<"spaces">,
    since,
  });
  const events: MailArrivalEvent[] = (rows ?? []).map((row) => ({
    ...row,
    id: String(row.id),
    widgetId: row.widgetId ? String(row.widgetId) : undefined,
  }));
  return <MailArrivalStage events={events} scale={1} />;
}

/** The lab: fixtures on timers plus the pill. */
function MailArrivalLab({ widgets, hooks }: { widgets: Widget[]; hooks: LabHooks }) {
  const lab = useMailLab(widgets, hooks);
  return (
    <>
      <MailArrivalStage events={lab.events} scale={lab.scale} onFile={hooks.onFile} />
      <Suspense fallback={null}>
        <MailLabBar
          slow={lab.slow}
          onSlow={() => lab.setSlow((value) => !value)}
          onFire={lab.fire}
          onReplay={lab.replay}
          onClear={lab.clear}
        />
      </Suspense>
    </>
  );
}

/** The stage: which envelopes are on it, which have landed, the reply ticks. */
function MailArrivalStage({
  events,
  scale,
  onFile,
}: {
  events: MailArrivalEvent[];
  scale: number;
  onFile?: LabHooks["onFile"];
}) {
  /* Envelopes that finished (flew, were tossed, faded) stay finished even
     though the row is still in the subscription for a couple of minutes. */
  const [landed, setLanded] = useState<Record<string, Landed>>({});
  const markLanded = useCallback(
    (id: string, info: Landed) => {
      setLanded((current) => ({ ...current, [id]: info }));
      if (info.widgetId) {
        const landedKind = mailKind(events.find((row) => row.id === id)?.label);
        if (landedKind) onFile?.(landedKind, info.widgetId);
      }
    },
    [events, onFile],
  );

  const now = useNow(events.length > 0);
  const visible = events
    .filter((event) => !landed[event.id])
    .filter((event) => {
      const age = now - event.createdAt;
      return age < SHOW_FOR_MS || (!event.repliedAt && age < UNREPLIED_FOR_MS);
    })
    .slice(0, STACK);

  /* `↩ told holly` — only once the envelope landed on the widget AND the
     reply really went out; fades on its own. */
  const ticks = events.filter((event) => {
    const info = landed[event.id];
    if (!info?.widgetId || !event.repliedAt) return false;
    return now - Math.max(info.at, event.repliedAt) < TICK_FOR_MS * scale;
  });

  return (
    <div className="mail-arrival" aria-hidden="true">
      {visible.map((event, index) => (
        <MailEnvelope
          key={event.id}
          event={event}
          index={index}
          now={now}
          scale={scale}
          onDone={markLanded}
        />
      ))}
      {ticks.map((event) => (
        <MailReplyTick
          key={`tick-${event.id}`}
          widgetId={landed[event.id].widgetId ?? ""}
          who={mailSender(event.from)}
        />
      ))}
    </div>
  );
}

/* ── one envelope ────────────────────────────────────────────────────────── */

function MailEnvelope({
  event,
  index,
  now,
  scale,
  onDone,
}: {
  event: MailArrivalEvent;
  index: number;
  now: number;
  scale: number;
  onDone: (id: string, info: Landed) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const fresh = useRef(Date.now() - event.createdAt < FRESH_MS * scale).current;
  const [phase, setPhase] = useState<Phase>(fresh ? "landing" : "reading");
  const [slot, setSlot] = useState(measureSlot);
  const flown = useRef(false);
  const kind = mailKind(event.label);
  const stage = mailStage(event, now, scale);
  const slow = phase === "reading" && mailSlow(event, now, scale);
  const who = mailSender(event.from);

  /* 1 · it lands — measured off the header, `place` */
  useEffect(() => {
    setSlot(measureSlot());
    if (fresh) playSound("place");
    const onResize = () => setSlot(measureSlot());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fresh]);

  useEffect(() => {
    if (phase !== "landing") return;
    const timer = window.setTimeout(() => setPhase("reading"), 360 * scale);
    return () => window.clearTimeout(timer);
  }, [phase, scale]);

  /* 3 · it decides — the slip held on "reading" until the verdict landed */
  useEffect(() => {
    if (kind && phase === "reading") setPhase("decided");
  }, [kind, phase]);

  /* 4 · it files — stamp is read, then the destination line, then the move */
  useEffect(() => {
    if (phase === "decided") {
      const timer = window.setTimeout(() => setPhase("filing"), 900 * scale);
      return () => window.clearTimeout(timer);
    }
    if (phase === "filing") {
      const timer = window.setTimeout(() => {
        if (kind === "spam") setPhase("tossing");
        else if (event.widgetId) setPhase("flying");
        else setPhase("stay");
      }, 500 * scale);
      return () => window.clearTimeout(timer);
    }
    if (phase === "tossing") {
      const timer = window.setTimeout(() => setPhase("done"), 520 * scale);
      return () => window.clearTimeout(timer);
    }
    if (phase === "stay") {
      const timer = window.setTimeout(() => setPhase("done"), 4000 * scale);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [phase, kind, event.widgetId, scale]);

  /* A letter is a new widget made by this very email, so the one on the
     canvas would appear before the envelope gets there — two envelopes for
     a beat. Keep it hidden from the verdict until the flight lands (the wash
     in flyEnvelopeTo reveals it); the envelope that lands IS the letter.
     Layout effect so it never paints once un-hidden. */
  useLayoutEffect(() => {
    if (!event.widgetId) return;
    if (phase !== "decided" && phase !== "filing" && phase !== "flying") return;
    const target = findWidget(event.widgetId);
    if (!target || target.dataset.widgetType !== "letter") return;
    target.classList.add("is-mail-incoming");
    return () => target.classList.remove("is-mail-incoming");
  }, [event.widgetId, phase]);

  useEffect(() => {
    if (phase !== "flying" || !ref.current || !event.widgetId || flown.current) return;
    flown.current = true;
    let cancelled = false;
    void flyEnvelopeTo(ref.current, event.widgetId, scale).then((landedOnWidget) => {
      if (cancelled) return;
      if (landedOnWidget) playSound("place");
      setPhase("done");
    });
    return () => {
      cancelled = true;
    };
  }, [phase, event.widgetId, scale]);

  useEffect(() => {
    if (phase !== "done") return;
    onDone(event.id, {
      widgetId: kind !== "spam" ? event.widgetId : undefined,
      at: Date.now(),
    });
  }, [phase, onDone, event.id, event.widgetId, kind]);

  if (phase === "done") return null;

  const copy = kind ? MAIL_COPY[kind] : null;
  const reading = phase === "landing" || phase === "reading";
  let line: string;
  let caret = false;
  if (reading) {
    line = mailReadingLine(event, stage, slow);
    caret = true;
  } else if (phase === "decided") {
    line = event.because ?? copy?.decided ?? "";
  } else if (phase === "stay") {
    line = `${event.because ?? copy?.decided ?? "not sure what this is"} — ${copy?.filed ?? "open me"}`;
  } else if (phase === "tossing") {
    line = "spam — tossed it";
  } else {
    line = copy?.filed ?? "";
  }

  return (
    <article
      ref={ref}
      className={`mail-envelope is-${phase}${kind ? ` is-kind-${kind}` : ""}`}
      data-stage={reading ? stage : 3}
      data-slow={slow || undefined}
      style={{ left: slot.left, top: slot.top, "--i": index } as CSSProperties}
    >
      <div className="mail-env-paper">
        <span className="letter-flap" />
        <span className="letter-stamp">✉</span>
        <span className="letter-seal">✦</span>
        <span className="mail-env-from">
          <strong>from {who}</strong>
          <em>{event.subject || "(no subject)"}</em>
        </span>
        {reading && <b className="mail-env-scan" />}
        {kind && copy && <b className="mail-env-verdict">{copy.stamp(event)}</b>}
      </div>
      <div className="mail-slip">
        <header>
          ✉ from {who} · {relMailTime(event.createdAt, now)}
        </header>
        <strong
          className={`mail-slip-line${phase === "decided" ? " is-because" : ""}`}
          key={`${phase}-${line}`}
        >
          {line}
          {caret && <i className="rr-row-caret" />}
        </strong>
        <b className="mail-slip-steps">
          <i />
          <i />
          <i />
        </b>
      </div>
    </article>
  );
}

function MailReplyTick({ widgetId, who }: { widgetId: string; who: string }) {
  const [pos, setPos] = useState(() => measureWidgetFoot(widgetId));
  useEffect(() => {
    setPos(measureWidgetFoot(widgetId));
  }, [widgetId]);
  if (!pos) return null;
  return (
    <span className="mail-reply-tick" style={{ left: pos.left, top: pos.top }}>
      ↩ told {who}
    </span>
  );
}
