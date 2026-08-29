// Turn a public-domain painting (JPEG) into paint-by-number vector data.
// Controlled trace: downscale + blur merges brushstrokes, quantize to few
// colors, trace to closed regions, keep only comfortably tappable ones.
//
//   node scripts/trace-artwork.mjs <input.jpg> <out-prefix> [colors] [width] \
//     [--id=wave --title="the great wave" --credit="Hokusai, 1831"]
//
// Always emits <out-prefix>-finished.svg / <out-prefix>-board.svg previews.
// With --id it also emits the real app data: src/widgets/boards/<id>.ts and
// public/assets/cozy-poster-<id>.svg (door postcard, classic colors).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ImageTracer = require("imagetracerjs");
const jpeg = require("jpeg-js");

const flags = {};
const positional = [];
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([a-z]+)=(.*)$/);
  if (m) flags[m[1]] = m[2];
  else positional.push(arg);
}
const [input, outPrefix, colorsArg, scaleArg] = positional;
if (!input || !outPrefix) {
  console.error(
    "usage: trace-artwork.mjs <input.jpg> <out-prefix> [colors=7] [targetWidth=560] [--id= --title= --credit=]",
  );
  process.exit(2);
}
const NUM_COLORS = Number(colorsArg ?? 7);
const TARGET_W = Number(scaleArg ?? 560);
const MAX_REGIONS = 110;
const MIN_AREA_FRAC = 0.0009; // of canvas — below this a region isn't a comfy tap

// ---- decode + box-filter downscale ---------------------------------------
const raw = jpeg.decode(readFileSync(input), { useTArray: true });
const scale = Math.min(1, TARGET_W / raw.width);
const W = Math.round(raw.width * scale);
const H = Math.round(raw.height * scale);
const data = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const x0 = Math.floor(x / scale);
    const x1 = Math.min(raw.width, Math.ceil((x + 1) / scale));
    const y0 = Math.floor(y / scale);
    const y1 = Math.min(raw.height, Math.ceil((y + 1) / scale));
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        const o = (yy * raw.width + xx) * 4;
        r += raw.data[o];
        g += raw.data[o + 1];
        b += raw.data[o + 2];
        n += 1;
      }
    }
    const o = (y * W + x) * 4;
    data[o] = r / n;
    data[o + 1] = g / n;
    data[o + 2] = b / n;
    data[o + 3] = 255;
  }
}

// ---- trace ---------------------------------------------------------------
const tracedata = ImageTracer.imagedataToTracedata(
  { width: W, height: H, data },
  {
    numberofcolors: NUM_COLORS,
    colorquantcycles: 5,
    blurradius: 5,
    blurdelta: 256,
    ltres: 2,
    qtres: 2,
    pathomit: 32,
    rightangleenhance: false,
    linefilter: true,
  },
);

// ---- flatten segments to polygons ---------------------------------------
function flatten(segments) {
  const pts = [];
  for (const s of segments) {
    if (s.type === "L") {
      pts.push([s.x2, s.y2]);
    } else {
      for (const t of [0.33, 0.66, 1]) {
        const mt = 1 - t;
        pts.push([
          mt * mt * s.x1 + 2 * mt * t * s.x2 + t * t * s.x3,
          mt * mt * s.y1 + 2 * mt * t * s.y2 + t * t * s.y3,
        ]);
      }
    }
  }
  return pts;
}
const shoelace = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
};
function toPathD(pts) {
  return (
    `M${pts.map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join("L")}` +
    "Z"
  );
}
const inside = (pt, poly) => {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      odd = !odd;
    }
  }
  return odd;
};

// pole-of-inaccessibility-ish: interior grid point farthest from any outline pt
function labelPoint(main, holes) {
  const xs = main.map((p) => p[0]);
  const ys = main.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const all = [main, ...holes];
  let best = null;
  let bestD = -1;
  const STEPS = 18;
  for (let gy = 1; gy < STEPS; gy += 1) {
    for (let gx = 1; gx < STEPS; gx += 1) {
      const pt = [minX + ((maxX - minX) * gx) / STEPS, minY + ((maxY - minY) * gy) / STEPS];
      if (!inside(pt, main)) continue;
      if (holes.some((h) => inside(pt, h))) continue;
      let d = Infinity;
      for (const poly of all) {
        for (let i = 0; i < poly.length; i += 2) {
          const dx = poly[i][0] - pt[0];
          const dy = poly[i][1] - pt[1];
          const dd = dx * dx + dy * dy;
          if (dd < d) d = dd;
        }
      }
      if (d > bestD) {
        bestD = d;
        best = pt;
      }
    }
  }
  return best ? { x: best[0], y: best[1], r: Math.sqrt(bestD) } : null;
}

// ---- collect regions -----------------------------------------------------
// boost saturation + a touch of lightness so the painting pops app-style
function boost({ r, g, b }) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const l = (max + min) / 2;
  if (max !== min) {
    const mid = (max + min) / 2;
    const k = 1.35; // saturation multiplier around the mid tone
    rr = mid + (rr - mid) * k;
    gg = mid + (gg - mid) * k;
    bb = mid + (bb - mid) * k;
  }
  const lift = l < 0.55 ? 1.1 : 1.02;
  const to = (v) => Math.round(Math.max(0, Math.min(1, v * lift)) * 255);
  return `rgb(${to(rr)},${to(gg)},${to(bb)})`;
}
const palette = tracedata.palette.map(boost);
const muted = tracedata.palette.map(
  (c) => `rgb(${Math.round(24 + c.r * 0.14)},${Math.round(20 + c.g * 0.14)},${Math.round(28 + c.b * 0.14)})`,
);
const canvasArea = W * H;
const regions = [];
let allPathsD = [];
tracedata.layers.forEach((layer, colorIndex) => {
  layer.forEach((path, pathIndex) => {
    if (path.isholepath) return;
    const main = flatten(path.segments);
    if (main.length < 3) return;
    const holes = (path.holechildren ?? []).map((hi) => flatten(layer[hi].segments));
    const area = shoelace(main) - holes.reduce((s, h) => s + shoelace(h), 0);
    const d = [main, ...holes].map(toPathD).join(" ");
    allPathsD.push({ d, colorIndex });
    if (area / canvasArea < MIN_AREA_FRAC) return;
    const label = labelPoint(main, holes);
    if (!label || label.r < 4) return; // no room for a number
    regions.push({ colorIndex, d, area, label, id: `r${colorIndex}-${pathIndex}` });
  });
});
regions.sort((a, b) => b.area - a.area);
const kept = regions.slice(0, MAX_REGIONS);
const coverage = kept.reduce((s, r) => s + r.area, 0) / canvasArea;
const perColor = {};
for (const region of kept) perColor[region.colorIndex] = (perColor[region.colorIndex] ?? 0) + 1;
console.log(
  `${input}: ${W}x${H}, ${allPathsD.length} traced paths -> ${kept.length} tappable regions, ` +
    `${Math.round(coverage * 100)}% area coverage, per-color ${JSON.stringify(perColor)}`,
);

// ---- emit previews -------------------------------------------------------
const header = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`;
const underlay = allPathsD
  .map((p) => `<path d="${p.d}" fill="${muted[p.colorIndex]}" fill-rule="evenodd"/>`)
  .join("\n");

const fullColorUnderlay = allPathsD
  .map((p) => `<path d="${p.d}" fill="${palette[p.colorIndex]}" fill-rule="evenodd"/>`)
  .join("\n");

const finished = [
  header,
  `<rect width="${W}" height="${H}" fill="#171119"/>`,
  fullColorUnderlay,
  ...kept.map(
    (r) =>
      `<path d="${r.d}" fill="${palette[r.colorIndex]}" fill-rule="evenodd" stroke="#14101a" stroke-width="1.2" stroke-linejoin="round"/>`,
  ),
  "</svg>",
].join("\n");
writeFileSync(`${outPrefix}-finished.svg`, finished);

const board = [
  header,
  `<rect width="${W}" height="${H}" fill="#171119"/>`,
  underlay,
  ...kept.map(
    (r) =>
      `<path d="${r.d}" fill="#2c2431" fill-rule="evenodd" stroke="#0f0b12" stroke-width="1" stroke-linejoin="round" fill-opacity="0.9"/>`,
  ),
  ...kept.map((r) => {
    const size = Math.max(7, Math.min(22, r.label.r * 0.9));
    return `<text x="${Math.round(r.label.x)}" y="${Math.round(r.label.y)}" font-size="${Math.round(size)}" font-family="system-ui" font-weight="700" fill="rgba(255,255,255,0.62)" text-anchor="middle" dominant-baseline="central">${r.colorIndex + 1}</text>`;
  }),
  "</svg>",
].join("\n");
writeFileSync(`${outPrefix}-board.svg`, board);
console.log(`wrote ${outPrefix}-finished.svg + ${outPrefix}-board.svg`);

// ---- app data (only with --id) -------------------------------------------
if (flags.id) {
  const id = flags.id;
  // neon remix: rank painting colors by luminance, map onto the app tokens
  // (lightest→most acid), keeping the painting's tonal hierarchy readable
  const NEON_LIGHT_TO_DARK = [
    "var(--color-lime)",
    "var(--color-trip)",
    "var(--color-league)",
    "var(--color-couple)",
    "var(--color-fam)",
    "var(--color-crew)",
    "#312447",
    "#241b33",
  ];
  const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ranked = tracedata.palette
    .map((c, i) => ({ i, l: luminance(c) }))
    .sort((a, b) => b.l - a.l);
  const neon = new Array(tracedata.palette.length);
  ranked.forEach(({ i }, rank) => {
    neon[i] = NEON_LIGHT_TO_DARK[Math.min(rank, NEON_LIGHT_TO_DARK.length - 1)];
  });

  const regionsOut = kept.map((r, index) => ({
    id: `${id[0]}${index}`,
    c: r.colorIndex,
    d: r.d,
    labels: [
      {
        x: Math.round(r.label.x * 10) / 10,
        y: Math.round(r.label.y * 10) / 10,
        s: Math.round(Math.max(7, Math.min(22, r.label.r * 0.9))),
      },
    ],
  }));
  const underlayOut = allPathsD.map((p) => ({ d: p.d, c: p.colorIndex }));
  const module = `// AUTO-GENERATED by scripts/trace-artwork.mjs — do not edit by hand.
// ${flags.title ?? id} — traced public-domain artwork, ${kept.length} tappable regions.

export const BOARD = {
  id: ${JSON.stringify(id)},
  title: ${JSON.stringify(flags.title ?? id)},
  credit: ${JSON.stringify(flags.credit ?? "")},
  w: ${W},
  h: ${H},
  classic: ${JSON.stringify(palette)},
  neon: ${JSON.stringify(neon)},
  muted: ${JSON.stringify(muted)},
  poster: ${JSON.stringify(`/assets/cozy-poster-${id}.svg`)},
  regions: ${JSON.stringify(regionsOut)},
  underlay: ${JSON.stringify(underlayOut)},
};
`;
  mkdirSync(new URL("../src/widgets/boards", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../src/widgets/boards/${id}.ts`, import.meta.url), module);
  writeFileSync(new URL(`../public/assets/cozy-poster-${id}.svg`, import.meta.url), finished);
  console.log(`wrote src/widgets/boards/${id}.ts + public/assets/cozy-poster-${id}.svg`);
}
