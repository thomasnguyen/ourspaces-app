# OurSpaces

> Say "poll for Saturday" and it's on your friends' screens. The AI never cuts in.

A shared board for your group that builds itself when you talk to it. Tap the
orb, say what you need, and the card lands on everyone's screen in under a
second, filled in by **NVIDIA Nemotron on Nebius Token Factory** (NVIDIA-accelerated inference).
Then it's a normal card anyone can vote on, claim or drag.

**Live:** https://ourspaces.io · **Built for:** the Nebius × NVIDIA Global AI
Hackathon · **By** Thomas Nguyen (build) and Holly Tran (design)

<p align="center"><img src=".github/readme/loop-challenge.webp" width="900" alt="One sentence and six linked cards land on the family's board"></p>
<p align="center"><sub>"Set up a push-up challenge for the four of us": six linked cards on every screen 1.6 s after the last word.</sub></p>

## What you can say

| You say | What happens on every screen |
|---|---|
| "Add a poll for Saturday dinner" | A real poll, 610 ms after your last word |
| "Add ramen to the dinner poll" | A real ramen place nearby, found on the web by Tavily, in a room that knows its city |
| "Who's driving to Maya's?" | A wheel with exactly the four people who said yes |
| "Set up a push-up challenge for the four of us" | Six linked cards: who's in, a check-in grid, face-down standings, the deal, a countdown |
| "Put the trade up for a vote, 24 hours" | A yes/no vote that closes for everyone at once |
| "Add a poll for cake flavor" (one exists) | Nothing new. It takes you to the poll that's already there |

<p align="center"><img src=".github/readme/loop-journey-1.webp" width="900" alt="'Plan dinner Saturday' builds a poll and a who's-in card"></p>

## The AI waits its turn

An AI acting for a group fails in one way: it changes something a person is in
the middle of, or undoes something they already chose. We don't ask the model
to be careful. **The model proposes; a lease table in code decides.**

- A **lease** is a person's hand on a card: dragging it, typing in it, holding
  a vote. Every screen shows it as a halo with their name.
- An AI change to a held card **waits** as a ghost ("waiting on Holly") and
  lands when they let go.
- A change that would undo a vote or a claim **asks the people who made it**.
- Whoever asked can take an AI change back with one tap.

<p align="center"><img src=".github/readme/loop-waits.webp" width="900" alt="Two phones: Holly holds the dinner poll while Thomas adds ramen"></p>
<p align="center"><sub>Live, two phones: Holly holds the dinner poll; Thomas's "add ramen" waits on her, fills in from the web, and lands when she lets go.</sub></p>

**Why not just ask the model?** 155 situations, each a board, who is holding
or has chosen what, and one AI write: 107 would change something a person
holds or chose, 48 are harmless.

| Who decides | Harmful writes let through (of 107) | Harmless ones held (of 48) | Time per decision |
|---|---|---|---|
| The gate in code | 0 | 2 | about 1 µs |
| Nemotron Ultra, thinking on | 0 | 3 | 3,063 ms |
| Nemotron Ultra, thinking off | 29 | 8 | 1,075 ms |

The honest loss: Ultra with thinking on let none through on its first, blind
run; the gate's 0 came after fixing the 5 misses this set found. What code buys
is time and cost on every write. On the deployed app, two browsers: **38 of 38**
AI changes to a held card waited. Scenarios, answers and a replay:
[`eval/right-of-way/`](eval/right-of-way/).

## How one ask works

**The model only decides what a model must decide.** It fills every field and
picks the cards for a bigger ask. Code picks the action, places the card,
checks the write, and turns pointers like "the people who are coming" into
real names, so the model can't invent one.

![One ask in five steps: listen, start early, fill, check, sync](.github/readme/15-architecture.jpg)

| Model, on Token Factory | Job | Why |
|---|---|---|
| `nvidia/Nemotron-3_5-Lightning`, thinking off | Plain asks; picks web places by number | First card back in 436 ms |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | Asks that need the group's facts, multi-card asks, questions | Right cards 15 of 15 (Lightning: 6 of 15) |
| `nvidia/nemotron-3-super-120b-a12b`, thinking on | Game setup, the weekly email | Nobody waits on it; not measured |

A call fires while you're still talking and is thrown away if you keep going,
so the answer is usually back before you stop: about 3 calls per ask, **0.03
cents** for a plain one, discarded calls included. Last word to card: **610 ms**
median for a plain ask (12 runs). One miss: 1.85 s, the first ask after a
deploy (Oct 4; 718 ms median over those 13 runs).

**What Nemotron adds**, same asks with every model call switched off:

| Test | Rules only | With Nemotron |
|---|---|---|
| Asks that only make sense if it knows the group (10) | 1 | 9 |
| Plain asks, fields filled correctly (8) | 2 | 7 |
| The push-up challenge, 10 runs | one empty card | six cards, the right four people, 10 of 10 |

Each space has a page of **what this space knows**; every line shows its
source and anyone can cross one out.

![What this space knows: each fact with its source and a cross-out](.github/readme/13-knows.jpg)

## Who uses it

- **Our house** (Thomas, Holly, Hoa, Hoang and Bumi the dog) has had its room
  since Oct 6, with our real names and facts. **Thomas's fantasy league**
  moves its votes in from Sunday, Oct 11. No counts yet; when there are, they go
  in this repo.
- Built for phones first: the first minute fits a phone screen, and it installs
  to a home screen.
- Games Nemotron sets up for the room, with a reveal everyone sees at once.

## Where it falls short

- A bigger model alone didn't help: with the group's facts pasted into the
  prompt, Lightning and Ultra both got 1 of 10. Pointers and worked examples
  took it to 9.
- A brand-new space is weaker: 2 right, 5 partly right, 3 wrong.
- These are small tests we wrote ourselves, not recordings of real groups.

<p align="center"><img src=".github/readme/loop-undo.webp" width="900" alt="An AI change to the dinner poll, taken back with one tap on undo"></p>

## What changed

OurSpaces began Aug 26, 2026 as our Convex All Gas hackathon entry (shared
spaces with live widgets, 319 commits through Sep 21), its AI on OpenAI through
the Convex AI Gateway. Since Oct 3 (185 commits by Oct 10): Nemotron on Token
Factory behind every AI feature, the voice orb and card deck, Right of Way, the
family room, games, Tavily lookups and pilot counting.

## Try it

1. Open [the crew](https://ourspaces.io/#/space/crew) in two tabs. Vote in
   one; the bar moves in the other.
2. Tap the orb and say "add a poll for Friday game night". It lands in both.
3. Grab a card in one tab and ask the orb to change it in the other. The
   change waits until you let go.

## Stack

NVIDIA Nemotron on Nebius Token Factory (every chat model call,
`convex/nebius.ts`) · Convex (database, live sync, auth, scheduling, the lease
table and the Right of Way gate in `convex/rightOfWay.ts`; search embeddings
go through its AI Gateway) · Tavily (real places nearby) · AgentMail (every
space has an inbox) · Firecrawl (links become cards) · Vite + React +
TypeScript · Tailwind v4

## Run it locally

```bash
npm install
npx convex dev        # once, to provision; writes .env.local
npm run dev           # frontend
```

On your Convex deployment : `NEBIUS_API_KEY` for every
Nemotron call (without it the AI returns canned text); `FIRECRAWL_API_KEY`
and `AGENTMAIL_API_KEY`, which `convex/convex.config.ts` requires;
`TAVILY_API_KEY`, optional, for the lookup (also add your deployment's name
to `LANES` in `convex/tavily.ts`).

MIT License.
