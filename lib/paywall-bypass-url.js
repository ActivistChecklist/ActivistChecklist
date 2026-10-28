/**
 * Central paywall bypass "middleware" for URLs.
 *
 * - **React UI:** use `<Link href={url}>` (components/Link.js) or Markdown (components/Markdown.js);
 *   both call `applyPaywallBypassHref`.
 * - **Non-React (RSS, etc.):** call `applyPaywallBypassHref(url)` so feeds match the site.
 *
 * Domain suffix → bypass mode. Keys are lowercase host suffixes (no leading dot), longest match wins.
 * Links to a matched site’s homepage only (path `/` or empty) are not rewritten.
 *
 * Modes: inactive | unwall | wayback_oldest | wayback_newest
 *
 */

export const PAYWALL_BYPASS_BY_HOST_SUFFIX = {
  '404media.co': 'wayback_oldest',
  'nytimes.com': 'unwall',
  'washingtonpost.com': 'unwall',
  'forbes.com': 'wayback_newest',
  'syracuse.com': 'unwall',
};

const UNWALL_BASE = 'https://unwall.app';

function normalizeHost(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .replace(/^www\./, '');
}

/**
 * True when the URL is only the publisher root (no path beyond /), e.g. https://www.nytimes.com/
 * Query/hash allowed — still treated as homepage.
 */
function isPublisherHomepageOnly(urlString) {
  try {
    const { pathname } = new URL(urlString.trim());
    return pathname.replace(/\/+$/, '') === '';
  } catch {
    return false;
  }
}

/**
 * Resolve bypass mode for an absolute http(s) URL from PAYWALL_BYPASS_BY_HOST_SUFFIX.
 */
export function getPaywallBypassModeForUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return 'inactive';
  const trimmed = urlString.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return 'inactive';
  }
  try {
    const h = normalizeHost(new URL(trimmed).hostname);
    const entries = Object.entries(PAYWALL_BYPASS_BY_HOST_SUFFIX).sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [suffix, mode] of entries) {
      if (h === suffix || h.endsWith(`.${suffix}`)) {
        if (isPublisherHomepageOnly(trimmed)) return 'inactive';
        return mode;
      }
    }
  } catch {
    /* invalid URL */
  }
  return 'inactive';
}

/** True when `applyPaywallBypassHref` would rewrite this URL (for conditional UI copy). */
export function isPaywallBypassActiveForUrl(url) {
  return getPaywallBypassModeForUrl(url) !== 'inactive';
}

/**
 * Build the unwall / wayback URL from a mode and original article URL.
 */
export function buildBypassUrl(mode, originalUrl) {
  if (!originalUrl || !mode || mode === 'inactive') return null;

  if (mode === 'wayback_oldest') {
    return `https://web.archive.org/web/0/${originalUrl}`;
  }

  if (mode === 'wayback_newest') {
    return `https://web.archive.org/web/${originalUrl}`;
  }

  if (mode === 'unwall') {
    // unwall.app permalinks are the article URL without its scheme, as its own form builds them.
    return `${UNWALL_BASE}/${originalUrl.replace(/^https?:\/\//i, '')}`;
  }

  return null;
}

/**
 * Automatic rewrite for inline links (Markdown, <Link>, MDX SafeLink) on configured domains.
 */
export function applyPaywallBypassHref(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return url;
  }
  const mode = getPaywallBypassModeForUrl(trimmed);
  if (mode === 'inactive') return url;
  return buildBypassUrl(mode, trimmed) || url;
}
