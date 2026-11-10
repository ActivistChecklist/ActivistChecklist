#!/usr/bin/env bash
#
# Trim the PM2 app logs to a short retention window.
#
# PM2 does not rotate logs on its own, so the app logs had grown to hundreds of
# megabytes with entries going back more than a year. Anything logged lives until
# someone notices, which is how PII from a since-fixed logging bug stayed on disk
# for so long. Keep the window short so a future logging mistake has a bounded
# blast radius.
#
# Truncates in place with `: >` rather than deleting: PM2 holds the file open, so
# unlinking it would leave the daemon writing to an invisible inode until restart.
#
# Also caps PM2's own daemon log ($PM2_HOME/pm2.log), which sits beside the app
# logs rather than among them, at its last 256 kB once it passes 1 MB. It records
# process starts, stops and crashes, not requests, so it keeps more history.
#
# Scheduler example (daily):
#   /absolute/path/to/repo/scripts/rotate-api-logs.sh
#
# Env vars:
#   API_LOG_DIR          — PM2 log dir (default: $API_HEALTH_PM2_HOME/logs)
#   API_LOG_RETAIN_HOURS — keep entries newer than this (default: 24)
#   API_LOG_MAX_BYTES    — truncate outright above this size (default: 52428800)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "rotate-api-logs.log" "$(resolve_server_log_lines_keep)"

PM2_HOME_DIR="${API_HEALTH_PM2_HOME:-$PROJECT_DIR/.pm2}"
LOG_DIR_TARGET="${API_LOG_DIR:-$PM2_HOME_DIR/logs}"
RETAIN_HOURS="${API_LOG_RETAIN_HOURS:-24}"
MAX_BYTES="${API_LOG_MAX_BYTES:-52428800}"

if [[ ! "$RETAIN_HOURS" =~ ^[0-9]+$ ]] || (( RETAIN_HOURS < 1 )); then
  log_echo "ERROR: API_LOG_RETAIN_HOURS must be an integer >= 1 (got '$RETAIN_HOURS')"
  exit 1
fi
if [[ ! -d "$LOG_DIR_TARGET" ]]; then
  log_echo "Nothing to do: $LOG_DIR_TARGET does not exist"
  exit 0
fi

cutoff_ms=$(( ($(date +%s) - RETAIN_HOURS * 3600) * 1000 ))
log_echo "=== rotate-api-logs dir=$LOG_DIR_TARGET retain_hours=$RETAIN_HOURS ==="

shopt -s nullglob
for f in "$LOG_DIR_TARGET"/*.log; do
  size=$(wc -c <"$f" | tr -d ' ')

  # Oversized files are truncated outright rather than filtered: parsing hundreds
  # of MB line by line costs more than the history is worth.
  if (( size > MAX_BYTES )); then
    : >"$f"
    log_echo "truncated (was $size bytes, over ${MAX_BYTES}): $(basename "$f")"
    continue
  fi

  # Keep pino JSON lines newer than the cutoff. Lines without a parseable "time"
  # (plain console.log output) are dropped, since they cannot be dated and are
  # the noisiest part of the file.
  kept="$(mktemp)"
  awk -v cutoff="$cutoff_ms" '
    match($0, /"time":[0-9]+/) {
      t = substr($0, RSTART + 7, RLENGTH - 7) + 0
      if (t >= cutoff) print
    }
  ' "$f" >"$kept" 2>/dev/null || true

  new_size=$(wc -c <"$kept" | tr -d ' ')
  cat "$kept" >"$f"
  rm -f "$kept"
  log_echo "trimmed $(basename "$f"): $size -> $new_size bytes"
done

daemon_log="$PM2_HOME_DIR/pm2.log"
if [[ -f "$daemon_log" ]]; then
  size=$(wc -c <"$daemon_log" | tr -d ' ')
  if (( size > 1048576 )); then
    # tail -n +2 drops the line the byte cut landed in the middle of.
    kept="$(mktemp)"
    tail -c 262144 "$daemon_log" | tail -n +2 >"$kept"
    cat "$kept" >"$daemon_log"
    rm -f "$kept"
    log_echo "trimmed pm2.log: $size -> $(wc -c <"$daemon_log" | tr -d ' ') bytes"
  fi
fi

log_echo "=== rotate-api-logs done ==="
trim_log
