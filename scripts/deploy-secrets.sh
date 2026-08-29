#!/usr/bin/env bash
#
# Push secrets/config that are deliberately not in git:
#   1. .env.production + public/webhooks/ to the main site server
#   2. .env.production to the newsletter server (the listmonk host)
#
# The two servers are different accounts with different absolute paths, so each
# has its own local source file. Nothing here is committed - see .env.template
# for the (path-free) list of variables.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=../.env
source "$ROOT/.env"

# Turn a possibly-relative path from .env into an absolute one under the repo.
resolve_local_file() {
  local path="$1"
  if [[ "$path" != /* ]]; then
    path="$ROOT/${path#./}"
  fi
  printf '%s' "$path"
}

# ---------------------------------------------------------------------------
# Main site server
# ---------------------------------------------------------------------------
: "${FTP_HOST:?Set FTP_HOST in .env}"
: "${FTP_USER:?Set FTP_USER in .env}"
: "${FTP_DIR:?Set FTP_DIR in .env (remote web root, e.g. web or /public_html)}"
: "${ENV_PRODUCTION_PATH:?Set ENV_PRODUCTION_PATH in .env (remote .env.production file path)}"
: "${LOCAL_ENV_PRODUCTION_FILE:=./.env.production.local}"
LOCAL_ENV_PRODUCTION_FILE="$(resolve_local_file "$LOCAL_ENV_PRODUCTION_FILE")"
if [[ ! -f "$LOCAL_ENV_PRODUCTION_FILE" ]]; then
  echo "Missing local production env file: $LOCAL_ENV_PRODUCTION_FILE" >&2
  exit 1
fi

WEBHOOK_SECRETS_LOCAL="$ROOT/public/webhooks/webhook-secrets.local.php"
if [[ ! -f "$WEBHOOK_SECRETS_LOCAL" ]]; then
  echo "Missing $WEBHOOK_SECRETS_LOCAL" >&2
  echo "Copy public/webhooks/webhook-secrets.example.php → webhook-secrets.local.php and fill in secrets." >&2
  exit 1
fi

echo "===> [site] Uploading remote .env.production from $LOCAL_ENV_PRODUCTION_FILE..."
rsync -avz "$LOCAL_ENV_PRODUCTION_FILE" "$FTP_USER@$FTP_HOST:$ENV_PRODUCTION_PATH"

echo "===> [site] Syncing public/webhooks/ to $FTP_HOST:$FTP_DIR/webhooks/ ..."
# Exclude webhook-secrets.local.php from this pass: with --delete, an absent local copy would
# remove the file from the server; we upload it in the next step instead.
rsync -avz --delete \
  --exclude 'deploy-webhook.error.log' \
  --exclude '*.log' \
  --exclude 'webhook-secrets.local.php' \
  "$ROOT/public/webhooks/" \
  "$FTP_USER@$FTP_HOST:$FTP_DIR/webhooks/"

echo "===> [site] Uploading webhook-secrets.local.php..."
rsync -avz "$WEBHOOK_SECRETS_LOCAL" "$FTP_USER@$FTP_HOST:$FTP_DIR/webhooks/"

# ---------------------------------------------------------------------------
# Newsletter server (listmonk host)
# ---------------------------------------------------------------------------
# Optional: skipped cleanly when unconfigured. This box runs no webhooks - it
# only needs its own .env.production for the listmonk cron scripts.
NEWSLETTER_SSH_HOST="${NEWSLETTER_SSH_HOST:-}"
NEWSLETTER_ENV_PRODUCTION_PATH="${NEWSLETTER_ENV_PRODUCTION_PATH:-}"
LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE="${LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE:-./.env.production.newsletter.local}"

if [[ -z "$NEWSLETTER_SSH_HOST" || -z "$NEWSLETTER_ENV_PRODUCTION_PATH" ]]; then
  echo "===> [newsletter] Skipped - set NEWSLETTER_SSH_HOST and NEWSLETTER_ENV_PRODUCTION_PATH in .env"
else
  LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE="$(resolve_local_file "$LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE")"
  if [[ ! -f "$LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE" ]]; then
    echo "Missing local newsletter env file: $LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE" >&2
    exit 1
  fi
  echo "===> [newsletter] Uploading .env.production from $LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE..."
  rsync -avz "$LOCAL_NEWSLETTER_ENV_PRODUCTION_FILE" \
    "$NEWSLETTER_SSH_HOST:$NEWSLETTER_ENV_PRODUCTION_PATH"
  # The file carries the listmonk healthchecks ping URL; keep it owner-only.
  ssh "$NEWSLETTER_SSH_HOST" "chmod 600 '$NEWSLETTER_ENV_PRODUCTION_PATH'"
fi

echo "===> deploy:secrets complete."
