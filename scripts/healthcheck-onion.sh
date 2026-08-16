#!/usr/bin/env bash
#
# Tor onion service health check with Healthchecks.io ping.
#
# Checks, in order:
#   1. The .onion address published in content/en/pages/onion.mdx parses and looks valid.
#   2. That address matches the PGP-signed copy in public/files/onion-address.txt.asc
#      (catches an edited/tampered address in the page before readers hit it).
#   3. The onion service answers over Tor and serves the real site.
#
# Requires a local Tor SOCKS proxy (the `tor` daemon, default 127.0.0.1:9050).
# Onion fetches are slow, so timeouts are generous and failures are retried.
#
# This has no scheduled runner: the web host has no Tor daemon, and the GitHub
# Actions workflow that used to run it every 30 minutes has been removed. Run it
# by hand, or via the cron form below, on any machine that does run tor.
#
# Setup example:
#   export ONION_HEALTHCHECK_PING_URL="https://hc-ping.com/your-uuid"
#   */30 * * * * /absolute/path/to/repo/scripts/healthcheck-onion.sh >/dev/null 2>&1
#
# Optional env vars:
#   ONION_ADDRESS — override the address instead of reading onion.mdx
#   TOR_SOCKS_PROXY=127.0.0.1:9050
#   ONION_GUIDE_PATH=/essentials/
#   ONION_HEALTH_ATTEMPTS — fetch retries per URL (default: 3)
#   ONION_HEALTH_RETRY_SLEEP — seconds between retries (default: 5)
#   ONION_HEALTH_TIMEOUT — seconds per fetch (default: 60)
#   LOG_DIR / LOG_LINES_KEEP — shared log settings (see scripts/log.sh)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "healthcheck-onion.log" "$(resolve_server_log_lines_keep)"

ONION_MDX="$PROJECT_DIR/content/en/pages/onion.mdx"
ONION_SIGNED_FILE="$PROJECT_DIR/public/files/onion-address.txt.asc"
TOR_SOCKS_PROXY="${TOR_SOCKS_PROXY:-127.0.0.1:9050}"
GUIDE_PATH="${ONION_GUIDE_PATH:-/essentials/}"
HC_PING_URL="${ONION_HEALTHCHECK_PING_URL:-}"
ATTEMPTS="${ONION_HEALTH_ATTEMPTS:-3}"
RETRY_SLEEP="${ONION_HEALTH_RETRY_SLEEP:-5}"
FETCH_TIMEOUT="${ONION_HEALTH_TIMEOUT:-60}"
if [[ "${ATTEMPTS:-0}" -lt 1 ]]; then ATTEMPTS=1; fi

# v3 onion addresses are 56 base32 chars (a-z, 2-7) plus ".onion".
ONION_RE='[a-z2-7]{56}\.onion'

if [[ -z "$HC_PING_URL" ]]; then
  msg="ONION_HEALTHCHECK_PING_URL is required"
  echo "$msg" >&2
  log "$msg"
  exit 1
fi

hc_post() {
  local url="$1"
  local body="$2"
  curl -fsS --max-time 10 --retry 3 --data-raw "$body" "$url" >/dev/null || true
}

fail() {
  local msg="$1"
  echo "$msg" >&2
  scripts_log_file_failure_block "healthcheck-onion FAILED" "$msg"
  hc_post "${HC_PING_URL%/}/fail" "$msg"
  trim_log
  exit 1
}

# --- 1. Resolve the address ---------------------------------------------------

address="${ONION_ADDRESS:-}"
address_source="env"
if [[ -z "$address" ]]; then
  address_source="onion.mdx"
  if [[ ! -r "$ONION_MDX" ]]; then
    fail "healthcheck-onion failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) reason=onion_mdx_unreadable path=$ONION_MDX"
  fi
  address="$(grep -oE "$ONION_RE" "$ONION_MDX" | head -1 || true)"
fi
# Accept a full URL in ONION_ADDRESS too; we only want the host.
address="$(echo "$address" | grep -oE "$ONION_RE" | head -1 || true)"

if [[ -z "$address" ]]; then
  fail "healthcheck-onion failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) reason=no_valid_onion_address source=$address_source"
fi

log_echo "=== healthcheck-onion started (log: $LOG_FILE) address=$address source=$address_source proxy=$TOR_SOCKS_PROXY ==="

# --- 2. Compare against the PGP-signed copy -----------------------------------

if [[ ! -r "$ONION_SIGNED_FILE" ]]; then
  fail "healthcheck-onion failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) reason=signed_address_file_unreadable file=$ONION_SIGNED_FILE"
fi

signed_address="$(grep -oE "$ONION_RE" "$ONION_SIGNED_FILE" | head -1 || true)"
if [[ -z "$signed_address" ]]; then
  fail "healthcheck-onion failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) reason=signed_address_not_found file=$ONION_SIGNED_FILE"
fi

if [[ "$signed_address" != "$address" ]]; then
  fail "$(
    printf "healthcheck-onion failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "reason=address_mismatch published=%s signed=%s\n" "$address" "$signed_address"
    printf "The published address does not match the PGP-signed copy. Treat as tampering until proven otherwise.\n"
  )"
fi

# --- 3. Fetch over Tor --------------------------------------------------------

errors=()

# Fetches a path over the Tor SOCKS proxy, retrying transient circuit failures.
# $1 = path, $2 = optional string that must appear in the body.
check_path() {
  local path="$1"
  local expect="${2:-}"
  local url="http://$address$path"
  local diag=()
  local a tmp cerr meta curl_exit http_code time_total bytes snippet title

  for ((a = 1; a <= ATTEMPTS; a++)); do
    tmp=$(mktemp)
    cerr=$(mktemp)
    set +e
    meta=$(curl -sS --max-time "$FETCH_TIMEOUT" --socks5-hostname "$TOR_SOCKS_PROXY" \
      -o "$tmp" -w "%{http_code}|%{time_total}" "$url" 2>"$cerr")
    curl_exit=$?
    set -e
    IFS='|' read -r http_code time_total <<<"$meta"
    bytes=$(wc -c <"$tmp" | tr -d ' ')

    if [[ "$curl_exit" != "0" ]]; then
      local curl_err_text="" hint="" socks_code=""
      [[ -s "$cerr" ]] && curl_err_text=$(tr '\n' ' ' <"$cerr")
      case "$curl_exit" in
        5 | 7)
          # Nothing answering on the SOCKS port: the tor daemon, not the service.
          hint=" hint=tor_socks_proxy_unreachable_check_tor_daemon"
          ;;
        97)
          # Tor reports why the SOCKS connect failed as a trailing "(NNN)" code.
          socks_code=$(echo "$curl_err_text" | grep -oE '\(2[0-9]{2}\) *$' | tr -dc '0-9')
          case "$socks_code" in
            240) hint=" hint=onion_descriptor_not_found_service_likely_offline" ;;
            241) hint=" hint=onion_descriptor_invalid" ;;
            242) hint=" hint=onion_introduction_failed" ;;
            243) hint=" hint=onion_rendezvous_failed" ;;
            244) hint=" hint=onion_missing_client_auth" ;;
            245) hint=" hint=onion_wrong_client_auth" ;;
            246) hint=" hint=onion_address_invalid" ;;
            247) hint=" hint=onion_introduction_timed_out" ;;
            *) hint=" hint=tor_socks_connect_failed" ;;
          esac
          ;;
      esac
      diag+=("$path: attempt $a/$ATTEMPTS curl error http=${http_code:-?} time_s=${time_total:-?} bytes=${bytes:-?} curl_exit=$curl_exit${hint} curl_stderr=${curl_err_text}")
      rm -f "$tmp" "$cerr"
      if ((a < ATTEMPTS)); then sleep "$RETRY_SLEEP"; fi
      continue
    fi

    if [[ "${http_code:-}" != "200" ]]; then
      snippet=""
      if [[ "$bytes" -gt 0 && "$bytes" -lt 8000 ]]; then
        snippet=$(head -c 600 "$tmp" | tr '\n\r\t' ' ' | sed 's/  */ /g')
        snippet=$(printf '%.500s' "$snippet")
      fi
      diag+=("$path: attempt $a/$ATTEMPTS non-200 response http=$http_code bytes=$bytes time_s=$time_total snippet=${snippet:-"(large or empty)"}")
      rm -f "$tmp" "$cerr"
      if ((a < ATTEMPTS)); then sleep "$RETRY_SLEEP"; fi
      continue
    fi

    if [[ -z "$expect" ]] || grep -qi "$expect" "$tmp"; then
      rm -f "$tmp" "$cerr"
      log "$path: ok http=200 bytes=$bytes time_s=$time_total"
      return 0
    fi

    title=$(grep -oiE '<title[^>]*>[^<]+</title>' "$tmp" | head -1 | tr '\n' ' ' || true)
    snippet=$(head -c 800 "$tmp" | tr '\n\r\t' ' ' | sed 's/  */ /g')
    snippet=$(printf '%.500s' "$snippet")
    diag+=("$path: attempt $a/$ATTEMPTS HTTP 200 but grep missed \"$expect\" bytes=$bytes time_s=$time_total title=${title:-"(none)"}")
    diag+=("$path: attempt $a/$ATTEMPTS body_snippet=$snippet")
    rm -f "$tmp" "$cerr"
    if ((a < ATTEMPTS)); then sleep "$RETRY_SLEEP"; fi
  done

  errors+=("$path: failed after $ATTEMPTS attempt(s) via $url")
  errors+=("${diag[@]}")
  return 0
}

# Homepage must load and be our site, not a parking page or the wrong service.
check_path "/" "Activist Checklist"
# A stable guide page confirms routing beyond the index.
check_path "$GUIDE_PATH"

if ((${#errors[@]} > 0)); then
  body=$(
    printf "healthcheck-onion failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "address=%s source=%s proxy=%s guide_path=%s\n" "$address" "$address_source" "$TOR_SOCKS_PROXY" "$GUIDE_PATH"
    printf "%s\n" "${errors[@]}"
  )
  fail "$body"
fi

ok_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log_echo "healthcheck-onion ok $ok_ts address=$address"
hc_post "${HC_PING_URL%/}" "healthcheck-onion ok $ok_ts address=$address"
trim_log
