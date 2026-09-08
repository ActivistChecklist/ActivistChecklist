#!/usr/bin/env bash
#
# Health check + auto-restart for listmonk.
#
# Runs on the newsletter server (the box that hosts listmonk under PM2), not on
# the main site server. Two independent probes:
#
#   1. Liveness  - listmonk's own /api/health (fallback: the public /subscription
#                  page). Proves the process is listening.
#   2. Round trip - POST a real subscribe to the SITE's public endpoint, the same
#                  one the footer form calls. Proves the whole chain works:
#                  site nginx -> ac-api (Fastify) -> lib/listmonk -> listmonk -> postgres.
#
# The round trip is the one that catches real outages. api/subscribe.js returns
# its result object instead of setting a status code, so Fastify answers HTTP 200
# even when listmonk is unreachable - a status-code-only monitor reports green
# against a completely dead newsletter. See scripts/lib/listmonk-roundtrip.sh.
#
# Repeat runs do not pollute the subscriber table: lib/listmonk.js treats
# listmonk's 409 "e-mail already exists" as success, so the monitor address is
# inserted once and re-confirmed every run afterwards.
#
# Scheduling: run it every 5 minutes. May First no longer honours user crontabs
# on these hosts - `crontab -l` is refused outright - so the job is defined in the
# control panel, which generates ~/.config/systemd/user/red-item-<id>.{service,timer}.
# Verify it is actually scheduled, because a missing job looks exactly like a
# healthy service that never alerts:
#   systemctl --user list-timers
#   journalctl --user -u red-item-<id>.service
# Those generated units are Type=oneshot, which is why launch-listmonk.sh has to
# put PM2 in its own systemd scope - see the note in that file.
#
# Required env (see .env.production on the newsletter server):
#   LISTMONK_HEALTHCHECK_PING_URL — Healthchecks.io ping URL
#   LISTMONK_ROOT_URL             — public base URL (falls back to LISTMONK_API_URL)
#
# Optional env:
#   LISTMONK_HEALTH_PATH / LISTMONK_SUBSCRIPTION_PATH
#   LISTMONK_HEALTH_MARKER / LISTMONK_SUBSCRIPTION_MARKER
#   LISTMONK_SUBSCRIBE_URL         — site subscribe endpoint; empty disables the round trip
#   LISTMONK_SUBSCRIBE_TEST_EMAIL  — monitor address (default healthcheck@example.com)
#   LISTMONK_SUBSCRIBE_TEST_NAME   — monitor display name
#   LISTMONK_ROUNDTRIP_TIMEOUT     — seconds for the subscribe POST (default 20)
#   LISTMONK_LAUNCH_SCRIPT         — default: <repo>/scripts/launch-listmonk.sh
#   LISTMONK_LAUNCH_TIMEOUT        — seconds to allow the launcher (default 90)
#   LISTMONK_START_ATTEMPTS        — post-start probes (default 6)
#   LISTMONK_START_RETRY_SLEEP     — seconds between probes (default 5)
#   LOG_DIR / LOG_LINES_KEEP       — shared server log settings
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/listmonk-roundtrip.sh"

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

SUBSCRIBE_URL="${LISTMONK_SUBSCRIBE_URL:-}"
# RFC 2606 reserves example.com, so this address can never be delivered to or
# bounce. One row in listmonk, reused forever.
SUBSCRIBE_TEST_EMAIL="${LISTMONK_SUBSCRIBE_TEST_EMAIL:-healthcheck@example.com}"
SUBSCRIBE_TEST_NAME="${LISTMONK_SUBSCRIBE_TEST_NAME:-Healthcheck Monitor}"
ROUNDTRIP_TIMEOUT="${LISTMONK_ROUNDTRIP_TIMEOUT:-20}"

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

# Liveness only: is something answering on listmonk's own port?
probe_liveness() {
  local body
  body="$(fetch "$HEALTH_URL")"
  if grep -qF "$HEALTH_MARKER" <<<"$body"; then
    echo "OK: listmonk API is responding at $HEALTH_URL"
    return 0
  fi
  echo "FAIL: health API check (got: $(snippet "$body"))"
  # Fallback: the subscription page is public even when the API session check moves.
  body="$(fetch "$SUBSCRIPTION_URL")"
  if grep -qF "$SUBSCRIPTION_MARKER" <<<"$body"; then
    echo "OK: listmonk web interface is serving content at $SUBSCRIPTION_URL"
    return 0
  fi
  echo "FAIL: subscription page check ('$SUBSCRIPTION_MARKER' not found)"
  return 1
}

# Sets ROUNDTRIP_VERDICT. Budget note: the Fastify limiter on /subscribe allows 5
# posts per 15 minutes per IP, and a */5 schedule spends 3 of them, so this runs
# at most twice per invocation (once up front, once to confirm a restart).
ROUNDTRIP_VERDICT="SKIPPED"
run_roundtrip() {
  local label="$1" result code detail
  if [[ -z "$SUBSCRIBE_URL" ]]; then
    ROUNDTRIP_VERDICT="SKIPPED"
    echo "SKIP: round trip disabled (set LISTMONK_SUBSCRIBE_URL to enable)"
    return 0
  fi

  result="$(roundtrip_probe "$SUBSCRIBE_URL" "$SUBSCRIBE_TEST_EMAIL" "$SUBSCRIBE_TEST_NAME" "$ROUNDTRIP_TIMEOUT")"
  ROUNDTRIP_VERDICT="${result%% *}"
  result="${result#* }"
  code="${result%% *}"
  detail="${result#* }"

  case "$ROUNDTRIP_VERDICT" in
    PASS)
      echo "OK: $label round trip subscribed $SUBSCRIBE_TEST_EMAIL via $SUBSCRIBE_URL (http=$code)"
      ;;
    FAIL)
      # The 200 here is the trap: the site API answers fine, listmonk does not.
      echo "FAIL: $label round trip - site API answered http=$code but the subscribe did not succeed: $detail"
      ;;
    INCONCLUSIVE)
      echo "WARN: $label round trip rate limited (http=$code); treating as inconclusive: $detail"
      ;;
    BAD_REQUEST)
      echo "FAIL: $label round trip rejected by the site API (http=$code) - check LISTMONK_SUBSCRIBE_URL and the payload: $detail"
      ;;
    UPSTREAM_DOWN)
      echo "FAIL: $label round trip could not reach the site API (http=$code) - this is the site/ac-api, not listmonk: $detail"
      ;;
  esac
}

liveness_ok=false
if probe_liveness; then
  liveness_ok=true
fi

run_roundtrip "initial"

# Restart only for problems a listmonk restart can actually fix. A rate-limited
# probe proves nothing, and a dead site API or a malformed probe is not listmonk's
# fault - bouncing the service on those just adds an outage to an outage.
needs_restart=false
if [[ "$liveness_ok" == false ]]; then
  needs_restart=true
elif [[ "$ROUNDTRIP_VERDICT" == "FAIL" ]]; then
  echo "Listmonk is listening but the subscribe path is broken; restarting anyway."
  needs_restart=true
fi

restarted=false
if [[ "$needs_restart" == true ]]; then
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

    liveness_ok=false
    for ((attempt = 1; attempt <= START_ATTEMPTS; attempt++)); do
      sleep "$START_RETRY_SLEEP"
      RETRY_BODY="$(fetch "$HEALTH_URL")"
      if grep -qF "$HEALTH_MARKER" <<<"$RETRY_BODY"; then
        echo "OK: listmonk started (health API confirmed after $((attempt * START_RETRY_SLEEP))s)"
        liveness_ok=true
        restarted=true
        break
      fi
      echo "  ... attempt $attempt/$START_ATTEMPTS: not up yet (got: $(snippet "$RETRY_BODY"))"
    done

    [[ "$liveness_ok" == false ]] && echo "FAIL: listmonk did not come back up"
  else
    echo "FAIL: launch script missing or not executable: $LAUNCH_SCRIPT"
  fi
fi

# Re-run the round trip after a restart so a green ping always means the whole
# subscribe chain was verified, not just that the port reopened.
if [[ "$restarted" == true ]]; then
  run_roundtrip "post-restart"
fi

# Green requires liveness AND a round trip that did not fail. INCONCLUSIVE and
# SKIPPED stay green: they carry no evidence of an outage, and flapping the alert
# on a rate limit trains people to ignore it.
service_online=false
if [[ "$liveness_ok" == true ]]; then
  case "$ROUNDTRIP_VERDICT" in
    PASS | INCONCLUSIVE | SKIPPED) service_online=true ;;
  esac
fi

status_line="liveness=$liveness_ok roundtrip=$ROUNDTRIP_VERDICT restarted=$restarted"

if [[ "$service_online" == true ]]; then
  hc_post "${PING_URL%/}" "healthcheck-listmonk ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") url=$HEALTH_URL $status_line"
  [[ -n "$PING_URL" ]] && echo "Health check ping sent ($status_line)" || echo "No LISTMONK_HEALTHCHECK_PING_URL set; ping skipped ($status_line)"
else
  hc_post "${PING_URL%/}/fail" "healthcheck-listmonk failed $(date -u +"%Y-%m-%dT%H:%M:%SZ") url=$HEALTH_URL $status_line"
  [[ -n "$PING_URL" ]] && echo "Sent fail ping - listmonk is down ($status_line)" || echo "listmonk is down ($status_line; no ping URL configured)"
  echo "=== Check complete ==="
  exit 1
fi

echo "=== Check complete ==="
