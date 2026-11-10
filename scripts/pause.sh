#!/usr/bin/env bash
# Takes DocuHop offline within minutes, for example if IDFA objects, and brings it back.
#
#   scripts/pause.sh on ["message"]   swap the site for a short notice page and deploy it
#   scripts/pause.sh off              bring the planner back and deploy it
#   scripts/pause.sh status           say whether the site is paused here and on GitHub
#   scripts/pause.sh preview          build the notice page into dist-pause/ to look at; changes nothing
#
# How it works: "on" commits a PAUSED file (holding the optional message) to main and pushes. The deploy workflow sees
# PAUSED and publishes only the notice page (index.html and 404.html, so every link lands on it) instead of the app.
# A paused deploy skips npm install and the build, so it is live in about a minute; browsers that already had the page
# open can keep a cached copy for up to 10 minutes (GitHub Pages' cache time). The database is not touched: groups
# stay until the automatic deletion on 23 Dec 2026, or until you delete them.
set -euo pipefail
cd "$(dirname "$0")/.."

TRAILER="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
DEFAULT_MESSAGE="DocuHop, an unofficial planner for IDFA 2026, is offline for now."

need_main() {
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$branch" != "main" ]]; then echo "You're on '$branch'. Switch to main first: the site deploys from main." >&2; exit 1; fi
  if ! git remote get-url origin >/dev/null 2>&1; then echo "No 'origin' remote yet: create the GitHub repo first." >&2; exit 1; fi
  git pull --ff-only --quiet origin main
}

watch_hint() {
  if command -v gh >/dev/null 2>&1; then
    echo "Deploy started. Follow it with: gh run watch \$(gh run list --workflow=Deploy --limit 1 --json databaseId -q '.[0].databaseId')"
  else
    echo "Deploy started: see the Actions tab on GitHub."
  fi
}

case "${1:-}" in
  on)
    need_main
    printf '%s\n' "${2:-$DEFAULT_MESSAGE}" > PAUSED
    git add PAUSED
    git commit --quiet -m "Pause DocuHop: show the notice page" -m "$TRAILER" -- PAUSED
    git push --quiet origin main
    echo "Paused. The notice page replaces DocuHop in about a minute (cached copies: up to 10 minutes)."
    watch_hint
    ;;
  off)
    need_main
    if [[ ! -f PAUSED ]]; then echo "DocuHop isn't paused (no PAUSED file on main)."; exit 0; fi
    git rm --quiet PAUSED
    git commit --quiet -m "Unpause DocuHop: bring the planner back" -m "$TRAILER" -- PAUSED
    git push --quiet origin main
    echo "Unpaused. The planner is back after the build, in about 2 minutes."
    watch_hint
    ;;
  status)
    if [[ -f PAUSED ]]; then echo "Paused here (PAUSED says: $(cat PAUSED))"; else echo "Not paused here."; fi
    if git remote get-url origin >/dev/null 2>&1; then
      git fetch --quiet origin main && if git cat-file -e origin/main:PAUSED 2>/dev/null; then echo "Paused on GitHub."; else echo "Not paused on GitHub."; fi
    fi
    ;;
  preview)
    node scripts/build-pause.mjs dist-pause
    echo "Open dist-pause/index.html to see it."
    ;;
  *)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
