/* The voice orb's shader: a clear glass ball with liquid light inside. The
   colour is one soft field that runs crew violet → couple pink → trip orange
   (through pink, so it never goes muddy), folded over itself and seen through
   a lens, with a warm heart that brightens when you talk. It is the one lit
   material in the app (DESIGN.md): the light stays inside the circle, no
   halo. Your voice stirs the liquid and lifts the glow; "working" winds it
   into a whirlpool. */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;
uniform float uListen;
uniform float uWork;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;

// 3D simplex noise, Ashima Arts (MIT)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// violet → pink → orange. Always through pink: violet and orange mixed
// straight make mud.
vec3 ramp(float h) {
  vec3 c = mix(uA, uB, smoothstep(0.02, 0.5, h));
  return mix(c, uC, smoothstep(0.5, 0.98, h));
}

// The liquid: one smooth field, warped twice so it folds over itself.
float liquid(vec2 s, float t, float stir) {
  vec2 w = vec2(snoise(vec3(s * 0.6, t)), snoise(vec3(s * 0.6 + 5.2, t)));
  s += stir * w;
  w = vec2(snoise(vec3(s * 0.9 + 1.7, t * 0.8)), snoise(vec3(s * 0.9 + 9.2, t * 0.8)));
  s += 0.3 * stir * w;
  return snoise(vec3(s * 0.62, t * 0.6 + 2.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Round at rest; the outline only gives a little when you talk.
  float wob = snoise(vec3(cos(ang) * 1.1, sin(ang) * 1.1, uTime * 1.2)) * (0.003 + 0.024 * uLevel);
  float R = 0.62 + 0.06 * uLevel - 0.035 * uWork + wob;
  float aa = 2.0 / uRes.y;
  float mask = 1.0 - smoothstep(R - aa, R + aa, r);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

  vec2 q = uv / R;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 n = vec3(q, z);
  float edge = 1.0 - z;

  // Ball lens: the middle magnifies, the rim squeezes what's behind it.
  vec2 s = q / (0.55 + 0.45 * z);
  float t = uTime * (0.16 + 0.2 * uListen + 0.5 * uWork);
  // working: a whirlpool, wound tighter toward the middle
  s = rot(uTime * 0.12 + uWork * (uTime * 2.6 + 2.2 * (1.0 - length(q)))) * s;
  float stir = 0.6 + 0.3 * uLevel;

  // Two sheets of the same liquid, the far one slower and seen through the
  // near one: that is what makes it read as clear instead of painted.
  float fNear = liquid(s, t, stir);
  float fFar = liquid(s * 0.7 + 3.1, t * 0.7 + 4.0, stir);
  vec3 near = ramp(smoothstep(-0.42, 0.42, fNear));
  vec3 far = mix(uA * 0.6, uB * 0.7, smoothstep(-0.3, 0.6, fFar));
  float veil = smoothstep(-0.5, 0.5, snoise(vec3(s * 0.7 + 6.0, t * 0.9)));
  vec3 col = mix(far, near, 0.3 + 0.7 * veil);

  // Where violet turns to orange the sheet folds over and the light inside
  // shows through: that seam glows.
  float seam = exp(-fNear * fNear * 26.0) * veil;
  col += (col * 0.5 + vec3(0.3, 0.16, 0.22)) * seam * (0.55 + 0.6 * uLevel);

  // The heart: a warm light a little off centre, behind the liquid.
  vec2 hc = 0.16 * vec2(sin(uTime * 0.31), cos(uTime * 0.23)) + vec2(0.06, -0.04);
  float heart = exp(-dot(q - hc, q - hc) * 2.4);
  col *= 0.56 + 0.74 * heart;
  col += mix(uB, vec3(1.0, 0.9, 0.86), 0.6) * heart * (0.34 + 0.5 * uLevel + 0.15 * uWork);

  // Glass. Light comes from up-left, runs through the ball and pools on the
  // far rim as a bright crescent; a thin pale line all the way round; a soft
  // window up-left with one small hard glint in it.
  vec2 Ld = normalize(vec2(-0.55, 0.7));
  float through = pow(edge, 1.6) * smoothstep(-0.1, 0.9, dot(normalize(q + 1e-4), -Ld));
  col += (col * 0.9 + vec3(0.3, 0.2, 0.26)) * through * 1.25;
  col *= 1.0 - 0.42 * pow(edge, 1.8) * smoothstep(-0.2, 1.0, dot(normalize(q + 1e-4), Ld));
  col += vec3(0.95, 0.88, 1.0) * pow(edge, 6.0) * 0.8;
  vec3 H = normalize(vec3(Ld * 0.62, 0.78));
  float hl = clamp(dot(n, H), 0.0, 1.0);
  col += vec3(1.0, 0.97, 1.0) * (pow(hl, 14.0) * 0.34 + pow(hl, 220.0) * 0.9);

  col = min(col, vec3(1.0));
  gl_FragColor = vec4(col * mask, mask);
}
`;

export type OrbFrame = { time: number; level: number; listen: number; work: number };

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
    when there's no WebGL. */
export function createOrbRenderer(canvas: HTMLCanvasElement, px: number) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  gl.getExtension("OES_standard_derivatives");
  canvas.width = px;
  canvas.height = px;
  gl.viewport(0, 0, px, px);

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uTime = u("uTime");
  const uLevel = u("uLevel");
  const uListen = u("uListen");
  const uWork = u("uWork");
  gl.uniform2f(u("uRes"), px, px);
  gl.uniform3f(u("uA"), ...tokenRgb("--color-crew"));
  gl.uniform3f(u("uB"), ...tokenRgb("--color-couple"));
  gl.uniform3f(u("uC"), ...tokenRgb("--color-trip"));

  return {
    render({ time, level, listen, work }: OrbFrame) {
      gl.uniform1f(uTime, time);
      gl.uniform1f(uLevel, level);
      gl.uniform1f(uListen, listen);
      gl.uniform1f(uWork, work);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    },
  };
}
