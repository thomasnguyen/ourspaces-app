---
route: #/space/our-house
ready: dock-voice-orb
testids: plan-read web-pic dev-context-pic plan-read-step plan-read-fee plan-read-struck plan-read-source rsvp-bring rsvp-bring-pending dev-context-drawer dev-context-lookup dev-context-read lookup-tick
states:
  read: ?enter=1&timing=0&as=Hoa&paste=https://www.instagram.com/reel/Dd6ss_itvZA | wait plan-read | wait css:[data-testid="plan-read"][data-step="done"] | sleep 900
  reading: ?enter=1&timing=0&as=Hoa&paste=https://www.instagram.com/reel/Dd6ss_itvZA | wait plan-read-step
  receipt: ?enter=1&timing=0&as=Hoa&readReceipt=1&paste=https://www.instagram.com/reel/Dd6ss_itvZA | wait dev-context-read | sleep 500
---
# A pasted link, read (Tavily: the post vs the page)

**For a user:** in our house (the dev lane), paste a link on the board (⌘V
with no field focused), say an Instagram reel of a pumpkin patch. Two cards
land at once where you're looking (one column: the plan over its who's in;
off-screen, the board glides to them): `a link, pasted · instagram.com ·
reading instagram.com` with a ticking numeral (`lookup-tick`), and `who's
in?` with you in and `waiting on the page`. A second or three later the plan
fills: `Spina Farms`, `Morgan Hill`, `PARKING $30 cash · sat`, a small struck
`the post said $20`, and `↗ the farm's site`; the who's in turns `who's in ·
sat` and picks up `bring $30 cash` (lime on ink). The struck line shows only
when both pages parsed the same fee for the same day and the same venue and
season, and differ; otherwise the card shows the site's figure alone (or the
post's, labelled `the post`). Nothing found: `a link, read · nothing to plan
from this page`. A 44 px picture leads the venue (`web-pic`): 🔗 while the
post is read, the kind of place once it is named (🎃, from code's table over
the post and the site's title), and the first photo on the venue's own page
fading in when the read lands (`data-pic="img"`). The post's own image is
never used. Tap `the farm's site`: the receipt drawer.

**Under it:** `convex/tavily.ts` `readLink` (seated mutation, writes both
cards, a `lookup` ledger row) → `readRun`: Tavily extract of the link
(query-focused) → code names the venue (`venueIn`) and town (`townIn`) →
Tavily search `<venue> <town>` → code keeps the venue's own domain
(`ownSite`: never social or review sites, every word of the name in the
domain) → Tavily extract of it → code parses `<item> <days> $N` pairs
(`feesIn`, `feeOn` for Saturday) → `readLand` writes both cards. No model
writes a name or a number. One 9 s cap. Off without `TAVILY_API_KEY` or off
the lanes (`lookupOn`): the paste makes Firecrawl's link card instead
(`useLiveHandlers` `pasteLink`).

**Drawer:** `plan-read-source` (or `?readReceipt=1`) → `dev-context-drawer`
with `dev-context-lookup`: the line, the whole chain's ms, credits, each read
(`dev-context-read`: role, ms, credits, link, the sentence it parsed), the
search between them with what it kept and skipped, why, the picture
(`dev-context-pic`), what landed.

**Drive:** every state writes two real cards and spends Tavily credits
(repeats come from Tavily's cache, ~0.3 s). Sweep by id: `npx convex run
tavily:sweepRead '{"ids":[…]}'` on the dev lane. `__pasteLink(url)` in an
eval is the same path as a paste.

**Take (desktop + phone, live):** `node .context/house/take.mjs paste --deskY 0
--at <x,y>`: Hoa on a 1920×1080 desktop pastes the reel (a real paste event),
Thomas's 390 phone already looks at the canvas spot `--at` (from a first
pass, it prints the cards' canvas boxes); `desktop.mp4` + `phone.mp4` at
24 fps, `marks.txt` on one clock, `strip.jpg`; the two cards are swept by id.

**Desktop take with the picture (TV2c):** `node .context/tv2c/take.mjs paste`
→ `nebius/video/takes/post-vs-page-img/` (desktop only, marks + focus box).

**Code:** `convex/tavily.ts` (the post vs the page) · `convex/widgetData.ts`
(countdown `read`, rsvp `bring` / `bringPending`) · plan card + who's-in line
`src/widgets/linkRead.tsx` + `link-read.css` (dispatched from
`CountdownWidget` in `core.tsx`, `RsvpWidget` in `extras.tsx`) · receipt
`src/components/LinkReadReceipt.tsx` · paste `src/live/useLiveHandlers.ts`.
