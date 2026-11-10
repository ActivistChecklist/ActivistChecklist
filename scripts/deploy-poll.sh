#!/usr/bin/env bash
#
# Deploys the branch when it moves. A scheduled job on the web host runs this
# every minute. It asks the git remote which commit the branch is on, and when
# that is not the commit that is live, it starts scripts/build-deploy.sh in a
# unit of its own (through scripts/deploy-detached.sh) and exits. Nothing on the
# site accepts deploy requests, and the repo is public, so asking the remote
# needs no credentials.
#
# Point the job at this file's absolute path, with no arguments and no shell
# syntax around it. It needs git, flock, curl and systemd-run on the PATH.
#
# State, all at the repo root and gitignored:
#   .build-deploy.live-rev  the commit build-deploy.sh last published
#   .build-deploy.lock      held by build-deploy.sh while a build runs
#   .build-deploy.pending   asks a running build to go round again
#   .build-deploy.poll      the commit this script last started a build for,
#                           and how many times
#
# Failed builds: a commit that does not go live is built DEPLOY_POLL_MAX_ATTEMPTS
# times (default 2), then left until the branch moves again, so a broken commit
# does not rebuild every minute. Each failure reaches the Healthchecks deploy
# check (DEPLOY_HEALTHCHECK_PING_URL, see build-deploy.sh). To try again sooner,
# push a fix or delete .build-deploy.poll.
#
# Liveness: DEPLOY_POLL_PING_URL gets a ping on every run that got an answer
# from the remote. Give that check a period of a few minutes. Without it, a job
# that has stopped running looks the same as nobody pushing. A run that cannot
# reach the remote, or cannot start a build, logs to the check (/log) without
# changing its state, so a short outage at the remote does not page anyone and
# a long one shows up as missed pings.
#
# Settings come from the repo's env file (scripts/load-env.sh); see the
# deploy-poll section of .env.template. Only the names build_env_names matches
# reach the build, so the rest of the env file does not change its environment.
#
set -euo pipefail

# Everything lives in main() so bash has read the whole script before a build
# rewrites this file in the checkout.
main() {
  local SCRIPT_DIR REPO_DIR
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/load-env.sh" || return 1
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/log.sh"
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/lib/hc-ping.sh"
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/lib/deploy-poll.sh"

  init_scripts_file_log "$(resolve_server_log_dir "$REPO_DIR")" "deploy-poll.log" \
    "$(resolve_server_log_lines_keep)"

  local branch="${DEPLOY_BRANCH:-main}"
  local max_tries="${DEPLOY_POLL_MAX_ATTEMPTS:-2}"
  local ping_url="${DEPLOY_POLL_PING_URL:-}"
  local lock_file="$REPO_DIR/.build-deploy.lock"
  local pending_file="$REPO_DIR/.build-deploy.pending"
  local live_file="$REPO_DIR/.build-deploy.live-rev"
  local state_file="$REPO_DIR/.build-deploy.poll"

  # Logs one line, and sends it to the check without changing its state. The
  # check is a third-party service, so these lines name files relative to the
  # repo and never print server paths.
  report() {
    log "$1"
    trim_log
    hc_ping "$ping_url" log <(printf '%s\n' "$1")
  }

  if [[ -z "${DEPLOY_TARGET:-}" ]]; then
    report "ERROR: DEPLOY_TARGET is not set in the env file, so there is nowhere to publish"
    return 1
  fi
  local tool
  for tool in git flock curl systemd-run; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      report "ERROR: $tool is not on the job's PATH"
      return 1
    fi
  done

  local remote
  if ! remote="$(
    cd "$REPO_DIR" &&
      GIT_TERMINAL_PROMPT=0 timeout_cmd 60 git ls-remote origin "refs/heads/$branch" |
      deploy_poll_parse_remote
  )"; then
    report "WARN: could not read refs/heads/$branch from origin; trying again next run"
    return 1
  fi

  local live="" checkout tried="" tries=0 building=0 lock_rc=0
  if [[ -r "$live_file" ]]; then
    live="$(tr -d '[:space:]' <"$live_file")"
  fi
  checkout="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [[ -r "$state_file" ]]; then
    read -r tried tries _ <"$state_file" || true
  fi
  # Gives up at once, with 75, while build-deploy.sh holds the lock. Anything
  # else is a broken probe, and guessing either way could stall deploys.
  if [[ -e "$lock_file" ]]; then
    flock -n -E 75 "$lock_file" true || lock_rc=$?
    case "$lock_rc" in
      0) ;;
      75) building=1 ;;
      *)
        report "ERROR: flock could not probe .build-deploy.lock (exit $lock_rc)"
        return 1
        ;;
    esac
  fi

  local decision short="${remote:0:12}" live_short="${live:0:12}"
  live_short="${live_short:-none}"
  decision="$(deploy_poll_decide "$remote" "$live" "$building" "$checkout" "$tried" "$tries" "$max_tries")"

  case "$decision" in
    idle) ;;
    queue)
      # build-deploy.sh clears the marker each time it syncs, so this is
      # written, and logged, once per build.
      if [[ ! -e "$pending_file" ]]; then
        printf '%s queued by deploy-poll for %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$short" >"$pending_file"
        log "A build of ${checkout:0:12} is running; asked it to build $short next"
        trim_log
      fi
      ;;
    give-up)
      # Said once per commit: the count goes one past the limit afterwards.
      if [[ "$tries" == "$max_tries" ]]; then
        log "ERROR: $max_tries builds of $short did not put it live; waiting for a new commit (or delete .build-deploy.poll to retry)"
        trim_log
        printf '%s %s\n' "$remote" "$((max_tries + 1))" >"$state_file"
      fi
      ;;
    start*)
      local attempt="${decision#start }" launched
      printf '%s %s\n' "$remote" "$attempt" >"$state_file"
      if ! launched="$(launch_build "$REPO_DIR" "$SCRIPT_DIR" "$branch" "$short")"; then
        # Not counted, so the next run tries again.
        printf '%s %s\n' "$remote" "$((attempt - 1))" >"$state_file"
        report "ERROR: could not start a build of $short; trying again next run: ${launched:0:200}"
        return 1
      fi
      log "Started a build of $short (attempt $attempt of $max_tries) as $launched; live was ${live_short}"
      trim_log
      ;;
  esac

  hc_ping "$ping_url" "" <(printf '%s remote=%s live=%s\n' "$decision" "$short" "$live_short")
}

# timeout <seconds> <cmd...> where coreutils has it, else the command as is.
timeout_cmd() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  else
    "$@"
  fi
}

# The exported names the build gets: what it needs to find Node and pnpm, where
# to publish, and how to report.
build_env_names() {
  compgen -e | grep -E '^(REPO_DIR|GIT_BRANCH|GIT_UPDATE_MODE|DEPLOY_TARGET|DEPLOY_SCRIPT|DEPLOY_LOG|DEPLOY_LAUNCHER|DEPLOY_TRIGGER|DEPLOY_HEALTHCHECK_PING_URL|DEPLOY_SETTLE_SECONDS|MAX_BUILD_ITERATIONS|HOME|USER|LOGNAME|PATH|LANG|TMPDIR|TMP|TEMP|(NVM_PNPM|BUILD_DEPLOY)_[A-Z0-9_]+)$' || true
}

# launch_build <repo_dir> <script_dir> <branch> <short_rev>
#
# Starts scripts/deploy-detached.sh as a transient systemd user unit and prints
# its name, or prints systemd-run's output and returns 1. The build gets a unit
# of its own rather than running inside this job, so it is not stopped when the
# job exits and is not held to the job's resource limits (scripts/healthcheck-api.sh
# has the same issue with PM2).
#
# Values reach the unit as --setenv=NAME, which copies them from systemd-run's
# environment, so secrets never appear in argv.
launch_build() {
  local repo_dir="$1" script_dir="$2" branch="$3" short="$4"
  local unit out
  unit="ac-deploy-$(date -u +%Y%m%d-%H%M%S)-$short"

  export REPO_DIR="$repo_dir"
  export GIT_BRANCH="$branch"
  # hard-reset: the checkout is a build tree and always matches the remote.
  export GIT_UPDATE_MODE="${DEPLOY_GIT_UPDATE_MODE:-hard-reset}"
  export DEPLOY_SCRIPT="$script_dir/build-deploy.sh"
  export DEPLOY_LOG="${DEPLOY_LOG:-$repo_dir/.deploy.log}"
  export DEPLOY_TRIGGER="deploy-poll $short"
  export DEPLOY_LAUNCHER=systemd-run

  local -a setenv=()
  local name
  while IFS= read -r name; do
    setenv+=("--setenv=$name")
  done < <(build_env_names)

  # systemd-run finds the user manager through XDG_RUNTIME_DIR.
  if ! out="$(
    XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}" systemd-run --user --quiet --collect \
      --unit="$unit" --working-directory="$repo_dir" "${setenv[@]}" \
      -- /bin/bash --noprofile --norc "$script_dir/deploy-detached.sh" </dev/null 2>&1
  )"; then
    printf '%s' "$(head -n 1 <<<"${out:-systemd-run failed}")"
    return 1
  fi
  printf '%s' "$unit"
}

main "$@"
