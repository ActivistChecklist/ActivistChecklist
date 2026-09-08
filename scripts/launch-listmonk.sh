#!/usr/bin/env bash
#
# Start (or restart) listmonk on the newsletter server.
#
# Called by scripts/healthcheck-listmonk.sh, and safe to run by hand.
#
# Two backends, picked automatically (override with LISTMONK_SERVICE_MANAGER):
#
#   systemd — preferred. Runs listmonk as a transient user unit and lets systemd
#             supervise it with Restart=always, so a crash is recovered in
#             seconds instead of waiting for the next health check.
#   pm2     — fallback for hosts with no systemd user manager. Historic default.
#
# WHY systemd IS PREFERRED HERE (do not "simplify" this back to plain PM2):
# May First runs scheduled jobs as Type=oneshot user units, and those default to
# KillMode=control-group. When the job's script exits, systemd SIGTERMs
# everything left in the unit's cgroup - including a PM2 daemon the script just
# started, and listmonk with it. The job still exits 0, so the health check
# pinged green while listmonk was alive for ~7 seconds out of every 5 minutes.
#
# The obvious escape - `systemd-run --user --scope` - does NOT work on this host:
#   listmonk-pm2-daemon.scope: Couldn't move process ... Input/output error
#   listmonk-pm2-daemon.scope: Failed to add PIDs to scope's control group: Permission denied
# A scope has to migrate an already-running PID into a new cgroup, and cgroup
# delegation is restricted here. `systemd-run --user --unit=` works, because
# systemd forks the process directly into the new cgroup and never has to move
# it. Installing a unit file is also out: ~/.config/systemd/user is root-owned,
# reserved for the units the control panel generates.
#
# Required env (see .env.production on the newsletter server):
#   LISTMONK_BIN    — absolute path to the listmonk binary
#   LISTMONK_CONFIG — absolute path to config.toml
#
# Optional env:
#   LISTMONK_STATIC_DIR       — --static-dir passed to listmonk
#   LISTMONK_SERVICE_MANAGER  — auto (default) | systemd | pm2
#   LISTMONK_SYSTEMD_UNIT     — unit name (default: listmonk.service)
#   LISTMONK_PM2_HOME         — PM2 state dir; MUST match the PM2_HOME your shell uses,
#                               or cron talks to a second, separate PM2 daemon
#   LISTMONK_PM2_APP_NAME     — PM2 process name (default: listmonk)
#   LISTMONK_NVM_DIR          — nvm install dir to source for node/pm2 on PATH
#   LISTMONK_PATH_EXTRA       — extra PATH prefix if pm2 lives outside nvm
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"

APP_NAME="${LISTMONK_PM2_APP_NAME:-listmonk}"
LISTMONK_BIN="${LISTMONK_BIN:-}"
LISTMONK_CONFIG="${LISTMONK_CONFIG:-}"
LISTMONK_STATIC_DIR="${LISTMONK_STATIC_DIR:-}"
SERVICE_MANAGER="${LISTMONK_SERVICE_MANAGER:-auto}"
SYSTEMD_UNIT="${LISTMONK_SYSTEMD_UNIT:-listmonk.service}"

if [[ -z "$LISTMONK_BIN" || -z "$LISTMONK_CONFIG" ]]; then
  echo "FATAL: set LISTMONK_BIN and LISTMONK_CONFIG (see .env.production)" >&2
  exit 1
fi

if [[ ! -x "$LISTMONK_BIN" ]]; then
  echo "FATAL: listmonk binary missing or not executable: $LISTMONK_BIN" >&2
  exit 1
fi

# --- systemd backend ---------------------------------------------------------

systemd_available() {
  command -v systemctl >/dev/null 2>&1 || return 1
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  [[ -d "$XDG_RUNTIME_DIR" ]] || return 1
  systemctl --user show-environment >/dev/null 2>&1
}

# A TRANSIENT unit, not an installed unit file: ~/.config/systemd/user is
# root-owned on May First, so we cannot drop a .service file there and
# `systemctl --user enable` is not available to us. systemd-run is.
#
# The tradeoff is that a transient unit does not survive a reboot. That is no
# worse than the PM2 setup it replaces (there is no `pm2 startup` here either),
# and the health check timer recreates it within 5 minutes of boot.
launch_with_systemd() {
  local unit_base="${SYSTEMD_UNIT%.service}"
  local args=(--config "$LISTMONK_CONFIG")
  [[ -n "$LISTMONK_STATIC_DIR" ]] && args+=(--static-dir "$LISTMONK_STATIC_DIR")

  command -v systemd-run >/dev/null 2>&1 || return 1

  # A transient unit vanishes when stopped, so there is nothing to restart into;
  # always tear down and recreate rather than branching on current state.
  systemctl --user stop "$SYSTEMD_UNIT" >/dev/null 2>&1 || true
  systemctl --user reset-failed "$SYSTEMD_UNIT" >/dev/null 2>&1 || true

  # Restart=always is the real win over PM2 here: a crash is recovered in
  # seconds by systemd instead of waiting out the next health check.
  systemd-run --user --unit="$unit_base" \
    --description="listmonk newsletter" \
    --property=Restart=always \
    --property=RestartSec=5 \
    --property=WorkingDirectory="$(dirname "$LISTMONK_CONFIG")" \
    -- "$LISTMONK_BIN" "${args[@]}" >/dev/null 2>&1 || return 1

  echo "launch-listmonk: started $SYSTEMD_UNIT via systemd-run (Restart=always)"
  systemctl --user is-active "$SYSTEMD_UNIT"

  if [[ "$(loginctl show-user "$(id -u)" -p Linger --value 2>/dev/null)" != "yes" ]]; then
    echo "launch-listmonk: WARN lingering is off; the user manager (and listmonk) stops at logout." >&2
    echo "                 Fix with: loginctl enable-linger \$(whoami)" >&2
  fi
}

# --- pm2 backend -------------------------------------------------------------

launch_with_pm2() {
  # cron/systemd jobs do not source ~/.bashrc, which is the only place nvm's bin
  # dir and PM2_HOME get set. Without this pm2 is simply not found, and because
  # the caller used to discard output the restart failed silently every 5 minutes.
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
    return 1
  fi

  echo "launch-listmonk: pm2=$(command -v pm2) node=$(command -v node || echo none) PM2_HOME=${PM2_HOME:-<default>}"

  # Delete then start so a wedged process never lingers into the new run.
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true

  local start_args=(--config "$LISTMONK_CONFIG")
  [[ -n "$LISTMONK_STATIC_DIR" ]] && start_args+=(--static-dir "$LISTMONK_STATIC_DIR")

  pm2 start "$LISTMONK_BIN" --name "$APP_NAME" --interpreter none -- "${start_args[@]}"
  local rc=$?

  # Persist the process list so `pm2 resurrect` has something to restore.
  pm2 save >/dev/null 2>&1 || true

  warn_if_pm2_shares_our_cgroup
  return $rc
}

# Diagnostic for the PM2 path: if the daemon ended up in our own cgroup and we
# were run from a Type=oneshot unit, systemd kills it the moment we return. This
# is the exact condition that kept a green health check on top of a dead service.
warn_if_pm2_shares_our_cgroup() {
  local pidfile="${PM2_HOME:-$HOME/.pm2}/pm2.pid" pid ours theirs
  [[ -r "$pidfile" ]] || return 0
  pid="$(cat "$pidfile" 2>/dev/null)" || return 0
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || return 0
  ours="$(awk -F: '$1 == "0" { print $3; exit }' "/proc/$$/cgroup" 2>/dev/null)"
  theirs="$(awk -F: '$1 == "0" { print $3; exit }' "/proc/$pid/cgroup" 2>/dev/null)"
  [[ -n "$ours" && -n "$theirs" && "$ours" == "$theirs" ]] || return 0
  echo "launch-listmonk: WARN PM2 daemon (pid $pid) is in this job's cgroup ($ours)." >&2
  echo "                 A Type=oneshot unit will SIGTERM it when this script exits." >&2
}

# --- dispatch ----------------------------------------------------------------

case "$SERVICE_MANAGER" in
  systemd)
    launch_with_systemd
    exit $?
    ;;
  pm2)
    launch_with_pm2
    exit $?
    ;;
  auto)
    if systemd_available; then
      launch_with_systemd && exit 0
      echo "launch-listmonk: systemd backend failed; falling back to pm2" >&2
    fi
    launch_with_pm2
    exit $?
    ;;
  *)
    echo "FATAL: LISTMONK_SERVICE_MANAGER must be auto, systemd or pm2 (got: $SERVICE_MANAGER)" >&2
    exit 1
    ;;
esac
