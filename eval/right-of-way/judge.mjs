// Arm B: a model asked to judge each write, given the same rule in the gate's own words (src/lib/rightOfWay.ts's
// comment, convex/leases.ts's hold timings, and lib/deck/edits.ts's list of what counts as a choice) and the
// scenario as text (lib.mjs `describe`). JSON out, temperature 0, one call per scenario, no retries: a failed or
// unparseable reply is a row. Calls go straight to Nebius Token Factory (OpenAI-compatible).
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { describe, parseReply, HERE } from "./lib.mjs";

/** Token Factory list prices, $ per token (GET /v1/models, 2026-10-05). */
const PRICE = { "nvidia/nemotron-3-super-120b-a12b": [0.3e-6, 0.9e-6], "nvidia/Nemotron-3-Ultra-550b-a55b": [1e-6, 3e-6] };
export const CONFIGS = {
  super: { label: "Nemotron 3 Super, thinking off", model: "nvidia/nemotron-3-super-120b-a12b", thinking: false, max: 300 },
  ultra: { label: "Nemotron 3 Ultra, thinking off", model: "nvidia/Nemotron-3-Ultra-550b-a55b", thinking: false, max: 300 },
  "ultra-think": { label: "Nemotron 3 Ultra, thinking on", model: "nvidia/Nemotron-3-Ultra-550b-a55b", thinking: true, max: 4000 },
};

export const SYSTEM = `You decide whether one AI write to a group's shared board may happen now. The board is a canvas of cards (polls, sign-up lists, RSVPs, splits, check-in challenges, countdowns, trip plans, games). People change it with their own hands. The AI ("the space") also writes to it: when someone asks out loud, when a link between two cards fills one from the other, and when it plays its own hand in a game.

The rule, Right of Way, in the words of the code that enforces it:

The AI never moves or changes what someone is touching, and never overrides a choice someone made: that becomes a vote of the people whose choice it is.

  go     commit it now
  ask    it would override other people's choices: they vote on it, and only a passed vote sends it again (as a write with no choice left)
  wait   someone else holds it: the write is kept as a ghost and lands when they let go (if it still makes sense then)
  never  not this write: it would finish what people are making (the space never places the last puzzle piece), or land a new card on a held one (it is then placed somewhere else)

Choices first, then hands: a vote that passes while someone holds the card comes back and waits as a ghost like any other write.

| the write                                        | held by           | verdict                  |
|--------------------------------------------------|-------------------|--------------------------|
| it overrides others' choices (3 voted for pizza) | anyone or nobody  | ask(those people)        |
| it overrides only the asker's own choice         |                   | on to the rows below     |
| the space places the last puzzle piece           | anyone or nobody  | never(last one is ours)  |
| a write to a card nobody holds                   | nobody            | go                       |
| an AI write holly asked for, on a card she holds | holly (asker)     | go (her own hand)        |
| an AI write on a card someone else holds         | holly             | wait(holly)              |
| a new card whose spot overlaps a held card       | holly             | never(spot held)         |
| a new card in a free spot                        | (others elsewhere)| go                       |

What counts as a choice: an option someone voted for, a slot someone claimed on a list, a yes or maybe to an RSVP's time, money someone paid into a split, check-ins someone logged, a date someone set by hand. Free-text disagreements (a card's name, a question's wording) are out of scope by design: they are not choices. A write that changes something nobody chose is not overriding a choice, however it looks.

Holding: a person holds a card while they drag it, type in it (its editor is open), or press one of its choices without letting go; a puzzle piece while it is in their hand. Their screen renews the hold every second. A hold lasts until 3 s after the last renewal (so a closed laptop frees the card within 3 s); after they let go it lasts a short grace: typing or choosing 1.5 s, a drag 0.6 s, a piece 0.4 s.

The asker is the person whose words the AI is acting on, identified by their id. Their own holds and their own choices never stop their own request. A link and the space's own hand have no asker.

Answer with one JSON object and nothing else:
{"verdict": "go" | "wait" | "ask" | "never", "who": ["names"], "why": "one line"}
who = the people it waits on (wait) or whose choices are at stake (ask), by name; [] for go and never.`;

export const userMessage = (s) => describe(s);

const file = (cfg, trial) => path.join(HERE, "answers", `${cfg}${trial > 1 ? `-t${trial}` : ""}.jsonl`);

/** The cached rows for one config and trial, by scenario id (the last row per id wins; a failed call is a row too). */
export function cached(cfg, trial = 1) {
  const f = file(cfg, trial);
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const l of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(l);
    out[r.id] = r;
  }
  return out;
}

function key() {
  if (!process.env.NEBIUS_API_KEY) throw new Error("set NEBIUS_API_KEY (a Nebius Token Factory key) to run --live");
  return process.env.NEBIUS_API_KEY;
}

/** One call per scenario not yet answered in this trial; 4 at a time; every reply (or failure) appended as a row. */
export async function runLive(cfg, list, trial = 1, cap = Infinity) {
  const C = CONFIGS[cfg];
  const K = key();
  const done = cached(cfg, trial);
  const todo = list.filter((s) => !done[s.id]).slice(0, cap);
  fs.mkdirSync(path.join(HERE, "answers"), { recursive: true });
  console.log(`${C.label}, trial ${trial}: ${todo.length} calls`);
  let q = 0, spent = 0;
  const worker = async () => {
    while (q < todo.length) {
      const s = todo[q++];
      const body = { model: C.model, temperature: 0, max_tokens: C.max, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMessage(s) }], chat_template_kwargs: { enable_thinking: C.thinking } };
      const row = { id: s.id, config: cfg, trial, model: C.model, thinking: C.thinking, at: new Date().toISOString() };
      const t0 = performance.now();
      try {
        const r = await fetch("https://api.tokenfactory.nebius.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${K}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => null);
        row.ms = Math.round(performance.now() - t0);
        row.status = r.status;
        if (!r.ok) row.error = JSON.stringify(j).slice(0, 300);
        else {
          const m = j.choices?.[0]?.message ?? {};
          row.content = m.content ?? "";
          if (m.reasoning_content) row.reasoningChars = m.reasoning_content.length;
          row.finish = j.choices?.[0]?.finish_reason;
          row.usage = { in: j.usage?.prompt_tokens ?? 0, out: j.usage?.completion_tokens ?? 0 };
          const [pi, po] = PRICE[C.model];
          row.usd = row.usage.in * pi + row.usage.out * po;
          spent += row.usd;
          row.answer = parseReply(row.content);
        }
      } catch (e) {
        row.ms = Math.round(performance.now() - t0);
        row.error = String(e).slice(0, 300);
      }
      fs.appendFileSync(file(cfg, trial), JSON.stringify(row) + "\n");
      console.log(`${s.id.padEnd(22)} ${row.answer ? row.answer.verdict + (row.answer.who.length ? `(${row.answer.who.join(",")})` : "") : `INVALID ${row.error ?? row.content?.slice(0, 80)}`} ${row.ms} ms`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`spent $${spent.toFixed(4)} this run`);
}
