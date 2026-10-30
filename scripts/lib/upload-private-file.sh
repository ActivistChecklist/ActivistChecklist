#!/usr/bin/env bash
#
# Sourced by deploy-secrets.sh and deploy-remote.sh to push a secrets file
# (.env.production, webhook-secrets.local.php) to a server as owner-only.
#
# The local file may hold 1Password secret references instead of values:
#   RESEND_API_KEY={{ op://<vault>/<item-id>/password }}
# When it does, the file goes through `op inject`, so the real values exist only
# in this shell's memory and on the server, never on local disk. A file with no
# references is sent as-is.
#
# The upload lands in a temp file that is renamed into place, so a failed
# 1Password read or a dropped connection leaves the server's current copy alone
# instead of truncating it.
#
# Usage: upload_private_file <local file> <ssh target> <remote path>
upload_private_file() {
  local src="$1" target="$2" dest="$3" content tmp
  if grep -q 'op://' "$src"; then
    echo "===> Reading $(basename "$src") secrets from 1Password..."
    # Bracket each reference with a marker so an item whose field is still empty
    # shows up as an empty pair, instead of shipping a blank secret. A blank
    # webhook secret would be worse than an outage.
    content="$(sed -E 's/\{\{ *op:\/\/[^}]*\}\}/@@OP@@&@@OP@@/g' "$src" | op inject)" || return 1
    if [[ "$content" == *@@OP@@@@OP@@* ]]; then
      echo "Refusing to upload $src: a 1Password reference has an empty value" >&2
      return 1
    fi
    content="${content//@@OP@@/}"
  else
    content="$(cat "$src")" || return 1
  fi
  if [[ -z "$content" ]]; then
    echo "Refusing to upload an empty $src" >&2
    return 1
  fi
  # The webhook config sits in the docroot with no .htaccess guarding it. Keep
  # .php last on the temp name so a request for it runs PHP (which prints
  # nothing) rather than serving the secrets as text.
  case "$dest" in
    *.php) tmp="${dest%.php}.upload.php" ;;
    *) tmp="$dest.upload" ;;
  esac
  # umask 077: the file is created 600. PHP on the site host runs as the same
  # account, so the webhook config stays readable to it.
  printf '%s\n' "$content" |
    ssh "$target" "umask 077 && cat > $(printf %q "$tmp") && mv -f $(printf %q "$tmp") $(printf %q "$dest")"
}
