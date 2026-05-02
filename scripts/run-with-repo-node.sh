#!/usr/bin/env bash
#
# Run yarn (or any trailing command) using the repo Node version (.nvmrc + nvm).
# Use from SSH/cron when login shells do not load nvm:
#   ./scripts/run-with-repo-node.sh api:restart
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/nvm-yarn.sh"

export NVM_YARN_PROJECT_DIR="${NVM_YARN_PROJECT_DIR:-$REPO_ROOT}"
export NVM_YARN_USE_NVM="${NVM_YARN_USE_NVM:-0}"
export NVM_YARN_NVM_DIR="${NVM_YARN_NVM_DIR:-$HOME/.nvm}"
export NVM_YARN_NODE_VERSION="${NVM_YARN_NODE_VERSION:-}"
export NVM_YARN_PATH_EXTRA="${NVM_YARN_PATH_EXTRA:-}"

cd "$NVM_YARN_PROJECT_DIR"
nvm_yarn_init || exit 127
# `exec` cannot replace the shell with a shell function — `nvm_yarn` is defined
# in lib/nvm-yarn.sh, not on PATH. Call it normally; `set -e` propagates its exit code.
nvm_yarn "$@"
