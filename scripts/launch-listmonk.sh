#!/usr/bin/env bash
#
# Start (or restart) listmonk under PM2 on the newsletter server.
#
# Called by scripts/healthcheck-listmonk.sh, and safe to run by hand.
#
# IMPORTANT: this runs from cron, which does NOT source ~/.bashrc. Everything an
# interactive shell gets from .bashrc - nvm's bin dir on PATH, and PM2_HOME - has
# to be set up explicitly here. Without it `pm2` is simply not found, and because
# the caller used to discard output the restart failed silently every 5 minutes.
#
# Required env (see .env.production on the newsletter server):
#   LISTMONK_BIN    — absolute path to the listmonk binary
#   LISTMONK_CONFIG — absolute path to config.toml
#
# Optional env:
#   LISTMONK_STATIC_DIR   — --static-dir passed to listmonk
#   LISTMONK_PM2_HOME     — PM2 state dir; MUST match the PM2_HOME your shell uses,
#                           or cron talks to a second, separate PM2 daemon
#   LISTMONK_PM2_APP_NAME — PM2 process name (default: listmonk)
#   LISTMONK_NVM_DIR      — nvm install dir to source for node/pm2 on PATH
#   LISTMONK_PATH_EXTRA   — extra PATH prefix if pm2 lives outside nvm
#   LISTMONK_PM2_SCOPE    — 0 to skip the systemd scope described below
#
# IMPORTANT (systemd): May First now runs scheduled jobs as Type=oneshot user
# units. Those default to KillMode=control-group, so when the job's script exits
# systemd SIGTERMs everything left in the unit's cgroup - including the PM2 God
# daemon this script just started, and listmonk with it. The job looks like it
# succeeded, which is worse than failing: the service comes up for a few seconds
# and is killed on the way out. ensure_pm2_daemon() below starts the daemon in a
# separate transient scope so it survives our exit.
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"

APP_NAME="${LISTMONK_PM2_APP_NAME:-listmonk}"
LISTMONK_BIN="${LISTMONK_BIN:-}"
LISTMONK_CONFIG="${LISTMONK_CONFIG:-}"
LISTMONK_STATIC_DIR="${LISTMONK_STATIC_DIR:-}"

if [[ -z "$LISTMONK_BIN" || -z "$LISTMONK_CONFIG" ]]; then
  echo "FATAL: set LISTMONK_BIN and LISTMONK_CONFIG (see .env.production)" >&2
  exit 1
fi

if [[ ! -x "$LISTMONK_BIN" ]]; then
  echo "FATAL: listmonk binary missing or not executable: $LISTMONK_BIN" >&2
  exit 1
fi

# --- cron-safe environment bootstrap ---
[[ -n "${LISTMONK_PATH_EXTRA:-}" ]] && export PATH="$LISTMONK_PATH_EXTRA:$PATH"
if [[ -n "${LISTMONK_NVM_DIR:-}" && -s "$LISTMONK_NVM_DIR/nvm.sh" ]]; then
  export NVM_DIR="$LISTMONK_NVM_DIR"
  # nvm refuses to load when npm_config_prefix is inherited from a prior setup.
  unset npm_config_prefix NPM_CONFIG_PREFIX
  # shellcheck disable=SC1091
  \. "$NVM_DIR/nvm.sh"
fi
[[ -n "${LISTMONK_PM2_HOME:-}" ]] && export PM2_HOME="$LISTMONK_PM2_HOME"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "FATAL: pm2 not found on PATH ($PATH)." >&2
  echo "       Set LISTMONK_NVM_DIR or LISTMONK_PATH_EXTRA - cron does not read ~/.bashrc." >&2
  exit 1
fi

echo "launch-listmonk: pm2=$(command -v pm2) node=$(command -v node || echo none) PM2_HOME=${PM2_HOME:-<default>}"

pm2_daemon_pid() {
  local pidfile="${PM2_HOME:-$HOME/.pm2}/pm2.pid" pid
  [[ -r "$pidfile" ]] || return 1
  pid="$(cat "$pidfile" 2>/dev/null)" || return 1
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

# cgroup path of a pid (systemd unified hierarchy), empty when unavailable.
proc_cgroup() {
  local pid="$1"
  [[ -r "/proc/$pid/cgroup" ]] || return 0
  awk -F: '$1 == "0" { print $3; exit }' "/proc/$pid/cgroup" 2>/dev/null || true
}

# Start the PM2 God daemon inside its own transient systemd scope, so it lives in
# a different cgroup than this (possibly Type=oneshot) job and is not reaped when
# we exit. Ordering matters: the PM2 CLI auto-spawns the daemon on ANY command,
# `pm2 list` included, so this must run before every other pm2 invocation.
ensure_pm2_daemon() {
  [[ "${LISTMONK_PM2_SCOPE:-1}" == "0" ]] && return 0
  # Already running: it either survived, or a prior run placed it correctly.
  pm2_daemon_pid >/dev/null && return 0
  command -v systemd-run >/dev/null 2>&1 || return 0

  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  [[ -d "$XDG_RUNTIME_DIR" ]] || return 0

  # --collect reaps the scope once it is empty; the scope itself stays alive as
  # long as the daemon holds a process in it.
  if systemd-run --user --scope --quiet --collect \
    --unit="listmonk-pm2-daemon-$$" -- pm2 ping >/dev/null 2>&1; then
    echo "launch-listmonk: PM2 daemon started in its own systemd scope"
  else
    echo "launch-listmonk: WARN systemd-run scope failed; PM2 may be reaped when this job exits" >&2
  fi
}

# Warn when the daemon shares our cgroup, which means systemd will kill it the
# moment this script returns. Purely diagnostic, but this is the exact condition
# that let a green health check sit on top of a dead service.
warn_if_pm2_shares_our_cgroup() {
  local pid ours theirs
  pid="$(pm2_daemon_pid)" || return 0
  ours="$(proc_cgroup "$$")"
  theirs="$(proc_cgroup "$pid")"
  [[ -n "$ours" && -n "$theirs" ]] || return 0
  if [[ "$ours" == "$theirs" ]]; then
    echo "launch-listmonk: WARN PM2 daemon (pid $pid) is in this job's cgroup ($ours)." >&2
    echo "                 A Type=oneshot unit will SIGTERM it when this script exits." >&2
  fi
}

ensure_pm2_daemon

# Delete then start so a wedged process never lingers into the new run.
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true

start_args=(--config "$LISTMONK_CONFIG")
[[ -n "$LISTMONK_STATIC_DIR" ]] && start_args+=(--static-dir "$LISTMONK_STATIC_DIR")

pm2 start "$LISTMONK_BIN" --name "$APP_NAME" --interpreter none -- "${start_args[@]}"
start_rc=$?

# Persist the process list so `pm2 resurrect` has something to restore.
pm2 save >/dev/null 2>&1 || true

warn_if_pm2_shares_our_cgroup

exit $start_rc
