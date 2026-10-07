/**
 * Flappy: the room's week-long high-score game. Everyone flies the same pipes
 * (seeded by room + week), the bird is the classic one in your colour, and the
 * room's bests sit beside the canvas with flags on the course where each of
 * them went down. The world is the classic look, drawn here (no borrowed
 * sprites): teal sky, clouds, a city, bushes, green pipes, striped grass.
 * Prototype: bests live in this browser; in mock rooms the cast's are seeded.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { GamePerson } from "../../lib/games/types";
import { useGames } from "../../lib/games/useMockGames";
import { getSoundEnabled } from "../../lib/sounds";
import { byStyle, GameFace } from "./parts";
import "./flappy.css";

const W = 360, H = 560, GROUND = 76, FLOOR = H - GROUND;
const GRAVITY = 1500, FLAP = -430, SPEED = 150, STEP = 1 / 120;
const PIPE_W = 62, LIP = 6, LIP_H = 24, GAP = 158, SPACING = 214, FIRST = 400, R = 13, BIRD_X = 100;

type Best = GamePerson & { best: number };
type Phase = "ready" | "play" | "dead";

/** Medals, the classic ladder. */
export function medalOf(score: number): "platinum" | "gold" | "silver" | "bronze" | null {
  return score >= 40 ? "platinum" : score >= 30 ? "gold" : score >= 20 ? "silver" : score >= 10 ? "bronze" : null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Pipe n's gap centre: the same for everyone in the room this week. */
function gapY(seed: number, n: number): number {
  const r = hash(`${seed}:${n}`) / 4294967296;
  return 130 + r * (FLOOR - 260);
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
  return { rows, record, seed: hash(`${room}:${week}`), mine: mine[me.name] ?? 0 };
}

/** The three sounds, synthesised: a wing whoosh, the point ding, the hit. */
function useChirps() {
  const ac = useRef<AudioContext | null>(null);
  return useCallback((kind: "wing" | "point" | "hit" | "fall") => {
    if (!getSoundEnabled()) return;
    const ctx = (ac.current ??= new AudioContext());
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(ctx.destination);
    if (kind === "wing") {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.09, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(2400, t + 0.08);
      src.buffer = buf;
      src.connect(bp).connect(out);
      out.gain.value = 0.22;
      src.start(t);
      return;
    }
    const tone = (f: number, at: number, dur: number, type: OscillatorType, vol: number, to?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t + at);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + at + dur);
      g.gain.setValueAtTime(vol, t + at);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + dur);
    };
    if (kind === "point") {
      tone(1046, 0, 0.09, "square", 0.06);
      tone(1568, 0.08, 0.16, "square", 0.06);
    } else if (kind === "hit") {
      tone(160, 0, 0.18, "square", 0.12, 60);
    } else {
      tone(520, 0.05, 0.42, "triangle", 0.12, 140);
    }
  }, []);
}

export function FlappyStart() {
  const api = useGames();
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).get("flappy") !== null);
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
  const { rows, record, seed, mine } = useBests(room, people, me, seeded);
  const chirp = useChirps();
  const sheet = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [last, setLast] = useState<{ score: number; record: boolean; best: number } | null>(null);
  const flapRef = useRef<() => void>(() => {});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  /* the scoreboard re-renders every tick: the loop reads these through refs so a run never restarts */
  const live = useRef({ me, people, record, onClose, chirp, mine });
  live.current = { me, people, record, onClose, chirp, mine };

  useEffect(() => {
    const { me } = live.current;
    const sfx = (k: Parameters<typeof chirp>[0]) => live.current.chirp(k);
    const el = canvas.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = W * dpr;
    el.height = H * dpr;
    const ctx = el.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(sheet.current!);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const c = {
      ink: v("--color-ink"), card: v("--color-card"), sky: v("--fl-sky"), cloud: v("--fl-cloud"), city: v("--fl-city"),
      window: v("--fl-window"), bush: v("--fl-bush"), bushLo: v("--fl-bush-lo"), pipe: v("--fl-pipe"), pipeHi: v("--fl-pipe-hi"),
      pipeLo: v("--fl-pipe-lo"), ground: v("--fl-ground"), groundLo: v("--fl-ground-lo"), grass: v("--fl-grass"), grassLo: v("--fl-grass-lo"),
      beak: v("--fl-beak"), beakLo: v("--fl-beak-lo"), wing: v("--fl-wing"),
    };
    const display = v("--font-display");
    /* the backdrop, painted once as three tiles that loop at their own speeds */
    const tile = (h: number, paint: (g: CanvasRenderingContext2D) => void) => {
      const t = document.createElement("canvas");
      t.width = W * dpr;
      t.height = h * dpr;
      const g = t.getContext("2d")!;
      g.scale(dpr, dpr);
      paint(g);
      return t;
    };
    const CLOUD_H = 150, CITY_H = 120, BUSH_H = 46;
    const clouds = tile(CLOUD_H, (g) => {
      g.fillStyle = c.cloud;
      for (let x = -10, i = 0; x < W + 40; x += 34, i++) {
        const r = 22 + (hash(`c${i}`) % 18);
        for (const wx of [x - W, x, x + W]) {
          g.beginPath();
          g.arc(wx, CLOUD_H - 70 + (i % 2) * 8, r, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillRect(0, CLOUD_H - 70, W, 70);
    });
    const city = tile(CITY_H, (g) => {
      let x = 0, i = 0;
      while (x < W) {
        const bw = 22 + (hash(`b${i}`) % 26), bh = 40 + (hash(`h${i}`) % 70);
        g.fillStyle = c.city;
        g.fillRect(x, CITY_H - bh, bw, bh);
        g.fillStyle = c.window;
        for (let wy = CITY_H - bh + 8; wy < CITY_H - 10; wy += 12) for (let wx = x + 5; wx < x + bw - 6; wx += 9) g.fillRect(wx, wy, 4, 5);
        x += bw + 2;
        i++;
      }
    });
    const bushes = tile(BUSH_H, (g) => {
      for (const [col, dy] of [[c.bushLo, 0], [c.bush, 10]] as const) {
        g.fillStyle = col;
        for (let x = -6, i = 0; x < W + 30; x += 26, i++) {
          const by = BUSH_H - 12 + dy - (hash(`u${i}${dy}`) % 14);
          for (const wx of [x - W, x, x + W]) {
            g.beginPath();
            g.arc(wx + (dy ? 13 : 0), by, 20, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.fillRect(0, BUSH_H - 14 + dy, W, 20);
      }
    });
    const loopTile = (t: HTMLCanvasElement, h: number, y: number, speed: number) => {
      const off = Math.round((scroll * speed) % W);
      ctx.drawImage(t, -off, y, W + 1, h);
      ctx.drawImage(t, W - off - 1, y, W + 1, h);
    };

    let state: Phase = "ready";
    let y = H / 2 - 50, vy = 0, dist = 0, scroll = 0, score = 0, t = 0, deadAt = 0, hitAt = -9, scoredAt = -9, flapAt = -9, acc = 0, prev = performance.now(), raf = 0;

    const reset = () => {
      y = H / 2 - 50;
      vy = 0;
      dist = 0;
      score = 0;
      state = "ready";
    };
    flapRef.current = () => {
      if (state === "dead") {
        if (performance.now() - deadAt < 600) return;
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
      flapAt = t;
      sfx("wing");
    };

    const die = (ceilingOrPipe: boolean) => {
      state = "dead";
      deadAt = performance.now();
      hitAt = t;
      sfx("hit");
      if (ceilingOrPipe) sfx("fall");
      const isRecord = live.current.record(score);
      setLast({ score, record: isRecord, best: Math.max(score, live.current.mine) });
      window.setTimeout(() => setPhase("dead"), 520);
    };

    const pipeX = (n: number) => FIRST + n * SPACING - dist;

    /* ?flappy=auto flies itself through the gaps, for takes */
    const auto = new URLSearchParams(location.search).get("flappy") === "auto";
    const step = (dt: number) => {
      t += dt;
      if (auto && state !== "dead") {
        const next = Math.max(0, Math.floor((dist + BIRD_X - FIRST - PIPE_W - LIP - 16) / SPACING) + 1);
        if (state === "ready" ? t > 1.2 : y > gapY(seed, next) + 24 && vy > 0) flapRef.current();
      }
      if (state === "ready") {
        y = H / 2 - 50 + Math.sin(t * 5) * 7;
        scroll += SPEED * dt;
        return;
      }
      if (state === "dead") {
        if (y < FLOOR - R) {
          vy += GRAVITY * dt;
          y = Math.min(FLOOR - R, y + vy * dt);
        }
        return;
      }
      vy += GRAVITY * dt;
      y += vy * dt;
      dist += SPEED * dt;
      scroll += SPEED * dt;
      const passed = Math.max(0, Math.floor((dist + BIRD_X - FIRST - PIPE_W) / SPACING) + 1);
      if (passed > score) {
        score = passed;
        scoredAt = t;
        sfx("point");
      }
      if (y > FLOOR - R) {
        y = FLOOR - R;
        return die(false);
      }
      if (y < -R) y = -R;
      const n = Math.max(0, Math.floor((dist + BIRD_X - FIRST - PIPE_W) / SPACING));
      for (const k of [n, n + 1]) {
        const x = pipeX(k);
        if (BIRD_X + 15 > x - LIP && BIRD_X - 15 < x + PIPE_W + LIP) {
          const g = gapY(seed, k);
          if (y - 11 < g - GAP / 2 || y + 11 > g + GAP / 2) return die(true);
        }
      }
    };

    /* a pipe: shaded body, a wider lip at the open end, ink outline */
    const shade = (x: number, top: number, w: number, h: number) => {
      ctx.fillStyle = c.pipe;
      ctx.fillRect(x, top, w, h);
      ctx.fillStyle = c.pipeHi;
      ctx.fillRect(x + 5, top, 7, h);
      ctx.fillRect(x + 15, top, 3, h);
      ctx.fillStyle = c.pipeLo;
      ctx.fillRect(x + w - 12, top, 8, h);
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, top, w, h);
    };
    const pipe = (x: number, gy: number) => {
      const top = gy - GAP / 2, bot = gy + GAP / 2;
      shade(x, -4, PIPE_W, top - LIP_H + 4);
      shade(x - LIP, top - LIP_H, PIPE_W + LIP * 2, LIP_H);
      shade(x, bot + LIP_H, PIPE_W, FLOOR - bot - LIP_H);
      shade(x - LIP, bot, PIPE_W + LIP * 2, LIP_H);
    };

    /* the bird, the classic shape in a person's colour: round body, pale belly,
       big eye, two-lip beak, a wing that beats */
    const drawBird = (x: number, yy: number, color: string, tilt: number, beat: number, k = 1) => {
      ctx.save();
      ctx.translate(x, yy);
      ctx.rotate(tilt);
      ctx.scale(k, k);
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = c.ink;
      /* body + belly */
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = c.card;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.ellipse(2, 10, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(-4, -7, 9, 4, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
      ctx.stroke();
      /* eye */
      ctx.beginPath();
      ctx.arc(8, -5, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = c.card;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(10.5, -4.5, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = c.ink;
      ctx.fill();
      /* beak: upper and lower lip */
      ctx.beginPath();
      ctx.roundRect(7, 0, 15, 6, 3);
      ctx.fillStyle = c.beak;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(6, 6, 13, 5, 2.5);
      ctx.fillStyle = c.beakLo;
      ctx.fill();
      ctx.stroke();
      /* wing */
      ctx.save();
      ctx.translate(-9, 2);
      ctx.rotate(-0.15 + beat * 0.6);
      ctx.beginPath();
      ctx.ellipse(0, -beat * 3, 8.5, 5.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.wing;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    };
    const bird = () => {
      const tilt = state === "ready" ? 0 : state === "dead" ? Math.min(Math.PI / 2, Math.max(-0.4, vy / 600)) : Math.max(-0.42, Math.min(Math.PI / 2, (vy - 120) / 560));
      const beat = state === "dead" ? 0 : Math.sin(t - flapAt < 0.25 ? t * 38 : t * 18);
      drawBird(BIRD_X, y, me.color, tilt, beat);
    };

    const draw = () => {
      const shake = t - hitAt < 0.3 ? (1 - (t - hitAt) / 0.3) * 7 : 0;
      ctx.save();
      if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.fillStyle = c.sky;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      loopTile(clouds, CLOUD_H, FLOOR - CLOUD_H - 30, 0.12);
      loopTile(city, CITY_H, FLOOR - CITY_H - 14, 0.25);
      loopTile(bushes, BUSH_H, FLOOR - BUSH_H + 4, 0.5);

      if (state !== "ready") {
        const first = Math.max(0, Math.floor((dist - FIRST - PIPE_W - LIP) / SPACING));
        for (let k = first; k < first + 4; k++) {
          const x = pipeX(k);
          if (x > W + 10) break;
          pipe(x, gapY(seed, k));
        }
      }

      /* the ground: a striped grass edge scrolling with the pipes, sand under it */
      ctx.fillStyle = c.ground;
      ctx.fillRect(-10, FLOOR, W + 20, GROUND + 10);
      ctx.fillStyle = c.groundLo;
      ctx.fillRect(-10, FLOOR + 22, W + 20, 3);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-10, FLOOR, W + 20, 16);
      ctx.clip();
      ctx.fillStyle = c.grass;
      ctx.fillRect(-10, FLOOR, W + 20, 16);
      ctx.fillStyle = c.grassLo;
      const so = scroll % 24;
      for (let gx = -so - 24; gx < W + 24; gx += 24) {
        ctx.beginPath();
        ctx.moveTo(gx, FLOOR + 16);
        ctx.lineTo(gx + 12, FLOOR + 16);
        ctx.lineTo(gx + 24, FLOOR);
        ctx.lineTo(gx + 12, FLOOR);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = c.ink;
      ctx.fillRect(-10, FLOOR - 1, W + 20, 3);
      ctx.fillRect(-10, FLOOR + 15, W + 20, 2);

      /* each friend's bird perched on a post where their best run went down */
      if (state !== "ready") {
        for (const r of rowsRef.current) {
          if (r.name === me.name) continue;
          const fx = FIRST + r.best * SPACING - dist + PIPE_W + (SPACING - PIPE_W) / 2;
          if (fx < -40 || fx > W + 40) continue;
          ctx.fillStyle = c.ink;
          ctx.fillRect(fx - 1.5, FLOOR - 26, 3, 26);
          drawBird(fx, FLOOR - 34, r.color, 0, Math.sin(t * 6 + fx) * 0.3, 0.72);
          /* their name and score on an ink pill in the sand */
          const label = `${r.name.toLowerCase()} ${r.best}`;
          ctx.font = `800 13px ${display}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const lw = ctx.measureText(label).width + 16;
          ctx.fillStyle = c.ink;
          ctx.beginPath();
          ctx.roundRect(fx - lw / 2, FLOOR + 28, lw, 22, 11);
          ctx.fill();
          ctx.fillStyle = c.card;
          ctx.fillText(label, fx, FLOOR + 39.5);
          ctx.textBaseline = "alphabetic";
        }
      }

      bird();

      if (state === "play" || (state === "dead" && t - hitAt < 0.5)) {
        const pop = t - scoredAt < 0.14 ? 1 + Math.sin(((t - scoredAt) / 0.14) * Math.PI) * 0.18 : 1;
        ctx.save();
        ctx.translate(W / 2, 74);
        ctx.scale(pop, pop);
        ctx.font = `800 60px ${display}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 10;
        ctx.strokeStyle = c.ink;
        ctx.strokeText(String(score), 0, 0);
        ctx.fillStyle = c.card;
        ctx.fillText(String(score), 0, 0);
        ctx.restore();
      }
      ctx.restore();

      /* the hit: one white flash */
      if (t - hitAt < 0.16) {
        ctx.fillStyle = c.card;
        ctx.globalAlpha = 1 - (t - hitAt) / 0.16;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
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
      if (e.code === "Escape") live.current.onClose();
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
  const medal = last ? medalOf(last.score) : null;

  return (
    <div ref={sheet} className="fl-sheet" data-testid="flappy-sheet" data-phase={phase} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
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
              onPointerDown={(e) => {
                e.preventDefault();
                flapRef.current();
              }}
            />
            {phase === "ready" && (
              <div className="fl-hint">
                <b className="fl-title">get ready</b>
                <div className="fl-hint-low">
                  <span className="fl-tap">
                    <i aria-hidden="true">☝</i> tap
                  </span>
                  <span className="fl-chal">{leader && leader.name !== me.name ? `${leader.name.toLowerCase()} has ${leader.best}. go.` : "space works too"}</span>
                </div>
              </div>
            )}
            {phase === "dead" && last && (
              <div className="fl-over" data-testid="flappy-over">
                <b className="fl-title fl-title-over">game over</b>
                <div className="fl-panel">
                  <div className={`fl-medal ${medal ? `is-${medal}` : "is-none"}`} data-medal={medal ?? "none"}>
                    <span>medal</span>
                    <i aria-hidden="true">{medal ? "★" : ""}</i>
                  </div>
                  <dl>
                    <dt>score</dt>
                    <dd>{last.score}</dd>
                    <dt>best {last.record && last.score > 0 ? <em className="fl-new">new</em> : null}</dt>
                    <dd>{last.best}</dd>
                  </dl>
                </div>
                <span className="fl-chal">
                  {myRank === 0 && last.record && last.score > 0
                    ? "top of the room. for now"
                    : ahead
                      ? `${ahead.best - (rows[myRank]?.best ?? 0) + 1} more to pass ${ahead.name.toLowerCase()}`
                      : "one more go"}
                </span>
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
