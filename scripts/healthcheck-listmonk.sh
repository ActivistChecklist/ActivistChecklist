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
# run listmonk in its own systemd unit - see the note in that file.
#
# Paging: one bad run on its own does not page. A run that found listmonk down
# (and restarted it, or could not) sends a fail ping only when another run in the
# last hour also found trouble, so a host reboot that the next run fixes stays
# quiet, while an outage still pages on its second run, 5 to 10 minutes in. The
# time of the last bad run is kept in $LOG_DIR/healthcheck-listmonk.last-trouble.
# A quiet bad run still sends a success ping whose body names the verdict, so it
# shows in Healthchecks' event log, and it still exits 1. A checkout that has
# stopped syncing from main pages straight away. See should_page in
# scripts/lib/listmonk-health-verdict.sh for why.
#
# A liveness probe that gets no answer is tried again after a pause before
# anything is restarted. Now and then the probe from this host to listmonk's
# public URL gets nothing back while listmonk is fine, and restarting on that one
# miss took down a healthy listmonk. Each ping's status line says which attempt
# answered. The pause is skipped when systemd says listmonk's unit is not running
# at all (after a reboot, say), since then there is no blip to wait out.
#
# Required env (see .env.production on the newsletter server):
#   LISTMONK_HEALTHCHECK_PING_URL: Healthchecks.io ping URL
#   LISTMONK_ROOT_URL: public base URL (falls back to LISTMONK_API_URL)
#
# Optional env:
#   LISTMONK_HEALTH_PATH / LISTMONK_SUBSCRIPTION_PATH
#   LISTMONK_HEALTH_MARKER / LISTMONK_SUBSCRIPTION_MARKER
#   LISTMONK_SUBSCRIBE_URL: site subscribe endpoint; empty disables the round trip
#   LISTMONK_SUBSCRIBE_TEST_EMAIL: monitor address (default healthcheck@example.com)
#   LISTMONK_SUBSCRIBE_TEST_NAME: monitor display name
#   LISTMONK_ROUNDTRIP_TIMEOUT: seconds for the subscribe POST (default 20)
#   LISTMONK_LIVENESS_ATTEMPTS: liveness probes before restarting (default 2)
#   LISTMONK_LIVENESS_RETRY_SLEEP: seconds between those probes (default 60)
#   LISTMONK_SYSTEMD_UNIT / LISTMONK_SERVICE_MANAGER: as in launch-listmonk.sh
#   LISTMONK_LAUNCH_SCRIPT: launcher path (default <repo>/scripts/launch-listmonk.sh)
#   LISTMONK_LAUNCH_TIMEOUT: seconds to allow the launcher (default 90)
#   LISTMONK_START_ATTEMPTS: post-start probes (default 6)
#   LISTMONK_START_RETRY_SLEEP: seconds between probes (default 5)
#   LISTMONK_REPO_MAX_AGE_HOURS: fail when the last git fetch is older (default 6, 0 disables)
#   LOG_DIR / LOG_LINES_KEEP: shared server log settings
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
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/listmonk-health-verdict.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/hc-ping.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "healthcheck-listmonk.log" "$(resolve_server_log_lines_keep)"
TROUBLE_FILE="$LOG_DIR/healthcheck-listmonk.last-trouble"
RUN_STARTED="$(date +%s)"

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
LIVENESS_ATTEMPTS="${LISTMONK_LIVENESS_ATTEMPTS:-2}"
LIVENESS_RETRY_SLEEP="${LISTMONK_LIVENESS_RETRY_SLEEP:-60}"
if [[ ! "$LIVENESS_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then LIVENESS_ATTEMPTS=2; fi
if [[ ! "$LIVENESS_RETRY_SLEEP" =~ ^[0-9]+$ ]]; then LIVENESS_RETRY_SLEEP=60; fi
SYSTEMD_UNIT="${LISTMONK_SYSTEMD_UNIT:-listmonk.service}"

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

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# send_ping <suffix> <body>: suffix is empty for success, or "fail". hc_ping hands
# the URL to curl on stdin, so the ping credential stays out of argv where other
# accounts on this shared host could read it.
send_ping() {
  printf '%s\n' "$2" >"$WORK_DIR/ping"
  hc_ping "$PING_URL" "$1" "$WORK_DIR/ping"
}

# 503 pages and Cloudflare errors are long; keep just enough to tell them apart.
snippet() {
  printf '%s' "$1" | tr -d '\n' | cut -c1-200
}

# fetch <url>: sets FETCH_BODY, and FETCH_INFO to the HTTP status and curl's exit
# code. A miss used to log only "got: " with nothing after it, which could not
# tell a timeout (curl_exit=28) from a refused connection (7) or DNS (6).
FETCH_BODY=""
FETCH_INFO=""
fetch() {
  local out rc=0
  out="$(curl -s -m 5 -w $'\n%{http_code}' "$1" 2>/dev/null)" || rc=$?
  FETCH_BODY="${out%$'\n'*}"
  FETCH_INFO="http=${out##*$'\n'} curl_exit=$rc"
}

# Liveness only: is something answering on listmonk's own port?
probe_liveness() {
  fetch "$HEALTH_URL"
  if grep -qF "$HEALTH_MARKER" <<<"$FETCH_BODY"; then
    echo "OK: listmonk API is responding at $HEALTH_URL"
    return 0
  fi
  echo "FAIL: health API check ($FETCH_INFO, got: $(snippet "$FETCH_BODY"))"
  # Fallback: the subscription page is public even when the API session check moves.
  fetch "$SUBSCRIPTION_URL"
  if grep -qF "$SUBSCRIPTION_MARKER" <<<"$FETCH_BODY"; then
    echo "OK: listmonk web interface is serving content at $SUBSCRIPTION_URL"
    return 0
  fi
  echo "FAIL: subscription page check ('$SUBSCRIPTION_MARKER' not found; $FETCH_INFO)"
  return 1
}

# True only when systemd says listmonk's unit is not running. When we cannot
# tell (no systemctl, no user manager, or listmonk runs under PM2) this is false,
# and the liveness retry waits as usual.
listmonk_not_running() {
  [[ "${LISTMONK_SERVICE_MANAGER:-auto}" != pm2 ]] || return 1
  command -v systemctl >/dev/null 2>&1 || return 1
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  systemctl --user show-environment >/dev/null 2>&1 || return 1
  ! systemctl --user is-active --quiet "$SYSTEMD_UNIT"
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
for ((liveness_attempt = 1; ; liveness_attempt++)); do
  if probe_liveness; then
    liveness_ok=true
    break
  fi
  if ((liveness_attempt >= LIVENESS_ATTEMPTS)); then break; fi
  if listmonk_not_running; then
    echo "Liveness attempt $liveness_attempt/$LIVENESS_ATTEMPTS got no answer and $SYSTEMD_UNIT is not running; not waiting to probe again."
    break
  fi
  echo "Liveness attempt $liveness_attempt/$LIVENESS_ATTEMPTS got no answer; probing again in ${LIVENESS_RETRY_SLEEP}s before restarting anything."
  sleep "$LIVENESS_RETRY_SLEEP"
done

run_roundtrip "initial"

# Restart only for problems a listmonk restart can actually fix. A rate-limited
# probe proves nothing, a dead site API or a malformed probe is not listmonk's
# fault, and a subscribe that just went through proves listmonk is serving.
# Bouncing the service on any of those just adds an outage to an outage.
needs_restart="$(restart_needed "$liveness_ok" "$ROUNDTRIP_VERDICT")"
if [[ "$needs_restart" == true && "$liveness_ok" == true ]]; then
  echo "Listmonk is listening but the subscribe path is broken; restarting anyway."
elif [[ "$needs_restart" == false && "$liveness_ok" == false ]]; then
  echo "Not restarting: the round trip just subscribed through listmonk, so it is serving. The probe's path from this host is what failed."
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
      fetch "$HEALTH_URL"
      if grep -qF "$HEALTH_MARKER" <<<"$FETCH_BODY"; then
        echo "OK: listmonk started (health API confirmed after $((attempt * START_RETRY_SLEEP))s)"
        liveness_ok=true
        restarted=true
        break
      fi
      echo "  ... attempt $attempt/$START_ATTEMPTS: not up yet ($FETCH_INFO, got: $(snippet "$FETCH_BODY"))"
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

# The checkout this script runs from is only as current as sync-repo.sh keeps it.
# `date -r` reads a file's mtime on both GNU and BSD.
fetch_head="$(git -C "$PROJECT_DIR" rev-parse --git-path FETCH_HEAD 2>/dev/null || true)"
[[ -n "$fetch_head" && "$fetch_head" != /* ]] && fetch_head="$PROJECT_DIR/$fetch_head"
fetch_mtime=""
[[ -n "$fetch_head" && -e "$fetch_head" ]] && fetch_mtime="$(date -r "$fetch_head" +%s 2>/dev/null || true)"
repo_stale="$(repo_is_stale "$fetch_mtime" "$(date +%s)" "${LISTMONK_REPO_MAX_AGE_HOURS:-6}")"
repo_rev="$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"

verdict="$(health_verdict "$needs_restart" "$liveness_ok" "$ROUNDTRIP_VERDICT" "$repo_stale")"

last_trouble=""
[[ -r "$TROUBLE_FILE" ]] && last_trouble="$(head -n 1 "$TROUBLE_FILE" || true)"
page="$(should_page "$verdict" "$RUN_STARTED" "$last_trouble")"
if [[ "$verdict" == DOWN || "$verdict" == RECOVERED ]]; then
  printf '%s\n' "$RUN_STARTED" >"$TROUBLE_FILE" || echo "WARN: could not record this run in $TROUBLE_FILE"
fi
prev_trouble=none
[[ "$last_trouble" =~ ^[0-9]+$ ]] && prev_trouble="$(((RUN_STARTED - last_trouble) / 60))m_ago"

status_line="verdict=$verdict liveness=$liveness_ok liveness_attempt=$liveness_attempt/$LIVENESS_ATTEMPTS roundtrip=$ROUNDTRIP_VERDICT restarted=$restarted repo_stale=$repo_stale prev_trouble=$prev_trouble rev=$repo_rev"

case "$verdict" in
  OK) reason="" ;;
  RECOVERED) reason="listmonk was down on arrival and had to be restarted" ;;
  STALE) reason="server checkout has not fetched in ${LISTMONK_REPO_MAX_AGE_HOURS:-6}h - is sync-repo.sh scheduled?" ;;
  *)
    if [[ "$liveness_ok" == false && "$ROUNDTRIP_VERDICT" == PASS ]]; then
      reason="listmonk's public URL did not answer this host, though a subscribe through the site went through"
    else
      reason="listmonk is down"
    fi
    ;;
esac

if [[ "$verdict" == OK ]]; then
  send_ping "" "healthcheck-listmonk ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") url=$HEALTH_URL $status_line"
  [[ -n "$PING_URL" ]] && echo "Health check ping sent ($status_line)" || echo "No LISTMONK_HEALTHCHECK_PING_URL set; ping skipped ($status_line)"
elif [[ "$page" == false ]]; then
  # A success ping keeps the check green until a second bad run. Its body
  # carries the verdict, so the run still shows in Healthchecks' event log.
  send_ping "" "healthcheck-listmonk not paging $(date -u +"%Y-%m-%dT%H:%M:%SZ") $reason; no other run found trouble in the last hour url=$HEALTH_URL $status_line"
  echo "Not paging - $reason, but no other run found trouble in the last hour ($status_line)"
  echo "=== Check complete ==="
  exit 1
else
  send_ping fail "healthcheck-listmonk failed $(date -u +"%Y-%m-%dT%H:%M:%SZ") $reason url=$HEALTH_URL $status_line"
  [[ -n "$PING_URL" ]] && echo "Sent fail ping - $reason ($status_line)" || echo "$reason ($status_line; no ping URL configured)"
  echo "=== Check complete ==="
  exit 1
fi

echo "=== Check complete ==="
