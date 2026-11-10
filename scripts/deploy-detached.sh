#!/usr/bin/env bash
#
# Runs the deploy script in the background and archives its output.
# scripts/deploy-poll.sh starts it when the branch moves, as a transient systemd
# user unit, and public/webhooks/deploy.php starts it after answering 202 while
# that webhook is still in use.
#
# Why detached: May First's front proxy gives up on a request after about 5
# minutes and returns 504. A deploy that bumps dependencies (pnpm install, the
# static build, an ac-api restart) can take longer than that, and the 504 used to
# turn the GitHub run and the Healthchecks deploy check red while the build was
# still running and went on to publish. Now deploy.php starts this script and
# returns at once, and scripts/build-deploy.sh pings the deploy check itself with
# the real result (see "Healthchecks deploy check" there).
#
# How deploy.php starts it, best first:
#   1. `systemd-run --user --unit=ac-deploy-…`: a transient unit of the site
#      user's systemd manager. PHP-FPM runs in php8.4-fpm.service, a system unit
#      with KillMode=control-group, so anything left in its cgroup dies when
#      PHP-FPM restarts. A transient unit has its own cgroup. (`--scope` does not
#      work on May First; see the systemd notes in scripts/healthcheck-api.sh.)
#   2. `setsid -f`, when there is no user manager (it can be down after a reboot).
#      It survives the request ending but not a PHP-FPM restart.
# DEPLOY_LAUNCHER says which one, and is written to the log.
#
# The unit is Type=simple with KillMode=control-group, so when this script exits
# systemd kills anything still in its cgroup. The ac-api restart is safe: the
# health check it runs puts the PM2 daemon in a unit of its own first.
#
# Environment (all set by whatever starts it):
#   REPO_DIR            repo checkout (required)
#   DEPLOY_SCRIPT       deploy script to run (default: scripts/build-deploy.sh)
#   DEPLOY_LOG          file to append this run's output to; empty disables it
#                       (deploy.php sets DEPLOY_WEBHOOK_LOG instead)
#   DEPLOY_LAUNCHER     how this run was started, for the log
#   DEPLOY_TRIGGER      what started it, for the log (deploy.php sets
#                       GITHUB_DELIVERY instead)
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
export REPO_DIR
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-$SCRIPT_DIR/build-deploy.sh}"
DEPLOY_LOG="${DEPLOY_LOG:-${DEPLOY_WEBHOOK_LOG:-}}"
DEPLOY_TRIGGER="${DEPLOY_TRIGGER:-${GITHUB_DELIVERY:+webhook $GITHUB_DELIVERY}}"
export DEPLOY_TRIGGER="${DEPLOY_TRIGGER:-manual}"

utc_now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# The run's output stays private until it is archived: it can name paths and
# accounts on the server.
umask 077
run_dir="$(mktemp -d)" || {
  echo "deploy-detached: mktemp -d failed" >&2
  exit 1
}
run_log="$run_dir/run.log"

started_at="$(utc_now)"
start_s="$(date +%s)"

# build-deploy.sh reads DEPLOY_RUN_LOG to attach its own output to the
# Healthchecks ping.
DEPLOY_RUN_LOG="$run_log" /bin/bash --noprofile --norc "$DEPLOY_SCRIPT" \
  </dev/null >"$run_log" 2>&1
code=$?
duration_s=$(($(date +%s) - start_s))

archived=0
if [[ -n "$DEPLOY_LOG" ]]; then
  # flock serializes appends with any other run finishing at the same moment.
  if {
    exec 8>>"$DEPLOY_LOG" &&
      flock 8 &&
      {
        printf '\n[%s] START trigger=%s launcher=%s\n' \
          "$started_at" "$DEPLOY_TRIGGER" "${DEPLOY_LAUNCHER:-unknown}"
        cat "$run_log"
        printf '[%s] END exit=%d duration=%ds\n' "$(utc_now)" "$code" "$duration_s"
      } >&8
  } 2>/dev/null; then
    archived=1
  fi
  # Cap the log the way deploy.php caps its early log: past 1 MB, keep the last
  # 200 kB. Still under the lock, and rewritten in place so the file keeps its
  # owner and mode.
  if [[ "$archived" == 1 ]]; then
    log_size="$(wc -c <"$DEPLOY_LOG" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$log_size" =~ ^[0-9]+$ ]] && ((log_size > 1000000)); then
      if tail -c 200000 "$DEPLOY_LOG" >"$run_dir/log.tail" 2>/dev/null; then
        { printf -- '---- truncated ----\n'; cat "$run_dir/log.tail"; } >"$DEPLOY_LOG" 2>/dev/null || true
      fi
    fi
  fi
  exec 8>&- 2>/dev/null || true
fi

if [[ -z "$DEPLOY_LOG" || "$archived" == 1 ]]; then
  rm -rf "$run_dir"
else
  # Keep the output so it can be recovered by hand. This lands in the unit's
  # journal (or nowhere, under setsid); the path holds no secrets.
  echo "deploy-detached: could not append to the deploy log; this run's output is at $run_log" >&2
fi

exit "$code"
