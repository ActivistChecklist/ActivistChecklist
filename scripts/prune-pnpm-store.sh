#!/usr/bin/env bash
#
# Remove packages that no project uses any more from the pnpm store.
#
# The repo's pnpm 12 ships a `pnpm store prune` that exits 0 having removed
# nothing (12.4.1, checked 2026-10-31 against a throwaway store), so this runs
# pnpm 11's prune on the same store instead. Both use the v11 store format, and
# pnpm 12 installs keep working against a store pnpm 11 has pruned. The job this
# replaces ran a bare `pnpm store prune` from ~/web, where no package.json pins
# pnpm, so corepack picked pnpm 10 and pruned the abandoned v10 store while
# 2.8 GB of dead packages piled up in v11.
#
# Delete the pnpm 11 fallback when `pnpm store prune`, run from the repo,
# reports "Removed N packages" on a store that holds an unreferenced package.
#
# pnpm 11 counts a store file with a single hard link as unreferenced. That holds
# on the Linux server, where installs hard link from the store. On macOS pnpm 12
# clones files instead, so every store file has one link and this would empty the
# store; it refuses to run anywhere but Linux.
#
# Scheduler example (weekly):
#   /absolute/path/to/repo/scripts/run-with-repo-node.sh run store:prune
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "prune-pnpm-store.log" "$(resolve_server_log_lines_keep)"

PRUNE_PNPM="pnpm@11.4.0"

if [[ "$(uname -s)" != "Linux" ]]; then
  log_echo "ERROR: refusing to prune on $(uname -s); see the header of $0"
  exit 1
fi

# Ask the repo's own pnpm which store it installs from: that is the one to prune.
STORE_PATH="$(cd "$PROJECT_DIR" && pnpm store path)"
if [[ "$STORE_PATH" != */v11 || ! -d "$STORE_PATH" ]]; then
  log_echo "ERROR: expected a v11 store, got '$STORE_PATH'; $PRUNE_PNPM cannot prune another format"
  exit 1
fi
STORE_ROOT="${STORE_PATH%/v11}"

store_size() { du -sh "$STORE_PATH" 2>/dev/null | awk '{print $1}'; }

log_echo "=== prune-pnpm-store started store=$STORE_PATH size=$(store_size) ==="

# Run from the store rather than the repo: pnpm 11 would otherwise see the
# repo's packageManager pin and hand the command to pnpm 12.
if ! output="$(cd "$STORE_ROOT" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack "$PRUNE_PNPM" store prune --store-dir "$STORE_ROOT" 2>&1)"; then
  log_echo "ERROR: $PRUNE_PNPM store prune failed:"
  log_echo "$output"
  exit 1
fi
while IFS= read -r line; do
  [[ -n "$line" ]] && log_echo "$line"
done <<<"$output"

log_echo "=== prune-pnpm-store done size=$(store_size) ==="
trim_log
