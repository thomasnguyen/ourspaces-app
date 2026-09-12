#!/usr/bin/env bash
# Mirror local-only Claude skills into Codex's global skill directory.
#
# Codex only discovers skills from $CODEX_HOME/skills (default ~/.codex/skills),
# and when it scans a project's .claude/skills it skips anything gitignored --
# which is exactly the local-only skills. Symlinking does not work: Codex's
# directory scan ignores a symlinked SKILL.md. So these get copied.
#
# Re-run after editing a skill listed below:  npm run sync:skills
set -euo pipefail

SKILLS=(eye-candy)

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest_root="${CODEX_HOME:-$HOME/.codex}/skills"

for skill in "${SKILLS[@]}"; do
  src="$repo_root/.claude/skills/$skill/SKILL.md"
  if [[ ! -f "$src" ]]; then
    echo "skip  $skill (not present in this clone)"
    continue
  fi
  dest="$dest_root/$skill/SKILL.md"
  mkdir -p "$(dirname "$dest")"
  rm -f "$dest"   # drop any stale symlink; Codex cannot see those
  cp "$src" "$dest"
  echo "sync  $skill -> $dest"
done
