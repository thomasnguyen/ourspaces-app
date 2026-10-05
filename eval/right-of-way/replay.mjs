// Right of Way, replayed: the frozen scenarios through the code gate (arm A) or a model asked to judge (arm B).
//
//   node eval/right-of-way/replay.mjs                    arm A: every scenario through the gate, in-process, no network
//   node eval/right-of-way/replay.mjs --rows             … and every scenario's line
//   node eval/right-of-way/replay.mjs --model ultra      arm B from the cached answers (answers/<config>.jsonl)
//   node eval/right-of-way/replay.mjs --model ultra --live [--subset] [--trial 2]   call Token Factory (needs NEBIUS_API_KEY)
//   node eval/right-of-way/replay.mjs --all              every arm, the table, and results.json
//
// configs: super, ultra, ultra-think (Nemotron 3 Super / Ultra, thinking off; Ultra with thinking on).
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { load, loadGate, leaseRules, armA, judge, tally, HERE } from "./lib.mjs";
import { CONFIGS, cached, runLive } from "./judge.mjs";

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const data = load();
const list = data.scenarios;
// the first freeze (R3's 162) is scored as before; each appended batch (r4: the misses, as new situations) apart
const orig = list.filter((s) => !s.batch);
const clear = orig.filter((s) => !s.label.ambiguous);
const amb = orig.filter((s) => s.label.ambiguous);
const batches = data.batches ?? [];
const inBatch = (b) => list.filter((s) => s.batch === b.name);
const median = (a) => { const x = [...a].sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : null; };
const pct = (a, p) => { const x = [...a].sort((p, q) => p - q); return x.length ? x[Math.min(x.length - 1, Math.floor(x.length * p))] : null; };

async function gateArm() {
  const gate = await loadGate();
  const L = leaseRules();
  const answers = {}, us = {};
  for (const s of list) {
    answers[s.id] = armA(gate, s, L);
    // time it: the whole door path per scenario (lease filter, applyEdit, the gate), 2,000 runs, after a warm-up
    for (let i = 0; i < 200; i++) armA(gate, s, L);
    const N = 2000, t0 = performance.now();
    for (let i = 0; i < N; i++) armA(gate, s, L);
    us[s.id] = ((performance.now() - t0) * 1000) / N;
  }
  return { answers, us, rules: L };
}

function line(s, a, extra = "") {
  const r = judge(s.label, a);
  const want = `${s.label.verdict}${s.label.who.length ? `(${s.label.who.join(",")})` : ""}`;
  const got = a ? `${a.verdict}${a.who?.length ? `(${a.who.join(",")})` : ""}` : "—";
  return `${r === "right" ? "ok  " : r.toUpperCase().padEnd(4)} ${s.id.padEnd(22)} want ${want.padEnd(26)} got ${got.padEnd(26)} ${extra}${s.label.ambiguous ? "[amb] " : ""}${s.title}`;
}

const byGroup = (answers) => Object.fromEntries(["gate", "recorded", "adversarial"].map((g) => [g, tally(clear.filter((s) => s.group === g), answers)]));
const byKind = (answers) => Object.fromEntries([...new Set(list.map((s) => s.write.kind))].map((k) => [k, tally(clear.filter((s) => s.write.kind === k), answers)]));
const byLabel = (answers) => Object.fromEntries(["go", "wait", "ask", "never"].map((k) => [k, tally(clear.filter((s) => s.label.verdict === k), answers)]));

function summary(name, answers, extra = {}) {
  const t = tally(clear, answers), ta = tally(amb, answers);
  console.log(`\n${name}: ${t.right}/${t.n} right · harmful allowed ${t.harmful}/${t.harmfulOf} · wrongly held ${t.held}/${t.goOf} (wait ${t.heldWait}, vote ${t.heldAsk}, refused ${t.heldNever}) · other wrong ${t.other} · wrong person ${t.person} · invalid ${t.invalid} | ambiguous ${ta.right}/${ta.n} as labelled`);
  return { clear: t, ambiguous: ta, groups: byGroup(answers), kinds: byKind(answers), labels: byLabel(answers), ...extra };
}

function batchLine(b, answers) {
  const t = tally(inBatch(b).filter((s) => !s.label.ambiguous), answers);
  console.log(`+ batch ${b.name} (${b.count} scenarios appended, labels frozen ${b.frozenAt}): ${t.right}/${t.n} right · harmful allowed ${t.harmful}/${t.harmfulOf} · wrongly held ${t.held}/${t.goOf} (wait ${t.heldWait}, vote ${t.heldAsk}, refused ${t.heldNever}) · other wrong ${t.other} · wrong person ${t.person}`);
  return t;
}

const g = await gateArm();
if (!opt("--model") && !flag("--all")) {
  if (flag("--rows")) for (const s of list) console.log(line(s, g.answers[s.id]));
  else for (const s of list) if (judge(s.label, g.answers[s.id]) !== "right") console.log(line(s, g.answers[s.id]));
  const us = Object.values(g.us);
  summary(`arm A, the gate (${orig.length} scenarios, ${clear.length} clear + ${amb.length} ambiguous, labels frozen ${data.frozenAt})`, g.answers);
  for (const b of batches) batchLine(b, g.answers);
  console.log(`time per decision (the door path in-process, node ${process.version}): median ${median(us).toFixed(2)} µs · p90 ${pct(us, 0.9).toFixed(2)} µs · max ${Math.max(...us).toFixed(2)} µs`);
  process.exit(0);
}

if (opt("--model") && !flag("--all")) {
  const cfg = opt("--model");
  if (!CONFIGS[cfg]) throw new Error(`--model ${Object.keys(CONFIGS).join("|")}`);
  const trial = Number(opt("--trial") ?? 1);
  const ids = flag("--subset") ? new Set(data.subset) : null;
  if (flag("--live")) await runLive(cfg, list.filter((s) => !ids || ids.has(s.id)), trial);
  const rows = cached(cfg, trial);
  const answers = Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.answer]));
  const which = list.filter((s) => rows[s.id]);
  for (const s of which) if (flag("--rows") || judge(s.label, answers[s.id]) !== "right") console.log(line(s, answers[s.id], `${rows[s.id].ms} ms `));
  const t = tally(which.filter((s) => !s.label.ambiguous), answers);
  const ms = which.map((s) => rows[s.id].ms);
  console.log(`\n${CONFIGS[cfg].label}, trial ${trial}: ${which.length} answered of ${list.length} · ${t.right}/${t.n} clear right · harmful allowed ${t.harmful}/${t.harmfulOf} · wrongly held ${t.held}/${t.goOf} · other ${t.other} · person ${t.person} · invalid ${t.invalid} · median ${median(ms)} ms · p90 ${pct(ms, 0.9)} ms`);
  process.exit(0);
}

/* --all: every arm, every trial, results.json */
const out = { frozenAt: data.frozenAt, labelsHash: data.labelsHash, scenarios: orig.length, batches, clear: clear.length, ambiguous: amb.length, ran: new Date().toISOString(), arms: {} };
const us = Object.values(g.us);
out.arms.gate = summary("arm A, the gate", g.answers, { batches: Object.fromEntries(batches.map((b) => [b.name, batchLine(b, g.answers)])), usPerDecision: { median: median(us), p90: pct(us, 0.9), max: Math.max(...us) }, misses: list.filter((s) => judge(s.label, g.answers[s.id]) !== "right").map((s) => ({ id: s.id, ambiguous: Boolean(s.label.ambiguous), want: s.label, got: g.answers[s.id], result: judge(s.label, g.answers[s.id]) })) });
for (const cfg of Object.keys(CONFIGS)) {
  for (const trial of [1, 2]) {
    const rows = cached(cfg, trial);
    if (!Object.keys(rows).length) continue;
    const answers = Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.answer]));
    const which = list.filter((s) => rows[s.id]);
    const ms = which.map((s) => rows[s.id].ms);
    const tin = which.reduce((a, s) => a + (rows[s.id].usage?.in ?? 0), 0), tout = which.reduce((a, s) => a + (rows[s.id].usage?.out ?? 0), 0);
    const dollars = which.reduce((a, s) => a + (rows[s.id].usd ?? 0), 0);
    const key = `${cfg}#${trial}`;
    const full = which.length >= orig.length;
    const name = `${CONFIGS[cfg].label}, trial ${trial} (${which.length} scenarios${full ? "" : ", the variance subset"})`;
    const sub = which.filter((s) => !s.label.ambiguous);
    const t = tally(sub, answers);
    console.log(`\n${name}: ${t.right}/${t.n} right · harmful allowed ${t.harmful}/${t.harmfulOf} · wrongly held ${t.held}/${t.goOf} (wait ${t.heldWait}, vote ${t.heldAsk}, refused ${t.heldNever}) · other ${t.other} · person ${t.person} · invalid ${t.invalid} · median ${median(ms)} ms, p90 ${pct(ms, 0.9)} · $${(dollars / which.length).toFixed(6)}/decision`);
    out.arms[key] = {
      config: cfg, trial, model: CONFIGS[cfg].model, thinking: CONFIGS[cfg].thinking, n: which.length,
      clear: t, ambiguous: tally(which.filter((s) => s.label.ambiguous), answers),
      groups: full ? byGroup(answers) : undefined, kinds: full ? byKind(answers) : undefined, labels: full ? byLabel(answers) : undefined,
      ms: { median: median(ms), p90: pct(ms, 0.9), max: Math.max(...ms) }, msAnswered: (() => { const m = which.filter((s) => rows[s.id].answer).map((s) => rows[s.id].ms); return { median: median(m), p90: pct(m, 0.9), max: Math.max(...m) }; })(), failed: which.filter((s) => !rows[s.id].answer).map((s) => ({ id: s.id, why: rows[s.id].error ?? `finish ${rows[s.id].finish}`, ms: rows[s.id].ms })), tokens: { in: tin, out: tout }, usd: dollars, usdPerDecision: dollars / which.length,
      misses: which.filter((s) => judge(s.label, answers[s.id]) !== "right").map((s) => ({ id: s.id, ambiguous: Boolean(s.label.ambiguous), want: s.label.verdict, wantWho: s.label.who, got: answers[s.id] ?? null, result: judge(s.label, answers[s.id]) })),
    };
  }
  // run-to-run on the subset: trial 1 vs trial 2, same scenarios
  const a = cached(cfg, 1), b = cached(cfg, 2);
  const both = data.subset.filter((id) => a[id] && b[id]);
  if (both.length) {
    const valid = both.filter((id) => a[id].answer && b[id].answer);
    const flips = valid.filter((id) => a[id].answer.verdict !== b[id].answer.verdict);
    const invalid = both.filter((id) => !a[id].answer || !b[id].answer);
    const sub = list.filter((s) => both.includes(s.id));
    const t1 = tally(sub, Object.fromEntries(both.map((id) => [id, a[id].answer]))), t2 = tally(sub, Object.fromEntries(both.map((id) => [id, b[id].answer])));
    out.arms[`${cfg}#variance`] = { n: both.length, validPairs: valid.length, verdictFlips: flips.length, flipped: flips, invalidInATrial: invalid, trial1: { right: t1.right, harmful: t1.harmful, held: t1.held }, trial2: { right: t2.right, harmful: t2.harmful, held: t2.held } };
    console.log(`${CONFIGS[cfg].label} variance on ${both.length}: ${flips.length} of ${valid.length} valid pairs changed verdict (${flips.join(", ") || "none"}), ${invalid.length} invalid in a trial (${invalid.join(", ") || "none"}); right ${t1.right} → ${t2.right}, harmful ${t1.harmful} → ${t2.harmful}, wrongly held ${t1.held} → ${t2.held}`);
  }
}
fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify(out, null, 1));
console.log("\nwrote eval/right-of-way/results.json");
