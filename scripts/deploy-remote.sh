#!/usr/bin/env bash
set -e

# Load deploy/upload vars from .env (FTP_*, ENV_PRODUCTION_PATH, REMOTE_*)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Keep previous behavior for deploy-remote by defaulting to .env.
# You can override with ENV_FILE=/path/to/file.
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/ensure-remote-large-assets-dir.sh"

: "${REMOTE_SSH_HOST:?Set REMOTE_SSH_HOST in .env (e.g. user@host or SSH alias)}"
LOCAL_ENV_PRODUCTION_FILE="${LOCAL_ENV_PRODUCTION_FILE:-$ROOT/.env.production.local}"
: "${LOCAL_ENV_PRODUCTION_FILE:?Set LOCAL_ENV_PRODUCTION_FILE to local env production file path}"
if [[ ! -f "$LOCAL_ENV_PRODUCTION_FILE" ]]; then
  echo "Missing local production env file: $LOCAL_ENV_PRODUCTION_FILE" >&2
  exit 1
fi

REMOTE_SKIP_GIT="${REMOTE_SKIP_GIT:-0}"
REMOTE_SKIP_API="${REMOTE_SKIP_API:-0}"
REMOTE_GIT_BRANCH="${REMOTE_GIT_BRANCH:-main}"

if [[ "$REMOTE_SKIP_GIT" != "1" ]] || [[ "$REMOTE_SKIP_API" != "1" ]]; then
  : "${REMOTE_REPO_PATH:?Set REMOTE_REPO_PATH in .env to absolute path of git checkout on the server (or set REMOTE_SKIP_GIT=1 and REMOTE_SKIP_API=1)}"
fi

echo "===> Uploading built site (out/) to $FTP_HOST..."
RSYNC_EXCLUDE=()
if [[ -f "$ROOT/.rsync-exclude" ]]; then
  RSYNC_EXCLUDE=(--exclude-from="$ROOT/.rsync-exclude")
fi
# Server-only large files (see .rsync-exclude); create once so uploads have a stable path.
ensure_remote_large_assets_dir
rsync -avz --delete "${RSYNC_EXCLUDE[@]}" "$ROOT/out/" "$FTP_USER@$FTP_HOST:$FTP_DIR"

echo "===> Uploading remote .env.production from $LOCAL_ENV_PRODUCTION_FILE..."
rsync -avz "$LOCAL_ENV_PRODUCTION_FILE" "$FTP_USER@$FTP_HOST:$ENV_PRODUCTION_PATH"

if [[ "$REMOTE_SKIP_GIT" == "1" ]]; then
  echo "===> Skipping git pull (REMOTE_SKIP_GIT=1)."
else
  echo "===> Connecting to remote and force-syncing git branch: $REMOTE_GIT_BRANCH ..."
  # Default remote shell (not bash -l): avoids  login shell landing in $HOME and breaking cd into include/.
  ssh "$REMOTE_SSH_HOST" "cd $(printf %q "$REMOTE_REPO_PATH") && git fetch origin --prune && git checkout $REMOTE_GIT_BRANCH && git reset --hard origin/$REMOTE_GIT_BRANCH"
fi

if [[ "$REMOTE_SKIP_API" == "1" ]]; then
  echo "===> Skipping API restart (REMOTE_SKIP_API=1)."
else
  echo "===> Restarting API (run-with-repo-node.sh api:restart)..."
  ssh "$REMOTE_SSH_HOST" "bash -lc \"cd $(printf %q "$REMOTE_REPO_PATH") && ./scripts/run-with-repo-node.sh api:restart\""
fi

echo "===> Deploy complete."
