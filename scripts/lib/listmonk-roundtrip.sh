#!/usr/bin/env bash
#
# Round-trip subscribe probe for the listmonk health check.
# Source this file (do not run standalone):
#   source "$SCRIPT_DIR/lib/listmonk-roundtrip.sh"
#
# Why this exists: probing listmonk's own /api/health only proves the process is
# listening. The path that actually matters to a reader is
#   site nginx -> ac-api (Fastify) -> lib/listmonk -> listmonk -> postgres
# and every hop past nginx can be broken while /api/health still answers. This
# posts a real subscribe request to the SITE's public endpoint, the same one the
# footer form calls, and reads the JSON verdict out of the response.
#
# The subtle part is that api/subscribe.js *returns* its result object rather
# than setting a status code, so Fastify answers HTTP 200 even when the
# subscribe failed. Checking the status code alone reports green for a dead
# listmonk. The body must say "success":true.
#
# Repeat runs do not grow the subscriber table: lib/listmonk.js maps listmonk's
# 409 "e-mail already exists" onto success, so the monitor address is created
# once and every later run re-confirms the same row.

# classify_roundtrip <http_code> <body>
#
# Echoes exactly one verdict:
#   PASS          - full round trip confirmed; listmonk accepted the subscriber
#   FAIL          - the site API answered, but listmonk did not accept it.
#                   This is the case that means "restart listmonk".
#   INCONCLUSIVE  - rate limited (nginx in front, or the Fastify limiter on
#                   /subscribe). Proves nothing either way; never restart on it.
#   BAD_REQUEST   - the site API rejected our probe payload (schema/validation).
#                   A monitor misconfiguration, not a listmonk outage.
#   UPSTREAM_DOWN - the site API itself is unreachable or erroring. Restarting
#                   listmonk cannot fix this, so it must not trigger one.
classify_roundtrip() {
  local code="$1" body="${2:-}"

  case "$code" in
    429) printf 'INCONCLUSIVE'; return 0 ;;
    400 | 401 | 403 | 404 | 405 | 422) printf 'BAD_REQUEST'; return 0 ;;
  esac

  # curl writes 000 when it never got an HTTP response at all (DNS, TLS, timeout).
  if [[ "$code" == "000" || "$code" -ge 500 ]] 2>/dev/null; then
    printf 'UPSTREAM_DOWN'
    return 0
  fi

  if [[ "$code" == "200" ]]; then
    # Tolerate whitespace variations from any future serializer change.
    if [[ "$body" =~ \"success\"[[:space:]]*:[[:space:]]*true ]]; then
      printf 'PASS'
    else
      printf 'FAIL'
    fi
    return 0
  fi

  # Any other 2xx/3xx is not the contract this endpoint documents.
  printf 'UPSTREAM_DOWN'
}

# roundtrip_probe <subscribe_url> <email> <name> [timeout_seconds]
#
# Echoes "<verdict> <http_code> <single-line body snippet>".
# Never returns non-zero: the caller decides what a verdict means.
roundtrip_probe() {
  local url="$1" email="$2" name="$3" timeout="${4:-20}"
  local payload response code body

  # jq is not guaranteed on these shared hosts; the two fields are monitor
  # constants under our control, so a printf is safe here.
  payload="$(printf '{"email":"%s","name":"%s"}' "$email" "$name")"

  # -s so a failure body is captured rather than dumped; no -f, because a
  # non-2xx body is exactly what we need to classify.
  response="$(curl -s -m "$timeout" -w $'\n%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    --data-raw "$payload" \
    "$url" 2>/dev/null || true)"

  code="${response##*$'\n'}"
  body="${response%$'\n'*}"
  [[ -z "$code" ]] && code="000"
  # When curl fails outright the response is just the code with no body.
  [[ "$body" == "$code" ]] && body=""

  printf '%s %s %s' \
    "$(classify_roundtrip "$code" "$body")" \
    "$code" \
    "$(printf '%s' "$body" | tr -d '\n' | cut -c1-200)"
}
