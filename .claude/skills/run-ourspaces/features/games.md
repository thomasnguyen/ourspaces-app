---
route: #/space/crew
ready: game-door
testids: game-card game-lobby game-round game-see game-reveal game-awards game-sticker game-join game-begin game-pick game-next game-rematch game-to-board game-start game-invite game-invite-join game-invite-hide game-sheet game-sheet-close game-sheet-tab game-door rail-game award-dots award-row
states:
  idle: ?as=Rio
  start: ?as=Maya&game=start | wait game-lobby | sleep 5200
  invited: ?as=Rio&game=invited | wait game-invite | sleep 900
  ticket: ?as=Rio&game=late | wait game-invite | click game-invite-hide | click dock-recap | wait your-turn | sleep 700
  rail: ?as=Rio&game=invited&gameRoom=crew #/space/house | wait rail-game | sleep 400
  lobby: ?as=Maya&game=lobby | wait game-lobby | sleep 1300
  round: ?as=Maya&game=round | wait game-round | sleep 1300
  answered: ?as=Maya&game=answered | wait game-round | sleep 1300
  reveal: ?as=Maya&game=reveal | wait game-reveal | sleep 2600
  reveal-b: ?as=Maya&game=reveal&reveal=b | wait game-reveal | sleep 2600
  reveal-c: ?as=Maya&game=reveal&reveal=c | wait game-reveal | sleep 2600
  awards: ?as=Maya&game=awards | wait game-awards | sleep 1300
  late: ?as=Rio&game=late | wait game-invite | sleep 500
  knows: ?as=Maya&game=awards #/space/crew/knows | wait room-knows | sleep 900
  board: ?as=Rio&board=open | click game-door | sleep 1400
  locked: ?as=Rio | click game-door | sleep 1400
  house: ?as=gigi&game=reveal&round=3 #/space/house | wait game-reveal | sleep 2800
  house-awards: ?as=gigi&game=awards #/space/house | wait game-awards | sleep 1300
  couple: ?game=round&round=2 #/space/couple | wait game-round | sleep 1300
  couple-match: ?game=reveal&round=1 #/space/couple | wait game-reveal | sleep 2800
  couple-awards: ?game=awards #/space/couple | wait game-awards | sleep 1300
  play: ?as=Maya&game=round&live=1 | wait game-round | sleep 600
  play-b: ?as=Maya&game=round&live=1&reveal=b | wait game-round | sleep 600
  play-c: ?as=Maya&game=round&live=1&reveal=c | wait game-round | sleep 600
take:
  reveal: play real 30fps 170f focus css:[data-widget-id="game-card"] | 15 click css:[data-testid="game-pick"][data-name="Sam"]
  reveal-b: play-b real 30fps 170f focus css:[data-widget-id="game-card"] | 15 click css:[data-testid="game-pick"][data-name="Sam"]
  reveal-c: play-c real 30fps 170f focus css:[data-widget-id="game-card"] | 15 click css:[data-testid="game-pick"][data-name="Sam"]
---
# Games (the frame)
