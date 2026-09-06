#!/usr/bin/env bash
#
# Domain registration expiry monitor with Healthchecks.io ping.
#
# Cron example (weekly, Mondays at 09:00):
#   0 9 * * 1 /absolute/path/to/repo/scripts/healthcheck-domain.sh >/dev/null 2>&1
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"

DOMAIN_NAME="${DOMAIN_NAME:-activistchecklist.org}"
DOMAIN_WARN_DAYS="${DOMAIN_WARN_DAYS:-45}"
DOMAIN_HEALTHCHECK_PING_URL="${DOMAIN_HEALTHCHECK_PING_URL:-}"

if [[ -z "$DOMAIN_HEALTHCHECK_PING_URL" ]]; then
  echo "DOMAIN_HEALTHCHECK_PING_URL is required" >&2
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
  hc_post "${DOMAIN_HEALTHCHECK_PING_URL%/}/fail" "$msg"
  exit 1
}

expiry_raw=""
source_method=""

# 1) Try WHOIS first when available.
if command -v whois >/dev/null 2>&1; then
  whois_out="$(whois "$DOMAIN_NAME" 2>/dev/null || true)"
  if [[ -n "$whois_out" ]]; then
    expiry_raw="$(
      echo "$whois_out" | awk -F: '
        BEGIN {IGNORECASE=1}
        $1 ~ /(Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expiry Date|paid-till|renewal date|expire|expires)/ {
          sub(/^[^:]*:[[:space:]]*/, "", $0)
          print $0
          exit
        }
      '
    )"
    if [[ -n "$expiry_raw" ]]; then
      source_method="whois"
    fi
  fi
fi

# 2) Fallback to RDAP over HTTPS (no whois binary/sudo required).
# rdap.org is a bootstrap/redirect service: it answers 302 pointing at the TLD's
# authoritative server (.org -> rdap.publicinterestregistry.org), so -L is required.
# Without it curl returns an empty body and the check fails as expiry_not_found.
if [[ -z "$expiry_raw" ]]; then
  rdap_json="$(curl -fsSL --max-time 15 "https://rdap.org/domain/${DOMAIN_NAME}" 2>/dev/null || true)"
  if [[ -n "$rdap_json" ]]; then
    one_line_json="$(echo "$rdap_json" | tr -d '\n' | tr -d '\r')"
    # Common case: eventAction then eventDate in same event object.
    expiry_raw="$(echo "$one_line_json" | sed -n 's/.*"eventAction"[[:space:]]*:[[:space:]]*"expiration"[^}]*"eventDate"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    # Less common ordering: eventDate appears before eventAction.
    if [[ -z "$expiry_raw" ]]; then
      expiry_raw="$(echo "$one_line_json" | sed -n 's/.*"eventDate"[[:space:]]*:[[:space:]]*"\([^"]*\)"[^}]*"eventAction"[[:space:]]*:[[:space:]]*"expiration".*/\1/p')"
    fi
    if [[ -n "$expiry_raw" ]]; then
      source_method="rdap"
    fi
  fi
fi

expiry_raw="$(echo "$expiry_raw" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [[ -z "$expiry_raw" ]]; then
  fail "domain-check failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) domain=$DOMAIN_NAME reason=expiry_not_found whois_or_rdap"
fi

# Normalize: take first token that looks like a date for ISO-ish formats.
# Examples: 2027-01-21T23:59:59Z, 2027-01-21, 2027.01.21, 20270121
expiry_token="$(echo "$expiry_raw" | awk '{print $1}' | sed 's/T.*$//')"
expiry_token="${expiry_token//./-}"

expiry_epoch=""
if [[ "$expiry_token" =~ ^[0-9]{8}$ ]]; then
  # YYYYMMDD
  y="${expiry_token:0:4}"; m="${expiry_token:4:2}"; d="${expiry_token:6:2}"
  expiry_token="${y}-${m}-${d}"
fi

expiry_epoch="$(date -j -f "%Y-%m-%d" "$expiry_token" +%s 2>/dev/null || date -d "$expiry_token" +%s 2>/dev/null || echo "")"
if [[ -z "$expiry_epoch" ]]; then
  fail "domain-check failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) domain=$DOMAIN_NAME reason=could_not_parse_expiry expiry_raw=$(echo "$expiry_raw" | tr '\n' ' ' | head -c 120)"
fi

now_epoch="$(date +%s)"
days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

if [[ "$days_left" -lt 0 ]]; then
  fail "domain-check failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) domain=$DOMAIN_NAME expired_days_ago=$(( -days_left )) expiry=$expiry_token"
fi

if [[ "$days_left" -lt "$DOMAIN_WARN_DAYS" ]]; then
  fail "domain-check failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) domain=$DOMAIN_NAME days_left=$days_left warn_days=$DOMAIN_WARN_DAYS expiry=$expiry_token"
fi

hc_post "${DOMAIN_HEALTHCHECK_PING_URL%/}" "domain-check ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") domain=$DOMAIN_NAME days_left=$days_left expiry=$expiry_token source=$source_method"

