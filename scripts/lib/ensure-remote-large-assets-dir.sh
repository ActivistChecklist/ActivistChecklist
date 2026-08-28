#!/usr/bin/env bash
#
# Sourced after load-env.sh when FTP_* point at the production docroot (rsync target).
# Creates docroot/large-assets on the remote host over SSH (same as deploy-remote).
#
ensure_remote_large_assets_dir() {
  : "${FTP_USER:?Set FTP_USER in .env}"
  : "${FTP_HOST:?Set FTP_HOST in .env}"
  : "${FTP_DIR:?Set FTP_DIR in .env}"
  ssh "$FTP_USER@$FTP_HOST" "mkdir -p $(printf %q "$FTP_DIR")/large-assets"
}
