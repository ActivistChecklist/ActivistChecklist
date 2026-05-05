#!/bin/bash
# Post-build tasks for ActivistChecklist.org
# Runs automatically after `next build` via the postbuild npm hook

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/build-cli.sh
source "${SCRIPT_DIR}/lib/build-cli.sh"

build_section "🗺️" "Post-build — sitemap & RSS"
build_detail "next-sitemap + yarn rss"
next-sitemap
yarn rss
build_section_done 0 \
  "Sitemap generated (next-sitemap)" \
  "RSS feeds written under out/rss/"

if [ "$BUILD_MODE" = "static" ]; then
  build_section "📦" "Post-build — static export"
  build_detail "Search index, Apache rules, English root mirror"
  yarn index

  cp public/.htaccess out/.htaccess
  node scripts/inject-htaccess-redirects.cjs out/.htaccess

  # Copy English content to root so bare URLs (e.g. /about/) work on any static server.
  # Spanish stays at /es/. The .htaccess rewrite is a fallback for Apache.
  cp -a out/en/* out/

  find out -name '.DS_Store' -delete 2>/dev/null || true

  build_section_done 0 \
    "Pagefind index → out/pagefind & public/pagefind" \
    ".htaccess copied to out/" \
    "English routes mirrored to site root" \
    "Removed .DS_Store from out/"
else
  build_section "🧹" "Post-build — cleanup"
  find out -name '.DS_Store' -delete 2>/dev/null || true
  build_section_done 0 "Removed .DS_Store from out/ (if any)"
fi

if [ -n "$CI" ]; then
  build_section "💾" "Post-build — backup"
  build_detail "CI detected — skipping local out/ backup"
  build_section_done 0 "Backup skipped (CI environment)"
else
  yarn buildbackup
fi
