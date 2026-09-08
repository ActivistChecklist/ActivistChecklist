#!/usr/bin/env bash
#
# HTTP probe for the ac-api health check.
# Source this file (do not run standalone):
#   source "$SCRIPT_DIR/lib/api-probe.sh"
#
# Why this exists: `pm2 status ac-api` reporting "online" only proves PM2 has a
# child process it has not seen exit. It says nothing about whether Fastify bound
# the port, whether the routes registered, or whether the thing answering on 4321
# is even our app. The old monitor pinged Healthchecks green on that text alone,
# so a wedged-but-running API looked perfectly healthy.
#
# The trap that makes a status-code-only probe insufficient is visible in
# api/subscribe.js: the handler RETURNS its result object instead of setting a
# status code, so Fastify serializes a failure as HTTP 200. Any endpoint in this
# API can answer 200 while being broken, so the probe asserts on the body.
#
# This is the sibling of scripts/lib/listmonk-roundtrip.sh and deliberately not a
# reuse of it: there, an unreachable site API means "not listmonk's fault, do not
# restart". Here, an unreachable API is exactly the thing we manage, so it gets
# its own DOWN verdict that DOES trigger a restart. Same shape, inverted meaning.

# classify_api_probe <http_code> <body> <marker>
#
# Echoes exactly one verdict:
#   PASS         - the API answered and served the expected payload.
#   FAIL         - something answered on the port with HTTP 200, but not our
#                  payload: routes failed to register, a handler returned an
#                  error object, or another process owns the port. Restart.
#   DOWN         - nothing answered (refused/timeout/DNS), or the API returned
#                  5xx. This is our process, so it also means restart.
#   INCONCLUSIVE - rate limited. Proves nothing either way; never restart on it.
#   BAD_REQUEST  - a 4xx that means the probe itself is pointed at the wrong
#                  place. Restarting cannot fix a bad API_HEALTH_PROBE_URL, so
#                  this must stay distinct from DOWN.
classify_api_probe() {
  local code="$1" body="${2:-}" marker="${3:-}"

  case "$code" in
    429) printf 'INCONCLUSIVE'; return 0 ;;
    400 | 401 | 403 | 404 | 405 | 422) printf 'BAD_REQUEST'; return 0 ;;
  esac

  # curl writes 000 when it never got an HTTP response at all (connection
  # refused while PM2 restarts, TLS failure, timeout).
  if [[ "$code" == "000" ]] || { [[ "$code" =~ ^[0-9]+$ ]] && ((code >= 500)); }; then
    printf 'DOWN'
    return 0
  fi

  if [[ "$code" == "200" ]]; then
    # Fixed-string containment, not a regex: the marker is operator-supplied via
    # API_HEALTH_PROBE_MARKER and must not be interpreted as a pattern.
    if [[ -n "$marker" && "$body" == *"$marker"* ]]; then
      printf 'PASS'
    else
      printf 'FAIL'
    fi
    return 0
  fi

  # Any other 2xx/3xx is not the contract this endpoint documents. Treat it as a
  # broken app rather than a healthy one - a redirect here usually means we hit a
  # proxy or an error page instead of Fastify.
  printf 'FAIL'
}

# api_probe <url> <marker> [timeout_seconds]
#
# Echoes "<verdict> <http_code> <single-line body snippet>".
# Never returns non-zero: the caller decides what a verdict means.
api_probe() {
  local url="$1" marker="$2" timeout="${3:-10}"
  local response code body

  # -s so a failure body is captured rather than dumped; no -f, because a
  # non-2xx body is exactly what we need to classify.
  response="$(curl -s -m "$timeout" -w $'\n%{http_code}' \
    -H 'Accept: application/json' \
    "$url" 2>/dev/null || true)"

  code="${response##*$'\n'}"
  body="${response%$'\n'*}"
  [[ -z "$code" ]] && code="000"
  # When curl fails outright the response is just the code with no body.
  [[ "$body" == "$code" ]] && body=""

  printf '%s %s %s' \
    "$(classify_api_probe "$code" "$body" "$marker")" \
    "$code" \
    "$(printf '%s' "$body" | tr -d '\n' | cut -c1-200)"
}
