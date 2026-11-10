#!/usr/bin/env bash
#
# Healthchecks pings for the deploy scripts. Source this file:
#   source "$SCRIPT_DIR/lib/hc-ping.sh"

# hc_ping <ping_url> <suffix> [<body_file>]
#
# Pings the check at <ping_url>. <suffix> is empty for success, or "start",
# "fail", "log" or an exit code. <body_file>, when given, is sent as the ping
# body (Healthchecks keeps the first 100 kB).
#
# Always returns 0: a ping that does not get through must never change the
# caller's result. An empty <ping_url> turns the ping off.
#
# The URL is a credential (anyone holding it can mark the check up), so it
# reaches curl on stdin, not in argv where other accounts on the host can see
# it. Its quoting is curl config syntax, so anything that would need escaping
# there is refused.
hc_ping() {
  local base="$1" suffix="$2" body_file="${3:-}" url
  [[ -n "$base" ]] || return 0
  local plain_url='^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
  if [[ ! "$base" =~ $plain_url ]]; then
    printf 'WARN: a Healthchecks ping URL is not a plain https URL; skipping the ping\n' >&2
    return 0
  fi
  url="${base%/}${suffix:+/$suffix}"
  local -a data=()
  if [[ -n "$body_file" ]]; then
    data=(--data-binary "@$body_file")
  fi
  printf 'url = "%s"\n' "$url" |
    curl -fsS -o /dev/null --max-time 30 --retry 3 -K - ${data[@]+"${data[@]}"} ||
    printf 'WARN: Healthchecks ping (%s) failed\n' "${suffix:-success}" >&2
  return 0
}
