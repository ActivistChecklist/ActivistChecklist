#!/usr/bin/env bash
#
# Prune stale temp directories left behind by package managers and build tooling.
#
# Replaces two scheduled jobs that pointed at the system temp dir with a
# malformed `find ... -exec -delete`. Both were also looking in the wrong place:
# the scheduler sets TMPDIR under the account's own home. Orphaned `yarn--*`
# directories predating the pnpm migration had been accumulating there for
# months.
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

MIN_AGE="${CLEANUP_TMP_MIN_AGE:-1440}"
DRY_RUN="${CLEANUP_TMP_DRY_RUN:-0}"

# Prune the active temp dir (load-env.sh points TMPDIR at ~/include/.tmp on the
# servers) *and* the legacy ~/.tmp the scheduler still sets for jobs that do not
# source load-env.sh. Without the second entry the older directory would stop
# being collected entirely once TMPDIR moved.
CANDIDATE_DIRS=()
if [[ -n "${CLEANUP_TMP_DIR:-}" ]]; then
  CANDIDATE_DIRS+=("$CLEANUP_TMP_DIR")
else
  [[ -n "${TMPDIR:-}" ]] && CANDIDATE_DIRS+=("$TMPDIR")
  CANDIDATE_DIRS+=("$HOME/include/.tmp" "$HOME/.tmp")
fi

# This script runs `rm -rf`, so be strict about what it will accept. Resolve each
# candidate to a real path first: a string comparison alone would let a value
# like "$HOME/include/.tmp/../.." past the checks below, and a symlink could
# point anywhere. Then require the result to sit strictly inside $HOME, so a
# misconfigured CLEANUP_TMP_DIR aborts rather than walking an unrelated tree.
CONTAINMENT_ROOT="${CLEANUP_TMP_ROOT:-$HOME}"
CONTAINMENT_ROOT="$(cd "$CONTAINMENT_ROOT" 2>/dev/null && pwd -P || printf '%s' "$CONTAINMENT_ROOT")"

TMP_DIRS=()
for d in "${CANDIDATE_DIRS[@]}"; do
  d="${d%/}"
  [[ -n "$d" ]] || continue
  [[ -d "$d" ]] || continue

  # pwd -P resolves symlinks and .. segments.
  resolved="$(cd "$d" 2>/dev/null && pwd -P)" || continue
  [[ -n "$resolved" ]] || continue

  if [[ "$resolved" == "/" || "$resolved" == "$CONTAINMENT_ROOT" ]]; then
    log_echo "refusing to prune '$d' (resolves to '$resolved')"
    continue
  fi
  if [[ "$resolved" != "$CONTAINMENT_ROOT"/* ]]; then
    log_echo "refusing to prune '$d': outside '$CONTAINMENT_ROOT' (resolves to '$resolved')"
    continue
  fi

  seen=0
  for existing in ${TMP_DIRS[@]+"${TMP_DIRS[@]}"}; do
    [[ "$existing" == "$resolved" ]] && seen=1 && break
  done
  (( seen )) || TMP_DIRS+=("$resolved")
done

if (( ${#TMP_DIRS[@]} == 0 )); then
  log_echo "Nothing to do: no prunable temp directory found"
  exit 0
fi

# A non-numeric age makes find reject the -mmin argument, which (with stderr
# discarded) would silently prune nothing forever. A too-small one is worse: it
# would delete the working directories of builds that are still running. Require
# an integer, floor at an hour.
if [[ ! "$MIN_AGE" =~ ^[0-9]+$ ]] || (( MIN_AGE < 60 )); then
  log_echo "ERROR: CLEANUP_TMP_MIN_AGE must be an integer >= 60 minutes (got '$MIN_AGE')"
  exit 1
fi

# Leftovers from yarn (pre-pnpm), pnpm, npm, and mktemp. Anything not matching
# these stays put — this runs unattended and should not guess. Deliberately
# excludes v8-compile-cache-* and node-compile-cache: those are live caches that
# node rebuilds, not orphaned working directories.
PATTERNS=('yarn--*' 'pnpm-*' 'npm-*' 'tmp.*')

log_echo "=== cleanup-tmp started dirs='${TMP_DIRS[*]}' min_age_min=$MIN_AGE dry_run=$DRY_RUN ==="

total_removed=0
for TMP_DIR in "${TMP_DIRS[@]}"; do
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
  log_echo "$TMP_DIR: removed=$removed size ${before_size:-?} -> ${after_size:-?}"
  total_removed=$((total_removed + removed))
done

log_echo "=== cleanup-tmp done removed=$total_removed across ${#TMP_DIRS[@]} dir(s) ==="
trim_log
