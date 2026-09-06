#!/usr/bin/env bash
#
# API health monitor for PM2 app.
# - Verifies APP_NAME is online in PM2 *and* that the API actually answers HTTP
# - Attempts restart/start if not healthy
# - Sends Healthchecks ping only when the HTTP probe succeeds
#
# Scheduler example:
# */5 * * * * /absolute/path/to/repo/scripts/healthcheck-api.sh >/dev/null 2>&1
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

# HTTP liveness probe. Hits the app directly on loopback so this check reports on
# the API process itself; healthcheck-site.sh covers the public path through the
# web server. Routes are registered under the /api-server prefix (api/server.js).
API_PORT="${API_PORT:-4321}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:${API_PORT}/api-server/hello}"
API_HEALTH_HTTP_ATTEMPTS="${API_HEALTH_HTTP_ATTEMPTS:-3}"
API_HEALTH_HTTP_RETRY_SLEEP="${API_HEALTH_HTTP_RETRY_SLEEP:-3}"

# Start PM2 inside its own transient systemd scope. Set to 0 to always start directly.
API_HEALTH_USE_SYSTEMD_RUN="${API_HEALTH_USE_SYSTEMD_RUN:-1}"

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

# True when the API answers 2xx. PM2 reporting "online" is not proof the app is
# serving: the process can be up, wedged, or about to be reaped.
api_http_ok() {
  local attempts="${1:-1}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS --max-time 10 -o /dev/null "$API_HEALTH_URL"; then
      return 0
    fi
    if ((i < attempts)); then
      sleep "$API_HEALTH_HTTP_RETRY_SLEEP"
    fi
  done
  return 1
}

# The host schedules these jobs as Type=oneshot systemd user services. systemd's
# default KillMode=control-group reaps every process left in the unit cgroup the
# moment this script exits. PM2's CLI silently auto-spawns its God daemon on *any*
# command (`pm2 status` included), so a daemon spawned from here inherits the unit
# cgroup and dies seconds later — that is why the API used to come up for ~7s and
# vanish every 5 minutes.
#
# So the very first pm2 call must happen inside its own transient scope: if a
# daemon needs spawning it lands in that separate cgroup and outlives this unit.
# If one is already running, ping simply connects to it and the empty scope is
# garbage-collected by --collect. Inspect with:
#   systemctl --user list-units 'ac-api-pm2-*.scope'
ensure_pm2_daemon() {
  if [[ "$API_HEALTH_USE_SYSTEMD_RUN" != "1" ]] || ! command -v systemd-run >/dev/null 2>&1; then
    echo "systemd-run unavailable; PM2 daemon will start in the caller's cgroup"
    return 0
  fi

  local scope_name="ac-api-pm2-$$-$(date +%s)"
  # --scope inherits this shell's exported environment, so the child only needs
  # to re-source the nvm/pnpm helper (shell functions do not survive exec).
  if systemd-run --user --scope --quiet --collect --unit="$scope_name" -- \
    bash -c 'set -euo pipefail
cd "$NVM_PNPM_PROJECT_DIR"
source "$NVM_PNPM_PROJECT_DIR/scripts/lib/nvm-pnpm.sh"
nvm_pnpm_init
nvm_pnpm exec pm2 ping'; then
    echo "PM2 daemon reachable via scope $scope_name.scope"
    return 0
  fi

  echo "WARN: systemd-run scope failed; PM2 daemon may not survive this unit"
  return 0
}

start_api() {
  nvm_pnpm api:start
}

log_echo "=== API Health Monitor Started ==="
log_echo "Project: $PROJECT_DIR"
log_echo "App: $APP_NAME"
log_echo "Log file: $LOG_FILE"
log_echo "PM2_HOME: $PM2_HOME"
log_echo "Probe: $API_HEALTH_URL"

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
else
  log_echo "pnpm: $(command -v pnpm)"
fi

# Must run before any other pm2 command (see ensure_pm2_daemon above).
ENSURE_LOG="$(mktemp)"
ensure_pm2_daemon >"$ENSURE_LOG" 2>&1 || true
cat "$ENSURE_LOG" >> "$LOG_FILE"
rm -f "$ENSURE_LOG"

PM2_OUTPUT="$(nvm_pnpm exec pm2 status "$APP_NAME" --no-color 2>&1 || true)"
echo "$PM2_OUTPUT" >> "$LOG_FILE"

PM2_ONLINE=0
if echo "$PM2_OUTPUT" | grep -q "online"; then
  PM2_ONLINE=1
fi

HTTP_OK=0
if api_http_ok 1; then
  HTTP_OK=1
fi

if [[ "$PM2_ONLINE" -eq 1 ]] && [[ "$HTTP_OK" -eq 1 ]]; then
  log_echo "OK: $APP_NAME is online and answering"
  SERVICE_ONLINE=1
else
  log_echo "WARN: unhealthy (pm2_online=$PM2_ONLINE http_ok=$HTTP_OK); attempting start/restart"
  # Write to a file rather than a command substitution: a detached PM2 daemon can
  # inherit the pipe and make $( ) block until the daemon itself exits.
  START_LOG="$(mktemp)"
  start_api >"$START_LOG" 2>&1 || true
  cat "$START_LOG" >> "$LOG_FILE"
  rm -f "$START_LOG"

  sleep 5
  RECHECK_OUTPUT="$(nvm_pnpm exec pm2 status "$APP_NAME" --no-color 2>&1 || true)"
  echo "$RECHECK_OUTPUT" >> "$LOG_FILE"

  # Gate recovery on the HTTP probe, not on PM2's status text.
  if api_http_ok "$API_HEALTH_HTTP_ATTEMPTS"; then
    log_echo "OK: $APP_NAME is answering after restart"
    SERVICE_ONLINE=1
  else
    log_echo "ERROR: $APP_NAME still not answering $API_HEALTH_URL after restart"
    SERVICE_ONLINE=0
  fi
fi

if [[ "$SERVICE_ONLINE" -eq 1 ]]; then
  hc_ok "api-health ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") app=$APP_NAME url=$API_HEALTH_URL"
  log_echo "OK: API health ping sent"
else
  body=$(
    printf "api-health failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "app=%s\nproject_dir=%s\npm2_home=%s\nprobe_url=%s\n" "$APP_NAME" "$PROJECT_DIR" "$PM2_HOME" "$API_HEALTH_URL"
    printf "pm2_online=%s http_ok_before_restart=%s\n" "$PM2_ONLINE" "$HTTP_OK"
    printf "pm2_status_snippet=%s\n" "$(echo "${RECHECK_OUTPUT:-$PM2_OUTPUT}" | tr '\n' ' ' | head -c 400)"
  )
  hc_fail "$body"
  log_echo "WARN: Service not answering; sent fail ping"
  exit 1
fi

log_echo "=== API Health Monitor Completed ==="
trim_log
