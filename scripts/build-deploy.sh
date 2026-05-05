#!/usr/bin/env bash
#
# Pulled from the repo at scripts/build-deploy.sh.
# public/webhooks/deploy.php runs this and sets REPO_DIR from webhook-secrets.local.php (repo_root).
#
# Uses flock so overlapping webhook deliveries do not run two builds at once.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Webhook passes REPO_DIR; for a manual run from a checkout: export REPO_DIR="$(pwd)" first.
if [[ -z "${REPO_DIR:-}" ]]; then
  REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.build-deploy.lock}"
# Set on the server (export, systemd Environment=, etc.) to your site docroot
DEPLOY_TARGET="${DEPLOY_TARGET:-$HOME/public_html}"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"
log() {
  log_stderr_utc "$@"
}

# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/nvm-yarn.sh"
nvm_yarn_err() {
  log "$1"
}

if ! exec 9>"$LOCK_FILE"; then
  log "ERROR: cannot open lock file for writing: $LOCK_FILE (whoami=$(whoami))"
  exit 1
fi
if ! flock -n 9; then
  # The lock is kernel-level via flock(2); the file persisting after a run is normal
  # and does NOT itself block the next run. If we land here, a process is actively
  # holding the lock — identify it.
  holder=""
  if command -v fuser >/dev/null 2>&1; then
    holder="$(fuser "$LOCK_FILE" 2>&1 || true)"
  elif command -v lsof >/dev/null 2>&1; then
    holder="$(lsof "$LOCK_FILE" 2>&1 || true)"
  fi
  log "ERROR: Another deploy holds the lock; exiting without deploying. lock=$LOCK_FILE holder=${holder:-unknown}"
  # Non-zero so the webhook returns failure to GitHub (do not report success when no deploy ran).
  exit 1
fi

if [[ ! -d "$REPO_DIR/content" ]] || [[ ! -d "$REPO_DIR/.git" ]]; then
  log "REPO_DIR does not look like this project root: $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

export NVM_YARN_PROJECT_DIR="$REPO_DIR"
export NVM_YARN_USE_NVM="${BUILD_DEPLOY_USE_NVM:-${NVM_YARN_USE_NVM:-0}}"
export NVM_YARN_NVM_DIR="${BUILD_DEPLOY_NVM_DIR:-${NVM_YARN_NVM_DIR:-$HOME/.nvm}}"
export NVM_YARN_NODE_VERSION="${BUILD_DEPLOY_NODE_VERSION:-${NVM_YARN_NODE_VERSION:-}}"
export NVM_YARN_PATH_EXTRA="${BUILD_DEPLOY_PATH_EXTRA:-${NVM_YARN_PATH_EXTRA:-}}"

if ! nvm_yarn_init; then
  log "ERROR: nvm_yarn_init failed. whoami=$(whoami) HOME=$HOME PATH=$PATH"
  exit 127
fi

log "Deploy user=$(whoami) HOME=$HOME"
if [[ -n "${NVM_YARN_RESOLVED_VERSION:-}" ]]; then
  log "Node=$(nvm exec "$NVM_YARN_RESOLVED_VERSION" node -v) Yarn=$(nvm exec "$NVM_YARN_RESOLVED_VERSION" command -v yarn)"
else
  log "Node=$(command -v node || echo missing) Yarn=$(command -v yarn || echo missing)"
fi

GIT_BRANCH="${GIT_BRANCH:-main}"
git fetch origin --prune
git checkout "$GIT_BRANCH"
git pull --ff-only "origin" "$GIT_BRANCH"

# Yarn v1's --frozen-lockfile installs new entries but does NOT prune extraneous
# nested folders left behind from previous installs. When a resolution change
# collapses duplicate sub-versions (e.g. @radix-ui/react-slot 1.2.3 → 1.2.4),
# stale nested copies in node_modules/<pkg>/node_modules/ can shadow the new
# top-level version and break the build. Detect lockfile drift and reinstall
# from scratch when it changes.
LOCK_HASH_FILE="$REPO_DIR/.deploy-lock.sha256"
if command -v sha256sum >/dev/null 2>&1; then
  CURRENT_LOCK_HASH="$(sha256sum yarn.lock | cut -d' ' -f1)"
else
  CURRENT_LOCK_HASH="$(shasum -a 256 yarn.lock | cut -d' ' -f1)"
fi
PREVIOUS_LOCK_HASH="$(cat "$LOCK_HASH_FILE" 2>/dev/null || echo "")"
if [[ "$CURRENT_LOCK_HASH" != "$PREVIOUS_LOCK_HASH" ]]; then
  log "yarn.lock changed since last deploy; removing node_modules for clean install"
  rm -rf node_modules
fi

# Install must include devDependencies because `yarn buildstatic` runs Next build,
# which needs build-time tools like postcss/autoprefixer and other dev deps.
# Yarn v1 will skip devDependencies when NODE_ENV=production, so force them on.
YARN_PRODUCTION=false nvm_yarn install --frozen-lockfile --production=false

# Record the lockfile hash AFTER a successful install so a failed install
# doesn't get falsely marked as in-sync.
echo "$CURRENT_LOCK_HASH" > "$LOCK_HASH_FILE"

export NODE_ENV=production

BUILD_MODE=static nvm_yarn buildstatic

if [[ ! -d "$REPO_DIR/out" ]]; then
  log "Build did not produce out/: $REPO_DIR/out"
  exit 1
fi

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
