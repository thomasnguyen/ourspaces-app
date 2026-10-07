/**
 * Flappy: the room's week-long high-score game. Everyone flies the same pipes
 * (seeded by room + week), the bird is your face, and the room's bests sit
 * beside the canvas with flags on the course where each of them went down.
 * Prototype: bests live in this browser; in mock rooms the cast's are seeded.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getAvatarSrc } from "../../data/avatars";
import type { GamePerson } from "../../lib/games/types";
import { useGames } from "../../lib/games/useMockGames";
import { byStyle, GameFace } from "./parts";
import "./flappy.css";

const W = 360, H = 560, GROUND = 56;
const GRAVITY = 1500, FLAP = -430, SPEED = 150, STEP = 1 / 120;
const PIPE_W = 64, GAP = 156, SPACING = 214, FIRST = 380, R = 17, BIRD_X = 96;

type Best = GamePerson & { best: number };
type Phase = "ready" | "play" | "dead";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Pipe n's gap centre: the same for everyone in the room this week. */
function gapY(seed: number, n: number): number {
  const r = hash(`${seed}:${n}`) / 4294967296;
  return 120 + r * (H - GROUND - 240);
}

const weekOf = (now: number) => Math.floor((now / 86400000 + 4) / 7);
const KEY = (room: string, week: number) => `flappy:${room}:${week}`;

function readBests(room: string, week: number): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY(room, week)) ?? "{}");
  } catch {
    return {};
  }
}

function useBests(room: string, people: GamePerson[], me: GamePerson, seeded: boolean) {
  const week = weekOf(Date.now());
  const [mine, setMine] = useState(() => readBests(room, week));
  const record = useCallback(
    (score: number) => {
      const next = { ...readBests(room, week) };
      if (score <= (next[me.name] ?? -1)) return false;
      next[me.name] = score;
      localStorage.setItem(KEY(room, week), JSON.stringify(next));
      setMine(next);
      return true;
    },
    [room, week, me.name],
  );
  const rows: Best[] = [];
  for (const p of people) {
    const kept = mine[p.name];
    /* the mock cast has played already; a live room only shows what was flown here */
    const best = kept ?? (seeded && p.name !== me.name ? 3 + (hash(`${room}${week}${p.name}`) % 19) : undefined);
    if (best !== undefined) rows.push({ ...p, best });
  }
  if (!people.some((p) => p.name === me.name) && mine[me.name] !== undefined) rows.push({ ...me, best: mine[me.name] });
  rows.sort((a, b) => b.best - a.best);
  return { rows, record, seed: hash(`${room}:${week}`) };
}

export function FlappyStart() {
  const api = useGames();
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).get("flappy") === "open");
  if (!api) return null;
  const people = api.rows.map(({ name, color }) => ({ name, color }));
  return (
    <>
      <button type="button" className="gm-ghost fl-start" data-testid="flappy-start" onClick={() => setOpen(true)}>
        flappy · beat the room →
      </button>
      {open && createPortal(<FlappySheet room={api.room} me={api.me} people={people} seeded={!api.live} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function FlappySheet({ room, me, people, seeded, onClose }: { room: string; me: GamePerson; people: GamePerson[]; seeded: boolean; onClose: () => void }) {
  const { rows, record, seed } = useBests(room, people, me, seeded);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [last, setLast] = useState<{ score: number; record: boolean } | null>(null);
  const flapRef = useRef<() => void>(() => {});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  /* the scoreboard re-renders every tick: the loop reads these through refs so a run never restarts */
  const live = useRef({ me, people, record, onClose });
  live.current = { me, people, record, onClose };

  useEffect(() => {
    const { me, people } = live.current;
    const record = (n: number) => live.current.record(n);
    const onClose = () => live.current.onClose();
    const el = canvas.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = W * dpr;
    el.height = H * dpr;
    const ctx = el.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const sky = v(`--color-${room}`, v("--color-crew", "purple"));
    const ink = v("--color-ink", "black"), card = v("--color-card", "white"), lime = v("--color-lime", "lime"), mat = v("--color-mat", "tan");
    const display = v("--font-display", "sans-serif");
    const face = new Image();
    const src = getAvatarSrc(me.name);
    if (src) face.src = src;
    const faces = new Map<string, HTMLImageElement>();
    for (const p of people) {
      const s = getAvatarSrc(p.name);
      if (s) {
        const img = new Image();
        img.src = s;
        faces.set(p.name, img);
      }
    }

    let state: Phase = "ready";
    let y = H / 2 - 40, vy = 0, dist = 0, score = 0, t = 0, deadAt = 0, acc = 0, prev = performance.now(), raf = 0;
    const flaps: number[] = [];

    const reset = () => {
      y = H / 2 - 40;
      vy = 0;
      dist = 0;
      score = 0;
      state = "ready";
    };
    flapRef.current = () => {
      if (state === "dead") {
        if (performance.now() - deadAt < 450) return;
        reset();
        setPhase("ready");
        setLast(null);
        return;
      }
      if (state === "ready") {
        state = "play";
        setPhase("play");
      }
      vy = FLAP;
      flaps.push(t);
    };

    const die = () => {
      state = "dead";
      deadAt = performance.now();
      const isRecord = record(score);
      setLast({ score, record: isRecord });
      setPhase("dead");
    };

    const pipeX = (n: number) => FIRST + n * SPACING - dist;

    const step = (dt: number) => {
      t += dt;
      if (state === "ready") {
        y = H / 2 - 40 + Math.sin(t * 4) * 8;
        return;
      }
      if (state === "dead") {
        if (y < H - GROUND - R) {
          vy += GRAVITY * dt;
          y = Math.min(H - GROUND - R, y + vy * dt);
        }
        return;
      }
      vy += GRAVITY * dt;
      y += vy * dt;
      dist += SPEED * dt;
      const passed = Math.floor((dist + BIRD_X - FIRST - PIPE_W) / SPACING) + 1;
      if (passed > score) score = passed;
      if (y > H - GROUND - R || y < -R * 2) return die();
      const n = Math.max(0, Math.floor((dist + BIRD_X - FIRST - PIPE_W) / SPACING));
      for (const k of [n, n + 1]) {
        const x = pipeX(k);
        if (BIRD_X + R - 4 > x && BIRD_X - R + 4 < x + PIPE_W) {
          const g = gapY(seed, k);
          if (y - R + 3 < g - GAP / 2 || y + R - 3 > g + GAP / 2) return die();
        }
      }
    };

    const slab = (x: number, top: number, h: number) => {
      ctx.fillStyle = ink;
      ctx.fillRect(x + 5, top + 5, PIPE_W, h);
      ctx.fillStyle = card;
      ctx.fillRect(x, top, PIPE_W, h);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, top, PIPE_W, h);
    };

    const draw = () => {
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      /* dotted paper grid drifting at half speed */
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      const off = (dist * 0.5) % 28;
      for (let gx = -off; gx < W; gx += 28) for (let gy = 14; gy < H - GROUND; gy += 28) ctx.fillRect(gx, gy, 2, 2);

      const first = Math.max(0, Math.floor((dist - FIRST - PIPE_W) / SPACING));
      for (let k = first; k < first + 4; k++) {
        const x = pipeX(k);
        if (x > W + 10) break;
        const g = gapY(seed, k);
        slab(x, -6, g - GAP / 2 + 6);
        slab(x, g + GAP / 2, H - GROUND - (g + GAP / 2));
        ctx.fillStyle = lime;
        ctx.fillRect(x - 6, g - GAP / 2 - 16, PIPE_W + 12, 16);
        ctx.fillRect(x - 6, g + GAP / 2, PIPE_W + 12, 16);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 6, g - GAP / 2 - 16, PIPE_W + 12, 16);
        ctx.strokeRect(x - 6, g + GAP / 2, PIPE_W + 12, 16);
      }

      /* the ground, with a flag where each friend's best run ended */
      ctx.fillStyle = mat;
      ctx.fillRect(0, H - GROUND, W, GROUND);
      ctx.fillStyle = ink;
      ctx.fillRect(0, H - GROUND, W, 3);
      for (const r of rowsRef.current) {
        if (r.name === me.name) continue;
        const fx = FIRST + r.best * SPACING - dist + PIPE_W + SPACING / 2 - PIPE_W / 2;
        if (fx < -30 || fx > W + 30) continue;
        ctx.fillStyle = ink;
        ctx.fillRect(fx - 1, H - GROUND - 34, 3, 34);
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(fx, H - GROUND - 40, 12, 0, Math.PI * 2);
        ctx.fill();
        const img = faces.get(r.name);
        if (img?.complete && img.naturalWidth) {
          ctx.save();
          ctx.clip();
          ctx.drawImage(img, fx - 12, H - GROUND - 52, 24, 24);
          ctx.restore();
        }
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(fx, H - GROUND - 40, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.font = `700 12px ${display}`;
        ctx.textAlign = "center";
        ctx.fillText(`${r.name.toLowerCase()} ${r.best}`, fx, H - GROUND + 22);
      }

      /* the bird: your face on your colour, tilting with speed, squashing on a flap */
      const sinceFlap = flaps.length ? t - flaps[flaps.length - 1] : 9;
      const squash = sinceFlap < 0.12 ? 1 - Math.sin((sinceFlap / 0.12) * Math.PI) * 0.18 : 1;
      const tilt = state === "ready" ? 0 : Math.max(-0.45, Math.min(1.2, vy / 650));
      ctx.save();
      ctx.translate(BIRD_X, y);
      ctx.rotate(tilt);
      ctx.scale(2 - squash, squash);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(3, 4, R + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = me.color;
      ctx.beginPath();
      ctx.arc(0, 0, R + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      if (face.complete && face.naturalWidth) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(face, -R, -R, R * 2, R * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = card;
        ctx.font = `800 18px ${display}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(me.name.slice(0, 1), 0, 1);
        ctx.textBaseline = "alphabetic";
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, R + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (state !== "ready") {
        ctx.font = `800 64px ${display}`;
        ctx.textAlign = "center";
        ctx.lineWidth = 8;
        ctx.strokeStyle = ink;
        ctx.strokeText(String(score), W / 2, 92);
        ctx.fillStyle = card;
        ctx.fillText(String(score), W / 2, 92);
      }
    };

    const loop = (now: number) => {
      acc += Math.min(0.1, (now - prev) / 1000);
      prev = now;
      while (acc >= STEP) {
        step(STEP);
        acc -= STEP;
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const key = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flapRef.current();
      }
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", key);
    };
  }, [room, seed]);

  const myRank = rows.findIndex((r) => r.name === me.name);
  const ahead = myRank > 0 ? rows[myRank - 1] : undefined;
  const leader = rows[0];

  return (
    <div className="fl-sheet" data-testid="flappy-sheet" data-phase={phase} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fl-card">
        <header className="fl-head">
          <span className="fl-kicker">this week's course · same pipes for everyone</span>
          <h3>flappy</h3>
          <button type="button" className="fl-close" data-testid="flappy-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="fl-body">
          <div className="fl-stage">
            <canvas
              ref={canvas}
              className="fl-canvas"
              data-testid="flappy-canvas"
              style={{ width: W, height: H }}
              onPointerDown={(e) => {
                e.preventDefault();
                flapRef.current();
              }}
            />
            {phase === "ready" && (
              <div className="fl-hint">
                <b>tap to flap</b>
                <span>{leader && leader.name !== me.name ? `${leader.name.toLowerCase()} has ${leader.best}. go.` : "space works too"}</span>
              </div>
            )}
            {phase === "dead" && last && (
              <div className="fl-over" data-testid="flappy-over">
                <span className="fl-over-kicker">{last.record && last.score > 0 ? "new best" : "down at"}</span>
                <strong>{last.score}</strong>
                <em>
                  {myRank === 0 && last.record
                    ? "top of the room. for now"
                    : ahead
                      ? `${ahead.best - (rows[myRank]?.best ?? 0) + 1} more to pass ${ahead.name.toLowerCase()}`
                      : "one more go"}
                </em>
                <button type="button" className="gm-go" data-testid="flappy-again" onClick={() => flapRef.current()}>
                  again →
                </button>
              </div>
            )}
          </div>
          <ol className="fl-board" data-testid="flappy-board">
            {rows.length === 0 && <li className="fl-empty">nobody's flown yet. first score sets the bar</li>}
            {rows.map((r, i) => (
              <li key={r.name} className={`fl-row ${r.name === me.name ? "is-me" : ""}`} style={byStyle(r, { "--i": i }) as CSSProperties}>
                <b className="fl-rank">{i + 1}</b>
                <GameFace person={r} />
                <span className="fl-name">{r.name === me.name ? "you" : r.name.toLowerCase()}</span>
                <strong>{r.best}</strong>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
