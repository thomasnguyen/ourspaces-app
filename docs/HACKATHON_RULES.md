# Convex "All Gas" Hackathon — official rules (reference)

Source: https://www.convex.dev/hackathons/all-gas (fetched 2026-08-26). This is
a condensed transcript of the official page, not our interpretation. Strategy
lives in `HACKATHON_STRATEGY.md`.

## Timeline

| Milestone            | Date                          |
| -------------------- | ----------------------------- |
| Kickoff              | Aug 25, 2026                  |
| **Eligibility cutoff** | **Aug 25, 2026, 12:00 PM PT** — only apps started on/after this qualify |
| **Submission deadline** | **Sep 22, 2026, 12:00 PM PT** |
| Winners announced    | Sep 25, 2026                  |

## Eligibility

- 18+.
- Not an employee (or immediate family) of Convex, sponsors, or cohosts.
- Not a resident of a restricted jurisdiction (Quebec, Russia, Crimea, Cuba,
  Iran, North Korea, Syria, or other OFAC-designated).
- **"Only new apps started on or after August 25 at 12 PM PT will qualify for
  submission."** No resubmission of existing projects.
- Team size: not specified on the page.
- You may build and submit as many apps as you want.

## Required stack

- **Required:** Convex as the backend.
- **Strongly encouraged (judged as "sponsor stack"):** OpenAI Codex, Firecrawl,
  AgentMail — performing *core* functions, not garnish.
- Acceptable coding agents: Codex, Claude, Cursor, GitHub Copilot.
- The **hackathon skill** and **Convex plugin** must be integrated.
  - Skill: https://github.com/get-convex/convex-hackathon-skill
  - It maintains a public build log at `hackathon.md` (project root): metadata
    + timestamped changelog with git SHAs. Run `/hackathon` with your agent as
    you build to keep it current. It backfills from git history.
- No OpenAI or Convex credits are provided. Firecrawl gives $20k credits on
  registration.

## Submission requirements

1. **Live public URL** on `convex.site` or `chatgpt.site` — no localhost, no
   invites needed for judges.
2. **Public GitHub repo.**
3. **Video under 3 minutes** demonstrating the live product.
4. **Social post** on X or LinkedIn tagging @convex, @OpenAI, @firecrawl,
   @agentmail.
5. Submit repo + URL + video at
   https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit
   before Sep 22, 12:00 PM PT.

Setup flow from the page: register on Luma
(https://luma.com/convex-allgas-hackathon) → paste the hackathon setup prompt
into your agent (installs Convex integration + hackathon skill, starts the
build log) → build → deploy → post → submit.

## Judging criteria (as listed)

1. **Everyday apps, not developer tools** — real utility for real people.
   "Copycats and developer-only tools score low."
2. **Creativity and usefulness** — something a real person would use today.
3. **Convex depth** — genuine queries, mutations, live updates, auth,
   components.
4. **Sponsor stack** — OpenAI, Firecrawl, AgentMail doing core work.
5. **Live URL** — accessible without invites.
6. **Social proof** — engagement on the post.
7. **Video demo** — under 3 min, shows the actual product working.

## Judges (15)

- **Convex:** Jamie Turner (CEO), Wayne Sutton, Shawn Erquhart, Michael Cann,
  Nicolas Ettlin
- **OpenAI:** Moustafa Elhadary, Ansh Gupta, Apoorv Jha, Cole Lin
- **Partners:** Max Kelly (Firecrawl), Haakam Aujla (AgentMail CEO), Binoy
  Perera, Harry Du, Simon Lefort (ClarityCare AI), Nicole Grossmann (Vigil Labs)

## Prizes

| Place | Cash    | Codex credits | Firecrawl        | AgentMail         |
| ----- | ------- | ------------- | ---------------- | ----------------- |
| 1st   | $10,000 | $5,000        | 3 mo Growth      | 6 mo Startup      |
| 2nd   | $5,000  | $2,500        | 3 mo Growth      | 3 mo Startup      |
| 3rd   | $1,500  | $1,000        | 3 mo Growth      | 3 mo Startup      |

All places include swag. All participants: $20,000 Firecrawl credits.

## Useful links

- Using Codex with Convex: https://docs.convex.dev/ai/using-codex
- Agent plugins: https://docs.convex.dev/ai/overview#plugins
- Firecrawl component: https://www.convex.dev/components/firecrawl/firecrawl-convex
- AgentMail component: https://www.convex.dev/components/agentmail/convex
- Convex Auth v2 (alpha): https://auth-v2.previews.convex.dev/getting-started
- Convex AI Gateway: https://docs.convex.dev/ai-gateway/overview
- Discord: https://convex.dev/community
