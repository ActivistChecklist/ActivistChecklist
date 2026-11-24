#!/usr/bin/env bash
#
# Final verdict for scripts/healthcheck-listmonk.sh: what to tell healthchecks.io.
# Source this file (do not run standalone):
#   source "$SCRIPT_DIR/lib/listmonk-health-verdict.sh"
#
# Two layers. health_verdict says what happened: OK means listmonk was ALREADY
# up when we looked, and "it was down but I restarted it" is RECOVERED, never OK.
# should_page then decides whether that is worth waking someone for.
#
# Why RECOVERED is never OK (2026-10-06): the check found listmonk down, started
# it inside the Type=oneshot job's cgroup, saw it answer within 5s, pinged OK and
# exited - and systemd reaped listmonk on exit. That repeated every 5 minutes, so
# listmonk served ~5s out of every 300 while healthchecks.io showed an unbroken
# run of green pings. Any restart mechanism that silently stops sticking ends the
# same way if a successful restart counts as healthy. should_page keeps that
# lesson: a restart loop pages on its second run.

# restart_needed <liveness_ok> <roundtrip_verdict>
#
# Echoes true when restarting listmonk could fix what the probes saw:
#   - the liveness probe got no answer, unless the round trip PASSED
#   - listmonk answers, but the round trip says it refused the subscribe (FAIL)
#
# A round trip that PASSED means ac-api reached listmonk and listmonk accepted a
# subscriber moments ago, so a liveness miss next to it is a problem on the
# probe's own path from this host, and a restart only adds a real outage.
#
# Why (2026-11-23): the liveness probe got no answer twice in a row while the
# round trip in the same run went through. The check restarted a listmonk that
# had been serving for days and paged "down", then "up" five minutes later.
restart_needed() {
  local liveness_ok="$1" roundtrip="$2"

  if [[ "$liveness_ok" != true ]]; then
    [[ "$roundtrip" == PASS ]] && printf 'false' || printf 'true'
  elif [[ "$roundtrip" == FAIL ]]; then
    printf 'true'
  else
    printf 'false'
  fi
}

# health_verdict <needed_restart> <liveness_ok> <roundtrip_verdict> <repo_stale>
#
# Echoes exactly one of:
#   OK        - up on arrival, subscribe path not broken, checkout current
#   DOWN      - still not working after any restart attempt
#   RECOVERED - was down on arrival; a restart brought it back. Readers could
#               not subscribe until we got there, so it counts as trouble for
#               should_page.
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

# should_page <verdict> <now_epoch> <last_trouble_epoch>
#
# Echoes true when this run should send a fail ping, false when it should only
# be recorded. <last_trouble_epoch> is when an earlier run last ended DOWN or
# RECOVERED; empty when none is on record.
#   OK               never pages
#   STALE            always pages: a checkout that stopped syncing stays stopped
#   DOWN, RECOVERED  page only when another run ended DOWN or RECOVERED within
#                    the last hour
#
# So one bad run on its own stays quiet. That covers a host reboot (listmonk's
# transient unit dies with it, and the next run restarts it) and a probe that
# misses twice in one run. A real outage is a second bad run five minutes
# later, so it pages after 5 to 10 minutes, and so does a restart loop. A
# listmonk that keeps dying between good runs pages on its second restart
# within the hour.
#
# Why (2026-11-24): a May First kernel reboot took listmonk down for three and
# a half minutes. The first run after boot restarted it, and the RECOVERED
# fail ping paged for an outage that was already over and needed nobody.
should_page() {
  local verdict="$1" now="$2" last="$3"

  case "$verdict" in
    OK) printf 'false' ;;
    STALE) printf 'true' ;;
    *)
      if [[ "$last" =~ ^[0-9]+$ ]] && ((now - last < 3600)); then
        printf 'true'
      else
        printf 'false'
      fi
      ;;
  esac
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
