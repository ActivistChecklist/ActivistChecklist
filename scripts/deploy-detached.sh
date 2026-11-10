#!/usr/bin/env bash
#
# Runs the deploy script and archives its output. scripts/deploy-poll.sh starts
# it as a transient systemd user unit when the branch moves, so the build runs
# apart from the scheduled job that noticed the new commit. Nothing waits on the
# result: scripts/build-deploy.sh reports it to the Healthchecks deploy check
# itself (see "Healthchecks deploy check" there).
#
# The unit is Type=simple with KillMode=control-group, so when this script exits
# systemd kills anything still in its cgroup. The ac-api restart is safe: the
# health check it runs puts the PM2 daemon in a unit of its own first.
#
# Environment (all set by whatever starts it):
#   REPO_DIR            repo checkout (required)
#   DEPLOY_SCRIPT       deploy script to run (default: scripts/build-deploy.sh)
#   DEPLOY_LOG          file to append this run's output to; empty disables it
#   DEPLOY_LAUNCHER     how this run was started, for the log
#   DEPLOY_TRIGGER      what started it, for the log
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
export REPO_DIR
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-$SCRIPT_DIR/build-deploy.sh}"
DEPLOY_LOG="${DEPLOY_LOG:-}"
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
  # Cap the log: past 1 MB, keep the last 200 kB. Still under the lock, and
  # rewritten in place so the file keeps its owner and mode.
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
