#!/usr/bin/env bash
#
# Health check + auto-restart for listmonk.
#
# Runs on the newsletter server (the box that hosts listmonk under PM2), not on
# the main site server. Probes the public health API; if listmonk is down it runs
# launch-listmonk.sh, then pings Healthchecks.io once the service answers again.
#
# Cron example (every 5 minutes, plus a catch-up after reboot):
#   */5 * * * * /path/to/repo/scripts/healthcheck-listmonk.sh
#   @reboot sleep 60 && /path/to/repo/scripts/healthcheck-listmonk.sh
#
# Required env (see .env.production on the newsletter server):
#   LISTMONK_HEALTHCHECK_PING_URL — Healthchecks.io ping URL
#   LISTMONK_ROOT_URL             — public base URL (falls back to LISTMONK_API_URL)
#
# Optional env:
#   LISTMONK_HEALTH_PATH / LISTMONK_SUBSCRIPTION_PATH
#   LISTMONK_HEALTH_MARKER / LISTMONK_SUBSCRIPTION_MARKER
#   LISTMONK_LAUNCH_SCRIPT     — default: <repo>/scripts/launch-listmonk.sh
#   LISTMONK_LAUNCH_TIMEOUT    — seconds to allow the launcher (default 90)
#   LISTMONK_START_ATTEMPTS    — post-start probes (default 6)
#   LISTMONK_START_RETRY_SLEEP — seconds between probes (default 5)
#   LOG_DIR / LOG_LINES_KEEP   — shared server log settings
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "healthcheck-listmonk.log" "$(resolve_server_log_lines_keep)"

# Rotate BEFORE redirecting stdout. trim_log replaces the file via mv, so trimming
# afterwards would leave our fd pointing at the unlinked inode and silently drop
# every later line.
trim_log
exec >> "$LOG_FILE" 2>&1

ROOT_URL="${LISTMONK_ROOT_URL:-${LISTMONK_API_URL:-}}"
HEALTH_PATH="${LISTMONK_HEALTH_PATH:-/api/health}"
SUBSCRIPTION_PATH="${LISTMONK_SUBSCRIPTION_PATH:-/subscription}"
# An unauthenticated GET of the health API returns this; the homepage is not public.
HEALTH_MARKER="${LISTMONK_HEALTH_MARKER:-\"message\":\"invalid session\"}"
SUBSCRIPTION_MARKER="${LISTMONK_SUBSCRIPTION_MARKER:-listmonk.app}"
PING_URL="${LISTMONK_HEALTHCHECK_PING_URL:-}"
LAUNCH_SCRIPT="${LISTMONK_LAUNCH_SCRIPT:-$SCRIPT_DIR/launch-listmonk.sh}"
LAUNCH_TIMEOUT="${LISTMONK_LAUNCH_TIMEOUT:-90}"
START_ATTEMPTS="${LISTMONK_START_ATTEMPTS:-6}"
START_RETRY_SLEEP="${LISTMONK_START_RETRY_SLEEP:-5}"

echo "=== $(date -Iseconds) healthcheck-listmonk (log: $LOG_FILE) ==="

if [[ -z "$ROOT_URL" ]]; then
  echo "FATAL: set LISTMONK_ROOT_URL or LISTMONK_API_URL"
  exit 1
fi

HEALTH_URL="${ROOT_URL%/}$HEALTH_PATH"
SUBSCRIPTION_URL="${ROOT_URL%/}$SUBSCRIPTION_PATH"

hc_post() {
  local url="$1" body="$2"
  [[ -n "$PING_URL" ]] || return 0
  # A failed ping must never crash the monitor.
  curl -fsS --max-time 10 --retry 3 --data-raw "$body" "$url" >/dev/null 2>&1 || true
}

# 503 pages and Cloudflare errors are long; keep just enough to tell them apart.
snippet() {
  printf '%s' "$1" | tr -d '\n' | cut -c1-200
}

fetch() {
  curl -s -m 5 "$1" 2>/dev/null || true
}

service_online=false

HEALTH_BODY="$(fetch "$HEALTH_URL")"
if grep -qF "$HEALTH_MARKER" <<<"$HEALTH_BODY"; then
  echo "OK: listmonk API is responding at $HEALTH_URL"
  service_online=true
else
  echo "FAIL: health API check (got: $(snippet "$HEALTH_BODY"))"
  # Fallback: the subscription page is public even when the API session check moves.
  SUB_BODY="$(fetch "$SUBSCRIPTION_URL")"
  if grep -qF "$SUBSCRIPTION_MARKER" <<<"$SUB_BODY"; then
    echo "OK: listmonk web interface is serving content at $SUBSCRIPTION_URL"
    service_online=true
  else
    echo "FAIL: subscription page check ('$SUBSCRIPTION_MARKER' not found)"
  fi
fi

if [[ "$service_online" == false ]]; then
  echo "Attempting to start listmonk..."
  if [[ -x "$LAUNCH_SCRIPT" ]]; then
    # Foreground, with output captured. Backgrounding this into /dev/null is what
    # hid ~1600 consecutive "pm2: command not found" failures from cron.
    launch_rc=0
    if command -v timeout >/dev/null 2>&1; then
      timeout "$LAUNCH_TIMEOUT" "$LAUNCH_SCRIPT" || launch_rc=$?
    else
      # macOS has no coreutils timeout; the servers do. Degrade rather than fail.
      "$LAUNCH_SCRIPT" || launch_rc=$?
    fi
    echo "Launch script exited rc=$launch_rc"

    for ((attempt = 1; attempt <= START_ATTEMPTS; attempt++)); do
      sleep "$START_RETRY_SLEEP"
      RETRY_BODY="$(fetch "$HEALTH_URL")"
      if grep -qF "$HEALTH_MARKER" <<<"$RETRY_BODY"; then
        echo "OK: listmonk started (health API confirmed after $((attempt * START_RETRY_SLEEP))s)"
        service_online=true
        break
      fi
      echo "  ... attempt $attempt/$START_ATTEMPTS: not up yet (got: $(snippet "$RETRY_BODY"))"
    done

    [[ "$service_online" == false ]] && echo "FAIL: listmonk did not come back up"
  else
    echo "FAIL: launch script missing or not executable: $LAUNCH_SCRIPT"
  fi
fi

if [[ "$service_online" == true ]]; then
  hc_post "${PING_URL%/}" "healthcheck-listmonk ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") url=$HEALTH_URL"
  [[ -n "$PING_URL" ]] && echo "Health check ping sent" || echo "No LISTMONK_HEALTHCHECK_PING_URL set; ping skipped"
else
  hc_post "${PING_URL%/}/fail" "healthcheck-listmonk failed $(date -u +"%Y-%m-%dT%H:%M:%SZ") url=$HEALTH_URL"
  [[ -n "$PING_URL" ]] && echo "Sent fail ping - listmonk is down" || echo "listmonk is down (no ping URL configured)"
  echo "=== Check complete ==="
  exit 1
fi

echo "=== Check complete ==="
