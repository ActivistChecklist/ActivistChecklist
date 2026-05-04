#!/bin/sh

# Git hooks are managed by Husky (see .husky/pre-commit).
# `pnpm install` runs the "prepare" script which executes `husky` and wires .husky/ into Git.

if command -v husky >/dev/null 2>&1; then
  husky
  echo "Husky hooks are active (.husky/pre-commit)."
else
  echo "Husky not found. Run: pnpm install"
  exit 0
fi
