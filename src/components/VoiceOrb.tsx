import { useEffect, useRef, type RefObject } from "react";
import { createOrbRenderer } from "../lib/orbShader";
import type { VoiceState } from "../lib/voice";

/** The dock's voice orb. The look lives in `lib/orbShader.ts`; this eases
    the moods and the mic level into it every frame. */
export function VoiceOrb({
  state,
  level,
  size,
}: {
  state: VoiceState;
  level: RefObject<number>;
  /** CSS size of the sphere at rest. The canvas is 1.6× that, so the
      wobble and the voice swell have room to spill past it. */
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!canvasRef.current) return;
    // 1.35 more on top: the dock scales the orb up while it listens.
    const px = Math.round(size * 1.6 * 1.35 * Math.min(2, window.devicePixelRatio || 1));
    const orb = createOrbRenderer(canvasRef.current, px);
    if (!orb) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let time = 7.3;
    let last = performance.now();
    let listen = 0;
    let work = 0;
    let shown = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const mood = stateRef.current;
      listen += ((mood === "listening" ? 1 : 0) - listen) * 0.08;
      work += ((mood === "working" ? 1 : 0) - work) * 0.1;
      shown += ((level.current ?? 0) - shown) * 0.25;
      if (!still || mood !== "idle") time += dt;
      orb.render({ time, level: shown, listen, work });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      orb.dispose();
    };
  }, [level, size]);

  return (
    <canvas
      ref={canvasRef}
      className="voice-orb"
      style={{ width: size * 1.6, height: size * 1.6 }}
      aria-hidden="true"
    />
  );
}
