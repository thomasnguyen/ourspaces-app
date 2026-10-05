/* The voice orb's shader: three liquid strands (crew violet, couple pink,
   trip orange) twisted around each other inside a glossy sphere, like the
   concept in nebius/refs/voice/01. It is the one lit material in the app
   (DESIGN.md): the light stays inside the circle, no halo. Your voice swells
   the strands and loosens the twist; "working" tightens and spins it. */

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

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Round at rest; the outline only gives a little when you talk.
  float wob = snoise(vec3(cos(ang) * 1.1, sin(ang) * 1.1, uTime * 1.4)) * (0.004 + 0.03 * uLevel);
  float R = 0.62 + 0.06 * uLevel - 0.035 * uWork + wob;
  float aa = 2.0 / uRes.y;
  float mask = 1.0 - smoothstep(R - aa, R + aa, r);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

  vec2 q = uv / R;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 n = normalize(vec3(q, z));

  float t = uTime * (0.2 + 0.28 * uListen + 1.2 * uWork);
  vec3 p = n;
  p.yz = rot(0.55) * p.yz;
  p.xz = rot(t * 0.8) * p.xz;
  float flow = 0.2 * (1.0 + 0.9 * uLevel);
  p += flow * vec3(
    snoise(p * 1.3 + vec3(0.0, 0.0, t * 0.7)),
    snoise(p * 1.3 + vec3(3.1, 1.7, t * 0.7)),
    snoise(p * 1.3 + vec3(7.3, 4.1, t * 0.7)));

  // Three strands twisted around one axis, like a rope of jelly.
  float twist = 2.3 + 0.6 * sin(t * 0.5) + 1.2 * uWork - 0.6 * uLevel;
  float psi = atan(p.y, p.x) + p.z * twist + t * 0.5;
  float third = 2.0943951;
  float w1 = pow(0.5 + 0.5 * cos(psi), 3.0);
  float w2 = pow(0.5 + 0.5 * cos(psi - third), 3.0);
  float w3 = pow(0.5 + 0.5 * cos(psi + third), 3.0);
  float sum = w1 + w2 + w3;
  // Colour from much sharper weights, or violet + orange blend into a third
  // pink and pink swallows the orb.
  vec3 k = pow(vec3(w1, w2, w3) / sum, vec3(4.0));
  vec3 col = (uA * k.x + uB * k.y + uC * k.z) / (k.x + k.y + k.z);

  // Each strand is a rounded tube: bright crest, shadowed valley between,
  // and the normal bends over the tube so every strand catches its own light.
  float crest = smoothstep(0.34, 0.92, max(w1, max(w2, w3)) / sum);
  float tube = sqrt(crest);
  col = mix(uA * 0.22, col, 0.18 + 0.82 * tube);
  vec2 slope = vec2(dFdx(tube), dFdy(tube)) * uRes.y * 0.5;
  vec3 nb = normalize(n + vec3(-slope * 0.07, 0.0));

  vec3 L = normalize(vec3(-0.45, 0.62, 0.75));
  float diff = clamp(dot(nb, L), 0.0, 1.0);
  col *= 0.5 + 0.7 * diff;
  col += col * 0.25 * z * tube;

  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  col += vec3(1.0, 0.96, 0.98) * pow(clamp(dot(nb, H), 0.0, 1.0), 48.0) * 0.7 * tube;
  col += vec3(1.0, 0.97, 0.99) * pow(clamp(dot(n, H), 0.0, 1.0), 140.0) * 0.8;

  float fres = pow(1.0 - z, 2.4);
  col = mix(col, uB * 1.08 + 0.06, fres * 0.38);
  col *= 1.0 - 0.32 * pow(1.0 - z, 7.0);

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
