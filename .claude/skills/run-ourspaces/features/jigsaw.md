---
route: #/space/crew
ready: game-door
testids: jigsaw-mat jigsaw-piece jigsaw-count jigsaw-ghost jigsaw-helper jigsaw-done jigsaw-slip jigsaw-invite jigsaw-invite-join jigsaw-invite-hide jigsaw-start jigsaw-sheet jigsaw-sheet-close jigsaw-sheet-leave jigsaw-dev
states:
  start: ?as=Maya&jigsaw=start&you=play | wait jigsaw-mat | sleep 2800
  playing: ?as=Maya&jigsaw=start&you=play | wait jigsaw-mat | sleep 9000
  ghost: ?as=Maya&jigsaw=start&you=play&beat=yield | wait jigsaw-ghost | sleep 900
  late: ?as=Rio&jigsaw=late | wait jigsaw-invite | sleep 1200
  last: ?as=Maya&jigsaw=last&you=play | wait jigsaw-mat | sleep 600
  done: ?as=Maya&jigsaw=done | wait jigsaw-slip | sleep 900
  boot: ?as=Maya&jigsaw=start&you=play
  boot-yield: ?as=Maya&jigsaw=start&you=play&beat=yield
  boot-nod: ?as=Maya&jigsaw=start&you=play&beat=nod
  boot-reach: ?as=Maya&jigsaw=start&you=reach
  boot-hold: ?as=Maya&jigsaw=start&you=hold
take:
  start: boot real 30fps 210f
  work: playing real 30fps 300f
  yield: boot-yield real 30fps 420f focus jigsaw-mat
  nod: boot-nod real 30fps 420f focus jigsaw-mat
  reach: boot-reach real 30fps 330f focus jigsaw-mat
  hold: boot-hold real 30fps 450f focus jigsaw-mat
  finish: last real 30fps 450f
---
# Jigsaw
