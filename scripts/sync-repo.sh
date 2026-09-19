#!/usr/bin/env bash
#
# Keep a server checkout of this repo in sync with the remote.
#
# The newsletter server runs cron scripts straight out of a clone but has no
# deploy webhook, so an hourly pull is how it picks up changes.
#
# Cron example:
#   17 * * * * /path/to/repo/scripts/sync-repo.sh
#
# Optional env:
#   REPO_SYNC_BRANCH              — branch to track (default: main)
#   REPO_SYNC_REMOTE              — remote name (default: origin)
#   REPO_SYNC_HEALTHCHECK_PING_URL — Healthchecks.io ping URL
#   LOG_DIR / LOG_LINES_KEEP      — shared server log settings
#
# Fast-forward only: if the checkout ever diverges the sync fails loudly with a
# /fail ping rather than silently discarding whatever is there.
#
set -uo pipefail

# Everything lives in main() so bash parses the whole script before the pull can
# rewrite this file underneath the running shell.
main() {
  local SCRIPT_DIR PROJECT_DIR
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/load-env.sh"
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/log.sh"

  init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "sync-repo.log" "$(resolve_server_log_lines_keep)"
  trim_log
  exec >> "$LOG_FILE" 2>&1

  local branch remote ping_url
  branch="${REPO_SYNC_BRANCH:-main}"
  remote="${REPO_SYNC_REMOTE:-origin}"
  ping_url="${REPO_SYNC_HEALTHCHECK_PING_URL:-}"

  echo "=== $(date -Iseconds) sync-repo $PROJECT_DIR ($remote/$branch) ==="

  hc_post() {
    local url="$1" body="$2"
    [[ -n "$ping_url" ]] || return 0
    curl -fsS --max-time 10 --retry 3 --data-raw "$body" "$url" >/dev/null 2>&1 || true
  }

  fail() {
    echo "FAIL: $1"
    hc_post "${ping_url%/}/fail" "sync-repo failed $(date -u +"%Y-%m-%dT%H:%M:%SZ") $1"
    exit 1
  }

  cd "$PROJECT_DIR" || fail "cannot cd to $PROJECT_DIR"
  git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository: $PROJECT_DIR"

  local before after
  before="$(git rev-parse HEAD)"

  git fetch --quiet "$remote" "$branch" || fail "git fetch $remote $branch failed"

  local current
  current="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current" != "$branch" ]]; then
    git checkout --quiet "$branch" || fail "cannot checkout $branch (on $current)"
  fi

  # --ff-only: refuse to invent a merge commit on a server checkout.
  git merge --ff-only --quiet "$remote/$branch" \
    || fail "cannot fast-forward to $remote/$branch - checkout has diverged or has local edits"

  after="$(git rev-parse HEAD)"

  if [[ "$before" == "$after" ]]; then
    echo "OK: already up to date at ${after:0:8}"
  else
    echo "OK: ${before:0:8} -> ${after:0:8}"
    git --no-pager log --oneline "$before..$after" | head -20
  fi

  hc_post "${ping_url%/}" "sync-repo ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") head=${after:0:8}"
  echo "=== Sync complete ==="
}

main "$@"; exit $?
