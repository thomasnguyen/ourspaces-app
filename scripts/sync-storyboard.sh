#!/bin/bash
# Stage the local-only demo-video storyboard into public/ so it ships with the
# static site (https://necessary-cobra-892.convex.site/storyboard.html) for
# Holly to read without running the repo.
#
# The source lives in gitignored docs/local/ and points at 1672px PNGs (~17MB
# total) that are fine on disk but absurd over the wire. This downscales them
# to web JPEGs and rewrites the extension in the copied HTML to match. Both
# outputs are gitignored — the public repo never carries the video plan.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=docs/local/demo-video-storyboard.html
ASSETS=docs/local/demo-video-assets
OUT=public/demo-video-assets

# Only the stills the storyboard actually renders — the folder also holds
# retired v1/v2 shot mockups we don't want to publish.
USED=(myspace-glitter feed-photos chat-crew build-room-pile link-card-arrival
      crawl-strip keep-takeaway reading-circle holly-desk thomas-desk)

rm -rf "$OUT" && mkdir -p "$OUT"
for name in "${USED[@]}"; do
  sips -s format jpeg -s formatOptions 80 -Z 1200 \
    "$ASSETS/$name.png" --out "$OUT/$name.jpg" >/dev/null
done

# The record-me pages the storyboard links to, plus their briefs, so the links
# work on the public copy too. Chat is one HTML with inline SVG, but myspace and
# feed each grew an assets/ folder of generated stills — copy the page without
# them and every portrait renders as a broken icon.
for page in myspace feed chat; do
  mkdir -p "$OUT/$page" && cp "$ASSETS/$page/index.html" "$OUT/$page/index.html"
done

# The myspace portraits are already 720px square and 60-160K — straight through,
# so they are not re-compressed a second time.
mkdir -p "$OUT/myspace/assets"
cp "$ASSETS"/myspace/assets/*.jpg "$OUT/myspace/assets/"

# The feed stills are 1280px against a 400px column (see feed-prototype.md);
# 800 still covers retina and takes the set from 2.8M to a fraction of it.
mkdir -p "$OUT/feed/assets"
for f in "$ASSETS"/feed/assets/*.jpg; do
  sips -s format jpeg -s formatOptions 80 -Z 800 "$f" \
    --out "$OUT/feed/assets/$(basename "$f")" >/dev/null
done
cp docs/local/myspace-prototype.md docs/local/feed-prototype.md docs/local/chat-prototype.md public/

# Frames are ~660px wide on screen, so 1200px covers retina. The .png -> .jpg
# rewrite only touches the asset-name string literals; nothing else in the file
# ends in .png'.
sed "s/\.png'/.jpg'/g" "$SRC" > public/storyboard.html

# The CapCut subtitle tracks, regenerated from the same beat data and published
# next to the page so Holly can grab them without the repo.
node scripts/gen-video-srt.mjs
cp docs/local/demo-video-dialogue.srt docs/local/demo-video-beats.srt "$OUT/"

echo "synced: public/storyboard.html + ${#USED[@]} stills ($(du -sh "$OUT" | cut -f1))"
