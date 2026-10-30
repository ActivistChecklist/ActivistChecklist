#!/usr/bin/env bash
#
# Shared NVM + pnpm for cron, webhooks, and SSH one-liners.
# Source this file (do not run standalone):
#   source "$SCRIPT_DIR/lib/nvm-pnpm.sh"
#
# Configure before nvm_pnpm_init:
#   NVM_PNPM_PROJECT_DIR   — absolute repo root (required)
#   NVM_PNPM_USE_NVM       — 0 (default) or 1 — use "nvm exec <ver> pnpm"
#   NVM_PNPM_NVM_DIR       — default $HOME/.nvm
#   NVM_PNPM_NODE_VERSION  — optional; else first real line of $PROJECT_DIR/.nvmrc
#   NVM_PNPM_PATH_EXTRA    — optional PATH prefix
#   NVM_PNPM_AUTO_INSTALL  — 1 (default when NVM_PNPM_USE_NVM=1) or 0 — when the
#                            version is not installed, `nvm install` it first
#                            (see nvm_pnpm__ensure_installed)
#
# Optional: define nvm_pnpm_err(message) before sourcing to route errors and
# progress messages (e.g. to log_echo or deploy log).
#
# After successful nvm_pnpm_init:
#   NVM_PNPM_RESOLVED_VERSION — non-empty when pnpm must run via nvm exec
#
# Run pnpm: nvm_pnpm install …   (same args as pnpm)

nvm_pnpm__err() {
  if declare -F nvm_pnpm_err >/dev/null 2>&1; then
    nvm_pnpm_err "$1"
  else
    printf '%s\n' "$1" >&2
  fi
}

# Echo first Node version line from repo .nvmrc (skip blanks / # comments).
nvm_pnpm_read_nvmrc() {
  local project_dir="$1"
  local f="$project_dir/.nvmrc"
  [[ -f "$f" ]] || { printf ''; return 0; }
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    line="${line//$'\r'/}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -n "$line" ]] && { printf '%s' "$line"; return 0; }
  done <"$f"
  printf ''
}

nvm_pnpm__prepend_path() {
  if [[ -n "${NVM_PNPM_PATH_EXTRA:-}" ]]; then
    export PATH="$NVM_PNPM_PATH_EXTRA:$PATH"
  fi
  # pnpm global bin dirs (Linux: ~/.local/share/pnpm, macOS: ~/Library/pnpm).
  export PATH="$HOME/bin:$HOME/.local/bin:$HOME/.local/share/pnpm:$HOME/Library/pnpm:$PATH"
}

# Install Node $1 through nvm when no installed version satisfies it, so bumping
# .nvmrc in a PR is the whole upgrade: the next deploy or scheduled job on the
# server installs it rather than failing at `nvm exec`. nvm verifies the
# download against the release's SHASUMS256.txt.
#
# Every job on the host shares one nvm dir, and the 5-minute healthchecks can
# land on the same version as a webhook deploy, so installs are serialized with
# flock. Whoever gets the lock second re-checks and finds it already installed.
# A partial version ("22") resolves to the newest installed 22.x and never
# triggers an install unless no 22.x exists at all.
nvm_pnpm__ensure_installed() {
  local ver="$1" nvm_dir="$2"
  [[ "$(nvm version "$ver" 2>/dev/null)" != "N/A" ]] && return 0

  if [[ "${NVM_PNPM_AUTO_INSTALL:-1}" != "1" ]]; then
    nvm_pnpm__err "nvm_pnpm_init: Node '$ver' is not installed (NVM_PNPM_AUTO_INSTALL=0); run: nvm install $ver"
    return 1
  fi
  if ! command -v flock >/dev/null 2>&1; then
    nvm_pnpm__err "nvm_pnpm_init: Node '$ver' is not installed and flock is unavailable to serialize the install; run: nvm install $ver"
    return 1
  fi

  local lock_file="$nvm_dir/.nvm-pnpm-install.lock"
  # Subshell so the lock fd is released however it exits. fd 7, not 9:
  # scripts/build-deploy.sh holds its deploy lock on 9.
  (
    if ! flock -w 900 7; then
      nvm_pnpm__err "nvm_pnpm_init: timed out waiting for another Node install ($lock_file)"
      exit 1
    fi
    if [[ "$(nvm version "$ver" 2>/dev/null)" != "N/A" ]]; then
      nvm_pnpm__err "nvm_pnpm_init: Node '$ver' was installed by another job while waiting"
      exit 0
    fi
    nvm_pnpm__err "nvm_pnpm_init: Node '$ver' is not installed; running nvm install $ver"
    # nvm's progress goes to stderr: the deploy log for build-deploy.sh, the
    # journal for scheduled jobs. stdout is left alone for callers that read it.
    if ! nvm install --no-progress "$ver" >&2; then
      nvm_pnpm__err "nvm_pnpm_init: nvm install $ver failed"
      exit 1
    fi
    nvm_pnpm__err "nvm_pnpm_init: installed Node $(nvm version "$ver")"
  ) 7>"$lock_file"
}

nvm_pnpm_init() {
  local project_dir="${NVM_PNPM_PROJECT_DIR:-}"
  if [[ -z "$project_dir" ]] || [[ ! -d "$project_dir" ]]; then
    nvm_pnpm__err "nvm_pnpm_init: NVM_PNPM_PROJECT_DIR must be set to repo root"
    return 1
  fi

  nvm_pnpm__prepend_path
  NVM_PNPM_RESOLVED_VERSION=""
  export NVM_PNPM_RESOLVED_VERSION

  if [[ "${NVM_PNPM_USE_NVM:-0}" != "1" ]]; then
    if command -v corepack >/dev/null 2>&1; then
      corepack enable >/dev/null 2>&1 || true
    fi
    if ! command -v pnpm >/dev/null 2>&1; then
      nvm_pnpm__err "nvm_pnpm_init: pnpm not found (NVM_PNPM_USE_NVM=0)"
      return 1
    fi
    return 0
  fi

  local nvm_dir="${NVM_PNPM_NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$nvm_dir/nvm.sh" ]]; then
    nvm_pnpm__err "nvm_pnpm_init: NVM_PNPM_USE_NVM=1 but missing $nvm_dir/nvm.sh"
    return 1
  fi

  # Cron sometimes exports npm_config_prefix (e.g. ~/.config/yarn from prior setups).
  # nvm refuses to run until it is unset. See: nvm.sh "not compatible with npm_config_prefix".
  unset npm_config_prefix
  unset NPM_CONFIG_PREFIX

  # --no-use: everything below goes through `nvm exec`, and nvm's default auto-use
  # reads .nvmrc from the cwd and fails (status 3, fatal under set -e) whenever
  # that version is not installed yet, i.e. before ensure_installed can run.
  # shellcheck disable=SC1090
  source "$nvm_dir/nvm.sh" --no-use

  local ver="${NVM_PNPM_NODE_VERSION:-}"
  if [[ -z "$ver" ]]; then
    ver="$(nvm_pnpm_read_nvmrc "$project_dir")"
  fi
  if [[ -z "$ver" ]]; then
    nvm_pnpm__err "nvm_pnpm_init: set NVM_PNPM_NODE_VERSION or add .nvmrc under $project_dir"
    return 1
  fi

  nvm_pnpm__ensure_installed "$ver" "$nvm_dir" || return 1

  if ! nvm exec "$ver" node -v >/dev/null 2>&1; then
    nvm_pnpm__err "nvm_pnpm_init: nvm exec '$ver' node failed"
    return 1
  fi

  # Activate corepack-managed pnpm under the selected Node version, then sanity-check.
  nvm exec "$ver" corepack enable >/dev/null 2>&1 || true
  if ! nvm exec "$ver" pnpm --version >/dev/null 2>&1; then
    nvm_pnpm__err "nvm_pnpm_init: pnpm not found under Node $ver"
    return 1
  fi

  NVM_PNPM_RESOLVED_VERSION="$ver"
  export NVM_PNPM_RESOLVED_VERSION
  return 0
}

nvm_pnpm() {
  if [[ -n "${NVM_PNPM_RESOLVED_VERSION:-}" ]]; then
    unset npm_config_prefix
    unset NPM_CONFIG_PREFIX
    nvm exec "$NVM_PNPM_RESOLVED_VERSION" pnpm "$@"
  else
    command pnpm "$@"
  fi
}
