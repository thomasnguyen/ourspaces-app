---
route: #/space/crew
ready: demo-banner
testids: demo-banner demo-make-space demo-welcome-notice demo-notice-explore claim-enter own-cursor orb-hint orb-hint-starter-0 orb-hint-starter-1 orb-hint-starter-2 orb-hint-dismiss dock-voice-orb voice-stage voice-landed admin-door-crew
states:
  cold: #/space/crew
  notice: ?notice=1 #/space/crew | wait demo-welcome-notice
  door: ?door=1 #/space/crew | wait claim-enter
  nodoor: ?door=0 #/space/crew | wait dock-voice-orb
  cursor: ?door=0&cursor=1 #/space/crew | wait own-cursor
  hint: ?door=0&hint=1 #/space/crew | wait orb-hint
  starter: ?door=0&hint=1 #/space/crew | click orb-hint-starter-0 | wait voice-stage | sleep 1500
  landed: ?door=0&hint=1&voice=start a push-up challenge for us&voicePace=talk #/space/crew | wait voice-landed
take:
---
# The first minute (lane)

**For a user:** a stranger lands on the room cold. The demo banner and the
welcome notice say what this is; the door asks for a name and a look; then
the own cursor and the orb hint show where to start; a starter ask lands a
first card, and the card asks for a vote. Lane only (`drive up --lane`).

**Where it lives:** `src/components/DemoBanner.tsx` (banner, notice,
`demo-make-space`), `ClaimCard.tsx` (the door, `claim-enter`) and
`GateCursor.tsx`, `src/pages/LiveSpace.tsx` (the wiring), `ActionDock.tsx`
(`dock-voice-orb`), `VoiceStage.tsx` (`voice-stage`), `VoiceBuildLayer.tsx`
(`voice-landed`). `OwnCursor.tsx` and `OrbHint.tsx` are FM1b, not in src yet.

**Take recipe:** fresh desktop (1440) and phone (390) contexts. Walk
`cold` → `notice` → `door` → `nodoor` → `hint` → `starter` → `landed`, then
the vote on the card. Add `?timing=0` for clean frames. `cursor` is 1440 only.
Each width is a fresh profile, so no persona or dismissed notice carries over.
