#!/usr/bin/env bash
#
# Generic env loader for scripts in this repo.
# Usage:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   # shellcheck disable=SC1091
#   source "$SCRIPT_DIR/load-env.sh"
#
# Behavior:
# - If ENV_FILE is set and readable, load only that file.
# - Otherwise, load the first readable file from:
#     1) .env.production
#     2) .env.local
#     3) .env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

load_env_file() {
  local file="$1"
  # Export all variables declared while sourcing the file.
  set -a
  # shellcheck disable=SC1090
  source "$file"
  # Stop auto-export behavior after sourcing.
  set +a
}

# ---------------------------------------------------------------------------
# Temp directory
# ---------------------------------------------------------------------------
# Optionally point TMPDIR at a directory owned by this account rather than the
# system temp dir, so intermediates (response bodies, media being processed) are
# not left where other local accounts could read them. mktemp, os.tmpdir() and
# most tooling follow TMPDIR automatically.
#
# Opt-in only: set SCRIPTS_TMPDIR in the environment that needs it (production
# does, via .env.production). When it is unset nothing is touched and the system
# default applies, so dev machines behave exactly as they always have.
#
# Called from every exit path below, including the ones that return early: this
# has to run whether or not an env file was found, and SCRIPTS_TMPDIR normally
# comes from the file that was just sourced.
apply_scripts_tmpdir() {
  local dir="${SCRIPTS_TMPDIR:-}"
  [[ -n "$dir" ]] || return 0

  if ! mkdir -p "$dir" 2>/dev/null; then
    echo "warning: could not create temp dir $dir; leaving TMPDIR unchanged" >&2
    return 0
  fi
  # 700: the whole point is that other tenants cannot read what lands here.
  chmod 700 "$dir" 2>/dev/null || true
  export TMPDIR="$dir"
  # Some tooling reads TMP/TEMP rather than TMPDIR; keep all three in step.
  export TMP="$dir"
  export TEMP="$dir"
}

if [[ -n "${ENV_FILE:-}" ]]; then
  if [[ -r "$ENV_FILE" ]]; then
    load_env_file "$ENV_FILE"
    export LOADED_ENV_FILE="$ENV_FILE"
    apply_scripts_tmpdir
    return 0
  fi
  echo "ENV_FILE is set but unreadable: $ENV_FILE" >&2
  return 1
fi

for candidate in "$ROOT_DIR/.env.production" "$ROOT_DIR/.env.local" "$ROOT_DIR/.env"; do
  if [[ -r "$candidate" ]]; then
    load_env_file "$candidate"
    export LOADED_ENV_FILE="$candidate"
    apply_scripts_tmpdir
    return 0
  fi
done

# Not an error: scripts can still run with environment provided externally.
apply_scripts_tmpdir
return 0
