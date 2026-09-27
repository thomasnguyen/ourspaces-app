#!/bin/bash
# Screenshot every slide of a deck at 1280×800 and tile them into one sheet.
#   .claude/skills/ourspaces-slides/shots.sh docs/<deck>.html
# Writes /tmp/deck-shots/<deck>/{1..N}.png and sheet.png (sheet needs ffmpeg).
# Reduced motion is forced so no shot lands mid-stagger. Headless Chrome here
# writes the PNG and then never exits, so each run gets a fresh profile and is
# killed as soon as its file lands (or after 30s if it never does).
set -euo pipefail

DECK=${1:?usage: shots.sh docs/<deck>.html}
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT=/tmp/deck-shots/$(basename "$DECK" .html)
N=$(grep -c '<section class="slide' "$DECK")
ABS=$(cd "$(dirname "$DECK")" && pwd)/$(basename "$DECK")

rm -rf "$OUT"; mkdir -p "$OUT"
for i in $(seq 1 "$N"); do
  "$CH" --headless=new --disable-gpu --hide-scrollbars \
    --force-prefers-reduced-motion --window-size=1280,800 \
    --user-data-dir="$OUT/.profile-$i" --screenshot="$OUT/$i.png" \
    "file://$ABS#$i" >/dev/null 2>&1 &
  for _ in $(seq 1 150); do [ -s "$OUT/$i.png" ] && break; sleep 0.2; done
  sleep 0.3
  pkill -f "$OUT/.profile-$i" 2>/dev/null || true
  wait 2>/dev/null || true
  [ -s "$OUT/$i.png" ] || echo "slide $i: no screenshot"
done
rm -rf "$OUT"/.profile-*

if command -v ffmpeg >/dev/null; then
  ffmpeg -loglevel error -y -framerate 1 -i "$OUT/%d.png" \
    -vf "scale=640:400,tile=3x$(( (N + 2) / 3 )):padding=6:color=white" \
    -frames:v 1 "$OUT/sheet.png"
  echo "$OUT/sheet.png"
else
  echo "$OUT/ (no ffmpeg, so no sheet)"
fi
