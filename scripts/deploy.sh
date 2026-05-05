#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env once for local deploy flows.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"

# Force production for the build. .env may set NODE_ENV=development for local dev
# (load-env.sh exports it via `set -a`), and Next.js bundles a dev-mode chunk that
# breaks the static export of /_error: /404 with a misleading <Html> error.
export NODE_ENV=production

cd "$ROOT"
yarn buildstatic
bash "$SCRIPT_DIR/deploy-remote.sh"
