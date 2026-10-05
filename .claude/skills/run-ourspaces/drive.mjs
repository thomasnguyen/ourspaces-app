#!/usr/bin/env node
/* drive — one warm Vite + one warm headless Chromium, driven by short commands.
 *
 *   node .claude/skills/run-ourspaces/drive.mjs <cmd> …   (alias: see SKILL.md)
 *
 *   up [--lane|--mock]           start the daemon (Vite :5291 strict + Chromium); any cmd auto-ups
 *   go <feature>[:<state>] [--w 1440|390]   load that state's URL, wait for its ready test id
 *   click <testid> · type <testid> <text> · wait <testid> · eval <file.mjs>
 *   shot [name]                  full PNG + small JPEG (≤1000px) in .context/drive/shots/
 *   sheet <f:s> … [--w 1440,390] shoot each, tile into ONE labelled JPEG
 *   two <f:s> [--w N]            two separate people (contexts) on one state, side by side
 *   take <f>[:<recipe>] [--w 1440|390] [--real|--det]   film a recipe: mp4 + one 8-frame filmstrip JPEG in .context/drive/takes/
 *   check                        every test id named in features/ exists as data-testid in src/
 *   down                         stop exactly what `up` started (recorded pids)
 *
 * A test id argument may be `css:<selector>` where the app has no test id yet.
 * Vite always runs with the dev-lane env (dusty-condor dev deployment), never prod;
 * mock vs lane is only whether `?mock=1` goes in the URL.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const FEATURES = join(HERE, "features");
const DIR = join(ROOT, ".context/drive");
const SHOTS = join(DIR, "shots");
const STATE = join(DIR, "state.json");
const LOG = join(DIR, "daemon.log");
const VITE_PORT = Number(process.env.DRIVE_VITE_PORT) || 5291; // a second worktree sets its own pair
const CTL_PORT = Number(process.env.DRIVE_CTL_PORT) || 5292;
const rel = (p) => relative(ROOT, p);

/* ---------- feature files ---------- */

function parseFeature(name) {
  const file = join(FEATURES, `${name}.md`);
  if (!existsSync(file)) throw new Error(`no feature "${name}" (features/${name}.md)`);
  const text = readFileSync(file, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`features/${name}.md has no --- header`);
  const f = { name, route: "#/", ready: null, testids: [], states: {}, stateOrder: [], takes: {}, takeOrder: [] };
  let block = null;
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#!")) continue;
    const st = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (block && st) {
      if (block === "states") { f.states[st[1]] = parseState(st[2]); f.stateOrder.push(st[1]); }
      else { f.takes[st[1]] = parseTake(st[2], `${name}:${st[1]}`); f.takeOrder.push(st[1]); }
      continue;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    block = kv[1] === "states" || kv[1] === "take" ? kv[1] : null;
    if (kv[1] === "route") f.route = kv[2].trim();
    else if (kv[1] === "ready") f.ready = kv[2].trim();
    else if (kv[1] === "testids") f.testids = kv[2].split(/\s+/).filter(Boolean);
  }
  if (!f.stateOrder.length) f.states.default = parseState(""), f.stateOrder.push("default");
  return f;
}

/* `?a=b #/space/x | click id | wait id | type id text | sleep 300` */
function parseState(spec) {
  const [head = "", ...rest] = spec.split("|").map((s) => s.trim());
  let search = "", hash = null;
  const h = head.match(/(#\/\S*)/);
  if (h) hash = h[1];
  const q = head.replace(/#\/\S*/, "").trim();
  if (q.startsWith("?")) search = q.slice(1);
  const steps = rest.filter(Boolean).map((s) => {
    const [verb, ...more] = s.split(/\s+/);
    if (verb === "type") return { verb, target: more[0], text: more.slice(1).join(" ") };
    return { verb, target: more.join(" ") }; // click/wait take the whole rest (css: selectors have spaces)
  });
  return { search, hash, steps };
}

/* take recipe: `<state> [WxH] [<n>fps] [<n>f] [warmup <ms>] [focus <id>] [real] | <frame> click <id> | <frame> scroll <id>` */
function parseTake(spec, where) {
  const [head = "", ...rest] = spec.split("|").map((s) => s.trim());
  const toks = head.split(/\s+/).filter(Boolean);
  const t = { state: null, w: null, h: null, fps: 60, frames: 120, focus: null, warmup: 0, real: false, actions: [] };
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    let mm;
    if ((mm = k.match(/^(\d+)x(\d+)$/))) { t.w = +mm[1]; t.h = +mm[2]; }
    else if ((mm = k.match(/^(\d+)fps$/))) t.fps = +mm[1];
    else if ((mm = k.match(/^(\d+)f$/))) t.frames = +mm[1];
    else if (k === "focus") t.focus = toks[++i];
    else if (k === "warmup") t.warmup = Number(toks[++i]) || 0;
    else if (k === "real") t.real = true;
    else if (!t.state) t.state = k;
    else throw new Error(`take ${where}: unknown token "${k}"`);
  }
  for (const s of rest.filter(Boolean)) {
    const mm = s.match(/^(\d+)\s+(click|scroll)\s+(.+)$/);
    if (!mm) throw new Error(`take ${where}: bad action "${s}" (want "<frame> click|scroll <id>")`);
    t.actions.push({ frame: +mm[1], verb: mm[2], target: mm[3].trim() });
  }
  return t;
}

function stepIds(f) {
  const ids = new Set([...(f.ready ? [f.ready] : []), ...f.testids]);
  for (const s of Object.values(f.states)) for (const st of s.steps) if (["click", "wait", "type"].includes(st.verb)) ids.add(st.target);
  for (const t of Object.values(f.takes)) { for (const a of t.actions) ids.add(a.target); if (t.focus) ids.add(t.focus); }
  return [...ids];
}

const sel = (id) => (id.startsWith("css:") ? id.slice(4) : `[data-testid="${id}"]`);

/* ---------- daemon ---------- */

async function daemon(mode) {
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(STATE, JSON.stringify({ pid: process.pid, starting: true }));
  const { chromium } = await import("playwright-core");
  let vite, server;
  const kill = async () => {
    try { await server?.close(); } catch {}
    for (const pid of CHILDREN) { try { process.kill(-pid, "SIGKILL"); } catch {} } // a take's recorder + its Chrome
    for (const pid of [vite?.pid, server?.process()?.pid]) { try { process.kill(-pid, "SIGTERM"); } catch {} }
    await sleep(300);
    for (const pid of [vite?.pid, server?.process()?.pid]) { try { process.kill(-pid, "SIGKILL"); } catch {} }
    try { rmSync(STATE); } catch {}
  };
  try { await daemonBody(mode, chromium, (v) => (vite = v), (b) => (server = b), kill); }
  catch (e) { console.error("daemon failed:", e.message); await kill(); process.exit(1); }
}

async function daemonBody(mode, chromium, setVite, setServer, kill) {
  const lane = devLaneEnv();
  const vite = setVite(spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: ROOT, env: { ...process.env, ...lane }, detached: true, stdio: ["ignore", "inherit", "inherit"],
  }));
  let viteDead = false;
  vite.on("exit", () => (viteDead = true));
  const base = `http://127.0.0.1:${VITE_PORT}`;
  for (let i = 0; ; i++) {
    if (viteDead || i > 150) throw new Error(`vite did not start on :${VITE_PORT}`);
    try { const r = await fetch(base + "/", { signal: AbortSignal.timeout(500) }); if ((await r.text()).includes("OurSpaces")) break; } catch {}
    await sleep(200);
  }
  const server = setServer(await chromium.launchServer({
    executablePath: findChrome(), headless: process.env.HEADLESS !== "0",
    args: [...(/* Metal: real GPU in headless, ~2x faster frames than SwiftShader; DRIVE_GL=swiftshader if the orb renders blank */
      process.env.DRIVE_GL === "swiftshader" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu"]), "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
  }));
  const browser = await chromium.connect(server.wsEndpoint());
  const S = { mode, base, browser, pages: {}, width: 1440, last: null, nonce: 0 };
  writeFileSync(STATE, JSON.stringify({ pid: process.pid, vitePid: vite.pid, chromePid: server.process().pid, vitePort: VITE_PORT, ctlPort: CTL_PORT, mode, startedAt: new Date().toISOString() }, null, 2));

  const shutdown = async () => { await kill(); process.exit(0); };
  process.on("SIGTERM", shutdown);
  vite.on("exit", () => { console.error("vite exited"); shutdown(); });
  browser.on("disconnected", () => { console.error("chromium gone"); shutdown(); });

  // warm the module cache so the first `go` is already warm
  try { await go(S, "__warm__", null, 1440); } catch (e) { console.error("warm:", e.message); }

  let queue = Promise.resolve();
  createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/ping") return res.end(JSON.stringify({ ok: true, mode: S.mode }));
      if (req.url === "/shutdown") { res.end(JSON.stringify({ ok: true, lines: ["down"] })); return void setTimeout(shutdown, 50); }
      queue = queue.then(async () => {
        const out = [];
        try {
          const { cmd, args } = JSON.parse(body);
          await run(S, cmd, args, out);
          res.end(JSON.stringify({ ok: true, lines: out }));
        } catch (e) {
          res.end(JSON.stringify({ ok: false, lines: out, error: String(e.message ?? e).split("\n")[0] }));
        }
      });
    });
  }).listen(CTL_PORT, "127.0.0.1", () => console.error(`drive daemon ready: vite ${base}, ctl :${CTL_PORT}, ${mode}`));
}

function devLaneEnv() {
  const sh = readFileSync(join(ROOT, "scripts/dev-lane.sh"), "utf8");
  const dev = sh.match(/^DEV=(\S+)/m)?.[1];
  if (!dev) throw new Error("could not read DEV= from scripts/dev-lane.sh");
  return { VITE_CONVEX_URL: `https://${dev}.convex.cloud`, VITE_CONVEX_SITE_URL: `https://${dev}.convex.site` };
}

function findChrome() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const revs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split("-")[1] - a.split("-")[1]);
  for (const rev of revs) {
    const exe = join(cache, rev, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (existsSync(exe)) return exe;
  }
  throw new Error(`no cached Chromium under ${cache}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const viewport = (w) => (w <= 500 ? { viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });

async function newPage(S, w, ctx) {
  if (!ctx) {
    ctx = await S.browser.newContext(viewport(w));
    /* a returning visitor: skip the "You're in the demo" modal (sessionStorage),
       unless the state URL asks for it with ?notice=1 */
    await ctx.addInitScript(() => { if (!location.search.includes("notice=1")) sessionStorage.setItem("ourspaces-demo-notice-seen", "1"); });
  }
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e).split("\n")[0]));
  return page;
}

async function pageFor(S, w) {
  if (!S.pages[w] || S.pages[w].isClosed()) S.pages[w] = await newPage(S, w);
  S.width = w;
  return S.pages[w];
}

function stateUrl(S, f, st) {
  /* ?mock=1 lives in the SEARCH string, before the hash (inside the hash it
     breaks the space-slug parser and you land on crew). */
  const q = [S.mode === "mock" ? "mock=1" : "", new URLSearchParams(st.search).toString(), `_d=${++S.nonce}`]; // _d: always a full load
  return `${S.base}/?${q.filter(Boolean).join("&")}${st.hash ?? f.route}`;
}

async function go(S, name, stateName, w, page) {
  const t0 = Date.now();
  let f, st;
  if (name === "__warm__") { f = { name, route: "#/space/crew", ready: "css:.space-canvas" }; st = { search: "", hash: null, steps: [] }; stateName = "-"; }
  else {
    f = parseFeature(name);
    stateName ??= f.stateOrder[0];
    st = f.states[stateName];
    if (!st) throw new Error(`no state "${stateName}" in ${name} (has: ${f.stateOrder.join(", ")})`);
  }
  page ??= await pageFor(S, w);
  page.errors.length = 0;
  S.last = null;
  const cdp = page._cdp ??= await page.context().newCDPSession(page);
  await page.goto(stateUrl(S, f, st), { waitUntil: "commit", timeout: 10000 }).catch((e) => { throw new Error(`${name}:${stateName} navigation failed: ${e.message.split("\n")[0]}`); });
  await cdp.send("Animation.enable").catch(() => {});
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 6 }).catch(() => {});
  if (f.ready) await page.locator(sel(f.ready)).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => { throw new Error(`${name}:${stateName} ready test id "${f.ready}" never appeared`); });
  await settle(page);
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 }).catch(() => {});
  for (const step of st.steps) await doStep(page, step, `${name}:${stateName}`);
  S.last = { name, stateName, w: w ?? S.width };
  return Date.now() - t0;
}

/* entrance run: wait until no finite CSS animation is still running (capped).
   Waiting for .is-entering to drop too costs ~1 s for no visible change. */
async function settle(page, cap = 1200) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().endTime === Infinity), null, { timeout: cap, polling: 40 }).catch(() => {});
}

async function doStep(page, { verb, target, text }, where) {
  const loc = () => page.locator(sel(target)).first();
  const fail = (what) => () => { throw new Error(`${where}: ${what} "${target}" failed (not found/visible)`); };
  if (verb === "click") {
    await loc().click({ timeout: 5000 }).catch(fail("click"));
    await page.mouse.move(4, 4); // park the pointer so hover chrome doesn't photobomb the shot
  }
  else if (verb === "wait") await loc().waitFor({ state: "visible", timeout: 10000 }).catch(fail("wait"));
  else if (verb === "type") await loc().fill(text, { timeout: 5000 }).catch(fail("type"));
  else if (verb === "sleep") await sleep(Number(target) || 0);
  else throw new Error(`${where}: unknown step "${verb}"`);
}

async function capture(page, format, max) {
  const vp = page.viewportSize();
  const cdp = page._cdp ??= await page.context().newCDPSession(page);
  const dpr = page._dpr ??= await page.evaluate(() => devicePixelRatio);
  /* CDP scale multiplies device pixels, so divide the DPR out for the cap */
  const scale = max ? Math.min(1, max / (Math.max(vp.width, vp.height) * dpr)) : 1;
  const { data } = await cdp.send("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality: 78 } : { optimizeForSpeed: true }), clip: { x: 0, y: 0, width: vp.width, height: vp.height, scale } });
  return Buffer.from(data, "base64");
}
const grabJpeg = (page, max = 1000) => capture(page, "jpeg", max);

function label() { return new Date().toISOString().slice(11, 19).replace(/:/g, ""); }

async function shoot(page, name) {
  const png = join(SHOTS, `${name}.png`), jpg = join(SHOTS, `${name}.jpg`);
  const [a, b] = await Promise.all([capture(page, "png"), grabJpeg(page)]);
  writeFileSync(png, a); writeFileSync(jpg, b);
  return { png, jpg };
}

/* tile [{label, jpeg}] into one JPEG, laid out in a throwaway page */
async function tile(S, items, out, cellH = 420) {
  const ctx = await S.browser.newContext({ viewport: { width: 1800, height: 400 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const cells = items.map((it) => `<figure><figcaption>${it.label}</figcaption><img src="data:image/jpeg;base64,${it.jpeg.toString("base64")}"></figure>`).join("");
  await p.setContent(`<style>body{margin:0;background:#222;font:600 15px ui-monospace,Menlo,monospace;color:#eee}
    main{display:flex;flex-wrap:wrap;gap:10px;padding:10px;width:max-content;max-width:1780px}
    figure{margin:0}figcaption{padding:2px 4px 6px}img{height:${cellH}px;display:block;border:1px solid #555}</style><main>${cells}</main>`);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete));
  const box = await p.locator("main").boundingBox();
  await p.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
  await p.screenshot({ path: out, type: "jpeg", quality: 80, clip: box });
  await ctx.close();
}

function widthsOf(args, def = [1440]) {
  const i = args.indexOf("--w");
  if (i < 0) return def;
  const ws = String(args[i + 1] ?? "").split(",").map(Number).filter(Boolean);
  args.splice(i, 2);
  return ws.length ? ws : def;
}

const splitTarget = (t) => { const [n, s] = String(t).split(":"); return [n, s || null]; };

async function run(S, cmd, args, out) {
  const t0 = Date.now();
  if (cmd === "up") {
    if (args.includes("--lane")) S.mode = "lane";
    if (args.includes("--mock")) S.mode = "mock";
    out.push(`up · ${S.mode} · vite ${S.base} · ctl :${CTL_PORT}`);
  } else if (cmd === "go") {
    const shotFlag = args.includes("--shot");
    args = args.filter((a) => a !== "--shot");
    const [w] = widthsOf(args, [S.width]);
    const [n, s] = splitTarget(args[0]);
    if (!n) throw new Error("usage: go <feature>[:<state>] [--w 1440|390]");
    const ms = await go(S, n, s, w);
    const page = S.pages[w];
    out.push(`go ${n}:${S.last.stateName} @${w} · ${ms}ms`);
    if (shotFlag) { const { png, jpg } = await shoot(page, `${n}-${S.last.stateName}-${w}`); out.push(`jpg ${rel(jpg)}`, `png ${rel(png)} · total ${Date.now() - t0}ms`); }
    if (page.errors.length) out.push(`page errors (${page.errors.length}): ${page.errors[0].slice(0, 160)}`);
  } else if (["click", "wait", "type"].includes(cmd)) {
    const page = await pageFor(S, S.width);
    if (!args[0]) throw new Error(`usage: ${cmd} <testid>${cmd === "type" ? " <text>" : ""}`);
    await doStep(page, { verb: cmd, target: args[0], text: args.slice(1).join(" ") }, cmd);
    out.push(`${cmd} ${args[0]} · ${Date.now() - t0}ms`);
  } else if (cmd === "shot") {
    const page = await pageFor(S, S.width);
    const name = args[0] ?? (S.last ? `${S.last.name}-${S.last.stateName}-${S.width}` : `shot-${label()}`);
    const { png, jpg } = await shoot(page, name);
    out.push(`jpg ${rel(jpg)}`, `png ${rel(png)} · ${Date.now() - t0}ms`);
  } else if (cmd === "sheet") {
    const ws = widthsOf(args, [1440]);
    if (!args.length) throw new Error("usage: sheet <feature>:<state> … [--w 1440,390]");
    const items = [];
    for (const t of args) for (const w of ws) {
      const [n, s] = splitTarget(t);
      await go(S, n, s, w);
      items.push({ label: `${n}:${S.last.stateName} @${w}`, jpeg: await grabJpeg(S.pages[w]) });
    }
    const outFile = join(SHOTS, `sheet-${label()}.jpg`);
    await tile(S, items, outFile, ws.some((w) => w <= 500) ? 520 : items.length >= 3 ? 360 : 420);
    out.push(`sheet ${rel(outFile)} · ${items.length} cells · ${Date.now() - t0}ms`);
  } else if (cmd === "two") {
    const [w] = widthsOf(args, [S.width]);
    const [n, s] = splitTarget(args[0]);
    if (!n) throw new Error("usage: two <feature>:<state>");
    const pages = await Promise.all([newPage(S, w), newPage(S, w)]);
    try {
      await Promise.all(pages.map((p) => go(S, n, s, w, p)));
      const items = await Promise.all(pages.map(async (p, i) => ({ label: `${i ? "B" : "A"} · ${n}:${S.last.stateName} @${w} · ${S.mode}`, jpeg: await grabJpeg(p) })));
      const outFile = join(SHOTS, `two-${n}-${label()}.jpg`);
      await tile(S, items, outFile, w <= 500 ? 640 : 480);
      out.push(`two ${rel(outFile)} · ${Date.now() - t0}ms`);
    } finally { await Promise.all(pages.map((p) => p.context().close())); }
  } else if (cmd === "eval") {
    const page = await pageFor(S, S.width);
    const file = resolve(args[0] ?? "");
    if (!existsSync(file)) throw new Error(`eval: no file ${args[0]}`);
    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    const log = console.log;
    console.log = (...a) => out.push(a.map(String).join(" "));
    try {
      const r = await mod.default({ page, ctx: page.context(), base: S.base, mockUrl: (route) => `${S.base}/${S.mode === "mock" ? "?mock=1" : ""}${route}`, go: (t, w = S.width) => go(S, ...splitTarget(t), w), shot: (name) => shoot(page, name) });
      if (r !== undefined) out.push(typeof r === "string" ? r : JSON.stringify(r));
    } finally { console.log = log; }
    out.push(`eval ${args[0]} · ${Date.now() - t0}ms`);
  } else if (cmd === "take") {
    await take(S, args, out);
  } else throw new Error(`unknown command "${cmd}" (up go click type wait eval shot sheet two take check down)`);
}

/* ---------- take: film a recipe → mp4 + one filmstrip JPEG ---------- */

const TAKES = join(DIR, "takes");
const RECORDER = join(ROOT, ".context/web-video/record.mjs");
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const CHILDREN = new Set(); // recorder process groups, killed by `down`

function sh(cmd, argv, { onLine } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    CHILDREN.add(p.pid);
    let all = "", buf = "";
    const eat = (c) => { all += c; buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { onLine?.(buf.slice(0, i)); buf = buf.slice(i + 1); } };
    p.stdout.on("data", eat); p.stderr.on("data", eat);
    p.on("error", rej);
    p.on("exit", (code) => { CHILDREN.delete(p.pid); res({ code, out: all }); });
  });
}

/* first free port in a small fixed range, so the recorder's Chrome profile
   (/tmp/web-video/profile-<port>) and its HTTP cache get reused between takes */
async function freePort(from = 9420, to = 9439) {
  const { createServer: net } = await import("node:net");
  for (let p = from; p <= to; p++) {
    const ok = await new Promise((r) => { const s = net().once("error", () => r(false)).listen(p, "127.0.0.1", () => s.close(() => r(true))); });
    if (ok) {
      try { await fetch(`http://127.0.0.1:${p}/json/version`, { signal: AbortSignal.timeout(300) }); continue; } catch {} // squatted on another interface
      return p;
    }
  }
  throw new Error(`take: no free CDP port in ${from}-${to}`);
}

async function take(S, args, out) {
  const t0 = Date.now();
  const realFlag = args.includes("--real"), detFlag = args.includes("--det");
  args = args.filter((a) => a !== "--real" && a !== "--det");
  const [wArg] = widthsOf(args, [0]);
  const [n, r] = splitTarget(args[0]);
  if (!n) throw new Error("usage: take <feature>[:<recipe>] [--w 1440|390] [--real|--det]");
  const f = parseFeature(n);
  if (!f.takeOrder.length) throw new Error(`${n} has no take recipe (features/${n}.md take: slot is empty)`);
  const recipe = r ?? f.takeOrder[0];
  const t = f.takes[recipe];
  if (!t) throw new Error(`no take "${recipe}" in ${n} (has: ${f.takeOrder.join(", ")})`);
  const stateName = t.state ?? f.stateOrder[0];
  const st = f.states[stateName];
  if (!st) throw new Error(`take ${n}:${recipe}: no state "${stateName}"`);
  const w = wArg || t.w || 1440;
  const vp = viewport(w);
  const h = wArg && wArg !== t.w ? vp.viewport.height : t.h || vp.viewport.height;
  const dsf = vp.deviceScaleFactor;
  const real = realFlag || (t.real && !detFlag);

  /* every test id the take clicks must be in src/ — fail before filming, by name */
  const srcIds = srcTestIds();
  for (const a of t.actions) if (!a.target.startsWith("css:") && !srcIds.ids.has(a.target) && !srcIds.prefixes.some((p) => a.target.startsWith(p)))
    throw new Error(`take ${n}:${recipe}: test id "${a.target}" (frame ${a.frame}) is not a data-testid in src/`);

  mkdirSync(TAKES, { recursive: true });
  const base = `${n}-${recipe}${wArg && wArg !== 1440 ? `-${w}` : ""}`;
  const mp4 = join(TAKES, `${base}.mp4`), strip = join(TAKES, `${base}-strip.jpg`);
  const frameDir = join(DIR, "scratch", `take-${base}`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  /* the focus box (css px) is measured on the drive browser at the start state */
  let focus = null;
  const measure = async (page) => {
    if (!t.focus) return;
    const b = await page.locator(sel(t.focus)).first().boundingBox().catch(() => null);
    if (!b) throw new Error(`take ${n}:${recipe}: focus "${t.focus}" not found`);
    const px = Math.max(48, b.height * 0.9, b.width * 0.35), py = Math.max(40, b.height * 0.8);
    const x = Math.max(0, b.x - px), y = Math.max(0, b.y - py);
    focus = { x, y, w: Math.min(w, b.x + b.width + px) - x, h: Math.min(h, b.y + b.height + py) - y };
  };

  let frames = [], ext, note;
  try {
    if (real) {
      if (h !== vp.viewport.height) throw new Error(`take ${n}:${recipe}: real mode films the drive viewport (${w}x${vp.viewport.height}); drop the WxH`);
      const page = await pageFor(S, w);
      await go(S, n, stateName, w);
      await measure(page);
      ({ frames, note } = await filmReal(page, t, frameDir, `${n}:${recipe}`));
      ext = "jpg";
    } else {
      if (st.steps.length) throw new Error(`take ${n}:${recipe}: state "${stateName}" has steps; deterministic takes start from a URL-only state (move the clicks into frame actions, or use real)`);
      if (t.focus) { const page = await pageFor(S, w); await go(S, n, stateName, w); await measure(page); }
      ({ frames, note } = await filmDeterministic(S, f, st, t, { w, h, dsf }, frameDir, `${n}:${recipe}`));
      ext = "png";
    }
    const enc = await sh(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(t.fps), "-start_number", "0", "-i", join(frameDir, `%05d.${ext}`),
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    if (enc.code) throw new Error(`ffmpeg failed: ${enc.out.trim().split("\n").pop()}`);
    const N = frames.length, picks = [...new Set(Array.from({ length: 8 }, (_, i) => Math.round((i * (N - 1)) / 7)))];
    await filmstrip(S, picks.map((i) => ({ label: `f${i} · ${(i / t.fps).toFixed(2)}s`, buf: readFileSync(frames[i]), mime: ext === "png" ? "image/png" : "image/jpeg" })),
      focus, w, strip);
  } finally { rmSync(frameDir, { recursive: true, force: true }); }

  out.push(`mp4 ${rel(mp4)}`, `strip ${rel(strip)}`,
    `${(t.frames / t.fps).toFixed(2)}s · ${t.frames}f @ ${t.fps}fps · ${real ? `real (${note})` : "deterministic"} · took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/* virtual-clock recorder (.context/web-video/record.mjs) in its own Chrome on a free port */
async function filmDeterministic(S, f, st, t, { w, h, dsf }, frameDir, where) {
  const port = await freePort();
  const actions = {};
  for (const a of t.actions) {
    if (actions[a.frame]) throw new Error(`take ${where}: two actions on frame ${a.frame}`);
    actions[a.frame] = a.target.startsWith("css:")
      ? `(() => { const el = document.querySelector(${JSON.stringify(a.target.slice(4))}); if (!el) throw new Error("no ${a.target.replace(/"/g, "'")}"); el.${a.verb === "click" ? "click()" : "scrollIntoView({block:'center'})"}; })()`
      : { [a.verb]: a.target };
  }
  const actFile = join(frameDir, "..", `${frameDir.split("/").pop()}-actions.json`);
  writeFileSync(actFile, JSON.stringify(actions));
  const url = stateUrl(S, f, st);
  const argv = [RECORDER, "--url", url, "--frames", String(t.frames), "--fps", String(t.fps), "--w", String(w), "--h", String(h), "--dsf", String(dsf),
    "--port", String(port), "--gl", process.env.DRIVE_GL === "swiftshader" ? "swiftshader" : "metal", "--keep-raf", "--warmup", String(Math.round((t.warmup * t.fps) / 1000)), "--out", frameDir, "--actions", actFile,
    "--pre", `if (!location.search.includes("notice=1")) sessionStorage.setItem("ourspaces-demo-notice-seen", "1");`];
  if (f.ready) argv.push("--ready", sel(f.ready));
  const failed = [];
  const res = await sh(process.execPath, argv, { onLine: (l) => { if (/FAILED|HIJACKED|HUNG/.test(l)) failed.push(l.trim()); } });
  rmSync(actFile, { force: true });
  try { await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(300) }); await closeBrowser(port); } catch {} // recorder died with its Chrome up
  for (const l of failed) {
    const id = l.match(/no \[data-testid=\\*"([^"\\]+)\\*"\]/)?.[1] ?? l.match(/no css:([^"\\]+)/)?.[1];
    const fr = l.match(/frame (\d+)/)?.[1];
    throw new Error(id ? `take ${where}: test id "${id}" not on the page at frame ${fr}` : `take ${where}: recorder ${l.slice(0, 200)}`);
  }
  if (res.code) throw new Error(`take ${where}: recorder exited ${res.code}: ${res.out.trim().split("\n").slice(-2).join(" | ").slice(0, 300)}`);
  const frames = Array.from({ length: t.frames }, (_, i) => join(frameDir, `${String(i).padStart(5, "0")}.png`));
  if (!frames.every((p) => existsSync(p))) throw new Error(`take ${where}: recorder wrote fewer than ${t.frames} frames`);
  return { frames };
}

async function closeBrowser(port) {
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  await sleep(300);
  try { ws.close(); } catch {}
}

/* real time in the drive browser: CDP screencast, resampled onto a fixed fps grid
   (each output frame = the newest screencast frame at that instant, so a stall
   shows as a held frame instead of being smoothed over) */
async function filmReal(page, t, frameDir, where) {
  const cdp = page._cdp ??= await page.context().newCDPSession(page);
  const shots = [];
  const onFrame = ({ data, metadata, sessionId }) => { shots.push({ data, ts: metadata.timestamp * 1000 }); cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {}); };
  cdp.on("Page.screencastFrame", onFrame);
  const vp = page.viewportSize(), dpr = page._dpr ??= await page.evaluate(() => devicePixelRatio);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: vp.width * dpr, maxHeight: vp.height * dpr, everyNthFrame: 1 });
  const start = Date.now();
  try {
    for (const a of [...t.actions].sort((x, y) => x.frame - y.frame)) {
      const due = start + (a.frame * 1000) / t.fps;
      if (due > Date.now()) await sleep(due - Date.now());
      const err = await page.evaluate(({ q, verb }) => { const el = document.querySelector(q); if (!el) return "missing"; if (verb === "click") el.click(); else el.scrollIntoView({ block: "center" }); return null; }, { q: sel(a.target), verb: a.verb });
      if (err) throw new Error(`take ${where}: test id "${a.target}" not on the page at frame ${a.frame}`);
    }
    const end = start + (t.frames * 1000) / t.fps;
    if (end > Date.now()) await sleep(end - Date.now() + 60);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    cdp.off("Page.screencastFrame", onFrame);
  }
  if (!shots.length) throw new Error(`take ${where}: screencast delivered no frames`);
  const frames = [];
  let j = 0;
  for (let i = 0; i < t.frames; i++) {
    const at = start + (i * 1000) / t.fps;
    while (j + 1 < shots.length && shots[j + 1].ts <= at) j++;
    const p = join(frameDir, `${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(p, Buffer.from(shots[j].data, "base64"));
    frames.push(p);
  }
  const inWindow = shots.filter((s) => s.ts >= start && s.ts <= start + (t.frames * 1000) / t.fps).length;
  return { frames, note: `${(inWindow / (t.frames / t.fps)).toFixed(0)} fps delivered` };
}

/* 8 frames, cropped to the focus box (css px of a cssW-wide viewport) if any, tiled so the longest side is ~1600 px.
   Frame images may be 1x or 2x (the screencast sends css-px frames on mobile), so scale by the image's own width. */
async function filmstrip(S, items, focus, cssW, outFile) {
  const ctx = await S.browser.newContext({ viewport: { width: 1700, height: 400 }, deviceScaleFactor: 1 });
  try {
    const p = await ctx.newPage();
    const html = items.map((it, i) => `<img id="i${i}" src="data:${it.mime};base64,${it.buf.toString("base64")}">`).join("");
    await p.setContent(`<body style="margin:0">${html}</body>`);
    await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
    const nat = await p.evaluate(() => [document.images[0].naturalWidth, document.images[0].naturalHeight]);
    const k = nat[0] / cssW, crop = focus && { x: focus.x * k, y: focus.y * k, w: focus.w * k, h: focus.h * k };
    const c = crop ? { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(Math.min(crop.w, nat[0] - crop.x)), h: Math.round(Math.min(crop.h, nat[1] - crop.y)) } : { x: 0, y: 0, w: nat[0], h: nat[1] };
    const GAP = 8, LAB = 22, MAX = 1600, n = items.length;
    let best = null;
    for (const cols of [1, 2, 4, 8].filter((k) => k <= n)) {
      const rows = Math.ceil(n / cols);
      const s = Math.min(1, (MAX - GAP * (cols + 1)) / (cols * c.w), (MAX - GAP * (rows + 1) - LAB * rows) / (rows * c.h));
      if (!best || s > best.s + 1e-6) best = { cols, rows, s };
    }
    const cw = Math.round(c.w * best.s), ch = Math.round(c.h * best.s);
    await p.evaluate(({ c, cw, ch, s, cols, labels, GAP, LAB }) => {
      const imgs = [...document.images];
      document.body.innerHTML = "";
      document.body.style.cssText = `margin:0;background:#1d1d1d;font:600 14px ui-monospace,Menlo,monospace;color:#eee`;
      const main = document.createElement("main");
      main.style.cssText = `display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:${GAP}px;padding:${GAP}px;width:max-content`;
      imgs.forEach((img, i) => {
        const fig = document.createElement("figure");
        fig.style.cssText = "margin:0";
        fig.innerHTML = `<figcaption style="height:${LAB}px;line-height:${LAB - 4}px">${labels[i]}</figcaption>`;
        const box = document.createElement("div");
        box.style.cssText = `width:${cw}px;height:${ch}px;overflow:hidden;position:relative;outline:1px solid #444`;
        img.style.cssText = `position:absolute;left:${-c.x * s}px;top:${-c.y * s}px;width:${img.naturalWidth * s}px;height:${img.naturalHeight * s}px`;
        box.append(img); fig.append(box); main.append(fig);
      });
      document.body.append(main);
    }, { c, cw, ch, s: best.s, cols: best.cols, labels: items.map((it) => it.label), GAP, LAB });
    const box = await p.locator("main").boundingBox();
    await p.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
    await p.screenshot({ path: outFile, type: "jpeg", quality: 82, clip: box });
  } finally { await ctx.close(); }
}

function srcTestIds() {
  const ids = new Set(), prefixes = [];
  const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(e)) {
    const t = readFileSync(p, "utf8");
    for (const m of t.matchAll(/data-testid="([^"]+)"/g)) ids.add(m[1]);
    for (const m of t.matchAll(/data-testid=\{`([^`$]*)\$\{/g)) prefixes.push(m[1]);
  } } };
  walk(join(ROOT, "src"));
  return { ids, prefixes };
}

/* ---------- check (no daemon needed) ---------- */

function check() {
  const files = readdirSync(FEATURES).filter((f) => f.endsWith(".md") && f !== "README.md");
  const { ids: srcIds, prefixes } = srcTestIds();
  const missing = [], mentioned = new Set(), css = [];
  for (const file of files) {
    const f = parseFeature(file.replace(/\.md$/, ""));
    for (const id of stepIds(f)) {
      if (id.startsWith("css:")) { css.push(`${f.name}: ${id}`); continue; }
      mentioned.add(id);
      if (!srcIds.has(id) && !prefixes.some((p) => id.startsWith(p))) missing.push(`${f.name}: ${id}`);
    }
  }
  const unmapped = [...srcIds].filter((id) => !mentioned.has(id));
  console.log(`check · ${files.length} features · ${mentioned.size} test ids`);
  if (css.length) console.log(`css stand-ins (want a test id): ${css.join(", ")}`);
  if (unmapped.length) console.log(`warn: ${unmapped.length} src test ids in no feature: ${unmapped.slice(0, 12).join(" ")}${unmapped.length > 12 ? " …" : ""}`);
  if (missing.length) { console.log(`FAIL: not a data-testid in src/: ${missing.join(", ")}`); process.exitCode = 1; }
  else console.log("ok");
}

/* ---------- CLI ---------- */

const readState = () => { try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return null; } };
const alive = (pid) => { try { return pid && process.kill(pid, 0); } catch { return false; } };

async function ping() {
  try { const r = await fetch(`http://127.0.0.1:${CTL_PORT}/ping`, { signal: AbortSignal.timeout(800) }); return await r.json(); } catch { return null; }
}

async function ensureUp(mode) {
  const s = readState();
  if (s && alive(s.pid)) {
    for (let i = 0; i < 300 && !(await ping()); i++) await sleep(200); // another call is starting it
    if (await ping()) return false;
    throw new Error(`daemon ${s.pid} alive but not answering on :${CTL_PORT}; run drive down`);
  }
  const t0 = Date.now();
  mkdirSync(DIR, { recursive: true });
  const fd = openSync(LOG, "w");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "__daemon", mode], { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    if (await ping()) { console.log(`up · ${mode} · cold ${Date.now() - t0}ms · log ${rel(LOG)}`); return true; }
    if (!alive(child.pid)) break;
  }
  const tail = existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").slice(-3).join(" | ") : "";
  throw new Error(`daemon did not come up: ${tail}`);
}

async function send(cmd, args) {
  /* node:http, not fetch: fetch gives up after 300 s without headers, and a take can run longer */
  const { request } = await import("node:http");
  const j = await new Promise((res, rej) => {
    const q = request({ host: "127.0.0.1", port: CTL_PORT, path: "/cmd", method: "POST" }, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); });
    q.on("error", rej); q.end(JSON.stringify({ cmd, args }));
  });
  for (const l of j.lines ?? []) console.log(l);
  if (!j.ok) { console.log(`ERROR ${cmd}: ${j.error}`); process.exitCode = 1; }
}

async function down() {
  const s = readState();
  if (!s) return console.log("down · nothing recorded");
  if (await ping()) { try { await fetch(`http://127.0.0.1:${CTL_PORT}/shutdown`, { method: "POST" }); } catch {} }
  for (let i = 0; i < 25 && (alive(s.pid) || alive(s.vitePid) || alive(s.chromePid)); i++) await sleep(200);
  const left = [];
  for (const [k, pid] of [["daemon", s.pid], ["vite", s.vitePid], ["chrome", s.chromePid]]) {
    if (alive(pid)) { left.push(k); try { process.kill(k === "daemon" ? pid : -pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch {} } }
  }
  try { rmSync(STATE); } catch {}
  console.log(`down · stopped daemon ${s.pid}, vite ${s.vitePid}, chrome ${s.chromePid}${left.length ? ` (force-killed: ${left.join(", ")})` : ""}`);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "__daemon") await daemon(args[0] ?? "mock");
  else if (cmd === "check") check();
  else if (cmd === "down") await down();
  else if (!cmd || cmd === "help") console.log("drive up [--lane] | go <f>[:<s>] [--w 390] [--shot] | click|wait <id> | type <id> <text> | shot [name] | sheet <f:s>… [--w 1440,390] | two <f:s> | take <f>[:<recipe>] [--w 390] [--real|--det] | eval <file> | check | down");
  else {
    const mode = args.includes("--lane") ? "lane" : "mock";
    const started = await ensureUp(mode);
    if (!(cmd === "up" && started)) await send(cmd, args);
  }
} catch (e) {
  console.log(`ERROR ${cmd}: ${String(e.message ?? e).split("\n")[0]}`);
  process.exitCode = 1;
}
