#!/usr/bin/env bash
#
# The decisions behind scripts/deploy-poll.sh, kept free of side effects so
# __tests__/deploy-poll.test.js can drive them. Source this file:
#   source "$SCRIPT_DIR/lib/deploy-poll.sh"

# deploy_poll_parse_remote
#
# Reads `git ls-remote <remote> refs/heads/<branch>` output on stdin and prints
# the commit SHA. Returns 1 when there is no line, or the first field is not a
# full SHA (so nothing odd ever reaches git's argv or the state files).
deploy_poll_parse_remote() {
  local rev _rest
  IFS=$'\t ' read -r rev _rest || [[ -n "${rev:-}" ]] || return 1
  [[ "$rev" =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] || return 1
  printf '%s' "$rev"
}

# deploy_poll_decide <remote> <live> <building> <checkout> <tried> <tries> <max>
#
#   remote    the commit the branch is on now
#   live      the commit the last publish put live (empty when unknown)
#   building  1 while a build holds the deploy lock, else 0
#   checkout  the commit the server checkout is on (what a running build builds)
#   tried     the commit this poller last started a build for (empty if none)
#   tries     how many builds it has started for <tried>
#   max       builds to start for one commit before waiting for a new one
#
# Prints one of:
#   idle      nothing to do: <remote> is live, or the running build is on it
#   queue     a build is running on an older commit; ask it to go round again
#   start N   start a build of <remote>; N is which attempt this is
#   give-up   <max> builds of <remote> have not put it live; wait for a new commit
deploy_poll_decide() {
  local remote="$1" live="$2" building="$3" checkout="$4" tried="$5" tries="$6" max="$7"

  if [[ "$remote" == "$live" ]]; then
    echo idle
    return
  fi
  if [[ "$building" == 1 ]]; then
    if [[ "$remote" == "$checkout" ]]; then
      echo idle
    else
      echo queue
    fi
    return
  fi

  # A missing or damaged count reads as none, so a bad state file costs at most
  # an extra build rather than stopping deploys.
  [[ "$tries" =~ ^[0-9]+$ ]] || tries=0
  [[ "$max" =~ ^[1-9][0-9]*$ ]] || max=2
  [[ "$tried" == "$remote" ]] || tries=0
  if ((tries >= max)); then
    echo give-up
  else
    echo "start $((tries + 1))"
  fi
}
