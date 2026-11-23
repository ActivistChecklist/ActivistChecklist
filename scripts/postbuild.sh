#!/bin/bash
# Post-build tasks for ActivistChecklist.org
# Runs automatically after `next build` via the postbuild npm hook

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/build-cli.sh
source "${SCRIPT_DIR}/lib/build-cli.sh"

# Sitemap/RSS/llms.txt, the SEO audit and the search index only read the
# content and out/*.html and each write their own files, so they run at once.
feeds() {
  build_section "🗺️" "Post-build — sitemap, RSS, llms.txt"
  build_detail "next-sitemap + pnpm rss + build-llms-txt"
  next-sitemap
  pnpm rss
  node scripts/build-llms-txt.cjs
  build_section_done 0 \
    "Sitemap generated (next-sitemap)" \
    "RSS feeds written under out/rss/" \
    "llms.txt written for en + es"
}

seo_audit() {
  build_section "🔍" "Post-build — SEO audit"
  build_detail "Checks seoDescription and seoTitle coverage"
  node scripts/seo-audit.cjs || true
  build_section_done 0 "SEO audit complete (non-blocking)"
}

# Before the English root mirror below, so the index has each page once.
search_index() {
  pnpm index
}

if [ "$BUILD_MODE" = "static" ]; then
  build_parallel feeds seo_audit search_index

  build_section "📦" "Post-build — static export"
  build_detail "Apache rules, English root mirror"

  cp public/.htaccess out/.htaccess
  node scripts/inject-htaccess-redirects.cjs out/.htaccess

  # Copy English content to root so bare URLs (e.g. /about/) work on any static server.
  # Other locales stay at /es/, /fr/, /it/, /ja/. The .htaccess rewrite is a fallback for Apache.
  cp -a out/en/* out/

  find out -name '.DS_Store' -delete 2>/dev/null || true

  # The commit this build is from. .github/workflows/deploy.yml reads it from
  # the live site to see whether a push has been deployed.
  if rev="$(git rev-parse HEAD 2>/dev/null)"; then
    printf '%s\n' "$rev" >out/version.txt
  fi

  build_section_done 0 \
    ".htaccess copied to out/" \
    "English routes mirrored to site root" \
    "Removed .DS_Store from out/" \
    "version.txt: ${rev:-not written (no git)}"

  build_section "📄" "Post-build — guide PDFs"
  build_detail "Renders each guide with the print stylesheet; unchanged guides come from the cache"
  node scripts/build-pdfs.mjs
  build_section_done 0 "Guide PDFs → out/pdf/ (cache: public/pdf/, .pdf-cache.json)"

  build_section "🪧" "Post-build: designed PDFs"
  build_detail "Lays out posters from content/<locale>/pdf/ in every language they have"
  node scripts/build-designed-pdfs.mjs
  build_section_done 0 "Designed PDFs → out/files/pdf/ (cache: public/files/pdf/, .designed-pdf-cache.json)"
else
  build_parallel feeds seo_audit

  build_section "🧹" "Post-build — cleanup"
  find out -name '.DS_Store' -delete 2>/dev/null || true
  build_section_done 0 "Removed .DS_Store from out/ (if any)"
fi
