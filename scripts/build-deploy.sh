#!/usr/bin/env bash
#
# Pulled from the repo at scripts/build-deploy.sh.
# public/webhooks/deploy.php runs this and sets REPO_DIR from webhook-secrets.local.php (repo_root).
#
# Concurrency model (deploy.php implements the matching half):
#
#   * flock still guarantees one build at a time.
#   * A delivery that finds the lock held no longer fails. It writes PENDING_FILE
#     and exits 0, so overlapping pushes coalesce instead of reporting a failed
#     deploy to GitHub. Ten pushes in a row cost at most one extra build.
#   * The builder loops: sync git, clear the marker, build, publish, and if a new
#     marker appeared it goes around again (up to MAX_BUILD_ITERATIONS).
#
#   This is safe because every iteration syncs to the tip of origin/$GIT_BRANCH
#   first, so a superseded build is redundant rather than lost: the next
#   iteration's tree already contains its commits.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Webhook passes REPO_DIR; for a manual run from a checkout: export REPO_DIR="$(pwd)" first.
if [[ -z "${REPO_DIR:-}" ]]; then
  REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.build-deploy.lock}"
# Existence signals "a newer push wants a build"; the contents are informational.
PENDING_FILE="${PENDING_FILE:-$REPO_DIR/.build-deploy.pending}"
# Total builds one invocation will run. Caps the worst case if pushes keep landing.
MAX_BUILD_ITERATIONS="${MAX_BUILD_ITERATIONS:-3}"
# deploy.php forwards its git_update_mode; manual runs default to the safer ff-only.
GIT_UPDATE_MODE="${GIT_UPDATE_MODE:-ff-only}"
# Set on the server (export, systemd Environment=, etc.) to your site docroot
DEPLOY_TARGET="${DEPLOY_TARGET:-$HOME/public_html}"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"
log() {
  log_stderr_utc "$@"
}

# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/nvm-pnpm.sh"
nvm_pnpm_err() {
  log "$1"
}

if [[ "$GIT_UPDATE_MODE" != "ff-only" && "$GIT_UPDATE_MODE" != "hard-reset" ]]; then
  log "ERROR: GIT_UPDATE_MODE must be 'ff-only' or 'hard-reset' (got: $GIT_UPDATE_MODE)"
  exit 1
fi

# Checked up front so a missing flock cannot be mistaken for a held lock below
# (it would exit 127, and we would silently queue a rebuild nobody ever runs).
if ! command -v flock >/dev/null 2>&1; then
  log "ERROR: flock is required to serialize deploys but is not on PATH (PATH=$PATH)"
  exit 1
fi

if ! exec 9>"$LOCK_FILE"; then
  log "ERROR: cannot open lock file for writing: $LOCK_FILE (whoami=$(whoami))"
  exit 1
fi
if ! flock -n 9; then
  # The lock is kernel-level via flock(2); the file persisting after a run is normal
  # and does NOT itself block the next run. If we land here, a process is actively
  # holding the lock — identify it for the log, then hand our work to that build.
  holder=""
  if command -v fuser >/dev/null 2>&1; then
    holder="$(fuser "$LOCK_FILE" 2>&1 || true)"
  elif command -v lsof >/dev/null 2>&1; then
    holder="$(lsof "$LOCK_FILE" 2>&1 || true)"
  fi
  if printf '%s coalesced delivery=%s\n' \
      "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "${GITHUB_DELIVERY:-unknown}" > "$PENDING_FILE"; then
    log "Another deploy is in flight; queued a pending rebuild and exiting 0. The running deploy will re-sync and build these commits. lock=$LOCK_FILE holder=${holder:-unknown}"
    exit 0
  fi
  # Without the marker the running build would never learn about this push, so
  # reporting success here would be a lie. Fail loudly instead.
  log "ERROR: another deploy holds the lock and the pending marker is not writable: $PENDING_FILE (whoami=$(whoami))"
  exit 1
fi

if [[ ! -d "$REPO_DIR/content" ]] || [[ ! -d "$REPO_DIR/.git" ]]; then
  log "REPO_DIR does not look like this project root: $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

export NVM_PNPM_PROJECT_DIR="$REPO_DIR"
export NVM_PNPM_USE_NVM="${BUILD_DEPLOY_USE_NVM:-${NVM_PNPM_USE_NVM:-0}}"
export NVM_PNPM_NVM_DIR="${BUILD_DEPLOY_NVM_DIR:-${NVM_PNPM_NVM_DIR:-$HOME/.nvm}}"
export NVM_PNPM_NODE_VERSION="${BUILD_DEPLOY_NODE_VERSION:-${NVM_PNPM_NODE_VERSION:-}}"
export NVM_PNPM_PATH_EXTRA="${BUILD_DEPLOY_PATH_EXTRA:-${NVM_PNPM_PATH_EXTRA:-}}"

if ! nvm_pnpm_init; then
  log "ERROR: nvm_pnpm_init failed. whoami=$(whoami) HOME=$HOME PATH=$PATH"
  exit 127
fi

log "Deploy user=$(whoami) HOME=$HOME"
if [[ -n "${NVM_PNPM_RESOLVED_VERSION:-}" ]]; then
  log "Node=$(nvm exec "$NVM_PNPM_RESOLVED_VERSION" node -v) pnpm=$(nvm exec "$NVM_PNPM_RESOLVED_VERSION" command -v pnpm)"
else
  log "Node=$(command -v node || echo missing) pnpm=$(command -v pnpm || echo missing)"
fi

GIT_BRANCH="${GIT_BRANCH:-main}"

git_sync() {
  git fetch origin --prune
  git checkout "$GIT_BRANCH"
  if [[ "$GIT_UPDATE_MODE" == "hard-reset" ]]; then
    git reset --hard "origin/$GIT_BRANCH"
  else
    git pull --ff-only "origin" "$GIT_BRANCH"
  fi
}

# Cooperative abort. True when a newer push landed and we still have an iteration
# left to spend on it, so the caller should abandon this round and restart from
# the newer tree. Only ever consulted before the long steps — see the loop.
iteration=0
superseded() {
  if [[ -e "$PENDING_FILE" ]] && (( iteration < MAX_BUILD_ITERATIONS )); then
    log "Newer commits pushed; abandoning this build before $1 and restarting from the newer tree."
    return 0
  fi
  return 1
}

while :; do
  iteration=$((iteration + 1))

  git_sync
  # Clear the marker only AFTER syncing: any request made before this point is
  # already contained in the tree we just checked out. A marker appearing from
  # here on is a genuinely newer push and earns another iteration.
  rm -f "$PENDING_FILE"
  log "Building $(git rev-parse --short HEAD) on $GIT_BRANCH (iteration $iteration/$MAX_BUILD_ITERATIONS)"

  if superseded "pnpm install"; then continue; fi

  # pnpm's strict, content-addressable store + --frozen-lockfile guarantee node_modules
  # matches pnpm-lock.yaml exactly (no stale nested folders shadowing top-level versions,
  # unlike yarn v1). So no hash-based clean-install dance is needed here.
  nvm_pnpm install --frozen-lockfile --prefer-offline --fetch-timeout 100000
  export NODE_ENV=production

  # Last abort checkpoint. `buildstatic` itself is not interruptible: killing it
  # mid-run would leave .next/ half-written, and there is no checkpoint after it
  # because what we just built is already newer than what is live — publish it and
  # let the next iteration handle anything newer still.
  if superseded "the static build"; then continue; fi

  # Non-interactive: no URL approval prompt; does not write .approved-urls.json
  CHECKBUILD_URL_APPROVAL=allow BUILD_MODE=static nvm_pnpm buildstatic

  if [[ ! -d "$REPO_DIR/out" ]]; then
    log "Build did not produce out/: $REPO_DIR/out"
    exit 1
  fi

  # Past this point we never abort: a half-finished `rsync --delete` leaves the
  # docroot in a broken state.
  RSYNC_EXCLUDE=()
  if [[ -f "$REPO_DIR/.rsync-exclude" ]]; then
    RSYNC_EXCLUDE=(--exclude-from="$REPO_DIR/.rsync-exclude")
  fi
  # Docroot folder for server-only large files (see .rsync-exclude); not from git or out/.
  mkdir -p "$DEPLOY_TARGET/large-assets"
  rsync -a --delete "${RSYNC_EXCLUDE[@]}" "$REPO_DIR/out/" "$DEPLOY_TARGET/"

  # Post-deploy smoke checks (informational only; deploy already published).
  SITE_URL="${SITE_URL:-https://activistchecklist.org}"
  SMOKE_GUIDE_PATH="${SMOKE_GUIDE_PATH:-/essentials/}"
  SMOKE_FAILED=0

  if ! curl -fsS --max-time 15 "$SITE_URL/" | grep -qi "Activist Checklist"; then
    log "WARN: smoke check failed for $SITE_URL/"
    SMOKE_FAILED=1
  fi
  if ! curl -fsS --max-time 15 "$SITE_URL/news/" >/dev/null; then
    log "WARN: smoke check failed for $SITE_URL/news/"
    SMOKE_FAILED=1
  fi
  if ! curl -fsS --max-time 15 "$SITE_URL$SMOKE_GUIDE_PATH" >/dev/null; then
    log "WARN: smoke check failed for $SITE_URL$SMOKE_GUIDE_PATH"
    SMOKE_FAILED=1
  fi
  if ! curl -fsS --max-time 15 "$SITE_URL/api-server/hello" >/dev/null; then
    log "WARN: smoke check failed for $SITE_URL/api-server/hello"
    SMOKE_FAILED=1
  fi

  if [[ "$SMOKE_FAILED" -eq 1 ]]; then
    log "WARN: one or more post-deploy smoke checks failed"
  else
    log "Post-deploy smoke checks passed"
  fi

  log "Deploy finished → $DEPLOY_TARGET"

  [[ -e "$PENDING_FILE" ]] || break
  if (( iteration >= MAX_BUILD_ITERATIONS )); then
    log "WARN: a pending rebuild is still queued after $MAX_BUILD_ITERATIONS iterations. The newest commits are NOT live; push again or run this script manually."
    break
  fi
  log "A newer push arrived during this run; rebuilding."
done
