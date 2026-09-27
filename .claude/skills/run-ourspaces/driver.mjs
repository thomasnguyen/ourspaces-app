#!/usr/bin/env node
/* OurSpaces headless browser driver (playwright-core + cached Chromium).
 *
 * Prereq: vite dev server running (npm run dev &) and playwright-core
 * installed in this directory (npm i --prefix .claude/skills/run-ourspaces).
 *
 * Usage (from repo root):
 *   node .claude/skills/run-ourspaces/driver.mjs shot "#/space/trip" /tmp/out.png
 *   node .claude/skills/run-ourspaces/driver.mjs dock /tmp/dock.png [2]
 *   node .claude/skills/run-ourspaces/driver.mjs eval my-script.mjs
 *
 * `shot`  — open a hash route in the MOCK space (no Convex needed), screenshot.
 * `dock`  — trip space: open the web post's reading-circle thread dock via its
 *           comment chip, screenshot; optional arg 2 switches to starter q2.
 * `eval`  — escape hatch: the file default-exports async ({page, ctx, base}).
 *
 * Env: PORT=5174 to pin the vite port, HEADLESS=0 to watch, LIVE=1 to skip
 * the ?mock=1 flag and hit the connected Convex deployment instead.
 */
import { chromium } from "playwright-core";
import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function findChrome() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const revs = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const rev of revs) {
    const exe = join(
      cache, rev,
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    );
    if (existsSync(exe)) return exe;
  }
  throw new Error(`No cached Chromium under ${cache} — npx playwright install chromium`);
}

/* Other Conductor workspaces run their own vite; probe for OUR app by title. */
async function findBase() {
  const ports = process.env.PORT ? [process.env.PORT] : [5173, 5174, 5175, 5176];
  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
      const html = await res.text();
      if (html.includes("OurSpaces")) return `http://localhost:${port}`;
    } catch { /* not listening */ }
  }
  throw new Error("No OurSpaces vite server found on 5173-5176. Start one: npm run dev &");
}

function mockUrl(base, route) {
  /* ?mock=1 must live in the SEARCH string, before the hash — inside the hash
     it breaks the space-slug parser and you land on the crew space. */
  return process.env.LIVE === "1" ? `${base}/${route}` : `${base}/?mock=1${route}`;
}

const base = await findBase();
const browser = await chromium.launch({
  executablePath: findChrome(),
  headless: process.env.HEADLESS !== "0",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "shot") {
    const [route = "#/", out = "/tmp/ourspaces-shot.png"] = args;
    await page.goto(mockUrl(base, route), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".space-canvas", { timeout: 20000 });
    await page.waitForTimeout(1800); // entrance animation
    await page.screenshot({ path: out });
    console.log("saved", out);
  } else if (cmd === "dock") {
    const [out = "/tmp/ourspaces-dock.png", q] = args;
    await page.goto(mockUrl(base, "#/space/trip"), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".widget-link-card.is-ready", { timeout: 20000 });
    await page.waitForTimeout(1500);
    /* The chip is a sibling of the card inside .widget-group. Don't XPath on
       'widget-group' — the predicate also matches 'widget-group-body'. */
    await page.evaluate(() => {
      const card = document.querySelector(".widget-link-card.is-ready");
      const group = card.closest(".widget-group") ?? card.parentElement.parentElement;
      group.querySelector(".widget-comment-chip").click();
    });
    await page.waitForSelector(".thread-question-strip", { timeout: 15000 });
    await page.waitForTimeout(1400);
    if (q) {
      await page.locator(".thread-question-strip button").nth(Number(q) - 1).click();
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: out });
    console.log("saved", out);
  } else if (cmd === "eval") {
    const mod = await import(pathToFileURL(resolve(args[0])).href);
    await mod.default({ page, ctx, base, mockUrl: (r) => mockUrl(base, r) });
  } else {
    console.error("usage: driver.mjs shot <route> <out.png> | dock <out.png> [qN] | eval <file.mjs>");
    process.exitCode = 2;
  }
} finally {
  if (errors.length) console.error("page errors:", errors.slice(0, 5));
  await browser.close();
}
