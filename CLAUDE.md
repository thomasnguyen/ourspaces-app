**Read `AGENTS.md` first** — the project rules (no tests, reply style, design
constraints) and the current focus: the Nebius × NVIDIA hackathon, due Fri Oct
30 2026, 10:00 PT.

**Then find your doc in `nebius/DIRECTORY.md`** before opening anything else
in `nebius/` — one line per doc, grouped by purpose, with the five to read
first (`overnight-log.md`, `path-to-win.md`, `loop/gates.md`, `queue.md`,
`eval/r3-proof.md`). The folder has 40-odd files and most are evidence.

**Working a task:** `nebius/loop/standing.md` is binding; the playbooks are in
`.claude/skills/hack-mode/playbooks/`; reach any feature state with
`node .claude/skills/run-ourspaces/drive.mjs go <feature>:<state>` from the
feature map in `.claude/skills/run-ourspaces/features/`; read
`.claude/skills/eye-candy/SKILL.md` before any visible change.

**Prod is frozen** (`nebius/.prod-freeze`): ship to the dev lane only with
`npm run deploy:dev`. Never `npm run deploy` or `npm run deploy:convex`.

This file and `AGENTS.md` are gitignored (they name local-only folders), so a
clone won't have them; `README.md` is what judges read.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
