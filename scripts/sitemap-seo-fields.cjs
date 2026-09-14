/**
 * Extra sitemap fields for SEO: hreflang alternates (matches app alternate metadata)
 * and coarse priority / changefreq hints.
 */

const SITE_URL = 'https://activistchecklist.org'.replace(/\/$/, '');
const LOCALE_PATH_PREFIXES = ['en', 'es', 'ar'];

/**
 * @param {string} dedupeKey — trailing-slash path, may be `/es/...` or English canonical
 * @returns {string} English canonical path with slashes, e.g. `/signal/` or `/`
 */
function normalizeToEnCanonicalPath(dedupeKey) {
  let p = dedupeKey.startsWith('/') ? dedupeKey : `/${dedupeKey}`;
  if (!p.endsWith('/')) p = `${p}/`;
  for (const locale of LOCALE_PATH_PREFIXES) {
    if (p === `/${locale}/` || p === `/${locale}`) return '/';
    const prefix = `/${locale}/`;
    if (p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      return rest ? `/${rest.replace(/\/$/, '')}/` : '/';
    }
  }
  return p;
}

/**
 * Google-supported hreflang cluster for default-locale + translated routes.
 * @param {string} dedupeKey
 * @returns {Array<{ href: string, hreflang: string, hrefIsAbsolute: boolean }>}
 */
function buildHreflangAlternateRefs(dedupeKey) {
  const enPath = normalizeToEnCanonicalPath(dedupeKey);
  const enUrl =
    enPath === '/'
      ? `${SITE_URL}/`
      : `${SITE_URL}${enPath.endsWith('/') ? enPath : `${enPath}/`}`;

  const esUrl =
    enPath === '/'
      ? `${SITE_URL}/es/`
      : `${SITE_URL}/es${enPath.replace(/\/$/, '')}/`;
  const arUrl =
    enPath === '/'
      ? `${SITE_URL}/ar/`
      : `${SITE_URL}/ar${enPath.replace(/\/$/, '')}/`;

  return [
    { href: enUrl, hreflang: 'en', hrefIsAbsolute: true },
    { href: esUrl, hreflang: 'es', hrefIsAbsolute: true },
    { href: arUrl, hreflang: 'ar', hrefIsAbsolute: true },
    { href: enUrl, hreflang: 'x-default', hrefIsAbsolute: true },
  ];
}

/**
 * @param {string} dedupeKey
 * @returns {{ priority: number, changefreq: import('next-sitemap').IConfig['changefreq'] }}
 */
function seoPriorityAndChangefreq(dedupeKey) {
  const enPath = normalizeToEnCanonicalPath(dedupeKey);

  if (enPath === '/') {
    return { priority: 1, changefreq: 'weekly' };
  }

  const hubPaths = ['/checklists/', '/news/', '/changelog/', '/contact/'];
  if (hubPaths.includes(enPath)) {
    return { priority: 0.85, changefreq: 'weekly' };
  }

  return { priority: 0.8, changefreq: 'monthly' };
}

module.exports = {
  SITE_URL,
  normalizeToEnCanonicalPath,
  buildHreflangAlternateRefs,
  seoPriorityAndChangefreq,
};
