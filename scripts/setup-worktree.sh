#!/usr/bin/env bash
#
# Symlink env files and node_modules from the main repo into the current git
# worktree, so the worktree is immediately usable for build/test without
# re-installing or re-creating local secrets.
#
# Run from inside a worktree:
#   ./scripts/setup-worktree.sh
#
# Idempotent: existing matching symlinks are left alone; existing real files
# are skipped with a warning (the script never overwrites real content).

set -euo pipefail

# Resolve the worktree root (current dir, but allow being called from elsewhere).
WT_ROOT="$(git rev-parse --show-toplevel)"

# Main repo root = parent of the shared .git common dir.
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_REPO="$(dirname "$COMMON_DIR")"

if [[ "$WT_ROOT" == "$MAIN_REPO" ]]; then
  echo "✗ Refusing to run: $WT_ROOT is the main repo, not a worktree." >&2
  echo "  This script is only meaningful inside .claude/worktrees/<name>/ etc." >&2
  exit 1
fi

echo "Worktree:  $WT_ROOT"
echo "Main repo: $MAIN_REPO"
echo

# Files / dirs we mirror from the main repo. Add more here as the project grows.
TARGETS=(
  ".env"
  ".env.production.local"
  ".env.production.railway.local"
  "node_modules"
)

linked=0
skipped_missing=0
skipped_existing=0

for name in "${TARGETS[@]}"; do
  src="$MAIN_REPO/$name"
  dest="$WT_ROOT/$name"

  if [[ ! -e "$src" && ! -L "$src" ]]; then
    echo "  -  $name (not present in main repo, skipping)"
    skipped_missing=$((skipped_missing + 1))
    continue
  fi

  if [[ -L "$dest" ]]; then
    current="$(readlink "$dest")"
    if [[ "$current" == "$src" ]]; then
      echo "  ✓  $name (symlink already correct)"
      skipped_existing=$((skipped_existing + 1))
      continue
    fi
    echo "  ✗  $name: symlink points elsewhere ($current); leaving as-is" >&2
    skipped_existing=$((skipped_existing + 1))
    continue
  fi

  if [[ -e "$dest" ]]; then
    echo "  ✗  $name: real file/dir already exists in worktree; leaving as-is" >&2
    skipped_existing=$((skipped_existing + 1))
    continue
  fi

  ln -s "$src" "$dest"
  echo "  +  $name -> $src"
  linked=$((linked + 1))
done

echo
echo "Done. linked=$linked existing=$skipped_existing missing-in-main=$skipped_missing"
