#!/bin/bash

# Set NODE_ENV to development if not set
: "${NODE_ENV:=development}"
export NODE_ENV

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/build-cli.sh
source "${SCRIPT_DIR}/lib/build-cli.sh"

build_section "🔎" "Search index — Pagefind"
build_detail "BUILD_MODE=${BUILD_MODE:-unset}  NODE_ENV=${NODE_ENV}"

PF_OK=1
if [ "$BUILD_MODE" = "static" ]; then
  rm -rf out/pagefind
  rm -rf public/pagefind
  if pagefind --site out --output-path out/pagefind && cp -r out/pagefind public/; then
    PF_OK=0
  fi
elif [ "$NODE_ENV" = "development" ]; then
  if [ ! -d "out" ]; then
    build_detail "No out/ yet — running pnpm buildstatic…"
    pnpm buildstatic
  fi
  rm -rf public/pagefind
  if pagefind --site out --output-path public/pagefind; then
    PF_OK=0
  fi
else
  rm -rf public/pagefind
  if pagefind --site .next/server/pages/en --output-path public/pagefind; then
    PF_OK=0
  fi
fi

if [[ "$PF_OK" -eq 0 ]]; then
  build_section_done 0 "Pagefind index built successfully"
else
  build_section_done 1 "Pagefind failed — see errors above"
  exit 1
fi
