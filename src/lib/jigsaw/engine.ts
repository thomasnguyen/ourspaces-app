/**
 * The jigsaw in mock mode: the pieces, the hands on them, and the clock.
 *
 * Everything that moves is written straight to the DOM as a transform on
 * rAF; React only hears about discrete things (who holds what, a piece
 * placed, the ghost). The other players are simulated here, and so is the
 * space's helper hand: it is SCRIPTED, not a model. What is real is the
 * rule. Every pick-up and every placement, a person's or the space's, goes
 * through `rightOfWay` (lib/games/rightOfWay.ts).
 *
 * Live (`o.live`): nobody is simulated and the space's hand is absent. The
 * other people's pieces arrive from Convex (`applyRemote`: where each piece
 * is and who holds it, a lease that runs out by itself); your own grabs,
 * moves and drops go out through `o.live.onLocal`. The same rule decides a
 * grab here and again on the server (convex/puzzles.ts).
 */
import { rightOfWay, type Decision, type Hold, type Mover } from "../games/rightOfWay";
import { seeded, type Cut } from "./cut";

export type Rect = { x: number; y: number; w: number; h: number };
export type Layout = { W: number; H: number; frame: Rect; /** where loose pieces may lie (piece centres) */ zones: Rect[]; phone: boolean };
export type Person = { name: string; color: string };
export type YouMode = "real" | "play" | "reach" | "hold" | "none";
export type Beat = "yield" | "nod" | "";

export const SPACE_NAME = "the space";

export type PieceState = "loose" | "held" | "placed";
export type Ghost = { piece: number; on: string | null; leaving?: boolean };

export type Snap = {
  v: number;
  phase: "cut" | "burst" | "play" | "finish";
  placed: number;
  total: number;
  states: PieceState[];
  holders: (string | null)[];
  ghost: Ghost | null;
  /** what the space says out loud, in a few words */
  line: string | null;
  helper: "idle" | "waiting" | "last";
  counts: Record<string, number>;
  waits: number;
  refusals: number;
};

export type JigsawResult = {
  ms: number;
  total: number;
  /** people who placed at least one, in the order they first did */
  by: Person[];
  counts: Record<string, number>;
  space: { placed: number; waits: number };
  finisher: string;
  lastCorner?: string;
  /** held one piece the longest before finding its place */
  patient?: string;
};

type Tween = { x0: number; y0: number; r0: number; x1: number; y1: number; r1: number; el: number; dur: number; delay: number; ease: (t: number) => number };
type P = {
  id: number; corner: boolean; edge: boolean;
  hx: number; hy: number; x: number; y: number; r: number;
  state: PieceState; holder: string | null; heldAt: number; placedBy: string | null;
  tw: Tween | null; el: HTMLElement | null; dirty: boolean; z: number;
};
type Seg = { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; bow: number; t: number; dur: number };
type Mode = "rest" | "reach" | "press" | "arrive" | "setdown" | "park" | "last" | "off";
type Plan = "place" | "wrong" | "release";
type A = Person & {
  kind: "person" | "space"; you: boolean; auto: boolean;
  x: number; y: number; segs: Seg[]; wait: number; mode: Mode;
  target: number; holding: number; gx: number; gy: number;
  plan: Plan; wrongAt: [number, number] | null; retry: number; force: number; forcePlan: Plan | null;
  speed: number; el: HTMLElement | null; dirty: boolean; chase: number;
  /** the space only: the piece its next move is about, and who it waits on */
  want: number; waitingOn: string | null;
};

const STEP = 4;
const jerk = (t: number) => t * t * t * (10 + t * (-15 + 6 * t));
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= (((ax * t + bx) * t + cx) * t - x) / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
/* the house curves (index.css @theme), for moves the engine tweens itself */
const GLIDE = bezier(0.16, 1, 0.3, 1);
const POP = bezier(0.2, 0.9, 0.3, 1.18);
const GLIDE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";
const SNAP_CSS = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** live: one of your moves, for the server */
export type LocalMove = { kind: "grab" | "move" | "drop" | "place"; id: number; x: number; y: number };
/** live: a piece as the server has it */
export type RemotePiece = { i: number; x: number; y: number; placed: boolean; by?: string | null; holder: string | null };

export type EngineOptions = {
  live?: { onLocal: (m: LocalMove) => void };
  layout: Layout;
  cut: Cut;
  seed: number;
  you: Person;
  youMode: YouMode;
  sims: Person[];
  beat: Beat;
  /** pieces already in when you arrive (a late joiner) */
  already: number;
  /** skip the cut-and-burst (late joiners, held states) */
  skipIntro: boolean;
  onChange: (snap: Snap) => void;
  onFinish: (result: JigsawResult) => void;
  sound: () => void;
};

export class JigsawEngine {
  readonly o: EngineOptions;
  readonly pieces: P[] = [];
  readonly agents: A[] = [];
  private readonly rand: () => number;
  private readonly you: A;
  private readonly space: A;
  private phase: Snap["phase"] = "cut";
  private t = 0;
  private playAt = 0;
  private clockFrom = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private v = 0;
  private z = 10;
  private placed = 0;
  private ghost: Ghost | null = null;
  private ghostGoneAt = 0;
  private line: string | null = null;
  private counts: Record<string, number> = {};
  private order: string[] = [];
  private waits = 0;
  private refusals = 0;
  private lastCorner: string | undefined;
  private longest: Record<string, number> = {};
  private lastOneSince = 0;
  private lineAt = 0;
  private beatDone = false;
  private youScriptDone = false;
  private youWaited = false;
  private soundAt = -1000;
  private clockEl: HTMLElement | null = null;
  private clockShown = -1;
  private done = false;
  /** frame times of the last couple of seconds, for the dev readout and the perf check */
  readonly frames: number[] = [];

  constructor(o: EngineOptions) {
    this.o = o;
    this.rand = seeded(o.seed);
    const { cut, layout } = o;
    for (const c of cut.pieces) {
      const hx = layout.frame.x + c.col * cut.cw, hy = layout.frame.y + c.row * cut.ch;
      this.pieces.push({ id: c.id, corner: c.corner, edge: c.edge, hx, hy, x: hx, y: hy, r: 0, state: "loose", holder: null, heldAt: 0, placedBy: null, tw: null, el: null, dirty: true, z: 2 });
    }
    const agent = (p: Person, kind: A["kind"], you: boolean, auto: boolean, i: number): A => {
      const left = i % 2 === 0;
      return {
        ...p, kind, you, auto, x: left ? -60 : layout.W + 60, y: layout.H * (0.25 + 0.5 * this.rand()), segs: [], wait: 500 + i * 650 + this.rand() * 500, mode: auto ? "rest" : "off",
        target: -1, holding: -1, gx: 0, gy: 0, plan: "place", wrongAt: null, retry: -1, force: -1, forcePlan: null,
        speed: 0.8 + this.rand() * 0.5, el: null, dirty: true, chase: 0, want: -1, waitingOn: null,
      };
    };
    o.sims.forEach((sim, i) => this.agents.push(agent(sim, "person", false, !o.live, i)));
    this.you = agent(o.you, "person", true, o.youMode !== "real" && o.youMode !== "none", 1);
    this.you.wait = o.youMode === "hold" ? 900 : o.youMode === "reach" ? 2600 : 1400;
    this.you.x = layout.W * 0.5;
    this.you.y = layout.H + 50;
    if (o.youMode !== "none") this.agents.push(this.you);
    /* live: the space's hand is absent (its live behaviour is the Right of Way gate's task) */
    this.space = agent({ name: SPACE_NAME, color: "var(--color-sticker)" }, "space", false, !o.live, 1);
    this.space.wait = o.youMode === "hold" ? 3300 : 2400;
    this.space.y = -50;
    this.space.x = layout.W * 0.8;
    this.agents.push(this.space);
    this.scatter();
    if (o.skipIntro) {
      for (const p of this.pieces) if (p.tw) { p.x = p.tw.x1; p.y = p.tw.y1; p.r = p.tw.r1; p.tw = null; }
      /* whoever was here before you: the players, and the space now and then */
      const people = [...(o.youMode === "none" || o.sims.length === 0 ? [] : o.sims), ...(o.youMode !== "none" && o.already >= this.pieces.length - 3 ? [o.you] : []), { name: SPACE_NAME, color: "" }];
      if (people.length === 1) people.unshift(o.you);
      const ids = this.pieces.map((p) => p.id).sort(() => this.rand() - 0.5).slice(0, Math.max(0, Math.min(o.already, this.pieces.length - 2)));
      ids.forEach((id, i) => {
        const p = this.pieces[id], who = people[i % people.length].name;
        Object.assign(p, { x: p.hx, y: p.hy, r: 0, state: "placed", placedBy: who });
        this.count(who);
        this.placed += 1;
      });
      this.clockFrom = ids.length * 2300;
      this.phase = "play";
      /* near the end the others hang back: the last pieces are for whoever just walked in */
      if (this.left() <= 3 && o.youMode !== "none") for (const a of this.agents) if (a.kind === "person" && !a.you) a.wait += 5000;
    }
  }

  /* ---------- wiring ---------- */

  attachPiece(id: number, el: HTMLElement | null) {
    const p = this.pieces[id];
    p.el = el;
    p.dirty = true;
    if (el) {
      el.style.zIndex = String(p.z);
      this.write(p);
    }
  }
  attachAgent(name: string, el: HTMLElement | null) {
    const a = this.agents.find((x) => x.name === name);
    if (!a) return;
    a.el = el;
    a.dirty = true;
  }
  attachClock(el: HTMLElement | null) {
    this.clockEl = el;
    this.clockShown = -1;
  }
  start() {
    this.last = performance.now();
    this.emit();
    const loop = (now: number) => {
      const dt = Math.min(50, now - this.last);
      this.frames.push(now - this.last);
      if (this.frames.length > 240) this.frames.shift();
      this.last = now;
      /* the simulation runs on a fixed 4 ms step so a seed replays the same game; the DOM is written once a frame */
      this.acc += dt;
      while (this.acc >= STEP) {
        this.step(STEP);
        this.acc -= STEP;
      }
      this.flush();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }
  snap(): Snap {
    return {
      v: this.v, phase: this.phase, placed: this.placed, total: this.pieces.length,
      states: this.pieces.map((p) => p.state), holders: this.pieces.map((p) => p.holder),
      ghost: this.ghost, line: this.line,
      helper: this.space.mode === "last" ? "last" : this.space.waitingOn ? "waiting" : "idle",
      counts: { ...this.counts }, waits: this.waits, refusals: this.refusals,
    };
  }
  elapsed() {
    return this.phase === "cut" || this.phase === "burst" ? 0 : this.clockFrom + this.t - this.playAt;
  }
  private emit() {
    this.v += 1;
    this.o.onChange(this.snap());
  }

  /* ---------- your hand (a real pointer) ---------- */

  grab(id: number, x: number, y: number): Decision | null {
    const p = this.pieces[id];
    if (this.phase !== "play" || !p || p.state === "placed" || this.you.holding >= 0) return null;
    this.point(x, y);
    const d = rightOfWay(this.holds(), { thing: String(id), by: this.mover(this.you) });
    if (d.kind === "go") {
      this.take(this.you, p);
      this.o.live?.onLocal({ kind: "grab", id, x: p.x, y: p.y });
    } else if (d.kind === "wait") this.refuse(p, this.you);
    return d;
  }
  point(x: number, y: number) {
    const a = this.you;
    a.x = x;
    a.y = y;
    a.dirty = true;
    if (a.holding >= 0) {
      this.carry(a);
      const p = this.pieces[a.holding];
      this.write(p);
      this.o.live?.onLocal({ kind: "move", id: p.id, x: p.x, y: p.y });
    }
  }
  release() {
    const a = this.you;
    if (a.holding < 0) return;
    const p = this.pieces[a.holding];
    if (Math.hypot(p.x - p.hx, p.y - p.hy) < this.snapWithin()) {
      this.place(a, p);
      this.o.live?.onLocal({ kind: "place", id: p.id, x: p.hx, y: p.hy });
    } else {
      this.drop(a, p, (this.rand() - 0.5) * 8);
      this.o.live?.onLocal({ kind: "drop", id: p.id, x: p.tw?.x1 ?? p.x, y: p.tw?.y1 ?? p.y });
    }
  }

  /** live: the server said someone else has it (a race the local rule couldn't see): let go */
  yieldPiece(id: number) {
    const a = this.you;
    if (a.holding !== id) return;
    const p = this.pieces[id];
    this.drop(a, p, 0);
    this.refuse(p, a);
  }

  /** live: the room's pieces as the server has them. Your own hand wins on your screen. */
  applyRemote(rows: readonly RemotePiece[], colors: (name: string) => string) {
    let changed = false;
    const agentFor = (name: string): A => {
      let a = this.agents.find((x) => x.name === name);
      if (!a) {
        a = { name, color: colors(name), kind: "person", you: false, auto: false, x: -60, y: -60, segs: [], wait: 0, mode: "off", target: -1, holding: -1, gx: 0, gy: 0, plan: "place", wrongAt: null, retry: -1, force: -1, forcePlan: null, speed: 1, el: null, dirty: false, chase: 0, want: -1, waitingOn: null };
        this.agents.push(a);
      }
      return a;
    };
    const glide = (p: P, x: number, y: number) => {
      if (Math.hypot(p.x - x, p.y - y) < 0.5) return;
      p.tw = { x0: p.x, y0: p.y, r0: p.r, x1: x, y1: y, r1: p.state === "held" ? 0 : p.r, el: 0, dur: 110, delay: 0, ease: GLIDE };
    };
    for (const r of rows) {
      const p = this.pieces[r.i];
      if (!p || this.you.holding === p.id) continue;
      if (r.placed) {
        if (p.state !== "placed") {
          const a = agentFor(r.by ?? r.holder ?? "someone");
          if (p.holder && p.holder !== a.name) { const h = this.agents.find((x) => x.name === p.holder); if (h) h.holding = -1; }
          a.holding = p.id;
          this.place(a, p);
          changed = true;
        }
        continue;
      }
      if (r.holder && r.holder !== this.you.name) {
        const a = agentFor(r.holder);
        if (p.state !== "held" || p.holder !== a.name) {
          if (a.holding >= 0 && a.holding !== p.id) { const q = this.pieces[a.holding]; if (q.state === "held") { q.state = "loose"; q.holder = null; } }
          if (p.holder) { const h = this.agents.find((x) => x.name === p.holder); if (h) h.holding = -1; }
          p.state = "held";
          p.holder = a.name;
          a.holding = p.id;
          p.z = this.z += 1;
          if (p.el) p.el.style.zIndex = String(p.z);
          changed = true;
        }
        glide(p, r.x, r.y);
      } else {
        if (p.state === "held" && p.holder !== this.you.name) {
          const h = this.agents.find((x) => x.name === p.holder);
          if (h) h.holding = -1;
          p.state = "loose";
          p.holder = null;
          changed = true;
        }
        glide(p, r.x, r.y);
      }
    }
    if (changed) this.emit();
  }

  /* ---------- the clock ---------- */

  private step(dt: number) {
    this.t += dt;
    if (this.phase === "cut" && this.t > 420) {
      this.phase = "burst";
      this.emit();
    }
    if (this.phase === "burst" && this.pieces.every((p) => !p.tw)) {
      this.phase = "play";
      this.playAt = this.t;
      this.emit();
    }
    for (const p of this.pieces) {
      const tw = p.tw;
      if (tw && this.phase !== "cut") {
        tw.el += dt;
        if (tw.el >= tw.delay) {
          const k = Math.min(1, (tw.el - tw.delay) / tw.dur), e = tw.ease(k);
          p.x = tw.x0 + (tw.x1 - tw.x0) * e;
          p.y = tw.y0 + (tw.y1 - tw.y0) * e;
          p.r = tw.r0 + (tw.r1 - tw.r0) * e;
          p.dirty = true;
          if (k >= 1) p.tw = null;
        }
      } else if (p.state === "held" && p.r !== 0) {
        /* a piece straightens in the hand */
        p.r = Math.abs(p.r) < 0.15 ? 0 : p.r * Math.exp(-dt / 55);
        p.dirty = true;
      }
    }
    if (this.phase === "play") {
      if (this.ghost?.leaving && this.t > this.ghostGoneAt) {
        this.ghost = null;
        this.emit();
      }
      this.direct();
      for (const a of this.agents) this.move(a, dt);
    }
  }

  private flush() {
    for (const p of this.pieces) if (p.dirty) this.write(p);
    for (const a of this.agents) {
      if (a.dirty && a.el) a.el.style.transform = `translate3d(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px,0)`;
      a.dirty = false;
    }
    if (this.clockEl) {
      const s = Math.floor(this.elapsed() / 1000);
      if (s !== this.clockShown) {
        this.clockShown = s;
        this.clockEl.textContent = clock(s * 1000);
      }
    }
  }

  private write(p: P) {
    p.dirty = false;
    const pad = this.o.cut.pad;
    if (p.el) p.el.style.transform = `translate3d(${(p.x - pad).toFixed(1)}px,${(p.y - pad).toFixed(1)}px,0) rotate(${p.r.toFixed(2)}deg)`;
  }

  private move(a: A, dt: number) {
    const s = a.segs[0];
    if (s) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur), e = jerk(k), bow = Math.sin(Math.PI * e) * s.bow;
      a.x = s.x0 + (s.x1 - s.x0) * e + s.nx * bow;
      a.y = s.y0 + (s.y1 - s.y0) * e + s.ny * bow;
      a.dirty = true;
      if (k >= 1) a.segs.shift();
      if (a.holding >= 0) this.carry(a);
    } else if (a.wait > 0) a.wait -= dt;
    else if (a.auto) a.kind === "space" ? this.thinkSpace(a) : this.thinkPerson(a);
  }

  private carry(a: A) {
    const p = this.pieces[a.holding];
    p.x = a.x - a.gx;
    p.y = a.y - a.gy;
    p.dirty = true;
  }

  private go(a: A, x: number, y: number, dur: number, bow = 0) {
    const from = a.segs[a.segs.length - 1];
    const x0 = from ? from.x1 : a.x, y0 = from ? from.y1 : a.y;
    const d = Math.hypot(x - x0, y - y0) || 1;
    a.segs.push({ x0, y0, x1: x, y1: y, nx: -(y - y0) / d, ny: (x - x0) / d, bow, t: 0, dur: Math.max(60, dur) });
  }
  private remaining(a: A) {
    return a.segs.reduce((sum, s) => sum + s.dur - s.t, 0);
  }

  /* ---------- the rule's inputs ---------- */

  private mover(a: A): Mover {
    return a.kind === "space" ? { kind: "space" } : { kind: "person", name: a.name };
  }
  private holds(): Hold[] {
    return this.agents.filter((a) => a.holding >= 0).map((a) => ({ thing: String(a.holding), by: this.mover(a) }));
  }
  private left() {
    return this.pieces.length - this.placed;
  }
  private snapWithin() {
    return Math.max(20, this.o.cut.cw * 0.3);
  }
  private centre(p: P): [number, number] {
    return [p.x + this.o.cut.cw / 2, p.y + this.o.cut.ch / 2];
  }

  /* ---------- what a hand can do ---------- */

  private take(a: A, p: P) {
    if (p.holder === SPACE_NAME && a !== this.space) {
      /* a person reached for what the space was carrying: it lets go */
      const s = this.space;
      s.holding = -1;
      s.segs = [];
      s.want = -1;
      s.mode = "rest";
      s.wait = 1600;
      this.ghost = null;
      this.nod(s);
    }
    p.state = "held";
    p.holder = a.name;
    p.heldAt = this.t;
    p.tw = null;
    a.holding = p.id;
    a.gx = a.x - p.x;
    a.gy = a.y - p.y;
    p.dirty = true;
    p.z = this.z += 1;
    if (p.el) p.el.style.zIndex = String(p.z);
    const s = this.space;
    if (a !== s && s.want === p.id) this.beginWait(s, p, a.name);
    this.emit();
  }

  private drop(a: A, p: P, rot: number) {
    const { layout, cut } = this.o;
    const x = Math.max(-cut.cw * 0.3, Math.min(layout.W - cut.cw * 0.7, p.x)), y = Math.max(-cut.ch * 0.2, Math.min(layout.H - cut.ch * 0.8, p.y));
    this.held(a, p);
    p.state = "loose";
    p.holder = null;
    a.holding = -1;
    p.tw = { x0: p.x, y0: p.y, r0: 0, x1: x, y1: y, r1: rot, el: 0, dur: 200, delay: 0, ease: GLIDE };
    const s = this.space;
    if (a !== s && s.want === p.id && s.waitingOn) {
      /* they let go without placing it: the space's move may land now */
      s.waitingOn = null;
      if (this.ghost) this.ghost = { piece: p.id, on: null };
      s.mode = "rest";
      s.wait = 260;
    }
    this.emit();
  }

  private place(a: A, p: P) {
    this.held(a, p);
    p.state = "placed";
    p.holder = null;
    p.placedBy = a.name;
    a.holding = -1;
    p.tw = { x0: p.x, y0: p.y, r0: p.r, x1: p.hx, y1: p.hy, r1: 0, el: 0, dur: 130, delay: 0, ease: GLIDE };
    p.z = 1;
    if (p.el) p.el.style.zIndex = "1";
    /* squash on landing, then settle */
    p.el?.firstElementChild?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.09, 0.9)", offset: 0.3 }, { transform: "scale(1)" }],
      { duration: 380, easing: SNAP_CSS },
    );
    if (this.t - this.soundAt > 90) {
      this.soundAt = this.t;
      this.o.sound();
    }
    this.count(a.name);
    this.placed += 1;
    if (p.corner && a.kind === "person") this.lastCorner = a.name;
    const s = this.space;
    if (a === s) {
      this.ghost = null;
      s.want = -1;
    } else if (s.want === p.id) {
      /* the person placed the piece the space was waiting for: nothing to do but nod */
      if (this.ghost) {
        this.ghost = { ...this.ghost, leaving: true };
        this.ghostGoneAt = this.t + 420;
      }
      s.want = -1;
      s.waitingOn = null;
      s.segs = [];
      s.mode = "rest";
      s.wait = 1500;
      this.nod(s);
    }
    if (this.left() === 1) {
      this.lastOneSince = this.t;
      if (s.mode === "rest") s.wait = Math.min(s.wait, 450);
    }
    if (this.left() === 0) this.finish(a);
    this.emit();
  }

  private held(a: A, p: P) {
    if (a.kind === "person") this.longest[a.name] = Math.max(this.longest[a.name] ?? 0, this.t - p.heldAt);
  }
  private count(name: string) {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    if (name !== SPACE_NAME && !this.order.includes(name)) this.order.push(name);
  }

  /** Reaching for a piece in someone's hand: it leans away, their tag bumps. */
  private refuse(p: P, a: A) {
    this.refusals += 1;
    const [cx, cy] = this.centre(p);
    const d = Math.hypot(cx - a.x, cy - a.y) || 1;
    const dx = ((cx - a.x) / d) * 15, dy = ((cy - a.y) / d) * 15 - 4;
    const lean = dx >= 0 ? 8 : -8;
    p.el?.firstElementChild?.animate(
      [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) rotate(${lean}deg)`, offset: 0.35 }, { transform: "none" }],
      { duration: 560, easing: GLIDE_CSS },
    );
    p.el?.querySelector(".jg-tag")?.animate([{ scale: "1" }, { scale: "1.22", offset: 0.3 }, { scale: "1" }], { duration: 420, easing: SNAP_CSS });
    this.emit();
  }

  private nod(a: A) {
    this.go(a, a.x, a.y + 10, 150);
    this.go(a, a.x, a.y, 220);
  }

  private finish(by: A) {
    if (this.done) return;
    this.done = true;
    this.phase = "finish";
    this.line = null;
    this.ghost = null;
    for (const a of this.agents) a.segs = [];
    const people = [this.o.you, ...this.o.sims];
    const names = Object.entries(this.longest).filter(([name]) => name !== this.lastCorner).sort((x, y) => y[1] - x[1]);
    const result: JigsawResult = {
      ms: this.elapsed(), total: this.pieces.length,
      by: this.order.map((name) => people.find((p) => p.name === name)).filter((p): p is Person => Boolean(p)),
      counts: { ...this.counts }, space: { placed: this.counts[SPACE_NAME] ?? 0, waits: this.waits },
      finisher: by.name, lastCorner: this.lastCorner, patient: names[0]?.[0],
    };
    this.o.onFinish(result);
  }

  /* ---------- simulated people ---------- */

  private targeted(id: number, but: A) {
    return this.agents.some((a) => a !== but && a.target === id);
  }

  private pickFor(a: A): number {
    if (a.force >= 0) {
      const id = a.force;
      a.force = -1;
      if (this.pieces[id].state === "loose") return id;
    }
    if (a.retry >= 0) {
      const id = a.retry;
      a.retry = -1;
      if (this.pieces[id].state === "loose") return id;
    }
    if (a.you && this.o.youMode === "reach" && !this.youScriptDone) {
      /* the scripted you reaches for a piece somebody is holding */
      const held = this.pieces.find((p) => p.state === "held" && p.holder !== SPACE_NAME && this.t - p.heldAt > 250);
      if (!held) return -1;
      this.youScriptDone = true;
      return held.id;
    }
    /* a staged beat (&beat=): while the space waits, nobody starts anything new, so the yield is the only thing moving */
    if (this.o.beat && this.space.want >= 0 && (this.space.waitingOn || this.ghost)) return -1;
    const free = this.pieces.filter((p) => p.state === "loose");
    if (free.length === 0) return -1;
    /* a scripted you lets the space say its line before taking the last one */
    if (a.you && this.left() === 1 && (this.space.mode !== "last" || this.t - this.lineAt < 1500)) return -1;
    /* the last one waits a while for you */
    const humanHere = this.o.youMode !== "none";
    if (this.left() === 1 && humanHere && !a.you && this.t - this.lastOneSince < (this.o.youMode === "real" ? 9000 : 30000)) return -1;
    const s = this.space;
    if (!a.you && s.mode === "reach" && s.target >= 0 && this.remaining(s) > 520 && this.rand() < 0.42 && this.left() > 3) return s.target;
    const open = free.filter((p) => !this.targeted(p.id, a) && p.id !== s.want);
    const pool = (open.length ? open : free).map((p) => ({ p, d: Math.hypot(p.x - a.x, p.y - a.y) })).sort((x, y) => x.d - y.d);
    return pool[Math.floor(this.rand() * Math.min(4, pool.length))].p.id;
  }

  private thinkPerson(a: A) {
    const { cut, layout } = this.o;
    if (a.mode === "rest") {
      const id = this.pickFor(a);
      if (id < 0) {
        a.wait = 220;
        return;
      }
      a.target = id;
      a.chase = 0;
      const [cx, cy] = this.centre(this.pieces[id]);
      const tx = cx + (this.rand() - 0.5) * cut.cw * 0.3, ty = cy + (this.rand() - 0.5) * cut.ch * 0.3;
      const d = Math.hypot(tx - a.x, ty - a.y) || 1;
      let dur = ((360 + d * 1.2) / a.speed) * (0.85 + this.rand() * 0.4);
      const s = this.space;
      if (s.target === id && s.mode === "reach") dur = Math.max(240, Math.min(dur, this.remaining(s) - 200));
      const over = 4 + this.rand() * 12;
      this.go(a, tx + ((tx - a.x) / d) * over, ty + ((ty - a.y) / d) * over, dur, (this.rand() - 0.5) * d * 0.22);
      this.go(a, tx, ty, 110 + this.rand() * 90);
      a.mode = "reach";
      return;
    }
    if (a.mode === "reach") {
      const p = this.pieces[a.target];
      if (!p || p.state === "placed") return this.rest(a, 300 + this.rand() * 500);
      const [cx, cy] = this.centre(p);
      if (Math.hypot(cx - a.x, cy - a.y) > cut.cw * 0.55 && (a.chase += 1) < 5) {
        this.go(a, cx, cy, 240);
        return;
      }
      const d = rightOfWay(this.holds(), { thing: String(p.id), by: this.mover(a) });
      if (d.kind !== "go" || p.holder === SPACE_NAME) {
        /* somebody has it: a beat of "oh", then something else */
        if (d.kind === "wait") this.refuse(p, a);
        this.go(a, a.x + (this.rand() - 0.5) * 50, a.y + 30 + this.rand() * 22, 340);
        return this.rest(a, (a.you ? 1100 : 600) + this.rand() * 700);
      }
      this.take(a, p);
      a.mode = "press";
      a.wait = 110;
      return;
    }
    if (a.mode === "press") {
      const p = this.pieces[a.holding];
      const wanted = this.space.want === p.id;
      const roll = this.rand();
      let plan: Plan = roll < 0.09 ? "release" : roll < 0.2 ? "wrong" : "place";
      let hover = this.rand() < 0.35 || plan === "release" ? 600 + this.rand() * 1100 : 0;
      if (wanted) {
        plan = this.rand() < 0.55 ? "release" : "place";
        hover = 1900 + this.rand() * 900;
      }
      if (this.o.youMode === "reach" && !this.youScriptDone && !a.you) {
        plan = "place";
        hover = 3200;
      }
      if (a.forcePlan) {
        plan = a.forcePlan;
        a.forcePlan = null;
        hover = 2300;
      }
      if (a.you && this.o.youMode === "hold" && !this.youScriptDone) {
        this.youScriptDone = true;
        plan = "release";
        hover = 5200;
      }
      if (this.left() <= 2) plan = "place";
      let to: [number, number] = [p.hx, p.hy];
      a.wrongAt = null;
      if (plan === "wrong") {
        const near = this.pieces.filter((q) => q.id !== p.id && q.state !== "placed" && Math.abs(q.hx - p.hx) + Math.abs(q.hy - p.hy) < cut.cw + cut.ch + 2);
        if (near.length) {
          const q = near[Math.floor(this.rand() * near.length)];
          to = [q.hx + (this.rand() - 0.5) * 10, q.hy + (this.rand() - 0.5) * 10];
          a.wrongAt = to;
        } else plan = "place";
      }
      a.plan = plan;
      const carryMs = (d: number) => ((420 + d * 1.5) / a.speed) * (0.9 + this.rand() * 0.3);
      if (hover > 0) {
        const k = 0.4 + this.rand() * 0.3;
        const hx = Math.max(20, Math.min(layout.W - cut.cw - 20, p.x + (to[0] - p.x) * k + (this.rand() - 0.5) * 70));
        const hy = Math.max(60, Math.min(layout.H - cut.ch - 20, p.y + (to[1] - p.y) * k + (this.rand() - 0.5) * 60));
        const d = Math.hypot(hx - p.x, hy - p.y);
        this.go(a, hx + a.gx, hy + a.gy, carryMs(d), (this.rand() - 0.5) * d * 0.25);
        const parts = Math.max(2, Math.round(hover / 700));
        for (let i = 0; i < parts; i += 1) this.go(a, hx + a.gx + (this.rand() - 0.5) * 26, hy + a.gy + (this.rand() - 0.5) * 20, hover / parts);
        if (plan !== "release") this.go(a, to[0] + a.gx, to[1] + a.gy, carryMs(Math.hypot(to[0] - hx, to[1] - hy)) * 0.8);
      } else {
        const d = Math.hypot(to[0] - p.x, to[1] - p.y);
        const jx = plan === "place" ? (this.rand() - 0.5) * 6 : 0;
        this.go(a, to[0] + a.gx + jx, to[1] + a.gy + jx, carryMs(d), (this.rand() - 0.5) * d * 0.2);
      }
      a.mode = "arrive";
      return;
    }
    if (a.mode === "arrive") {
      const p = this.pieces[a.holding];
      if (!p) return this.rest(a, 400);
      if (a.plan === "place") this.place(a, p);
      else {
        this.drop(a, p, (this.rand() - 0.5) * 12);
        if (a.plan === "wrong" && this.rand() < 0.6) a.retry = p.id;
      }
      this.rest(a, a.plan === "place" ? 1100 + this.rand() * 2400 : 500 + this.rand() * 600);
    }
  }

  private rest(a: A, ms: number) {
    a.mode = "rest";
    a.target = -1;
    a.wait = ms / (a.kind === "person" ? a.speed : 1);
  }

  /* ---------- the space's hand (scripted here; the rule is real) ---------- */

  private pickForSpace(): number {
    const a = this.space;
    const inHand = this.pieces.filter((p) => p.state === "held" && p.holder !== SPACE_NAME && this.t - p.heldAt > 900);
    const yours = inHand.find((p) => p.holder === this.you.name);
    if (yours && (!this.youWaited || this.rand() < 0.5)) {
      this.youWaited = true;
      return yours.id;
    }
    if (inHand.length && this.rand() < 0.4) return inHand[0].id;
    const free = this.pieces.filter((p) => p.state === "loose");
    if (free.length === 0) return -1;
    const scored = free.map((p) => ({ p, s: (p.edge ? 0 : 70) + Math.hypot(p.x - a.x, p.y - a.y) * 0.25 + this.rand() * 90 + (this.targeted(p.id, a) ? 500 : 0) }));
    return scored.sort((x, y) => x.s - y.s)[0].p.id;
  }

  private thinkSpace(a: A) {
    const { cut } = this.o;
    if (a.mode === "last" || a.mode === "off") {
      a.wait = 400;
      return;
    }
    if (a.mode === "park") {
      /* waiting is resolved by the holder letting go or placing; this is only a safety net */
      const p = this.pieces[a.want];
      if (!p || p.state !== "held") this.rest(a, 200);
      else a.wait = 300;
      return;
    }
    if (a.mode === "rest") {
      if (this.left() <= 1) return this.lastOne(a);
      const resume = a.want >= 0 && this.pieces[a.want].state === "loose";
      const id = resume ? a.want : this.pickForSpace();
      if (id < 0) {
        a.wait = 500;
        return;
      }
      const p = this.pieces[id];
      a.want = id;
      const d = rightOfWay(this.holds(), { thing: String(id), by: { kind: "space" } });
      if (d.kind === "wait") return this.beginWait(a, p, d.on);
      const [cx, cy] = this.centre(p);
      const dist = Math.hypot(cx - a.x, cy - a.y);
      this.go(a, cx, cy, 680 + dist * 1.5, dist * 0.08);
      a.target = id;
      a.mode = "reach";
      return;
    }
    if (a.mode === "reach") {
      const p = this.pieces[a.target];
      if (!p || p.state === "placed") {
        a.want = -1;
        return this.rest(a, 900);
      }
      const d = rightOfWay(this.holds(), { thing: String(p.id), by: { kind: "space" }, finishes: this.left() === 1 });
      if (d.kind === "never") return this.lastOne(a);
      if (d.kind === "wait") return this.beginWait(a, p, d.on);
      const [cx, cy] = this.centre(p);
      if (Math.hypot(cx - a.x, cy - a.y) > cut.cw * 0.5) {
        this.go(a, cx, cy, 360);
        return;
      }
      this.take(a, p);
      a.target = -1;
      a.mode = "press";
      a.wait = 200;
      return;
    }
    if (a.mode === "press") {
      const p = this.pieces[a.holding];
      if (!p) return this.rest(a, 600);
      const dist = Math.hypot(p.hx - p.x, p.hy - p.y);
      this.go(a, p.hx + a.gx, p.hy + a.gy, 760 + dist * 1.6, dist * 0.07);
      a.mode = "arrive";
      return;
    }
    if (a.mode === "arrive") {
      const p = this.pieces[a.holding];
      if (!p) return this.rest(a, 600);
      const d = rightOfWay(this.holds(), { thing: String(p.id), by: { kind: "space" }, finishes: this.left() === 1 });
      if (d.kind === "never") {
        /* everyone else finished around it: it sets the piece down beside its place */
        this.go(a, a.x + cut.cw * 0.9, a.y + cut.ch * 0.7, 520);
        a.mode = "setdown";
        return;
      }
      this.place(a, p);
      this.rest(a, 2300 + this.rand() * 1300);
      return;
    }
    if (a.mode === "setdown") {
      const p = this.pieces[a.holding];
      if (p) this.drop(a, p, -6);
      a.want = -1;
      this.lastOne(a);
    }
  }

  private beginWait(a: A, p: P, on: string) {
    if (a.waitingOn !== on || this.ghost?.piece !== p.id) this.waits += 1;
    a.segs = [];
    a.target = -1;
    a.want = p.id;
    a.waitingOn = on;
    a.mode = "park";
    a.wait = 300;
    this.ghost = { piece: p.id, on };
    const { cut } = this.o;
    this.go(a, p.hx + cut.cw * 1.02, p.hy + cut.ch * 0.92, 560);
    this.emit();
  }

  private lastOne(a: A) {
    const { frame } = this.o.layout;
    a.mode = "last";
    a.want = -1;
    a.target = -1;
    a.wait = 400;
    this.ghost = null;
    this.line = "last one's yours";
    this.lineAt = this.t;
    this.go(a, frame.x + frame.w + 26, frame.y + frame.h * 0.5, 700);
    this.emit();
  }

  /** `&beat=yield|nod`: one sim takes the piece the space is reaching for, so a take always has the moment. */
  private direct() {
    const s = this.space;
    if (!this.o.beat || this.beatDone || s.mode !== "reach" || this.remaining(s) < 700 || this.t - this.playAt < 1500) return;
    const sim = this.agents.find((a) => a.kind === "person" && !a.you && a.mode === "rest" && a.holding < 0);
    if (!sim) return;
    this.beatDone = true;
    sim.segs = [];
    sim.wait = 0;
    sim.force = s.target;
    sim.forcePlan = this.o.beat === "yield" ? "release" : "place";
  }

  /* ---------- the scatter ---------- */

  private scatter() {
    const { layout, cut } = this.o;
    const spots: [number, number][] = [];
    const area = layout.zones.map((z) => Math.max(1, z.w) * Math.max(1, z.h));
    const total = area.reduce((sum, v) => sum + v, 0);
    const sample = (): [number, number] => {
      let at = this.rand() * total, i = 0;
      while (i < area.length - 1 && at > area[i]) at -= area[i++];
      const z = layout.zones[i];
      return [z.x + this.rand() * z.w, z.y + this.rand() * z.h];
    };
    for (let n = 0; n < this.pieces.length; n += 1) {
      let best: [number, number] = sample(), score = -1;
      for (let k = 0; k < 14; k += 1) {
        const c = sample();
        const near = Math.min(...spots.map(([x, y]) => Math.hypot((x - c[0]) * 0.9, y - c[1])), 9999);
        if (near > score) {
          score = near;
          best = c;
        }
      }
      spots.push(best);
    }
    const order = this.pieces.map((p) => p.id).sort(() => this.rand() - 0.5);
    order.forEach((id, i) => {
      const p = this.pieces[id], [cx, cy] = spots[i];
      p.tw = { x0: p.hx, y0: p.hy, r0: 0, x1: cx - cut.cw / 2, y1: cy - cut.ch / 2, r1: (this.rand() - 0.5) * 34, el: 0, dur: 620, delay: i * 34, ease: POP };
      p.z = 2 + i;
      if (p.el) p.el.style.zIndex = String(p.z);
    });
  }
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
