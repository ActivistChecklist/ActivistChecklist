/** @type {import('next-sitemap').IConfig} */
/**
 * Static export writes locale-prefixed folders under `out/` (`/en/`, `/es/`). Public URLs use
 * next-intl `localePrefix: 'as-needed'`: English has no `/en/` prefix; Spanish stays `/es/...`.
 * postbuild mirrors `out/en/*` to the site root after sitemap generation; the sitemap should
 * list canonical public URLs, not internal `/en/` paths.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

['.env', '.env.local', '.env.production', '.env.production.local'].forEach((rel) => {
  const abs = path.join(process.cwd(), rel);
  if (fs.existsSync(abs)) dotenv.config({ path: abs, override: true });
});

const { buildLastmodByPath, lookupContentLastmod } = require('./scripts/sitemap-lastmod-map.cjs');
const {
  buildHreflangAlternateRefs,
  seoPriorityAndChangefreq,
} = require('./scripts/sitemap-seo-fields.cjs');

/** Dedupe after canonicalization (e.g. if both `/en/foo/` and `/foo/` ever appeared). */
const canonicalLocEmitted = new Set();

/** Path → YYYY-MM-DD from guide/page/news/changelog MDX frontmatter (built once per run). */
const lastmodByPath = buildLastmodByPath();

module.exports = {
  siteUrl: 'https://activistchecklist.org',
  generateRobotsTxt: false,
  outDir: 'out',
  generateIndexSitemap: false,
  output: 'export',
  trailingSlash: true,
  /** Use content dates from frontmatter when available; do not stamp every URL with build time. */
  autoLastmod: false,
  exclude: [
    '/api/*',
    '/keystatic*',
    '/preview*',
    '/_next/*',
    '/404*',
  ],
  transform: async (config, path) => {
    /** @type {string} */
    let loc = path.startsWith('/') ? path : `/${path}`;

    // Canonical English URLs (strip static-export `/en/` prefix only).
    if (loc === '/en' || loc === '/en/') {
      loc = '/';
    } else if (loc.startsWith('/en/')) {
      const rest = loc.slice(4);
      loc = rest ? `/${rest}` : '/';
    }

    const dedupeKey = loc.endsWith('/') || loc === '/' ? loc : `${loc}/`;

    if (canonicalLocEmitted.has(dedupeKey)) {
      return null;
    }
    canonicalLocEmitted.add(dedupeKey);

    const contentLastmod = lookupContentLastmod(dedupeKey, lastmodByPath);
    /** W3C date (YYYY-MM-DD) — valid for sitemap lastmod; avoids bogus "build time" stamps. */
    const lastmod = contentLastmod || undefined;

    const { priority, changefreq } = seoPriorityAndChangefreq(dedupeKey);

    return {
      loc,
      lastmod,
      changefreq,
      priority,
      alternateRefs: buildHreflangAlternateRefs(dedupeKey),
      trailingSlash: config.trailingSlash,
    };
  },
};
