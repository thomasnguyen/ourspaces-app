---
route: #/space/crew
ready: game-door
testids: hot-seat-start hot-seat-why hot-seat-short hot-seat-others hot-seat-pick hot-seat-option hot-seat-slider hot-seat-value hot-seat-lock hot-seat-watch hot-seat-answer hot-seat-fact hot-seat-reacts hot-seat-react hot-seat-reaction hot-seat-podium hot-seat-rank hot-seat-to-keepsake hot-seat-keepsake keepsake-row
states:
  lobby: ?as=Sam&game=lobby&play=seat | wait game-lobby | sleep 1300
  round: ?as=Sam&game=round&play=seat | wait game-round | sleep 1300
  reveal: ?as=Sam&game=reveal&play=seat | wait game-reveal | sleep 3200
  slider: ?as=Sam&game=round&play=seat&round=5 | wait game-round | sleep 1300
  slider-reveal: ?as=Sam&game=reveal&play=seat&round=5 | wait game-reveal | sleep 3200
  done: ?as=Sam&game=awards&play=seat | wait game-awards | sleep 1500
  keepsake: ?as=Sam&game=keepsake&play=seat | wait hot-seat-keepsake | sleep 1200
  seat-invited: ?as=Maya&game=invited&play=seat | wait game-invite | sleep 900
  seat-lobby: ?as=Maya&game=lobby&play=seat | wait game-lobby | sleep 1300
  seat-round: ?as=Maya&game=round&play=seat&round=2 | wait game-round | sleep 1300
  seat-reveal: ?as=Maya&game=reveal&play=seat&round=2 | wait hot-seat-reacts | sleep 3000
  seat-reacted: ?as=Maya&game=reveal&play=seat&round=2&react=who-told-you | wait hot-seat-reaction | sleep 3200
  seat-done: ?as=Maya&game=awards&play=seat | wait game-awards | sleep 1500
  other: ?as=Maya&game=lobby&play=seat&about=Rio | wait hot-seat-short | sleep 1300
  house: ?as=gigi&game=lobby&play=seat #/space/house | wait hot-seat-short | sleep 1300
  house-round: ?as=gigi&game=round&play=seat&round=3 #/space/house | wait game-round | sleep 1300
  house-reveal: ?as=gigi&game=reveal&play=seat&round=3 #/space/house | wait game-reveal | sleep 3200
  house-done: ?as=gigi&game=awards&play=seat #/space/house | wait game-awards | sleep 1500
  two: ?game=round&play=seat #/space/couple | wait game-round | sleep 1300
  two-slider: ?game=round&play=seat&round=2 #/space/couple | wait game-round | sleep 1300
  two-reveal: ?game=reveal&play=seat&round=1 #/space/couple | wait game-reveal | sleep 3200
  two-done: ?game=awards&play=seat #/space/couple | wait game-awards | sleep 1500
  play: ?as=Sam&game=round&play=seat&live=1 | wait game-round | sleep 600
  play-seat: ?as=Maya&game=round&play=seat&live=1 | wait game-round | sleep 600
  idle-sam: ?as=Sam
take:
  reveal: play real 30fps 250f focus css:[data-widget-id="game-card"] | 15 click css:[data-testid="hot-seat-option"][data-option="matcha"]
  reveal-phone: play real 30fps 250f | 15 click css:[data-testid="hot-seat-option"][data-option="matcha"]
  seat: play-seat real 30fps 330f focus css:[data-widget-id="game-card"] | 280 click css:[data-testid="hot-seat-react"][data-kind="who-told-you"]
  seat-phone: play-seat real 30fps 330f | 280 click css:[data-testid="hot-seat-react"][data-kind="who-told-you"]
---
# The hot seat ("how well do you know maya")
