#!/usr/bin/env bash
#
# Final verdict for scripts/healthcheck-listmonk.sh: what to tell healthchecks.io.
# Source this file (do not run standalone):
#   source "$SCRIPT_DIR/lib/listmonk-health-verdict.sh"
#
# The rule that matters: green means listmonk was ALREADY up when we looked.
# "It was down but I restarted it" is an outage, and it is reported as one.
#
# Why (2026-10-06): the check found listmonk down, started it inside the
# Type=oneshot job's cgroup, saw it answer within 5s, pinged OK and exited -
# and systemd reaped listmonk on exit. That repeated every 5 minutes, so
# listmonk served ~5s out of every 300 while healthchecks.io showed an unbroken
# run of green pings. Any restart mechanism that silently stops sticking ends
# the same way if a successful restart counts as healthy. With this rule, a
# restart loop is a continuous run of fail pings no matter what causes it.

# health_verdict <needed_restart> <liveness_ok> <roundtrip_verdict> <repo_stale>
#
# Echoes exactly one of:
#   OK        - up on arrival, subscribe path not broken, checkout current
#   DOWN      - still not working after any restart attempt
#   RECOVERED - was down on arrival; a restart brought it back. Pinged as a
#               failure: readers could not subscribe until we got there.
#   STALE     - listmonk is fine, but the server checkout has stopped syncing,
#               so fixes merged to main are not reaching this box.
#
# Ordered most to least severe, so one ping carries the worst thing true now.
health_verdict() {
  local needed_restart="$1" liveness_ok="$2" roundtrip="$3" repo_stale="$4"

  if [[ "$liveness_ok" != true ]]; then
    printf 'DOWN'
    return 0
  fi

  # INCONCLUSIVE (rate limited) and SKIPPED carry no evidence of an outage.
  case "$roundtrip" in
    PASS | INCONCLUSIVE | SKIPPED) ;;
    *) printf 'DOWN'; return 0 ;;
  esac

  if [[ "$needed_restart" == true ]]; then
    printf 'RECOVERED'
  elif [[ "$repo_stale" == true ]]; then
    printf 'STALE'
  else
    printf 'OK'
  fi
}

# repo_is_stale <fetch_head_mtime_epoch> <now_epoch> <max_age_hours>
#
# Echoes true/false. sync-repo.sh fetches every hour, which touches FETCH_HEAD
# even when nothing changed, so an old FETCH_HEAD means the sync job is not
# running. An empty mtime (never fetched) counts as stale. max_age_hours=0
# disables the check.
#
# Why (2026-10-06): May First dropped user crontabs on 2026-09-01 and the
# hourly sync-repo job was never recreated in the control panel. It had no ping
# URL configured, so nothing noticed, and two monitoring fixes merged in
# September (#627, #628) never reached this server.
repo_is_stale() {
  local mtime="$1" now="$2" max_hours="$3"

  if [[ "$max_hours" == "0" ]]; then
    printf 'false'
  elif [[ -z "$mtime" ]]; then
    printf 'true'
  elif ((now - mtime > max_hours * 3600)); then
    printf 'true'
  else
    printf 'false'
  fi
}
