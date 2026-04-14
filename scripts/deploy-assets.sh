#!/usr/bin/env bash
#
# Upload public/large-assets/ to production docroot large-assets/ only.
# Uses the same FTP_* rsync target as deploy-remote.sh.
# Default: no --delete (empty local folder will not remove files on the server).
# Set DEPLOY_ASSETS_DELETE=1 to mirror: remove remote files missing locally.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/ensure-remote-large-assets-dir.sh"

LOCAL_ASSETS="${DEPLOY_ASSETS_LOCAL:-$ROOT/public/large-assets}"

if [[ ! -d "$LOCAL_ASSETS" ]]; then
  echo "Missing local assets directory: $LOCAL_ASSETS" >&2
  exit 1
fi

DELETE_FLAG=()
if [[ "${DEPLOY_ASSETS_DELETE:-0}" == "1" ]]; then
  DELETE_FLAG=(--delete)
fi

ensure_remote_large_assets_dir
REMOTE_DIR="$FTP_DIR/large-assets"
echo "===> Syncing large assets → $FTP_USER@$FTP_HOST:$REMOTE_DIR/"
rsync -avz "${DELETE_FLAG[@]}" \
  --exclude '.gitignore' \
  --exclude '.gitkeep' \
  "$LOCAL_ASSETS/" "$FTP_USER@$FTP_HOST:$REMOTE_DIR/"

echo "===> deploy:assets complete."
