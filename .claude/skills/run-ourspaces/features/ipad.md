---
route: #/space/our-house
ready: dock-voice-orb
testids: dock-voice-orb voice-stage
states:
  room: ?enter=1&standalone=1&timing=0 #/space/our-house | sleep 1200
  orb: ?enter=1&standalone=1&timing=0&voice=who's home for dinner thursday&voicePace=talk #/space/our-house | click dock-voice-orb | wait voice-stage | sleep 900
take:
---
# The kitchen iPad (lane)

**For a user:** the house room on the counter, added to the Home Screen. Tap
the icon and it opens straight into the room (no door, no browser chrome),
the screen stays on, and after the iPad sleeps the board reconnects by itself.

**Where it lives:** `public/manifest.webmanifest` (name, icons, `start_url`
= `/?enter=1#/space/our-house`), `index.html` (manifest link, Apple meta
tags, `viewport-fit=cover`), `public/icons/` (192, 512, 512 maskable, 1024,
apple-touch 180), `src/lib/standalone.ts` (wake lock + reconnect / reload on
wake; `?standalone=1` runs it in a tab, `?wake=0` skips the lock),
`src/index.css` `@media (display-mode: standalone)` (safe-area insets for the
banner and everything pinned to the bottom).

**Install on the iPad:** open `https://dev--ourspaces-app.netlify.app/?enter=1#/space/our-house`
in Safari → Share → Add to Home Screen. Settings → Display → Auto-Lock:
Never if the wake lock is refused (iPadOS before 18.4).

**Take recipe:** `go ipad:room --w 1024` (landscape) and `--w 820`
(portrait); `ipad:orb` for the listening state. Headless Chrome has zero
safe-area insets, so the inset rules only show on a real iPad.
