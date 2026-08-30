# vibeapps listing — description draft

<!-- Paste into the vibeapps description field at submit time (Mon Sep 21).
     Before pasting, fill every [bracketed] placeholder with real numbers and
     only claim what is actually live — if a feature slips, cut its line
     rather than soften it. If the vibeapps field strips markdown, the ##/###
     headers still read as standalone headline lines. -->

**group chats forget. spaces remember.**

Every friend group runs on a chat that loses everything: the poll gets buried, "what time again?" gets asked three times, the photos scroll away. OurSpaces turns the group chat into a live shared canvas — countdowns, ballots, sign-up sheets, photo piles — that everyone sees update cursor-to-cursor, and that remembers.

## three rooms, three real problems

### the crew — the plan that dies in the scroll

Countdown, cake ballot, RSVP postmarks, potluck signatures — the whole birthday moves live on one wall instead of getting re-asked in chat. We ran [real event] through it for real last week: the claims and photos in the demo are true.

### us two — one of you is always asleep

Long distance across timezones. Color a shared Starry Night paint-by-number together — or leave regions filled overnight so they wake up to a more finished sky. Two cursors, one canvas, an ocean apart.

### the commons — the links nobody ever discusses

A public space for this hackathon's builders: drop your project link and it becomes a reading card with its own discussion circle, or sign the guestbook by email. [n] builders, [n] cards so far.

## the space you can email

Every space has its own email address. The one person who'll never install the app — grandma, the busy friend — just emails it: "I'll bring drinks" claims a potluck slot on the wall, live.

## the questions each widget kills

- who's in? → a postal RSVP card that postmarks each yes
- who's bringing what? → a sign-up sheet that slams an ALL SET stamp when the last slot claims
- when works for everyone? → the availability grid
- who owes who? → a thermal-receipt expense split
- wait, what did we decide? → promote any chat message into a sticky note that stays put
- what did I miss? → catch me up, a structured recap of decisions and what you're on the hook for

## the stack doing real work

- **Convex** is the entire backend and the frontend host: realtime queries drive all 22 widget types, presence powers live cursors, crons sweep stale rows, file storage holds the memory wall, HTTP actions catch inbound email.
- **AgentMail** provisions a real inbox per space; its webhook turns replies into canvas mutations.
- **Firecrawl** turns any pasted URL into a structured reading card (Hacker News links resolve to the article plus live points and the thread).
- **OpenAI gpt-4o-mini** works as a structured extractor/decider, never a chatbot: it routes inbound email to the right action and seeds two conversation starters on every saved article.

No signup. Open the live app, claim a name, drag something — then open it in a second tab and watch the cursors. Or skip all that and just email the space.

Built in [26] days, [200+] commits, 100% vibe-coded — the human never edited a line.
