/**
 * Cuts a picture into interlocking pieces. Every inner edge is one bezier
 * tab shared by the two pieces it separates, so neighbours always fit. Seeded,
 * so the same seed cuts the same puzzle on every screen.
 */

export function seeded(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

type Pt = [number, number];

export type CutPiece = {
  id: number;
  col: number;
  row: number;
  /** outline in the piece's own box, where the cell's corner is (pad, pad) */
  d: string;
  corner: boolean;
  edge: boolean;
};

export type Cut = {
  cols: number;
  rows: number;
  /** one cell */
  cw: number;
  ch: number;
  /** room around a cell for its tabs; a piece's box is cw+2·pad by ch+2·pad */
  pad: number;
  pieces: CutPiece[];
};

/** One edge as points: start, then three cubics (9 points). Flat edges are 2 points. */
function tab(rand: () => number, along: (l: number, w: number) => Pt): Pt[] {
  const t = 0.1;
  const j = () => (rand() - 0.5) * 0.08;
  const flip = rand() < 0.5 ? -1 : 1;
  const [a, b, c, d, e] = [j(), j(), j(), j(), j()];
  const p = (l: number, w: number) => along(l, w * flip);
  return [
    p(0, 0),
    p(0.2, a), p(0.5 + b + d, -t + c), p(0.5 - t + b, t + c),
    p(0.5 - 2 * t + b - d, 3 * t + c), p(0.5 + 2 * t + b - d, 3 * t + c), p(0.5 + t + b, t + c),
    p(0.5 + b + d, -t + c), p(0.8, e), p(1, 0),
  ];
}

const n = (v: number) => Math.round(v * 10) / 10;

function trace(points: Pt[], ox: number, oy: number): string {
  if (points.length === 2) return `L${n(points[1][0] - ox)} ${n(points[1][1] - oy)}`;
  let out = "";
  for (let i = 1; i < points.length; i += 3) {
    out += `C${points.slice(i, i + 3).map(([x, y]) => `${n(x - ox)} ${n(y - oy)}`).join(" ")}`;
  }
  return out;
}

export function cutPicture(w: number, h: number, cols: number, rows: number, seed: number): Cut {
  const rand = seeded(seed);
  const cw = w / cols;
  const ch = h / rows;
  const size = Math.min(cw, ch);
  const pad = Math.ceil(size * 0.36) + 2;
  /* across[r][c]: the edge under row r-1, left to right. down[c][r]: the edge right of column c-1, top to bottom. */
  const across: Pt[][][] = [];
  for (let r = 0; r <= rows; r += 1) {
    across.push([]);
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * cw, y0 = r * ch;
      across[r].push(r === 0 || r === rows ? [[x0, y0], [x0 + cw, y0]] : tab(rand, (l, v) => [x0 + l * cw, y0 + v * size]));
    }
  }
  const down: Pt[][][] = [];
  for (let c = 0; c <= cols; c += 1) {
    down.push([]);
    for (let r = 0; r < rows; r += 1) {
      const x0 = c * cw, y0 = r * ch;
      down[c].push(c === 0 || c === cols ? [[x0, y0], [x0, y0 + ch]] : tab(rand, (l, v) => [x0 + v * size, y0 + l * ch]));
    }
  }
  const pieces: CutPiece[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ox = c * cw - pad, oy = r * ch - pad;
      const top = across[r][c], right = down[c + 1][r];
      const bottom = [...across[r + 1][c]].reverse(), left = [...down[c][r]].reverse();
      const d = `M${n(top[0][0] - ox)} ${n(top[0][1] - oy)}${trace(top, ox, oy)}${trace(right, ox, oy)}${trace(bottom, ox, oy)}${trace(left, ox, oy)}Z`;
      const sides = Number(r === 0) + Number(r === rows - 1) + Number(c === 0) + Number(c === cols - 1);
      pieces.push({ id: r * cols + c, col: c, row: r, d, corner: sides >= 2, edge: sides >= 1 });
    }
  }
  return { cols, rows, cw, ch, pad, pieces };
}

/** 12, 20 or 30 pieces of a 4:3 picture. */
export function gridFor(count: number): { cols: number; rows: number } {
  if (count <= 12) return { cols: 4, rows: 3 };
  if (count <= 20) return { cols: 5, rows: 4 };
  return { cols: 6, rows: 5 };
}
