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

# Delete then start so a wedged process never lingers into the new run.
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true

start_args=(--config "$LISTMONK_CONFIG")
[[ -n "$LISTMONK_STATIC_DIR" ]] && start_args+=(--static-dir "$LISTMONK_STATIC_DIR")

pm2 start "$LISTMONK_BIN" --name "$APP_NAME" --interpreter none -- "${start_args[@]}"
start_rc=$?

# Persist the process list so `pm2 resurrect` has something to restore.
pm2 save >/dev/null 2>&1 || true

exit $start_rc
