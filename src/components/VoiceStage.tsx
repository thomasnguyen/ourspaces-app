import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { orbLook } from "../lib/orbShader";
import { playSound } from "../lib/sounds";
import type { useVoice } from "../lib/voice";
import { onVoiceStageRelease } from "../lib/voiceStage";
import { VoiceOrb } from "./VoiceOrb";
import "./voice-stage.css";

/* The voice stage: tapping the dock orb is the biggest moment in the app.
   The orb itself lifts out of the dock and grows into the middle of a dark
   stage (one canvas, moved and FLIPped: no second orb), asks the question,
   listens with a waveform, shows your words as a headline and offers three
   starter asks. When the ask ends, or a build starts (`releaseVoiceStage()`
   in lib/voiceStage.ts), the stage lets go and the same orb flies home while
   the board comes back.

   `?stage=0` keeps the old dock-only listening. `?stage=1` opens the stage on
   load (with `?voice=…` it plays the scripted ask). `&level=0.8` pins the
   loudness for stills. */

type Voice = ReturnType<typeof useVoice>;
type Phase = "closed" | "open" | "closing";

const STARTERS = [
  { glyph: "◐", label: "Poll the group", ask: "add a poll for Saturday dinner" },
  { glyph: "◷", label: "Count down to it", ask: "start a countdown to the trip" },
  { glyph: "✺", label: "Spin for who drives", ask: "spin a wheel for who drives" },
];

/** The house curves (index.css @theme), for moves that are driven per frame. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const u = 1 - t;
      const err = 3 * x1 * t * u * u + 3 * x2 * t * t * u + t * t * t - x;
      const slope = 3 * x1 * (u * u - 2 * t * u) + 3 * x2 * (2 * t * u - t * t) + 3 * t * t;
      if (Math.abs(slope) < 1e-5) break;
      t -= err / slope;
    }
    const u = 1 - t;
    return 3 * y1 * t * u * u + 3 * y2 * t * t * u + t * t * t;
  };
}
const glide = bezier(0.16, 1, 0.3, 1);
const pop = bezier(0.2, 0.9, 0.3, 1.18);
const sway = bezier(0.3, 0.6, 0.3, 1);

type Box = { x: number; y: number; w: number };
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
};

/** Fly `host` from one box to another. It stays where layout put it; only
    its transform moves, re-aimed every frame because the dock it lands in is
    still settling. x runs on a slower curve than y, so the path is an arc. */
function fly(host: HTMLElement, from: () => Box, to: () => Box, ms: number, grow: (t: number) => number, done: () => void) {
  host.style.transform = "";
  const home = boxOf(host);
  const started = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const p = Math.min(1, (now - started) / ms);
    const a = from();
    const b = to();
    const x = a.x + (b.x - a.x) * sway(p);
    const y = a.y + (b.y - a.y) * glide(p);
    const w = a.w + (b.w - a.w) * grow(p);
    host.style.transform = `translate(${x - home.x}px, ${y - home.y}px) scale(${w / home.w})`;
    if (p < 1) raf = requestAnimationFrame(frame);
    else done();
  };
  frame(started);
  return () => cancelAnimationFrame(raf);
}

/** Where the orb sits in the dock: centred on its key, 1.6 × the 58 px ball. */
const SEAT = 93;
const seatBox = (seat: HTMLElement): Box => ({ ...boxOf(seat), w: SEAT });

function tokenRgb(name: string) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The waveform under the orb: your loudness, newest in the middle, running
    out to both sides, in the orb's own violet → pink → orange. */
function StageWave({ level }: { level: RefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const stops = [tokenRgb("--color-crew"), tokenRgb("--color-couple"), tokenRgb("--color-trip")];
    const colour = (t: number) => {
      const [a, b] = t < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
      const k = t < 0.5 ? t * 2 : t * 2 - 2 + 1;
      return a.map((v, i) => Math.round(v + (b[i] - v) * k));
    };
    const history: number[] = new Array(64).fill(0);
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      if (now - last > 38) {
        last = now;
        history.unshift(level.current ?? 0);
        history.pop();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const pitch = 9;
      const bars = Math.floor(w / pitch / 2) * 2 + 1;
      const mid = (bars - 1) / 2;
      const left = (w - (bars - 1) * pitch) / 2;
      for (let i = 0; i < bars; i++) {
        const away = Math.abs(i - mid);
        // every bar has its own reach, so it reads as a voice, not a ramp
        const reach = 0.45 + 0.55 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
        const v = Math.min(1, history[Math.min(63, Math.round(away * 1.2))] * reach * (1 - (away / (mid + 1)) * 0.55));
        const tall = 4 + v * (h - 4);
        const [r, g, b] = colour(i / (bars - 1));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.38 + 0.62 * Math.min(1, v * 3)})`;
        ctx.beginPath();
        ctx.roundRect(left + i * pitch - 2, (h - tall) / 2, 4, tall, 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return <canvas ref={ref} className="voice-stage-wave" data-testid="voice-stage-wave" aria-hidden="true" />;
}

/** Long asks keep their tail: the newest words are the ones being read. */
function headline(text: string) {
  if (text.length <= 120) return text;
  const tail = text.slice(-116);
  return `…${tail.slice(tail.indexOf(" ") + 1)}`;
}

/** Owns the orb (so it can travel) and the stage. The dock gives it the
    voice and the orb's seat; it gets back whether the stage is up, a way to
    open it, and the layer to render. */
export function useVoiceStage(voice: Voice, seat: RefObject<HTMLElement | null>) {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const enabled = params.get("stage") !== "0";
  const [phase, setPhase] = useState<Phase>("closed");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [host] = useState(() => {
    const el = document.createElement("span");
    el.className = "voice-orb-host";
    return el;
  });
  const slot = useRef<HTMLDivElement>(null);
  const flight = useRef<() => void>(() => {});
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // `&level=0.8` pins the loudness the orb and the waveform show
  const pinned = useRef(Number(params.get("level")));
  const level = params.has("level") ? pinned : voice.level;
  const silent = useRef(0);

  useLayoutEffect(() => {
    seat.current?.appendChild(host);
    return () => {
      flight.current();
      host.remove();
    };
  }, [host, seat]);

  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Opening: the orb changes parent to the stage and flies there from where
  // it was in the dock, growing as it goes.
  useLayoutEffect(() => {
    if (phase !== "open" || !slot.current || host.parentElement === slot.current) return;
    const from = boxOf(host);
    slot.current.appendChild(host);
    flight.current();
    if (still()) return;
    flight.current = fly(host, () => from, () => boxOf(slot.current ?? host.parentElement!), 760, pop, () => {
      host.style.transform = "";
    });
  }, [phase, host]);

  /** Let go: the stage closes and the orb flies home. `send` true sends what
      was said, false throws it away, undefined leaves the voice alone (the
      ask already ended, or a build started and you may still be talking). */
  const close = useCallback(
    (send?: boolean) => {
      if (phaseRef.current !== "open") return;
      const v = voiceRef.current;
      if (send && v.transcript.trim()) v.finish();
      else if (send !== undefined) v.cancel();
      setPhase("closing");
      phaseRef.current = "closing";
      flight.current();
      const land = () => {
        host.style.transform = "";
        seat.current?.appendChild(host);
        setPhase("closed");
      };
      if (still() || !seat.current) {
        window.setTimeout(land, 200);
        return;
      }
      const from = boxOf(host);
      flight.current = fly(host, () => from, () => seatBox(seat.current!), 560, glide, land);
    },
    [host, seat],
  );

  const open = useCallback(() => {
    if (enabled && phaseRef.current === "closed") setPhase("open");
  }, [enabled]);

  // the ask ended (finish, the script ran out, a pause): let go
  useEffect(() => {
    if (voice.state !== "listening") close();
  }, [voice.state, close]);
  // a build started mid-sentence: let go, keep listening in the dock
  useEffect(() => onVoiceStageRelease(() => close()), [close]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, close]);

  // `?stage=1`: open on load
  useEffect(() => {
    if (params.get("stage") !== "1") return;
    void voiceRef.current.start();
    setPhase("open");
  }, [params]);

  const chip = (ask: string) => {
    playSound("tap");
    voice.say(ask);
    // long enough to read the sentence land before the stage lets go
    window.setTimeout(() => close(true), 650);
  };

  const text = headline(voice.transcript);
  const layer: ReactNode = (
    <>
      {createPortal(<VoiceOrb state={voice.muted ? "idle" : voice.state} level={level} stage={phase === "open"} />, host)}
      {phase !== "closed" &&
        createPortal(
          <div
            className={`voice-stage is-${orbLook()} ${voice.muted ? "is-muted" : ""}`}
            data-testid="voice-stage"
            data-phase={phase}
            onClick={() => close(true)}
          >
            <div className="voice-stage-body">
              <h2 className="voice-stage-question" style={{ "--i": 0 } as React.CSSProperties}>
                What are we doing together?
              </h2>
              <div className="voice-stage-orb" ref={slot} />
              <span className="voice-stage-status" data-testid="voice-stage-status" style={{ "--i": 2 } as React.CSSProperties}>
                <i aria-hidden="true" />
                {voice.muted ? "Muted" : "Listening"}
              </span>
              <div className="voice-stage-wave-wrap" style={{ "--i": 3 } as React.CSSProperties}>
                <StageWave level={voice.muted ? silent : level} />
              </div>
              <p
                className={`voice-stage-text ${text ? "" : "is-hint"}`}
                data-testid="voice-stage-text"
                style={{ "--i": 4 } as React.CSSProperties}
              >
                {text || "Say it out loud, or start with one of these."}
              </p>
              <div className="voice-stage-chips" style={{ "--i": 5 } as React.CSSProperties} onClick={(event) => event.stopPropagation()}>
                {STARTERS.map((starter, i) => (
                  <button
                    type="button"
                    key={starter.label}
                    className="voice-stage-chip"
                    data-testid={`voice-stage-chip-${i}`}
                    onClick={() => chip(starter.ask)}
                  >
                    <i aria-hidden="true">{starter.glyph}</i>
                    {starter.label}
                  </button>
                ))}
              </div>
              <div className="voice-stage-controls" style={{ "--i": 6 } as React.CSSProperties} onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="voice-stage-mute"
                  data-testid="voice-stage-mute"
                  aria-pressed={voice.muted}
                  onClick={() => {
                    playSound("tap");
                    voice.mute(!voice.muted);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
                    {voice.muted && <path className="voice-stage-slash" d="M4 4l16 16" />}
                  </svg>
                  <b>{voice.muted ? "Unmute" : "Mute"}</b>
                </button>
                <button
                  type="button"
                  className="voice-stage-finish"
                  data-testid="voice-stage-finish"
                  onClick={() => {
                    playSound("tap");
                    close(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  <b>Finish</b>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  return { up: phase === "open", open, layer };
}
