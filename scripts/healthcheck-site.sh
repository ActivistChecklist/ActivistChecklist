#!/usr/bin/env bash
#
# Scheduled health check for the static site.
# If all checks pass, ping Healthchecks.io.
#
# Deliberately does NOT probe the API: an API outage used to fail this check and
# fire a misleading "main site down" alert. scripts/healthcheck-api.sh owns the
# API and probes it over HTTP.
#
# A failed round is fetched again after a pause before anything is reported.
# Now and then a request is refused outright while the site is fine (the host's
# front proxy can refuse one IP for about a minute after a burst), and reporting
# that single round as /fail paged "site down" and then "up" five minutes later.
# The pause outlasts that window, so a real outage still fails the last round and
# alerts a couple of minutes later. A round that failed and then recovered is
# listed in the success ping's body, so blips stay visible in Healthchecks
# without paging anyone.
#
# Setup example:
#   export HEALTHCHECK_PING_URL="https://hc-ping.com/your-uuid"
#   */5 * * * * /absolute/path/to/repo/scripts/healthcheck-site.sh >/dev/null 2>&1
#
# Optional env vars:
#   SITE_URL=https://activistchecklist.org
#   GUIDE_PATH=/essentials/
#   LOG_DIR: base log dir for server/cron scripts (default: <repo>/logs)
#   LOG_LINES_KEEP: tail trim for rotated logs (default: 500)
#   SITE_HEALTH_ATTEMPTS: rounds of checks before reporting a failure (default: 2)
#   SITE_HEALTH_RETRY_SLEEP: seconds between rounds (default: 90)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Optional env loading from repo env files.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/hc-ping.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "healthcheck-site.log" "$(resolve_server_log_lines_keep)"

SITE_URL="${SITE_URL:-https://activistchecklist.org}"
GUIDE_PATH="${GUIDE_PATH:-/essentials/}"
HC_PING_URL="${HEALTHCHECK_PING_URL:-}"
ATTEMPTS="${SITE_HEALTH_ATTEMPTS:-2}"
RETRY_SLEEP="${SITE_HEALTH_RETRY_SLEEP:-90}"
if [[ ! "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then ATTEMPTS=2; fi
if [[ ! "$RETRY_SLEEP" =~ ^[0-9]+$ ]]; then RETRY_SLEEP=90; fi

if [[ -z "$HC_PING_URL" ]]; then
  msg="HEALTHCHECK_PING_URL is required"
  echo "$msg" >&2
  log "$msg"
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

log_echo "=== healthcheck-site started (log: $LOG_FILE) site_url=$SITE_URL guide_path=$GUIDE_PATH attempts=$ATTEMPTS ==="

# send_ping <suffix> <body>: suffix is empty for success, or "fail".
send_ping() {
  printf '%s\n' "$2" >"$WORK_DIR/ping"
  hc_ping "$HC_PING_URL" "$1" "$WORK_DIR/ping"
}

fail() {
  local msg="$1"
  echo "$msg" >&2
  scripts_log_file_failure_block "healthcheck-site FAILED" "$msg"
  send_ping fail "$msg"
  trim_log
  exit 1
}

# The start of a response body on one line, for the failure report.
body_snippet() {
  local snippet
  snippet=$(head -c 600 "$1" | tr '\n\r\t' '   ' | sed 's/  */ /g')
  printf '%.500s' "${snippet:-(empty)}"
}

# fetch_page <label> <url> [<marker>]
#
# Fetches <url> once. It passes on HTTP 200 whose body contains <marker> (when
# given). Otherwise it adds one line saying what came back to round_errors.
fetch_page() {
  local label="$1" url="$2" marker="${3:-}"
  local body="$WORK_DIR/body" cerr="$WORK_DIR/curl-stderr"
  local meta curl_exit http_code time_total detail title
  : >"$body"
  set +e
  meta=$(curl -sS --max-time 15 -o "$body" -w '%{http_code}|%{time_total}' "$url" 2>"$cerr")
  curl_exit=$?
  set -e
  IFS='|' read -r http_code time_total <<<"$meta"
  detail="http=${http_code:-?} time_s=${time_total:-?} bytes=$(wc -c <"$body" | tr -d ' ')"

  if [[ "$curl_exit" != "0" ]]; then
    round_errors+=("$label: curl error $detail curl_exit=$curl_exit curl_stderr=$(tr '\n' ' ' <"$cerr") url=$url")
  elif [[ "$http_code" != "200" ]]; then
    round_errors+=("$label: HTTP $http_code $detail url=$url body=$(body_snippet "$body")")
  elif [[ -n "$marker" ]] && ! grep -qiF "$marker" "$body"; then
    title=$(grep -oiE '<title[^>]*>[^<]+</title>' "$body" | head -1 || true)
    round_errors+=("$label: HTTP 200 without \"$marker\" $detail url=$url title=${title:-(none)} body=$(body_snippet "$body")")
  fi
}

earlier=()
attempt=1
while true; do
  round_errors=()
  fetch_page homepage "$SITE_URL/" "Activist Checklist"
  fetch_page guide "$SITE_URL$GUIDE_PATH"
  fetch_page news "$SITE_URL/news/"
  if ((${#round_errors[@]} == 0)); then break; fi

  for e in "${round_errors[@]}"; do earlier+=("attempt $attempt/$ATTEMPTS $e"); done
  if ((attempt >= ATTEMPTS)); then
    fail "$(
      printf "healthcheck-site failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      printf "site_url=%s guide_path=%s\n" "$SITE_URL" "$GUIDE_PATH"
      printf "%s\n" "${earlier[@]}"
    )"
  fi
  scripts_log_file_failure_block "healthcheck-site attempt $attempt/$ATTEMPTS failed, trying again in ${RETRY_SLEEP}s" \
    "$(printf "%s\n" "${round_errors[@]}")"
  sleep "$RETRY_SLEEP"
  attempt=$((attempt + 1))
done

# All checks passed: ping Healthchecks (POST so we can attach minimal context).
ok_msg="healthcheck-site ok $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if ((${#earlier[@]} > 0)); then
  ok_msg="$ok_msg on attempt $attempt/$ATTEMPTS"$'\n'"$(printf "%s\n" "${earlier[@]}")"
fi
log_echo "$ok_msg"
send_ping "" "$ok_msg"
trim_log
