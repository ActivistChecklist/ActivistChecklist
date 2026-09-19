#!/usr/bin/env bash
#
# Scheduled health check for the static site.
# If all checks pass, ping Healthchecks.io.
#
# Deliberately does NOT probe the API: an API outage used to fail this check and
# fire a misleading "main site down" alert. scripts/healthcheck-api.sh owns the
# API and probes it over HTTP.
#
# Setup example:
#   export HEALTHCHECK_PING_URL="https://hc-ping.com/your-uuid"
#   */5 * * * * /absolute/path/to/repo/scripts/healthcheck-site.sh >/dev/null 2>&1
#
# Optional env vars:
#   SITE_URL=https://activistchecklist.org
#   GUIDE_PATH=/essentials/
#   LOG_DIR — base log dir for server/cron scripts (default: <repo>/logs)
#   LOG_LINES_KEEP — tail trim for rotated logs (default: 500)
#   SITE_HEALTH_HOME_ATTEMPTS — homepage fetch retries (default: 2)
#   SITE_HEALTH_HOME_RETRY_SLEEP — seconds between retries (default: 3)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Optional env loading from repo env files.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "healthcheck-site.log" "$(resolve_server_log_lines_keep)"

SITE_URL="${SITE_URL:-https://activistchecklist.org}"
GUIDE_PATH="${GUIDE_PATH:-/essentials/}"
HC_PING_URL="${HEALTHCHECK_PING_URL:-}"
HOME_ATTEMPTS="${SITE_HEALTH_HOME_ATTEMPTS:-2}"
HOME_RETRY_SLEEP="${SITE_HEALTH_HOME_RETRY_SLEEP:-3}"
if [[ "${HOME_ATTEMPTS:-0}" -lt 1 ]]; then HOME_ATTEMPTS=1; fi

if [[ -z "$HC_PING_URL" ]]; then
  msg="HEALTHCHECK_PING_URL is required"
  echo "$msg" >&2
  log "$msg"
  exit 1
fi

log_echo "=== healthcheck-site started (log: $LOG_FILE) site_url=$SITE_URL guide_path=$GUIDE_PATH home_attempts=$HOME_ATTEMPTS ==="

hc_post() {
  local url="$1"
  local body="$2"
  curl -fsS --max-time 10 --retry 3 --data-raw "$body" "$url" >/dev/null || true
}

fail() {
  local msg="$1"
  echo "$msg" >&2
  scripts_log_file_failure_block "healthcheck-site FAILED" "$msg"
  hc_post "${HC_PING_URL%/}/fail" "$msg"
  trim_log
  exit 1
}

errors=()

# Homepage: retries help with transient CDN/network/partial HTML; log rich detail on failure.
home_ok=0
home_diag=()
for ((a = 1; a <= HOME_ATTEMPTS; a++)); do
  tmp=$(mktemp)
  cerr=$(mktemp)
  set +e
  meta=$(curl -sS --max-time 15 -o "$tmp" -w "%{http_code}|%{time_total}" "$SITE_URL/" 2>"$cerr")
  curl_exit=$?
  set -e
  IFS='|' read -r http_code time_total <<<"$meta"
  bytes=$(wc -c <"$tmp" | tr -d ' ')

  if [[ "$curl_exit" != "0" ]]; then
    curl_err_text=""
    [[ -s "$cerr" ]] && curl_err_text=$(tr '\n' ' ' <"$cerr")
    home_diag+=("homepage: attempt $a/$HOME_ATTEMPTS curl error http=${http_code:-?} time_s=${time_total:-?} bytes=${bytes:-?} curl_exit=$curl_exit curl_stderr=${curl_err_text}")
    rm -f "$tmp" "$cerr"
    if ((a < HOME_ATTEMPTS)); then sleep "$HOME_RETRY_SLEEP"; fi
    continue
  fi

  if [[ "${http_code:-}" != "200" ]]; then
    snippet=""
    if [[ "$bytes" -gt 0 && "$bytes" -lt 8000 ]]; then
      snippet=$(head -c 600 "$tmp" | tr '\n\r\t' ' ' | sed 's/  */ /g')
      snippet=$(printf '%.500s' "$snippet")
    fi
    home_diag+=("homepage: attempt $a/$HOME_ATTEMPTS non-200 response http=$http_code bytes=$bytes time_s=$time_total snippet=${snippet:-"(large or empty)"}")
    rm -f "$tmp" "$cerr"
    if ((a < HOME_ATTEMPTS)); then sleep "$HOME_RETRY_SLEEP"; fi
    continue
  fi

  if grep -qi "Activist Checklist" "$tmp"; then
    home_ok=1
    rm -f "$tmp" "$cerr"
    break
  fi

  title=$(grep -oiE '<title[^>]*>[^<]+</title>' "$tmp" | head -1 | tr '\n' ' ' || true)
  snippet=$(head -c 800 "$tmp" | tr '\n\r\t' ' ' | sed 's/  */ /g')
  snippet=$(printf '%.500s' "$snippet")
  home_diag+=("homepage: attempt $a/$HOME_ATTEMPTS HTTP 200 but grep missed \"Activist Checklist\" bytes=$bytes time_s=$time_total title=${title:-"(none)"}")
  home_diag+=("homepage: attempt $a/$HOME_ATTEMPTS body_snippet=$snippet")
  rm -f "$tmp" "$cerr"
  if ((a < HOME_ATTEMPTS)); then sleep "$HOME_RETRY_SLEEP"; fi
done

if [[ "$home_ok" != "1" ]]; then
  errors+=("homepage: failed after $HOME_ATTEMPTS attempt(s) (see lines below; intermittent misses are often CDN/edge timeouts or a non-HTML response)")
  errors+=("${home_diag[@]}")
fi

# A stable guide page should resolve.
if ! curl -fsS --max-time 15 "$SITE_URL$GUIDE_PATH" >/dev/null; then
  errors+=("guide: curl failed ($SITE_URL$GUIDE_PATH)")
fi

# News index should resolve.
if ! curl -fsS --max-time 15 "$SITE_URL/news/" >/dev/null; then
  errors+=("news: curl failed ($SITE_URL/news/)")
fi

if (( ${#errors[@]} > 0 )); then
  body=$(
    printf "healthcheck-site failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "site_url=%s guide_path=%s\n" "$SITE_URL" "$GUIDE_PATH"
    printf "%s\n" "${errors[@]}"
  )
  fail "$body"
fi

# All checks passed: ping Healthchecks (POST so we can attach minimal context).
ok_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log_echo "healthcheck-site ok $ok_ts"
hc_post "${HC_PING_URL%/}" "healthcheck-site ok $ok_ts"
trim_log
