import { useEffect, useRef, type RefObject } from "react";
import { createOrbRenderer } from "../lib/orbShader";
import type { VoiceState } from "../lib/voice";

/** The voice orb. The look lives in `lib/orbShader.ts`; this eases the
    moods and the mic level into it every frame. The canvas fills whatever
    box it is put in (the dock seat or the stage, `VoiceStage.tsx` moves it)
    and re-sizes its pixels to match, so one orb serves both. The ball is
    62% of the box; the rest is room for the swell and the stage light. */
export function VoiceOrb({
  state,
  level,
  stage = false,
}: {
  state: VoiceState;
  level: RefObject<number>;
  /** on the stage the orb lights the dark around it */
  stage?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Small boxes get 4 pixels per CSS pixel, big ones at least 2: the
    // browser's downscale is the antialiasing for the folds.
    const pixels = () => {
      const box = canvas.offsetWidth || 93;
      const per = box < 160 ? 4 : Math.max(2, Math.min(3, window.devicePixelRatio || 1));
      return Math.min(1100, Math.round(box * per));
    };
    const orb = createOrbRenderer(canvas, pixels());
    if (!orb) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let time = 7.3;
    let flow = 3.0;
    let spin = 0;
    let last = performance.now();
    let listen = 0;
    let work = 0;
    let shown = 0;
    let lit = 0;
    const draw = () => orb.render({ time, flow, spin, level: shown, listen, work, stage: lit });
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const mood = stateRef.current;
      listen += ((mood === "listening" ? 1 : 0) - listen) * 0.08;
      work += ((mood === "working" ? 1 : 0) - work) * 0.1;
      shown += ((level.current ?? 0) - shown) * 0.25;
      lit += ((stageRef.current ? 1 : 0) - lit) * 0.07;
      if (!still || mood !== "idle") {
        time += dt;
        // the folds run faster while you talk, never jump
        flow += dt * (0.22 + 0.2 * listen + 0.75 * shown + 0.5 * work);
        spin += dt * work * 2.4;
      }
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // moved between the dock and the stage: new pixels, drawn the same frame
    const resized = new ResizeObserver(() => {
      orb.resize(pixels());
      draw();
    });
    resized.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      resized.disconnect();
      orb.dispose();
    };
  }, [level]);

  return <canvas ref={canvasRef} className="voice-orb" aria-hidden="true" />;
}
