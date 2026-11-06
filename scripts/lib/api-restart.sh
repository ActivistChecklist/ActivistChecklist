#!/usr/bin/env bash
#
# Which deploys have to restart ac-api. Source this file (do not run standalone):
#   source "$SCRIPT_DIR/lib/api-restart.sh"
#
# ac-api keeps running whatever it loaded when it last started. The merge deploy
# (scripts/build-deploy.sh) runs `pnpm install` and rebuilds the static site, so
# a change to the API's code or dependencies sits on disk unused until something
# restarts it. A restart is not free, though: the API is down for a few seconds,
# and the analytics relay's in-memory key goes with it, so every visitor counts
# as new afterwards. Most deploys are content only, and those leave it alone.

# api_path_needs_restart <path>
#
# Returns 0 when a change to <path> (repo-relative, as `git diff --name-only`
# prints it) changes what ac-api runs.
#
# lib/listmonk.js is the one file outside api/ the API loads today.
# __tests__/api-restart.test.js follows the API's requires from its PM2 entry
# point and fails when it reaches a file this list misses.
api_path_needs_restart() {
  case "$1" in
    # Its code, and the PM2 config it starts from.
    api/* | lib/listmonk.js | ecosystem.config.js) return 0 ;;
    # Its dependencies.
    package.json | pnpm-lock.yaml | pnpm-workspace.yaml) return 0 ;;
    # Its Node. The restart goes through scripts/healthcheck-api.sh, which
    # replaces the PM2 daemon when it runs a different Node than .nvmrc pins.
    .nvmrc) return 0 ;;
    *) return 1 ;;
  esac
}

# api_restart_reason <running_rev>
#
# Run inside the checkout that was just deployed. <running_rev> is the commit
# ac-api last started from, as the deploy recorded it (empty when there is no
# record). Prints why ac-api needs a restart and returns 0, or prints nothing and
# returns 1 when nothing it runs differs between <running_rev> and HEAD.
#
# When <running_rev> is missing, malformed or not in this checkout, what changed
# cannot be known, so it says restart. A restart too many costs a few seconds; a
# fix left unloaded is the bug this exists to prevent.
api_restart_reason() {
  local rev="$1" changed path

  if [[ -z "$rev" ]]; then
    printf 'there is no record of which commit it runs'
    return 0
  fi
  # Also keeps anything that is not a plain SHA (an option, say) out of git's argv.
  if ! [[ "$rev" =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]]; then
    printf 'the record of which commit it runs is not a commit SHA'
    return 0
  fi
  if ! git cat-file -e "${rev}^{commit}" 2>/dev/null; then
    printf 'it runs %s, which is not in this checkout' "${rev:0:12}"
    return 0
  fi

  # A tree diff, not a log walk: what matters is whether the files differ, so a
  # change that was made and then reverted between deploys needs no restart.
  # --no-renames lists both sides of a rename, so a file moved out of api/
  # still counts as an api/ change.
  if ! changed="$(git diff --no-renames --name-only "$rev" HEAD --)"; then
    printf 'git could not diff %s against HEAD' "${rev:0:12}"
    return 0
  fi

  while IFS= read -r path; do
    if [[ -n "$path" ]] && api_path_needs_restart "$path"; then
      printf '%s changed since %s' "$path" "${rev:0:12}"
      return 0
    fi
  done <<<"$changed"
  return 1
}
