// Generates the "same moon, both windows" paint-by-number artwork.
// Emits src/widgets/cozyColorArt.ts (typed region data for the widget) and
// public/assets/cozy-color-poster.svg (fully-colored postcard for the door).
// Rerun with: node scripts/generate-cozy-art.mjs

import { writeFileSync } from "node:fs";

const W = 1200;
const H = 800;
const MOON = { x: 600, y: 210, r: 106 };

// electric-preset hex, only used for the standalone poster file
const HEX = {
  berry: "#e9369d",
  orange: "#ff7c42",
  blue: "#3f70ff",
  violet: "#7853ff",
  teal: "#13b8a6",
  lime: "#c9ff3d",
};
const INK = "#14101a";
const BG = "#171119";

const n = (value) => {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};
const pt = (x, y) => `${n(x)} ${n(y)}`;

function circlePath(cx, cy, r) {
  return `M${pt(cx + r, cy)} A${n(r)} ${n(r)} 0 1 0 ${pt(cx - r, cy)} A${n(r)} ${n(r)} 0 1 0 ${pt(cx + r, cy)} Z`;
}

function donutPath(cx, cy, rOut, rIn) {
  return `${circlePath(cx, cy, rOut)} ${circlePath(cx, cy, rIn)}`;
}

// smooth polyline via midpoint quadratics; returns segments after an M
function smoothSegs(points) {
  if (points.length < 3) return points.slice(1).map(([x, y]) => `L${pt(x, y)}`);
  const segs = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const isLast = i === points.length - 2;
    const ex = isLast ? nx : (cx + nx) / 2;
    const ey = isLast ? ny : (cy + ny) / 2;
    segs.push(`Q${pt(cx, cy)} ${pt(ex, ey)}`);
  }
  return segs;
}

function lensPath(cx, cy, rx, ry) {
  return `M${pt(cx - rx, cy)} Q${pt(cx, cy - ry * 1.9)} ${pt(cx + rx, cy)} Q${pt(cx, cy + ry * 1.9)} ${pt(cx - rx, cy)} Z`;
}

function sparklePath(cx, cy, s) {
  const w = s * 0.16;
  return [
    `M${pt(cx, cy - s)}`,
    `Q${pt(cx + w, cy - w)} ${pt(cx + s, cy)}`,
    `Q${pt(cx + w, cy + w)} ${pt(cx, cy + s)}`,
    `Q${pt(cx - w, cy + w)} ${pt(cx - s, cy)}`,
    `Q${pt(cx - w, cy - w)} ${pt(cx, cy - s)}`,
    "Z",
  ].join(" ");
}

function birdPath(cx, cy, s, dir = 1) {
  // deep double-arc sticker gull, wingtips raised
  const d = (dx, dy) => pt(cx + dx * s * dir, cy + dy * s);
  return [
    `M${d(-1, -0.34)}`,
    `Q${d(-0.55, -0.92)} ${d(-0.03, -0.26)}`,
    `Q${d(0.5, -0.98)} ${d(1, -0.4)}`,
    `Q${d(0.62, -0.1)} ${d(0.06, 0.12)}`,
    `Q${d(-0.52, 0.04)} ${d(-1, -0.34)}`,
    "Z",
  ].join(" ");
}

function cloudPath(x, y, w) {
  const p1 = [x + w * 0.26, y - w * 0.2];
  const p2 = [x + w * 0.62, y - w * 0.17];
  const r1 = w * 0.18;
  const r2 = w * 0.24;
  const r3 = w * 0.22;
  return [
    `M${pt(x, y)}`,
    `A${n(r1)} ${n(r1)} 0 0 1 ${pt(p1[0], p1[1])}`,
    `A${n(r2)} ${n(r2)} 0 0 1 ${pt(p2[0], p2[1])}`,
    `A${n(r3)} ${n(r3)} 0 0 1 ${pt(x + w, y)}`,
    "Z",
  ].join(" ");
}

const PEAK_BASE = 600;
function peakPath(ax, ay, hw) {
  const rise = PEAK_BASE - ay;
  return [
    `M${pt(ax - hw, PEAK_BASE)}`,
    `Q${pt(ax - hw * 0.42, ay + rise * 0.46)} ${pt(ax, ay)}`,
    `Q${pt(ax + hw * 0.42, ay + rise * 0.46)} ${pt(ax + hw, PEAK_BASE)}`,
    "Z",
  ].join(" ");
}

function capPath(ax, ay, hw) {
  const capY = ay + 58;
  const rise = PEAK_BASE - ay;
  const capW = hw * ((capY - ay) / rise) * 0.92;
  return [
    `M${pt(ax, ay)}`,
    `Q${pt(ax + capW * 0.5, ay + 28)} ${pt(ax + capW, capY)}`,
    `L${pt(ax + capW * 0.52, capY - 15)}`,
    `L${pt(ax + capW * 0.14, capY + 9)}`,
    `L${pt(ax - capW * 0.24, capY - 15)}`,
    `L${pt(ax - capW * 0.62, capY + 7)}`,
    `L${pt(ax - capW, capY - 2)}`,
    `Q${pt(ax - capW * 0.5, ay + 26)} ${pt(ax, ay)}`,
    "Z",
  ].join(" ");
}

function pinePath(x, baseY, h, w) {
  const t1 = baseY - h; // apex
  const tier1 = t1 + h * 0.34;
  const tier2 = t1 + h * 0.64;
  const bottom = t1 + h * 0.9;
  const trunkW = w * 0.22;
  const w1 = w * 0.44;
  const w2 = w * 0.72;
  return [
    `M${pt(x, t1)}`,
    `L${pt(x + w1, tier1)}`,
    `L${pt(x + w1 * 0.42, tier1)}`,
    `L${pt(x + w2, tier2)}`,
    `L${pt(x + w2 * 0.45, tier2)}`,
    `L${pt(x + w, bottom)}`,
    `L${pt(x + trunkW, bottom)}`,
    `L${pt(x + trunkW, baseY)}`,
    `L${pt(x - trunkW, baseY)}`,
    `L${pt(x - trunkW, bottom)}`,
    `L${pt(x - w, bottom)}`,
    `L${pt(x - w2 * 0.45, tier2)}`,
    `L${pt(x - w2, tier2)}`,
    `L${pt(x - w1 * 0.42, tier1)}`,
    `L${pt(x - w1, tier1)}`,
    "Z",
  ].join(" ");
}

function bushPath(cx, baseY, w, h) {
  const l = cx - w / 2;
  const r = cx + w / 2;
  return [
    `M${pt(l, baseY)}`,
    `Q${pt(l + w * 0.03, baseY - h * 0.92)} ${pt(cx - w * 0.18, baseY - h * 0.72)}`,
    `Q${pt(cx, baseY - h * 1.28)} ${pt(cx + w * 0.18, baseY - h * 0.72)}`,
    `Q${pt(r - w * 0.03, baseY - h * 0.92)} ${pt(r, baseY)}`,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------- regions

const regions = [];
const decor = [];
const add = (id, tone, d, labels) => regions.push({ id, tone, d, labels });
const L = (x, y, s) => ({ x, y, s });

// sky backdrop (two visible corner islands beyond the outer ring)
add("sky", "violet", `M0 0H${W}V${H}H0Z`, [L(52, 46, 26), L(1148, 46, 26)]);

// halo rings radiating from the moon
const RING_EDGES = [106, 156, 216, 292, 398, 560];
const RING_TONES = ["teal", "violet", "blue", "violet", "blue"];
const RING_LABELS = [
  [483, 168],
  [772, 148],
  [362, 124],
  [924, 93],
  [150, 47],
];
RING_TONES.forEach((tone, i) => {
  add(
    `ring-${i + 1}`,
    tone,
    donutPath(MOON.x, MOON.y, RING_EDGES[i + 1], RING_EDGES[i]),
    [L(RING_LABELS[i][0], RING_LABELS[i][1], i < 2 ? 24 : 27)],
  );
});

// moon + craters
add("moon", "orange", circlePath(MOON.x, MOON.y, MOON.r), [L(592, 216, 34)]);
add("crater-1", "berry", circlePath(566, 180, 17), [L(566, 181, 15)]);
add("crater-2", "berry", circlePath(636, 245, 14), [L(636, 246, 13)]);
add("crater-3", "berry", circlePath(616, 155, 11), [L(616, 156, 11)]);

// stars
const STARS = [
  [95, 152, 18],
  [258, 64, 19],
  [438, 44, 15],
  [768, 48, 18],
  [1062, 142, 19],
  [398, 190, 15],
];
STARS.forEach(([x, y, s], i) => {
  add(`star-${i + 1}`, "lime", sparklePath(x, y, s), [L(x, y + 1, 14)]);
});

// two birds flying toward each other beneath the moon
add("bird-left", "orange", birdPath(452, 348, 34, 1), [L(452, 335, 14)]);
add("bird-right", "orange", birdPath(748, 343, 34, -1), [L(748, 330, 14)]);

// clouds
add("cloud-left", "berry", cloudPath(140, 252, 220), [L(250, 224, 21)]);
add("cloud-right", "teal", cloudPath(855, 272, 210), [L(960, 246, 21)]);

// mountain range + snowcaps
const PEAKS = [
  [155, 320, 175, "berry"],
  [390, 285, 195, "violet"],
  [835, 300, 200, "violet"],
  [1085, 330, 175, "berry"],
];
const PEAK_LABELS = [
  [185, 425],
  [395, 408],
  [818, 432],
  [1048, 438],
];
PEAKS.forEach(([ax, ay, hw, tone], i) => {
  add(`peak-${i + 1}`, tone, peakPath(ax, ay, hw), [L(PEAK_LABELS[i][0], PEAK_LABELS[i][1], 26)]);
});
PEAKS.forEach(([ax, ay, hw], i) => {
  add(`cap-${i + 1}`, "blue", capPath(ax, ay, hw), [L(ax, ay + 34, 16)]);
});

// hills
add(
  "hill-left",
  "teal",
  `M${pt(0, 560)} Q${pt(230, 440)} ${pt(500, 528)} ` +
    smoothSegs([
      [500, 528],
      [488, 575],
      [490, 620],
      [472, 668],
      [462, 715],
      [448, 760],
      [442, 800],
    ]).join(" ") +
    ` L${pt(0, 800)} Z`,
  [L(255, 560, 30)],
);
add(
  "hill-right",
  "blue",
  `M${pt(1200, 555)} Q${pt(970, 438)} ${pt(700, 522)} ` +
    smoothSegs([
      [700, 522],
      [716, 568],
      [730, 614],
      [738, 660],
      [756, 706],
      [748, 752],
      [760, 800],
    ]).join(" ") +
    ` L${pt(1200, 800)} Z`,
  [L(940, 560, 30)],
);

// river between the hills, carrying the moon glow
add(
  "river",
  "violet",
  `M${pt(500, 528)} Q${pt(545, 503)} ${pt(600, 499)} Q${pt(655, 502)} ${pt(700, 522)} ` +
    smoothSegs([
      [700, 522],
      [716, 568],
      [730, 614],
      [738, 660],
      [756, 706],
      [748, 752],
      [760, 800],
    ]).join(" ") +
    ` L${pt(442, 800)} ` +
    smoothSegs([
      [442, 800],
      [448, 760],
      [462, 715],
      [472, 668],
      [490, 620],
      [488, 575],
      [500, 528],
    ]).join(" ") +
    " Z",
  [L(548, 556, 24)],
);

// wavy current stripes inside the river (bank x interpolated per y, inset)
const LEFT_BANK = [
  [500, 528],
  [488, 575],
  [490, 620],
  [472, 668],
  [462, 715],
  [448, 760],
  [442, 800],
];
const RIGHT_BANK = [
  [700, 522],
  [716, 568],
  [730, 614],
  [738, 660],
  [756, 706],
  [748, 752],
  [760, 800],
];
function bankX(bank, y) {
  for (let i = 0; i < bank.length - 1; i += 1) {
    const [x0, y0] = bank[i];
    const [x1, y1] = bank[i + 1];
    if (y >= y0 && y <= y1) return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
  }
  return bank[bank.length - 1][0];
}
function ribbonPath(y, amp, wavelength, thickness) {
  const x0 = bankX(LEFT_BANK, y) + 24;
  const x1 = bankX(RIGHT_BANK, y) - 24;
  const top = [];
  const steps = Math.max(8, Math.round((x1 - x0) / 16));
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) / steps) * i;
    top.push([x, y + Math.sin((x - x0) / wavelength) * amp]);
  }
  const bottom = top.map(([x, yy]) => [x, yy + thickness]).reverse();
  return (
    `M${pt(top[0][0], top[0][1])} ` +
    smoothSegs(top).join(" ") +
    ` L${pt(bottom[0][0], bottom[0][1])} ` +
    smoothSegs(bottom).join(" ") +
    " Z"
  );
}
[600, 668, 738].forEach((y, i) => {
  add(`stripe-${i + 1}`, "teal", ribbonPath(y, 5, 34, 18), [
    L(bankX(LEFT_BANK, y) + 45, y + 9, 14),
  ]);
});

// moon shimmer on the water
const SHIMMER = [
  [604, 566, 34, 9],
  [596, 636, 28, 8],
  [610, 706, 31, 8],
];
SHIMMER.forEach(([cx, cy, rx, ry], i) => {
  add(`shimmer-${i + 1}`, "orange", lensPath(cx, cy, rx, ry), [L(cx, cy + 1, 13)]);
});

// twin houses — same moon, both windows
function house(prefix, cx, baseY, mirror) {
  const m = mirror ? -1 : 1;
  const bodyW = 64;
  const bodyH = 52;
  const bodyTop = baseY - bodyH;
  const apexY = bodyTop - 46;
  const overhang = 8;
  add(
    `${prefix}-body`,
    "berry",
    `M${pt(cx - bodyW / 2, baseY)} V${n(bodyTop)} H${n(cx + bodyW / 2)} V${n(baseY)} Z`,
    [L(cx + 20 * m, baseY - 13, 15)],
  );
  // roof with chimney on the moon-facing slope
  const slope = (x) => apexY + (Math.abs(x - cx) / (bodyW / 2 + overhang)) * (bodyTop - apexY);
  const c1 = cx + 14 * m;
  const c2 = cx + 30 * m;
  add(
    `${prefix}-roof`,
    "orange",
    [
      `M${pt(cx - (bodyW / 2 + overhang) * m, bodyTop)}`,
      `L${pt(cx, apexY)}`,
      `L${pt(c1, slope(c1))}`,
      `L${pt(c1, apexY + 2)}`,
      `L${pt(c2, apexY + 2)}`,
      `L${pt(c2, slope(c2))}`,
      `L${pt(cx + (bodyW / 2 + overhang) * m, bodyTop)}`,
      "Z",
    ].join(" "),
    [L(cx - 12 * m, bodyTop - 12, 15)],
  );
  add(`${prefix}-window`, "lime", circlePath(cx - 6 * m, baseY - 26, 13), [
    L(cx - 6 * m, baseY - 25, 13),
  ]);
  // decor: window panes, door, chimney smoke
  decor.push({ d: `M${pt(cx - 6 * m - 13, baseY - 26)} h26 M${pt(cx - 6 * m, baseY - 39)} v26`, w: 2.5 });
  decor.push({
    d: `M${pt(cx + 12 * m, baseY)} v-14 a9 9 0 0 ${mirror ? 0 : 1} ${n(18 * m)} 0 v14`,
    w: 3.5,
  });
  const sx = (c1 + c2) / 2;
  decor.push({
    d: `M${pt(sx, apexY - 6)} q${pt(9 * m, -8)} ${pt(3 * m, -17)} q${pt(-7 * m, -9)} ${pt(3 * m, -18)}`,
    w: 3.5,
  });
}
house("house-left", 250, 470, false);
house("house-right", 950, 466, true);

// pines
const PINES = [
  [95, 522, 118, 42, "blue"],
  [350, 512, 90, 33, "violet"],
  [882, 505, 94, 34, "teal"],
  [1125, 522, 120, 43, "violet"],
  [795, 552, 78, 28, "teal"],
];
PINES.forEach(([x, baseY, h, w, tone], i) => {
  add(`pine-${i + 1}`, tone, pinePath(x, baseY, h, w), [L(x, baseY - h * 0.42, 16)]);
});

// foreground bushes
add("bush-left", "violet", bushPath(170, 730, 190, 95), [L(170, 692, 22)]);
add("bush-right", "teal", bushPath(1010, 738, 170, 88), [L(1010, 702, 22)]);

// ---------------------------------------------------------------- outputs

const TONE_NUMBER = { berry: 1, orange: 2, blue: 3, violet: 4, teal: 5, lime: 6 };
const counts = {};
for (const region of regions) counts[region.tone] = (counts[region.tone] ?? 0) + 1;
console.log(`${regions.length} regions`, counts);

const ts = `// AUTO-GENERATED by scripts/generate-cozy-art.mjs — do not edit by hand.
// "same moon, both windows" — closed-region vector art for CozyColorWidget.

export type ArtTone = "berry" | "orange" | "blue" | "violet" | "teal" | "lime";

export type ArtLabel = { x: number; y: number; s: number };

export type ArtRegion = {
  id: string;
  tone: ArtTone;
  d: string;
  labels: ArtLabel[];
};

export const ART_W = ${W};
export const ART_H = ${H};

export const ART_REGIONS: ArtRegion[] = ${JSON.stringify(
  regions.map(({ id, tone, d, labels }) => ({ id, tone, d, labels })),
  null,
  2,
)};

export const ART_DECOR: { d: string; w: number }[] = ${JSON.stringify(decor, null, 2)};
`;
writeFileSync(new URL("../src/widgets/cozyColorArt.ts", import.meta.url), ts);

// fully-colored poster (door preview / finished postcard)
const posterPaths = regions
  .map(
    (region) =>
      `  <path d="${region.d}" fill="${HEX[region.tone]}" fill-rule="evenodd" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
  )
  .join("\n");
const posterDecor = decor
  .map(
    (piece) =>
      `  <path d="${piece.d}" fill="none" stroke="${INK}" stroke-width="${piece.w * 1.4}" stroke-linecap="round"/>`,
  )
  .join("\n");
const poster = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Finished 'same moon, both windows' poster">
  <rect width="${W}" height="${H}" fill="${BG}"/>
${posterPaths}
${posterDecor}
</svg>
`;
writeFileSync(new URL("../public/assets/cozy-color-poster.svg", import.meta.url), poster);
console.log("wrote src/widgets/cozyColorArt.ts and public/assets/cozy-color-poster.svg");
