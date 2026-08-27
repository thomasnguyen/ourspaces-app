import { useEffect, useMemo, useState } from "react";
import { Canvas } from "../components/Canvas";
import { LiveCursor } from "../cursors";
import { CREW } from "../data/spaces";
import { useSpaceEntrance } from "../lib/entrance";
import { playSound } from "../lib/sounds";
import { createDemoWidget } from "../lib/widgetDefaults";

const COUNTDOWN_START = 12 * 86_400 + 4 * 3_600 + 32 * 60 + 19;
const CURSOR_STYLE_IDS = ["friend-pin", "name-chip", "soft-orb"];
const CURSOR_MEMBERS = CREW.members.filter((member) => member.online).slice(0, 3);

type CursorPosition = { x: number; y: number };

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function cursorPoint(index: number, width: number, height: number): CursorPosition {
  const lanes = [
    { x: [0.08, 0.38], y: [0.25, 0.62] },
    { x: [0.62, 0.92], y: [0.2, 0.76] },
    { x: [0.2, 0.82], y: [0.62, 0.9] },
  ];
  const lane = lanes[index % lanes.length];
  return {
    x: width * (lane.x[0] + Math.random() * (lane.x[1] - lane.x[0])),
    y: height * (lane.y[0] + Math.random() * (lane.y[1] - lane.y[0])),
  };
}

function initialCursorPositions(): CursorPosition[] {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  const height = typeof window === "undefined" ? 800 : window.innerHeight;
  return [
    { x: width * 0.16, y: height * 0.34 },
    { x: width * 0.78, y: height * 0.28 },
    { x: width * 0.48, y: height * 0.78 },
  ];
}

function useWelcomeCursors(reducedMotion: boolean) {
  const [positions, setPositions] = useState(initialCursorPositions);

  useEffect(() => {
    if (reducedMotion) return;

    const interval = window.setInterval(() => {
      setPositions((current) => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        return current.map((_, index) => cursorPoint(index, width, height));
      });
    }, 2600);

    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  return positions;
}

function formatCountdown(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(
    2,
    "0",
  )}m ${String(seconds).padStart(2, "0")}s`;
}

function WelcomeChatChip() {
  return (
    <span
      className="welcome-chip welcome-chat-chip"
      aria-label="chat activity, 99 plus messages"
    >
      <span className="welcome-chat-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <b aria-hidden="true">99+</b>
    </span>
  );
}

function WelcomeCountdownChip({ reducedMotion }: { reducedMotion: boolean }) {
  const [remaining, setRemaining] = useState(COUNTDOWN_START);
  const [shown, setShown] = useState(formatCountdown(COUNTDOWN_START));
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const display = formatCountdown(remaining);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  useEffect(() => {
    if (display === shown) return;
    setOutgoing(shown);
    setShown(display);
    const timeout = window.setTimeout(() => setOutgoing(null), 520);
    return () => window.clearTimeout(timeout);
  }, [display, shown]);

  return (
    <span
      className="welcome-chip welcome-countdown-chip"
      aria-label={`countdown, ${display}`}
    >
      <span aria-hidden="true">🎂</span>
      <span className="welcome-chip-roll" aria-hidden="true">
        {outgoing !== null && (
          <span className="welcome-chip-value is-roll-out">{outgoing}</span>
        )}
        <span
          key={shown}
          className={`welcome-chip-value${outgoing !== null ? " is-roll-in" : ""}`}
        >
          {shown}
        </span>
      </span>
    </span>
  );
}

function WelcomePollChip({ reducedMotion }: { reducedMotion: boolean }) {
  const [fill, setFill] = useState(54);
  const [votes, setVotes] = useState(7);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = window.setInterval(() => {
      setFill((current) => (current >= 78 ? 52 : current + 4));
      setVotes((current) => current + 1);
    }, 7000);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  return (
    <span
      className="welcome-chip welcome-poll-chip"
      aria-label={`live poll, ${votes} votes`}
    >
      <span className="welcome-poll-bars" aria-hidden="true">
        <span className="welcome-poll-bar">
          <i className="welcome-poll-fill" style={{ width: `${fill}%` }} />
        </span>
        <span className="welcome-poll-bar">
          <i className="welcome-poll-fill is-secondary" style={{ width: "36%" }} />
        </span>
      </span>
      <b aria-hidden="true">{votes} votes</b>
    </span>
  );
}

function WelcomeCanvasSliver() {
  const demoWidgets = useMemo(() => {
    const countdown = createDemoWidget("countdown", "welcome-countdown");
    const poll = createDemoWidget("poll", "welcome-poll");
    const note = createDemoWidget("note", "welcome-note");

    countdown.x = 42;
    countdown.y = 88;
    countdown.rotate = -2;
    poll.x = 270;
    poll.y = 72;
    note.x = 568;
    note.y = 106;
    note.rotate = 2;

    return [countdown, poll, note];
  }, []);

  return (
    <div className="welcome-canvas-sliver" aria-hidden="true">
      <div className="welcome-canvas-scale">
        <Canvas
          spaceId="crew"
          widgets={demoWidgets}
          selectedWidgetId=""
          onWidgetSelect={() => undefined}
          managedWidgetId=""
          onWidgetManage={() => undefined}
          onWidgetDelete={() => undefined}
          onWidgetEdit={() => undefined}
          promoted={false}
          onPromote={() => undefined}
          entrance={false}
        />
      </div>
    </div>
  );
}

export function Welcome() {
  const reducedMotion = useReducedMotion();
  const entering = useSpaceEntrance(true);
  const cursorPositions = useWelcomeCursors(reducedMotion);

  return (
    <main className={`welcome-page paper-bg space-theme-blush${entering ? " is-entering" : ""}`}>
      <div className="welcome-wordmark" aria-label="ourspaces">
        <span className="welcome-wordmark-mark" aria-hidden="true">
          ⦿
        </span>
        <span>ourspaces</span>
      </div>

      <div className="welcome-cursor-layer" aria-hidden="true">
        {CURSOR_MEMBERS.map((member, index) => (
          <div className="welcome-cursor" key={member.name}>
            <LiveCursor
              name={member.name}
              color={member.color}
              styleId={CURSOR_STYLE_IDS[index]}
              label={member.name}
              x={cursorPositions[index]?.x}
              y={cursorPositions[index]?.y}
            />
          </div>
        ))}
      </div>

      <section className="welcome-content" aria-labelledby="welcome-heading">
        <h1 id="welcome-heading" className="welcome-headline">
          <span className="welcome-headline-line">
            <span>group chats</span>
            <WelcomeChatChip />
            <span>forget.</span>
          </span>
          <span className="welcome-headline-line">
            <span>spaces</span>
            <WelcomeCountdownChip reducedMotion={reducedMotion} />
            <WelcomePollChip reducedMotion={reducedMotion} />
            <span>remember.</span>
          </span>
        </h1>

        <p className="welcome-support">
          A live canvas for every group in your life — walk in and everything&apos;s still where you left it.
        </p>

        <button
          type="button"
          className="welcome-cta"
          onClick={() => {
            playSound("place");
            window.location.hash = "#/";
          }}
        >
          Get started <span aria-hidden="true">→</span>
        </button>
      </section>

      <WelcomeCanvasSliver />
    </main>
  );
}

export default Welcome;
