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
#
# Optional: define nvm_pnpm_err(message) before sourcing to route errors
# (e.g. to log_echo or deploy log).
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

  # shellcheck disable=SC1090
  source "$nvm_dir/nvm.sh"

  local ver="${NVM_PNPM_NODE_VERSION:-}"
  if [[ -z "$ver" ]]; then
    ver="$(nvm_pnpm_read_nvmrc "$project_dir")"
  fi
  if [[ -z "$ver" ]]; then
    nvm_pnpm__err "nvm_pnpm_init: set NVM_PNPM_NODE_VERSION or add .nvmrc under $project_dir"
    return 1
  fi

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
