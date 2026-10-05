---
route: #/space/crew
ready: scoreboard
testids: game-pick game-reveal game-sticker game-awards
states:
  round: ?as=Maya&game=round&round=2 | wait game-round | sleep 1300
  reveal: ?as=Maya&game=reveal&round=2 | wait game-reveal | sleep 2800
  split: ?as=Maya&game=reveal&round=5 | wait game-reveal | sleep 2800
  awards: ?as=Maya&game=awards | wait game-awards | sleep 1300
  house: ?as=gigi&game=round&round=1 #/space/house | wait game-round | sleep 1300
  two: ?game=round&round=4 #/space/couple | wait game-round | sleep 1300
  two-match: ?game=reveal&round=1 #/space/couple | wait game-reveal | sleep 2800
take:
---
# most likely to… (the first game on the frame)

**For a user:** five prompts about this group, each one true to something
the room already knows: "most likely to forget the balloons", "…pick sam's
place again", "…cover the bill and never mention it". Tap a person. When
everyone's in (or 14 s is up) the votes land on faces for everyone at once
and the most-picked wears the round's **award sticker** ("balloon duty 🎈").
Two people can share one; a wider tie gives none ("nobody agrees"). You get
a point when your pick was the room's pick. After five: the awards wall.
The stickers then ride on people's faces in the header, on the scoreboard
and under their portraits on "what this space knows".

**A room of two** plays "more likely to…": you each pick, a match is the
win ("you both said so"), a split gives no sticker and prints who said who.

**Where the prompts come from:** `src/data/games.ts`, by hand, only from
the mock facts on each room's knows page; every prompt carries the `fact`
key it was written from and prints it small under the prompt ("↳ jules
covered the most last time"). Crew and house have two sets (a rematch deals
the other), the couple one. Never about bodies, money owed or who's liked.
`lean` in that file is only how the simulated players tend to vote.

**Live version:** code picks 5 facts from `roomBrief` `knows` (habits,
claims, places, told, away), the model words each as a prompt + a 2–3 word
sticker title, code checks the names against the member list. Same engine.

**Drive / code:** see `games.md` (same card, same test ids).
