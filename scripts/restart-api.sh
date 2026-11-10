#!/usr/bin/env bash
#
# Restart ac-api now so it loads the code and dependencies on disk. Run it on the
# web host from the repo checkout:
#   ./scripts/restart-api.sh
#
# scripts/build-deploy.sh runs this after a deploy that changed what ac-api runs
# (scripts/lib/api-restart.sh decides that).
#
# It hands the restart to `scripts/healthcheck-api.sh --restart` rather than
# calling `pm2 restart` itself. The health check keeps the PM2 daemon out of the
# caller's cgroup, so the API is not killed along with the deploy or SSH session
# that restarted it. It also moves the daemon to a new Node after a .nvmrc bump,
# waits until the new process actually serves, and fails loudly when it does not.
#
# Clean environment: `pm2 start ecosystem.config.js` copies the caller's whole
# environment into ac-api. From the deploy that would be everything the deploy
# was given; from SSH it would include SSH_CONNECTION, which holds the
# admin's IP address. So the health check gets only what it needs to find Node
# and pnpm, and reads everything else from the repo's env file, the same way its
# timer run does. This covers the caller's environment only: what the systemd
# user manager sets (SSH_AUTH_SOCK on the web host) still reaches ac-api through
# the PM2 daemon it starts.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

env_args=()
for name in HOME USER LOGNAME PATH TMPDIR XDG_RUNTIME_DIR \
  NVM_PNPM_USE_NVM NVM_PNPM_NVM_DIR NVM_PNPM_NODE_VERSION NVM_PNPM_PATH_EXTRA NVM_PNPM_AUTO_INSTALL; do
  if [[ -n "${!name:-}" ]]; then
    env_args+=("$name=${!name}")
  fi
done

exec env -i "${env_args[@]}" /bin/bash "$SCRIPT_DIR/healthcheck-api.sh" --restart </dev/null
