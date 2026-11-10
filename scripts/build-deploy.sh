#!/usr/bin/env bash
#
# Pulled from the repo at scripts/build-deploy.sh.
# scripts/deploy-poll.sh starts this when the branch moves, and so does
# public/webhooks/deploy.php while it is still in use. Both set REPO_DIR.
#
# Concurrency model (deploy-poll.sh and deploy.php implement the matching half):
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

# The web server runs as another account, so everything this publishes has to
# be readable by others. A launcher's private umask (077) once reached the build
# and git checkout, rsync -a copied the owner-only modes to the docroot, and
# Apache answered every page with 403. RSYNC_PERMS below fixes the modes at
# publish time too, for files an earlier run already wrote owner-only.
umask 022
RSYNC_PERMS=(--chmod=D755,F644)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The launcher passes REPO_DIR; for a manual run from a checkout: export REPO_DIR="$(pwd)" first.
if [[ -z "${REPO_DIR:-}" ]]; then
  REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.build-deploy.lock}"
# Existence signals "a newer push wants a build"; the contents are informational.
PENDING_FILE="${PENDING_FILE:-$REPO_DIR/.build-deploy.pending}"
# Total builds one invocation will run. Caps the worst case if pushes keep landing.
MAX_BUILD_ITERATIONS="${MAX_BUILD_ITERATIONS:-3}"
# The launchers pass hard-reset; manual runs default to the safer ff-only.
GIT_UPDATE_MODE="${GIT_UPDATE_MODE:-ff-only}"
# Set on the server (export, systemd Environment=, etc.) to your site docroot
DEPLOY_TARGET="${DEPLOY_TARGET:-$HOME/public_html}"
# The commit ac-api last started from, as far as deploys know. See restart_api_if_needed.
API_REV_FILE="${API_REV_FILE:-$REPO_DIR/.build-deploy.api-rev}"
# The commit the last publish put live. scripts/deploy-poll.sh builds when the
# branch is on any other commit.
LIVE_REV_FILE="${LIVE_REV_FILE:-$REPO_DIR/.build-deploy.live-rev}"
# What started this run, for the log and the Healthchecks ping.
DEPLOY_TRIGGER="${DEPLOY_TRIGGER:-${GITHUB_DELIVERY:+webhook $GITHUB_DELIVERY}}"
DEPLOY_TRIGGER="${DEPLOY_TRIGGER:-manual}"

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

# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/api-restart.sh"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/hc-ping.sh"

# --- Healthchecks deploy check ---
#
# Whatever starts this runs it detached (see scripts/deploy-detached.sh) and
# never learns how the deploy went. This script reports it instead: /start once
# it holds the lock, then its exit code when it ends. A run that dies without
# reaching the EXIT trap (SIGKILL, a reboot) leaves the check started, and
# Healthchecks marks it down once the check's grace time passes, so keep the
# grace time longer than the slowest deploy.
#
# DEPLOY_HEALTHCHECK_PING_URL comes from the environment (the launcher passes it
# on) or else from the repo's env file. Set it to empty to turn the pings off
# for a manual run. Only that one variable is read from the env file:
# sourcing the whole file here would change the build's environment.
#
# A delivery that coalesces into a running build sends nothing; the running
# build reports for both.
if [[ -z "${DEPLOY_HEALTHCHECK_PING_URL+x}" ]]; then
  DEPLOY_HEALTHCHECK_PING_URL="$(
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/load-env.sh" >/dev/null 2>&1 || true
    printf '%s' "${DEPLOY_HEALTHCHECK_PING_URL:-}"
  )"
fi
DEPLOY_PING_ACTIVE=1

# scripts/lib/hc-ping.sh never lets a failed ping change the deploy's result.
deploy_ping() {
  hc_ping "$DEPLOY_HEALTHCHECK_PING_URL" "$@"
}

# Body for the final ping: a summary line and the tail of this run's output.
# Healthchecks keeps the first 100 kB. $HOME is collapsed to ~ and the values of
# secret-looking environment variables are redacted, the same as the webhook
# used to do before it put a log in the GitHub run.
deploy_ping_body() {
  local code="$1" out="$2" tail="" name value
  if [[ -n "${DEPLOY_RUN_LOG:-}" && -r "$DEPLOY_RUN_LOG" ]]; then
    tail="$(tail -c 95000 "$DEPLOY_RUN_LOG" 2>/dev/null || true)"
  fi
  for name in $(compgen -e); do
    [[ "$name" =~ (SECRET|TOKEN|PASSWORD|PASS|KEY|CREDENTIAL|HMAC|PING_URL) ]] || continue
    value="${!name:-}"
    (( ${#value} >= 8 )) || continue
    tail="${tail//"$value"/[REDACTED]}"
  done
  if [[ -n "${HOME:-}" && "$HOME" != "/" ]]; then
    tail="${tail//"${HOME%/}"/\~}"
  fi
  {
    printf 'exit=%s head=%s trigger=%s\n' \
      "$code" "$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)" \
      "$DEPLOY_TRIGGER"
    if [[ -n "$tail" ]]; then
      printf -- '--- deploy output (tail) ---\n%s\n' "$tail"
    else
      printf '(no run log; see the deploy log on the server)\n'
    fi
  } >"$out"
}

deploy_ping_on_exit() {
  local code=$? body_file="" body_dir=""
  trap - EXIT
  if [[ "$DEPLOY_PING_ACTIVE" == 1 && -n "$DEPLOY_HEALTHCHECK_PING_URL" ]]; then
    if body_dir="$(mktemp -d 2>/dev/null)"; then
      body_file="$body_dir/body.txt"
      deploy_ping_body "$code" "$body_file" 2>/dev/null || body_file=""
    fi
    # Healthchecks reads /<exit code> as success for 0 and failure otherwise.
    deploy_ping "$code" "$body_file"
    [[ -z "$body_dir" ]] || rm -rf "$body_dir"
  fi
  exit "$code"
}
trap deploy_ping_on_exit EXIT
# Bash skips the EXIT trap when a signal kills it, so turn the usual ones into
# an exit. systemd stops a unit with SIGTERM.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

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
  if printf '%s coalesced trigger=%s\n' \
      "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$DEPLOY_TRIGGER" > "$PENDING_FILE"; then
    log "Another deploy is in flight; queued a pending rebuild and exiting 0. The running deploy will re-sync and build these commits. lock=$LOCK_FILE holder=${holder:-unknown}"
    # The running build reports to Healthchecks for this push too.
    DEPLOY_PING_ACTIVE=0
    exit 0
  fi
  # Without the marker the running build would never learn about this push, so
  # reporting success here would be a lie. Fail loudly instead.
  log "ERROR: another deploy holds the lock and the pending marker is not writable: $PENDING_FILE (whoami=$(whoami))"
  exit 1
fi

deploy_ping start

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

log "Deploy user=$(whoami) HOME=$HOME"

# Resolve Node from the tree just synced, not the one we started in, so the
# deploy that bumps .nvmrc already builds on the new version. With nvm, a version
# the server lacks is installed first (see nvm_pnpm__ensure_installed). A .nvmrc
# change also restarts ac-api at the end of the deploy (restart_api_if_needed),
# and scripts/healthcheck-api.sh, which does the restart, moves its PM2 daemon
# to the new Node.
init_node() {
  if ! nvm_pnpm_init; then
    log "ERROR: nvm_pnpm_init failed. whoami=$(whoami) HOME=$HOME PATH=$PATH"
    exit 127
  fi
  if [[ -n "${NVM_PNPM_RESOLVED_VERSION:-}" ]]; then
    log "Node=$(nvm exec "$NVM_PNPM_RESOLVED_VERSION" node -v) pnpm=$(nvm exec "$NVM_PNPM_RESOLVED_VERSION" command -v pnpm)"
  else
    log "Node=$(command -v node || echo missing) pnpm=$(command -v pnpm || echo missing)"
  fi
}

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

# Restart ac-api when this deploy changed what it runs. It keeps whatever it
# loaded at its last start, so without this a change to api/ or a dependency
# bump sits on disk unused. scripts/lib/api-restart.sh says what counts, and
# content-only deploys leave the API alone.
#
# API_REV_FILE moves to HEAD only after a restart that worked, or when nothing
# the API runs changed. A failed restart is therefore retried by the next
# deploy instead of forgotten, and fails this one (see the end of the script).
#
# Runs after the publish, so the API and the pages that call it change
# together, and before the smoke checks, so they probe the restarted API.
API_RESTART_FAILED=0
PDF_REFRESH_FAILED=0
restart_api_if_needed() {
  local head running="" reason
  head="$(git rev-parse HEAD)"
  if [[ -r "$API_REV_FILE" ]]; then
    running="$(tr -d '[:space:]' <"$API_REV_FILE")"
  fi

  if ! reason="$(api_restart_reason "$running")"; then
    log "ac-api restart not needed: nothing it runs changed since ${running:0:12}"
    printf '%s\n' "$head" >"$API_REV_FILE"
    API_RESTART_FAILED=0
    return 0
  fi

  log "Restarting ac-api: $reason"
  # 9>&- keeps the deploy lock out of the restart. A PM2 daemon spawned during
  # it would otherwise inherit the descriptor and hold the lock for as long as
  # it lives, and every later deploy would queue behind it.
  if /bin/bash "$REPO_DIR/scripts/restart-api.sh" 9>&-; then
    printf '%s\n' "$head" >"$API_REV_FILE"
    API_RESTART_FAILED=0
    log "ac-api restarted on $(git rev-parse --short HEAD)"
  else
    API_RESTART_FAILED=1
    log "ERROR: ac-api restart failed (output above). The next deploy will try again."
  fi
}

while :; do
  iteration=$((iteration + 1))

  git_sync
  # Clear the marker only AFTER syncing: any request made before this point is
  # already contained in the tree we just checked out. A marker appearing from
  # here on is a genuinely newer push and earns another iteration.
  rm -f "$PENDING_FILE"
  log "Building $(git rev-parse --short HEAD) on $GIT_BRANCH (iteration $iteration/$MAX_BUILD_ITERATIONS)"
  init_node

  if superseded "pnpm install"; then continue; fi

  # pnpm's strict, content-addressable store + --frozen-lockfile guarantee node_modules
  # matches pnpm-lock.yaml exactly (no stale nested folders shadowing top-level versions,
  # unlike yarn v1). So no hash-based clean-install dance is needed here.
  nvm_pnpm install --frozen-lockfile --prefer-offline --fetch-timeout 100000
  # The guide PDF step needs the Chromium build that matches this Playwright
  # version. A no-op when it is already there; after a Playwright bump it
  # downloads the new one. Its system libraries are in ~/.local/lib/chromium-deps
  # (see scripts/build-pdfs.mjs).
  nvm_pnpm exec playwright install chromium-headless-shell
  export NODE_ENV=production

  # Last abort checkpoint. `buildstatic` itself is not interruptible: killing it
  # mid-run would leave .next/ half-written, and there is no checkpoint after it
  # because what we just built is already newer than what is live — publish it and
  # let the next iteration handle anything newer still.
  if superseded "the static build"; then continue; fi

  # Non-interactive: no URL approval prompt; does not write .approved-urls.json.
  # PDF_DEFER: guide PDFs that changed but have an older copy ship that copy
  # now and are rendered after the publish below (see scripts/build-pdfs.mjs).
  CHECKBUILD_URL_APPROVAL=allow BUILD_MODE=static PDF_DEFER=1 nvm_pnpm buildstatic

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

  # Publish in two passes so the docroot is never a new _next/ tree next to old
  # page HTML.
  #
  # rsync walks in byte order and "_next" (0x5F) sorts before every lowercase
  # page directory (0x61+), so a single --delete pass replaced the chunks and
  # deleted the old ones seconds-to-tens-of-seconds before it rewrote, say,
  # proton/index.html — en/, es/, files/ and images/ all copy in between, and a
  # new build id changes every HTML file, so none of that is a no-op. Anyone
  # loading a page in that window got the previous build's HTML pointing at
  # chunks that were already gone: the page rendered, then died on hydration
  # with a ChunkLoadError.
  #
  # Pass 1 lays the new build down beside the old one. Nothing is removed, so
  # old and new HTML both still have chunks to load. Pass 2 removes what the new
  # build no longer references, by which point every page on disk is new. It
  # transfers nothing, so it is quick.
  log "Publishing pass 1/2 (add and update, no deletes) → $DEPLOY_TARGET"
  rsync -a "${RSYNC_PERMS[@]}" "${RSYNC_EXCLUDE[@]}" "$REPO_DIR/out/" "$DEPLOY_TARGET/"

  # A page fetched in the closing moments of pass 1 still has to come back for
  # its chunks. Hold briefly so those requests land before pass 2 deletes the
  # old ones. Set DEPLOY_SETTLE_SECONDS=0 to skip.
  settle="${DEPLOY_SETTLE_SECONDS:-5}"
  if [[ "$settle" != "0" ]]; then
    log "Settling ${settle}s so in-flight page loads can finish fetching chunks"
    sleep "$settle"
  fi

  log "Publishing pass 2/2 (prune files the new build dropped) → $DEPLOY_TARGET"
  rsync -a --delete "${RSYNC_PERMS[@]}" "${RSYNC_EXCLUDE[@]}" "$REPO_DIR/out/" "$DEPLOY_TARGET/"

  # Recorded as soon as the docroot holds it, before the steps below that can
  # still fail the run: those are retried by the next deploy, and a rebuild
  # would not fix them. A missing record costs one rebuild, so it only warns.
  if git rev-parse HEAD >"$LIVE_REV_FILE.tmp" && mv -f "$LIVE_REV_FILE.tmp" "$LIVE_REV_FILE"; then
    log "Live: $(git rev-parse --short HEAD)"
  else
    log "WARN: could not record the live commit in $LIVE_REV_FILE"
  fi

  # A newer push is queued and the next iteration will publish it, so leave the
  # API restart, smoke checks and deferred PDFs to that iteration rather than
  # doing them twice. API_REV_FILE does not move, so the API still restarts
  # when that iteration (or, if it fails, the next deploy) reaches this point.
  # Until then the API runs the code it had before this deploy, as it did
  # during the build. A PDF left stale here stays stale in .pdf-cache.json, so
  # the next build lists it again.
  if [[ -e "$PENDING_FILE" ]] && (( iteration < MAX_BUILD_ITERATIONS )); then
    log "Published $(git rev-parse --short HEAD). A newer push is queued, so the API restart, smoke checks and PDF refresh wait for its build."
    continue
  fi

  restart_api_if_needed

  # Post-deploy smoke checks (informational only; deploy already published).
  SITE_URL="${SITE_URL:-https://activistchecklist.org}"
  SMOKE_GUIDE_PATH="${SMOKE_GUIDE_PATH:-/essentials/}"
  SMOKE_FAILED=0

  # grep without -q, so it reads the whole page. With -q it stops at the first
  # match, curl then fails writing the rest (exit 23), and pipefail turns that
  # into a failed check: it warned on every deploy while the site was fine.
  if ! curl -fsS --max-time 15 "$SITE_URL/" | grep -i "Activist Checklist" >/dev/null; then
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

  # Guide PDFs the build deferred: their pages are live with the previous PDF,
  # so render the new ones now and copy them over it. rsync writes each file
  # under a temporary name and renames it, so a download never gets half a
  # PDF. A failure keeps the previous PDF live and fails this deploy, and the
  # next build lists the PDF again.
  if [[ -s "$REPO_DIR/.pdf-deferred.json" ]]; then
    log "Rendering the guide PDFs this build deferred"
    if nvm_pnpm pdfs:deferred; then
      PDF_REFRESH_FAILED=0
    else
      PDF_REFRESH_FAILED=1
      log "ERROR: some deferred guide PDFs failed to render (output above); their previous PDFs stay live."
    fi
    # Publishes whatever did render, even after a partial failure.
    rsync -a "${RSYNC_PERMS[@]}" "$REPO_DIR/out/pdf/" "$DEPLOY_TARGET/pdf/"
    log "Published the re-rendered guide PDFs"
  else
    PDF_REFRESH_FAILED=0
  fi

  log "Deploy finished → $DEPLOY_TARGET"

  [[ -e "$PENDING_FILE" ]] || break
  if (( iteration >= MAX_BUILD_ITERATIONS )); then
    log "WARN: a pending rebuild is still queued after $MAX_BUILD_ITERATIONS iterations. The newest commits are NOT live; push again or run this script manually."
    break
  fi
  log "A newer push arrived during this run; rebuilding."
done

# Fail the deploy so it shows up on the GitHub run, even though the site itself
# is live: the API is still on code this deploy was meant to replace.
if [[ "$API_RESTART_FAILED" == 1 ]]; then
  log "ERROR: the site is published, but ac-api did not restart onto it. scripts/restart-api.sh on the server retries it by hand."
  exit 1
fi
# Same for guide PDFs: the pages are new, but some of their PDFs are not.
if [[ "$PDF_REFRESH_FAILED" == 1 ]]; then
  log "ERROR: the site is published, but some guide PDFs are still the previous version. The next deploy renders them again."
  exit 1
fi
