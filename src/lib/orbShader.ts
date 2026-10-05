/* The voice orb's shaders. Two looks, both live WebGL, both in the house
   colours (crew violet, couple pink, trip orange, fam blue):

   - `knot`: one thick glossy ribbon tied round itself into a ball (a trefoil,
     raymarched). Your voice makes it swell, turn and shine; "working" winds
     it tight and spins it.
   - `glass`: a clear ball with silk light folded inside it, seen through a
     lens, with a bright rim. Your voice stirs the silk and lights the folds.

   Both are drawn for two sizes: the dock (about 58 px) and the stage (300 px
   and up). Edges are antialiased in the shader and the canvas is supersampled
   (VoiceOrb.tsx), so the folds stay clean small. On the stage (`stage` > 0)
   the ball also throws a soft light around itself; in the dock the light
   stays inside the circle. */

export type OrbLook = "knot" | "glass";

/** `?orb=glass|knot` picks the look; glass is the default (Thomas's pick). */
export function orbLook(): OrbLook {
  return new URLSearchParams(window.location.search).get("orb") === "knot" ? "knot" : "glass";
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const HEAD = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uFlow;
uniform float uSpin;
uniform float uLevel;
uniform float uListen;
uniform float uWork;
uniform float uStage;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uD;

// The ball's radius in canvas units (half the canvas = 1). The rest of the
// canvas is room for the voice swell and the stage light.
const float BALL = 0.62;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Stage only: the ball lights the dark around it. Additive (alpha 0), gone
// before the canvas edge.
vec3 spill(vec2 uv, float R, vec3 tint) {
  float r = length(uv);
  float d = max(0.0, r - R);
  float g = exp(-d * 7.0) * 0.34 + exp(-d * 2.6) * 0.16;
  g *= smoothstep(1.0, 0.72, r) * uStage * (0.55 + 0.9 * uLevel + 0.25 * uWork);
  return tint * g;
}
`;

const KNOT = `${HEAD}
// The knot is a ball cut into a few thick ribbons by one folded field:
// stripes run across it, bent into S-curves by slow sine warps, and each
// stripe puffs up between two creases. No poles, no seams: the field is
// smooth everywhere and the creases are valleys in real geometry.
float fold(vec3 p) {
  vec3 w = p;
  w += (0.16 + 0.05 * uLevel) * sin(w.yzx * 1.9 + vec3(uFlow * 0.9, 1.7 - uFlow * 0.6, 3.1 + uFlow * 0.7));
  // the twist: stripes turn as they go through the ball, which is what
  // bends them into S-curves on its face. Working winds it tighter.
  w.xy *= rot(w.z * (2.3 + 1.4 * uWork) + uFlow * 0.6 + uSpin * 0.5);
  return w.y * 1.75 + 0.5;
}

// Distance to the knot; 'tint' is the ribbon colour there.
float knot(vec3 p, out vec3 tint) {
  float f = fold(p);
  float cell = floor(f);
  float x = f - cell;
  // puffed between creases, with the crease itself rounded off
  float e = abs(2.0 * x - 1.0);
  float puff = 1.0 - e * e * e * e;
  puff = sqrt(puff * puff + 0.012);
  float swell = 0.03 * uLevel + 0.006 * sin(uTime * 0.9);
  float lift = 0.13 + 0.05 * uLevel - 0.03 * uWork;

  // three colours in turn, crossing over inside the crease where it is dark
  float k = mod(cell, 3.0);
  float kn = mod(cell + (x > 0.5 ? 1.0 : 2.0), 3.0);
  vec3 a = k < 0.5 ? uA : (k < 1.5 ? uC : uB);
  vec3 b = kn < 0.5 ? uA : (kn < 1.5 ? uC : uB);
  tint = mix(a, b, 0.5 * smoothstep(0.86, 1.0, e));
  // each ribbon drifts toward its neighbour on the wheel along its length
  float along = 0.5 + 0.5 * sin(dot(p, vec3(1.3, -0.4, 1.1)) * 2.2 + cell * 2.0);
  tint = mix(tint, mix(tint, k < 0.5 ? uD : uB, 0.5), along * 0.7);

  return length(p) - (0.68 + swell + lift * puff);
}

vec3 place(vec3 p) {
  p.xy *= rot(0.3 + 0.1 * sin(uFlow * 0.37));
  p.yz *= rot(uFlow * 0.4);
  p.xz *= rot(uFlow * 0.55 + uSpin);
  return p;
}

float map(vec3 p) {
  vec3 tint;
  return knot(place(p), tint);
}

vec3 shade(vec3 p) {
  const vec2 e = vec2(0.012, -0.012);
  vec3 n = normalize(
    e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
  vec3 base;
  knot(place(p), base);

  // creases between the passes go deep plum, never black
  float ao = clamp(map(p + n * 0.09) / 0.09, 0.0, 1.0) * 0.6
           + clamp(map(p + n * 0.24) / 0.24, 0.0, 1.0) * 0.4;
  ao = smoothstep(0.0, 1.0, ao);

  vec3 L = normalize(vec3(-0.5, 0.72, 0.62));
  float dif = pow(clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0), 1.5);
  vec3 deep = base * base * vec3(0.5, 0.34, 0.74) + uA * 0.07;
  vec3 col = mix(deep, base * 1.08, dif);
  col *= mix(vec3(0.34, 0.2, 0.44), vec3(1.0), ao);

  // gloss: a wide soft window from above, a hard glint in it, and a pink
  // bounce from below
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float window = smoothstep(0.3, 0.95, dot(r, normalize(vec3(-0.35, 0.9, 0.42))));
  col += (base * 0.35 + vec3(0.62, 0.56, 0.62)) * window * window * (0.5 + 0.25 * uLevel) * ao;
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  col += vec3(1.0, 0.96, 0.98) * pow(clamp(dot(n, H), 0.0, 1.0), 90.0) * (0.75 + 0.3 * uLevel) * ao;
  float under = smoothstep(0.45, 1.0, dot(r, normalize(vec3(0.5, -0.8, 0.3))));
  col += mix(uB, uC, 0.4) * under * 0.22;

  // edges of each fold catch a little light
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.6);
  col += (base * 0.6 + vec3(0.22, 0.14, 0.24)) * rim * 0.5 * ao;

  // your voice lifts the whole thing
  col += base * (0.2 * uLevel + 0.08 * uWork);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float R = BALL * (1.0 + 0.085 * uLevel - 0.06 * uWork);
  vec3 tint = mix(mix(uA, uB, 0.5 + 0.5 * sin(uFlow * 0.7 + uv.x * 2.0)), uC, 0.5 + 0.5 * sin(uFlow * 0.5 - uv.y * 2.4 + 1.0)) ;
  vec3 light = spill(uv, R * 0.9, tint);

  // the knot fits a ball of radius 0.9; anything past that is only stage light
  vec2 q = uv / R * 0.88;
  if (dot(q, q) > 1.0) { gl_FragColor = vec4(light, 0.0); return; }

  // straight-on rays; keep the nearest miss so the outline is antialiased
  float px = 2.0 / uRes.y / R * 0.88;
  float z = sqrt(max(0.0, 0.81 - dot(q, q))) + 0.02;
  float near = 1e3;
  float nearZ = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 64; i++) {
    float d = map(vec3(q, z));
    if (d < near) { near = d; nearZ = z; }
    if (d < 0.0015) { hit = 1.0; break; }
    z -= d * 0.5;
    if (z < -1.0) break;
  }
  float cover = hit > 0.5 ? 1.0 : 1.0 - smoothstep(0.0, px * 1.6, near);
  if (cover <= 0.0) { gl_FragColor = vec4(light, 0.0); return; }
  vec3 col = min(shade(vec3(q, hit > 0.5 ? z : nearZ)), vec3(1.0));
  gl_FragColor = vec4(col * cover + light * (1.0 - cover), cover);
}
`;

const GLASS = `${HEAD}
// What is inside the glass: the same folded field as the knot, but as thin
// sheets of light instead of a solid. Stripes through the ball, twisted so
// they bend into S-curves, a slow sine give so they never look machined.
float fold(vec3 p) {
  vec3 w = p;
  w += (0.2 + 0.07 * uLevel) * sin(w.yzx * 1.7 + vec3(uFlow * 0.9, 1.7 - uFlow * 0.6, 3.1 + uFlow * 0.7));
  w.xy *= rot(w.z * (1.7 + 1.5 * uWork) + uFlow * 0.5 + uSpin * 0.5);
  return w.y * 1.25 + 0.5 + 0.2 * sin(w.x * 1.6 + uFlow * 0.4);
}

// blue → violet → pink → orange
vec3 ramp(float h) {
  vec3 c = mix(uD, uA, smoothstep(0.0, 0.3, h));
  c = mix(c, uB, smoothstep(0.3, 0.6, h));
  return mix(c, uC, smoothstep(0.6, 0.95, h));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float r = length(uv);
  float R = BALL * (1.0 + 0.085 * uLevel - 0.06 * uWork);
  vec3 tint = mix(mix(uA, uB, 0.5 + 0.5 * sin(uFlow * 1.4 + uv.x * 2.0)), uC, 0.5 + 0.5 * sin(uFlow * 1.1 - uv.y * 2.4 + 1.0));
  vec3 light = spill(uv, R, tint);
  float aa = 2.0 / uRes.y;
  float mask = 1.0 - smoothstep(R - aa, R + aa, r);
  if (mask <= 0.0) { gl_FragColor = vec4(light, 0.0); return; }

  vec2 q = uv / R;
  float zs = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 n = vec3(q, zs);
  float edge = 1.0 - zs;

  // Look through the ball. The glass bends the view, so the inside is seen
  // a little magnified; then walk front to back adding up the light of
  // every sheet the eye passes through. Where the eye runs ALONG a sheet it
  // passes through a lot of it: that is why the folds have bright edges.
  vec2 s = q * (0.7 + 0.24 * zs);
  mat2 turn = rot(uFlow * 0.3 + uSpin);
  mat2 tip = rot(0.5 + 0.2 * sin(uFlow * 0.27));
  const int STEPS = 40;
  float span = 2.0 * zs * 0.94;
  float dz = span / float(STEPS);
  // a hair of jitter hides the steps
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 L = normalize(vec3(-0.5, 0.7, 0.5));
  vec3 col = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < STEPS; i++) {
    float z = zs * 0.94 - (float(i) + jit) * dz;
    vec3 p = vec3(s, z);
    p.yz *= tip;
    p.xz *= turn;
    float f = fold(p);
    float x = abs(fract(f) - 0.5) * 2.0;
    // the sheet: thin where stripes meet, soft falloff either side
    float sheet = smoothstep(0.7, 1.0, x);
    sheet *= sheet;
    // lit from up-left: one face of each fold is bright, the other falls away
    float lit = clamp((fold(p + L * 0.1) - f) * (fract(f) > 0.5 ? -1.0 : 1.0) * 3.2 + 0.55, 0.0, 1.0);
    // sheets take turns: one cool (blue to violet), the next warm (pink to orange)
    float warm = mod(floor(f + 0.5), 2.0);
    float h = mix(0.0, 0.52, warm) + 0.48 * (0.5 + 0.5 * sin(p.z * 1.6 + dot(p.xy, vec2(1.1, -0.8)) * 1.3 + uFlow * 0.25));
    vec3 c = ramp(h);
    float depth = 0.55 + 0.45 * smoothstep(-0.9, 0.9, z);
    float a = sheet * dz * 3.4;
    col += T * a * pow(c, vec3(1.45)) * (0.1 + 2.5 * lit * lit) * depth * (1.0 + 0.6 * uLevel + 0.25 * uWork);
    // the hot core of a fold: nearly white where the sheet is densest
    col += T * a * sheet * sheet * sheet * lit * lit * (c * 0.7 + vec3(0.75, 0.6, 0.62)) * (0.9 + 1.0 * uLevel);
    T *= 1.0 - min(0.9, a * 1.5);
    // the clear between the sheets carries a little colour, so pockets are deep violet, not black
    col += T * dz * (uA * 0.06 + uD * 0.06) * (1.0 - sheet);
  }

  // The heart: a warm light behind it all that your voice turns up.
  vec2 hc = 0.14 * vec2(sin(uTime * 0.31), cos(uTime * 0.23)) + vec2(0.05, -0.05);
  float heart = exp(-dot(q - hc, q - hc) * 2.6);
  col += T * mix(uB, uC, 0.5) * heart * (0.05 + 0.3 * uLevel + 0.12 * uWork);
  // bright without washing out: roll the top off per channel, then push the colour back in
  col = 1.0 - exp(-col * 1.5);
  float grey = dot(col, vec3(0.3, 0.5, 0.2));
  col = max(vec3(0.0), mix(vec3(grey), col, 1.35));

  // Glass. Light comes from up-left, runs through the ball and pools on the
  // far rim as a bright crescent; the near rim darkens; a thin pale line
  // runs all the way round; a soft window up-left with one hard glint in it.
  vec2 Ld = normalize(vec2(-0.55, 0.7));
  vec2 qn = normalize(q + 1e-4);
  vec3 rimTint = ramp(0.5 + 0.5 * sin(atan(q.y, q.x) * 1.0 + uFlow * 0.5 + 1.2));
  float through = pow(edge, 1.6) * smoothstep(-0.3, 0.9, dot(qn, -Ld));
  col += (col * 0.9 + rimTint * 0.75 + vec3(0.14, 0.08, 0.14)) * through * 1.25;
  col *= 1.0 - 0.35 * pow(edge, 1.8) * smoothstep(-0.2, 1.0, dot(qn, Ld));
  col += (rimTint * 0.9 + vec3(0.5, 0.42, 0.55)) * pow(edge, 3.6) * 1.0;
  vec3 H = normalize(vec3(Ld * 0.62, 0.78));
  float hl = clamp(dot(n, H), 0.0, 1.0);
  col += vec3(1.0, 0.97, 1.0) * (pow(hl, 10.0) * 0.12 + pow(hl, 260.0) * 0.8);

  col = min(col, vec3(1.0));
  gl_FragColor = vec4(col * mask + light * (1.0 - mask), mask);
}
`;

export type OrbFrame = {
  /** seconds, steady */
  time: number;
  /** seconds, runs faster while you talk */
  flow: number;
  /** radians of extra turn, wound up while working */
  spin: number;
  level: number;
  listen: number;
  work: number;
  /** 0 in the dock, 1 on the stage */
  stage: number;
};

function tokenRgb(name: string): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(shader));
  return shader;
}

/** Sets up the orb on a square canvas of `px` device pixels. Returns null
    when there's no WebGL. `resize` changes the pixel size without losing the
    program, so one canvas can go from the dock to the stage. */
export function createOrbRenderer(canvas: HTMLCanvasElement, px: number, look: OrbLook = orbLook()) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, look === "glass" ? GLASS : KNOT));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u("uRes");
  const uTime = u("uTime");
  const uFlow = u("uFlow");
  const uSpin = u("uSpin");
  const uLevel = u("uLevel");
  const uListen = u("uListen");
  const uWork = u("uWork");
  const uStage = u("uStage");
  gl.uniform3f(u("uA"), ...tokenRgb("--color-crew"));
  gl.uniform3f(u("uB"), ...tokenRgb("--color-couple"));
  gl.uniform3f(u("uC"), ...tokenRgb("--color-trip"));
  gl.uniform3f(u("uD"), ...tokenRgb("--color-fam"));

  let size = 0;
  const resize = (next: number) => {
    if (size === next) return;
    size = next;
    canvas.width = next;
    canvas.height = next;
    gl.viewport(0, 0, next, next);
    gl.uniform2f(uRes, next, next);
  };
  resize(px);

  return {
    gl,
    resize,
    render({ time, flow, spin, level, listen, work, stage }: OrbFrame) {
      gl.uniform1f(uTime, time);
      gl.uniform1f(uFlow, flow);
      gl.uniform1f(uSpin, spin);
      gl.uniform1f(uLevel, level);
      gl.uniform1f(uListen, listen);
      gl.uniform1f(uWork, work);
      gl.uniform1f(uStage, stage);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    },
  };
}
