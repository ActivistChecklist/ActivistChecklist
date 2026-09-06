#!/usr/bin/env bash
#
# Prune stale temp directories left behind by package managers and build tooling.
#
# Replaces two control-panel jobs that pointed at /tmp with a malformed
# `find ... -exec -delete`. Both were also looking in the wrong place: the
# scheduler sets TMPDIR to ~/.tmp, so nothing lands in /tmp any more. By the time
# this script was written ~/.tmp held 439 orphaned `yarn--*` directories going
# back to 2024 (215MB), none of them newer than the pnpm migration.
#
# Scheduler example (daily):
#   /absolute/path/to/repo/scripts/cleanup-tmp.sh
#
# Env vars:
#   CLEANUP_TMP_DIR      — directory to prune (default: $TMPDIR, else $HOME/.tmp)
#   CLEANUP_TMP_MIN_AGE  — minutes; only entries older than this go (default: 1440)
#   CLEANUP_TMP_DRY_RUN  — 1 to list what would be removed without deleting
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "cleanup-tmp.log" "$(resolve_server_log_lines_keep)"

TMP_DIR="${CLEANUP_TMP_DIR:-${TMPDIR:-$HOME/.tmp}}"
TMP_DIR="${TMP_DIR%/}"
MIN_AGE="${CLEANUP_TMP_MIN_AGE:-1440}"
DRY_RUN="${CLEANUP_TMP_DRY_RUN:-0}"

# Only ever prune a real, non-root directory we own. A misconfigured
# CLEANUP_TMP_DIR should abort, not walk someone's home or /.
if [[ -z "$TMP_DIR" || "$TMP_DIR" == "/" || "$TMP_DIR" == "$HOME" ]]; then
  log_echo "ERROR: refusing to prune TMP_DIR='$TMP_DIR'"
  exit 1
fi
if [[ ! -d "$TMP_DIR" ]]; then
  log_echo "Nothing to do: $TMP_DIR does not exist"
  exit 0
fi

# Leftovers from yarn (pre-pnpm), pnpm, npm, and mktemp. Anything not matching
# these stays put — this runs unattended and should not guess. Deliberately
# excludes v8-compile-cache-* and node-compile-cache: those are live caches that
# node rebuilds, not orphaned working directories.
PATTERNS=('yarn--*' 'pnpm-*' 'npm-*' 'tmp.*')

log_echo "=== cleanup-tmp started dir=$TMP_DIR min_age_min=$MIN_AGE dry_run=$DRY_RUN ==="
before_size="$(du -sh "$TMP_DIR" 2>/dev/null | awk '{print $1}')"

removed=0
for pattern in "${PATTERNS[@]}"; do
  # -mindepth 1 keeps $TMP_DIR itself out of the match set.
  while IFS= read -r -d '' entry; do
    if [[ "$DRY_RUN" == "1" ]]; then
      log_echo "would remove: $entry"
    else
      rm -rf -- "$entry"
    fi
    removed=$((removed + 1))
  done < <(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -name "$pattern" -mmin "+$MIN_AGE" -print0 2>/dev/null)
done

after_size="$(du -sh "$TMP_DIR" 2>/dev/null | awk '{print $1}')"
log_echo "=== cleanup-tmp done removed=$removed size ${before_size:-?} -> ${after_size:-?} ==="
trim_log
