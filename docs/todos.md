# Status

Session handoff file. Update at the end of every session (see `AGENTS.md`).
Backward-looking history lives in `hackathon.md`.

## Now working

- Full app deployed live: https://necessary-cobra-892.convex.site (Convex
  static hosting + prod backend, all spaces seeded).
- Canvas with every widget type, drag/resize/frames, per-widget threads,
  presence cursors + gestures, polls/votes, recap, invite links.
- AgentMail per-space inboxes + Firecrawl scrape action landed (`16fa04a`) —
  backend wired (`convex/agentmail.ts`, `convex/firecrawl.ts`, webhook at
  `/api/agentmail/webhook`).

## Broken / known issues

- (none recorded yet)

## Next up

- Surface AgentMail + Firecrawl in the UI (email → canvas mutations, link →
  structured widget).
- OpenAI structured extractor/decider (sponsor requirement — no chatbot UI).
- Update README "Convex depth" list with new components.
- `hackathon.md` log is stale past `a8dde65` — run `/hackathon`.

## Decisions

- 2026-08-28: Hackathon mode locked in — no tests ever, B/C-grade code fine,
  keep TypeScript decent, 100% vibe-coded by the human.
- 2026-08-28: Replies to the human: ≤3 bullets, no paragraphs; bold
  **(question)** tags for anything needing input.
- 2026-08-28: Agents may split `App.tsx` / `index.css` when sections get hairy;
  keep `docs/code-map.md` updated.
