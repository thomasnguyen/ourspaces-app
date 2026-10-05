#!/bin/sh
# The dev lane: the dusty-condor-648 Convex deployment plus a Netlify preview
# alias. Nothing here touches ourspaces.io or the prod database.
#
#   ./scripts/dev-lane.sh backend      push convex/ to the dev deployment
#   ./scripts/dev-lane.sh web [args]   vite against the dev deployment
#   ./scripts/dev-lane.sh deploy       backend + build + Netlify preview (alias "dev")
set -e
cd "$(dirname "$0")/.."

DEV=dusty-condor-648
SITE=3b6e9f86-2714-4074-b65e-704346455bbf
export VITE_CONVEX_URL="https://$DEV.convex.cloud"
export VITE_CONVEX_SITE_URL="https://$DEV.convex.site"

backend() {
  # convex dev may rewrite .env.local to the dev deployment; put prod back after.
  cp .env.local .env.local.lane-bak
  trap 'mv -f .env.local.lane-bak .env.local' EXIT
  CONVEX_DEPLOYMENT="dev:$DEV" npx convex dev --once
}

case "$1" in
  backend)
    backend
    ;;
  web)
    shift
    exec npx vite "$@"
    ;;
  deploy)
    backend
    npm run build
    # _redirects is read before netlify.toml, so /api/* goes to dev, not prod.
    printf '/api/*  https://%s.convex.site/api/:splat  200!\n/*  /index.html  200\n' "$DEV" > dist/_redirects
    npx --yes netlify-cli@27.1.2 deploy --site "$SITE" --dir dist --no-build --alias dev
    ;;
  *)
    echo "usage: dev-lane.sh backend | web [vite args] | deploy" >&2
    exit 1
    ;;
esac
