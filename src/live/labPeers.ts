import { CURSOR_MOTION, type PeerMotion } from "./peerMotion";
import type { LivePeer } from "./presenceTypes";

/* The peers lab — three or four hands on the board that aren't anyone.
 *
 * `/?mock=1&peers=4#/space/crew` (any mock space; `seed=` picks a different
 * take). Built for the demo video's "always live" beat: the crew's online
 * roster gets a cursor each, and the cursors move the way people's do —
 * a quick wrist move onto a card, a small overshoot and correction, a slow
 * loop while they read it, a rest, then off to the next one. Nobody moves
 * in step with anybody else.
 *
 * Nothing here is React state and nothing is written anywhere. Each hand's
 * position goes into the same engine a real peer's samples go through
 * (peerMotion.ts), so it gets the lead and the settle a remote hand gets.
 * It is fed every frame rather than at the 20Hz presence cadence: between
 * 50ms samples the engine's smoothing decays 30% a frame, which the
 * frame-by-frame recorder shows as a faint three-frame sawtooth in speed,
 * and the take has to read as one continuous hand. All timing comes off
 * the animation-frame clock, so under the recorder (.context/web-video) a
 * take is deterministic for a given seed.
 */

export type LabRect = { x: number; y: number; w: number; h: number };

export type LabPeerFeed = {
  /** Mutated in place as the hands move — same objects every render. */
  rows: LivePeer[];
  /** Hand the feed the canvas's motion engine. Returns the stop. */
  attach: (motion: PeerMotion, spaceId: string) => () => void;
};

/** every frame — see the header; 50 would be the real presence cadence */
const SAMPLE_MS = 0;

type Pt = { x: number; y: number };

type Phase =
  | { kind: "rest"; at: Pt; start: number; until: number; jiggle: boolean }
  | {
      kind: "hover";
      at: Pt;
      start: number;
      until: number;
      r: number;
      period: number;
      angle: number;
      dir: 1 | -1;
    }
  | {
      kind: "move";
      from: Pt;
      /** where the wrist aims — a hair past the target on a long move */
      to: Pt;
      /** where the hand actually ends up after the correction */
      land: Pt;
      start: number;
      dur: number;
      settle: number;
      /** sideways arc, as a fraction of the distance */
      bulge: number;
    };

type Hand = {
  row: LivePeer;
  pos: Pt;
  phase: Phase;
  /** which rect the hand is on, so two hands don't pile onto one card */
  rect: number;
  /** <1 quick, >1 slow */
  pace: number;
  /** how long it lingers */
  patience: number;
  tremor: [number, number];
};

export function labPeersRequested(): { count: number; seed: number } | null {
  const search = new URLSearchParams(window.location.search);
  const hashQuery = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const raw = search.get("peers") ?? hashQuery.get("peers");
  if (raw == null) return null;
  const count = Math.min(8, Math.max(1, Number(raw) || 4));
  const seed = Number(search.get("seed") ?? hashQuery.get("seed")) || 7;
  return { count, seed };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** minimum-jerk: how a hand actually crosses a distance */
const jerk = (u: number) => u * u * u * (10 + u * (-15 + 6 * u));
const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function createLabPeerFeed(
  members: { name: string; color: string; online?: boolean }[],
  rects: LabRect[],
  { count, seed }: { count: number; seed: number },
): LabPeerFeed {
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const roster = [
    ...members.filter((m) => m.online),
    ...members.filter((m) => !m.online),
  ].slice(0, count);
  /* Where the hands may wander when there is nothing to point at. */
  const bounds = rects.length
    ? rects.reduce(
        (b, r) => ({
          x0: Math.min(b.x0, r.x),
          y0: Math.min(b.y0, r.y),
          x1: Math.max(b.x1, r.x + r.w),
          y1: Math.max(b.y1, r.y + r.h),
        }),
        { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
      )
    : { x0: 40, y0: 40, x1: 1200, y1: 800 };

  const pointIn = (r: LabRect): Pt => ({
    x: r.x + r.w * between(0.2, 0.75),
    y: r.y + r.h * between(0.18, 0.72),
  });

  const hands: Hand[] = [];
  const pickRect = (hand: Hand | null, from: Pt): number => {
    const taken = new Set(hands.filter((h) => h !== hand).map((h) => h.rect));
    const options = rects
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => !taken.has(i) && i !== hand?.rect);
    if (!options.length) return -1;
    /* Prefer a card a real reach away — not the one under the hand, not the
       far corner of the board. */
    const weights = options.map(({ r }) => {
      const d = dist(from, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
      return Math.exp(-(((d - 420) / 320) ** 2)) + 0.06;
    });
    let roll = rand() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < options.length; k++) {
      roll -= weights[k];
      if (roll <= 0) return options[k].i;
    }
    return options[options.length - 1].i;
  };

  const rest = (at: Pt, now: number, patience: number, short = false): Phase => ({
    kind: "rest",
    at,
    start: now,
    until: now + (short ? between(180, 520) : between(260, 1300)) * patience,
    jiggle: !short && rand() < 0.12,
  });
  const hover = (at: Pt, now: number, patience: number): Phase => ({
    kind: "hover",
    at,
    start: now,
    until: now + between(700, 1900) * patience,
    r: between(3, 9),
    period: between(1300, 2800),
    angle: rand() * Math.PI * 2,
    dir: rand() < 0.5 ? 1 : -1,
  });
  const move = (hand: Hand, now: number): Phase => {
    const from = { ...hand.pos };
    let land: Pt;
    const free = rand() < 0.15 || !rects.length;
    if (free) {
      hand.rect = -1;
      const ang = rand() * Math.PI * 2;
      const reach = between(120, 320);
      land = {
        x: Math.min(bounds.x1 - 140, Math.max(bounds.x0, from.x + Math.cos(ang) * reach)),
        y: Math.min(bounds.y1 - 60, Math.max(bounds.y0, from.y + Math.sin(ang) * reach)),
      };
    } else {
      hand.rect = pickRect(hand, from);
      land = hand.rect >= 0 ? pointIn(rects[hand.rect]) : { ...from };
    }
    const d = Math.max(1, dist(from, land));
    const dur = Math.min(1300, Math.max(320, 260 + d * 0.95)) * hand.pace * between(0.9, 1.1);
    /* A long reach lands a hair past the card and comes back: that little
       correction is the most human thing a cursor does. */
    const over = d > 140 ? d * between(0.02, 0.05) : 0;
    const ux = (land.x - from.x) / d;
    const uy = (land.y - from.y) / d;
    return {
      kind: "move",
      from,
      to: { x: land.x + ux * over, y: land.y + uy * over },
      land,
      start: now,
      dur,
      settle: over ? between(120, 200) : 0,
      bulge: d > 90 ? between(-0.11, 0.11) : 0,
    };
  };

  const rows: LivePeer[] = [];
  roster.forEach((member, i) => {
    const row: LivePeer = {
      userId: `lab:${member.name.toLowerCase()}`,
      name: member.name,
      color: member.color,
      x: -1,
      y: -1,
      updatedAt: 0,
    };
    const hand: Hand = {
      row,
      pos: { x: 0, y: 0 },
      phase: { kind: "rest", at: { x: 0, y: 0 }, start: 0, until: 0, jiggle: false },
      rect: -1,
      pace: between(0.85, 1.25),
      patience: between(0.7, 1.4),
      tremor: [rand() * 7, rand() * 7],
    };
    hands.push(hand);
    hand.rect = pickRect(hand, { x: bounds.x0 + (bounds.x1 - bounds.x0) * ((i + 0.5) / roster.length), y: (bounds.y0 + bounds.y1) / 2 });
    hand.pos = hand.rect >= 0 ? pointIn(rects[hand.rect]) : { x: between(bounds.x0, bounds.x1 - 200), y: between(bounds.y0, bounds.y1 - 100) };
    /* Staggered first moves, so the take never opens on four hands leaving at once. */
    hand.phase = { kind: "rest", at: { ...hand.pos }, start: 0, until: between(150, 1600) * hand.patience, jiggle: false };
    row.x = hand.pos.x;
    row.y = hand.pos.y;
    rows.push(row);
  });

  const step = (hand: Hand, now: number) => {
    const p = hand.phase;
    if (p.kind === "move") {
      const t = now - p.start;
      if (t < p.dur) {
        const u = t / p.dur;
        const s = jerk(u);
        const dx = p.to.x - p.from.x;
        const dy = p.to.y - p.from.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const b = p.bulge * d * Math.sin(Math.PI * u);
        hand.pos = {
          x: p.from.x + dx * s + (-dy / d) * b,
          y: p.from.y + dy * s + (dx / d) * b,
        };
      } else if (t < p.dur + p.settle) {
        const s = easeOut((t - p.dur) / p.settle);
        hand.pos = {
          x: p.to.x + (p.land.x - p.to.x) * s,
          y: p.to.y + (p.land.y - p.to.y) * s,
        };
      } else {
        hand.pos = { ...p.land };
        hand.phase = rand() < 0.7 ? hover(hand.pos, now, hand.patience) : rest(hand.pos, now, hand.patience);
      }
    } else if (p.kind === "hover") {
      if (now >= p.until) {
        hand.pos = { ...p.at };
        hand.phase = rand() < 0.35 ? rest(hand.pos, now, hand.patience, true) : move(hand, now);
      } else {
        const t = now - p.start;
        const ramp = Math.min(1, t / 320, (p.until - now) / 320);
        const a = p.angle + (p.dir * Math.PI * 2 * t) / p.period;
        hand.pos = {
          x: p.at.x + Math.cos(a) * p.r * ramp,
          y: p.at.y + Math.sin(a) * p.r * 0.55 * ramp,
        };
      }
    } else if (now >= p.until) {
      hand.phase = move(hand, now);
    } else {
      const t = now - p.start;
      const shake = p.jiggle ? 4 * Math.exp(-t / 260) * Math.sin((t / 140) * Math.PI * 2) : 0;
      hand.pos = { x: p.at.x + shake, y: p.at.y };
    }
    /* a hand is never perfectly still */
    hand.pos.x += 0.6 * Math.sin(now / 233 + hand.tremor[0]);
    hand.pos.y += 0.6 * Math.cos(now / 301 + hand.tremor[1]);
  };

  const attach: LabPeerFeed["attach"] = (motion, spaceId) => {
    let frame: number | null = null;
    let lastSample = -Infinity;
    const loop = (now: number) => {
      for (const hand of hands) step(hand, now);
      if (now - lastSample >= SAMPLE_MS) {
        lastSample = now;
        for (const hand of hands) {
          hand.row.x = hand.pos.x;
          hand.row.y = hand.pos.y;
          hand.row.updatedAt = now;
          // the same key Canvas.tsx samples and draws a cursor under
          motion.sample(`cursor:${spaceId}:${hand.row.userId}`, hand.pos.x, hand.pos.y, CURSOR_MOTION, now);
        }
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
  };

  return { rows, attach };
}
