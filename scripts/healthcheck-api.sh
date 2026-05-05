#!/usr/bin/env bash
#
# API health monitor for PM2 app.
# - Checks whether APP_NAME is online in PM2
# - Attempts restart/start if not online
# - Sends Healthchecks ping on success
#
# Cron example:
# */5 * * * * /absolute/path/to/repo/scripts/api-health-monitor.sh >/dev/null 2>&1
#
# Logs: LOG_DIR (or <repo>/logs); trim lines from LOG_LINES_KEEP (or 500).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Optional: keep compatibility with environments that rely on ~/.bashrc for nvm/pnpm.
if [[ "${API_HEALTH_SOURCE_BASHRC:-0}" == "1" ]] && [[ -f "${HOME}/.bashrc" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/.bashrc"
fi

# Load repo env values.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"

PROJECT_DIR="${PROJECT_DIR:-$ROOT_DIR}"
APP_NAME="${API_APP_NAME:-ac-api}"
API_HEALTHCHECK_PING_URL="${API_HEALTHCHECK_PING_URL:-}"
PM2_HOME="${API_HEALTH_PM2_HOME:-$PROJECT_DIR/.pm2}"
export PM2_HOME

# Shared nvm-pnpm lib (scripts/lib/nvm-pnpm.sh): prefer NVM_PNPM_* from .env;
# API_HEALTH_* nvm vars are legacy aliases only.
export NVM_PNPM_PROJECT_DIR="$PROJECT_DIR"
export NVM_PNPM_USE_NVM="${NVM_PNPM_USE_NVM:-${API_HEALTH_USE_NVM:-0}}"
export NVM_PNPM_NVM_DIR="${NVM_PNPM_NVM_DIR:-${API_HEALTH_NVM_DIR:-$HOME/.nvm}}"
export NVM_PNPM_NODE_VERSION="${NVM_PNPM_NODE_VERSION:-${API_HEALTH_NODE_VERSION:-}}"
export NVM_PNPM_PATH_EXTRA="${NVM_PNPM_PATH_EXTRA:-${API_HEALTH_PATH_EXTRA:-}}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/nvm-pnpm.sh"
nvm_pnpm_err() {
  log_echo "$1"
}

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "api-health-monitor.log" "$(resolve_server_log_lines_keep)"
mkdir -p "$PM2_HOME" "$PM2_HOME/logs" "$PM2_HOME/pids" "$PM2_HOME/modules"

hc_post() {
  local url="$1"
  local body="$2"
  # Never let a failed ping crash the monitor script.
  curl -fsS --max-time 10 --retry 3 --data-raw "$body" "$url" >/dev/null || true
}

hc_fail() {
  local body="$1"
  if [[ -n "$API_HEALTHCHECK_PING_URL" ]]; then
    hc_post "${API_HEALTHCHECK_PING_URL%/}/fail" "$body"
  fi
}

hc_ok() {
  local body="$1"
  if [[ -n "$API_HEALTHCHECK_PING_URL" ]]; then
    hc_post "${API_HEALTHCHECK_PING_URL%/}" "$body"
  fi
}

log_echo "=== API Health Monitor Started ==="
log_echo "Project: $PROJECT_DIR"
log_echo "App: $APP_NAME"
log_echo "Log file: $LOG_FILE"
log_echo "PM2_HOME: $PM2_HOME"

if [[ ! -d "$PROJECT_DIR" ]]; then
  msg="api-health failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ"))\nproject_dir_missing=$PROJECT_DIR\npm2_home=$PM2_HOME"
  log_echo "ERROR: Project directory missing: $PROJECT_DIR"
  hc_fail "$msg"
  exit 1
fi

cd "$PROJECT_DIR"

if ! nvm_pnpm_init; then
  msg=$(
    printf "api-health failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "reason=pnpm_not_found\n"
    printf "project_dir=%s\npm2_home=%s\npath=%s\n" "$PROJECT_DIR" "$PM2_HOME" "$PATH"
  )
  log_echo "ERROR: pnpm not found. PATH=$PATH"
  hc_fail "$msg"
  exit 1
fi

if [[ -n "${NVM_PNPM_RESOLVED_VERSION:-}" ]]; then
  log_echo "Node: $(nvm exec "$NVM_PNPM_RESOLVED_VERSION" node -v) (nvm exec $NVM_PNPM_RESOLVED_VERSION)"
  log_echo "pnpm: $(nvm exec "$NVM_PNPM_RESOLVED_VERSION" command -v pnpm)"
else
  log_echo "pnpm: $(command -v pnpm)"
fi

PM2_OUTPUT="$(nvm_pnpm exec pm2 status "$APP_NAME" --no-color 2>&1 || true)"
echo "$PM2_OUTPUT" >> "$LOG_FILE"

if echo "$PM2_OUTPUT" | grep -q "online"; then
  log_echo "OK: $APP_NAME is online"
  SERVICE_ONLINE=1
else
  log_echo "WARN: $APP_NAME is not online; attempting start/restart"
  START_OUTPUT="$(nvm_pnpm api:start 2>&1 || true)"
  echo "$START_OUTPUT" >> "$LOG_FILE"
  sleep 5
  RECHECK_OUTPUT="$(nvm_pnpm exec pm2 status "$APP_NAME" --no-color 2>&1 || true)"
  echo "$RECHECK_OUTPUT" >> "$LOG_FILE"

  if echo "$RECHECK_OUTPUT" | grep -q "online"; then
    log_echo "OK: $APP_NAME is online after restart"
    SERVICE_ONLINE=1
  else
    log_echo "ERROR: $APP_NAME failed to become online"
    SERVICE_ONLINE=0
  fi
fi

if [[ "$SERVICE_ONLINE" -eq 1 ]]; then
  hc_ok "api-health ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") app=$APP_NAME"
  log_echo "OK: API health ping sent"
else
  body=$(
    printf "api-health failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "app=%s\nproject_dir=%s\npm2_home=%s\n" "$APP_NAME" "$PROJECT_DIR" "$PM2_HOME"
    printf "pm2_status_snippet=%s\n" "$(echo "$PM2_OUTPUT" | tr '\n' ' ' | head -c 400)"
  )
  hc_fail "$body"
  log_echo "WARN: Service not online; sent fail ping"
  exit 1
fi

log_echo "=== API Health Monitor Completed ==="
trim_log
