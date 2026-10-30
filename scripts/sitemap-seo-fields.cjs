/**
 * Extra sitemap fields for SEO: hreflang alternates (matches app alternate metadata)
 * and coarse priority / changefreq hints.
 */

const { LOCALES, DEFAULT_LOCALE } = require('../lib/i18n-config.mjs');

const SITE_URL = 'https://activistchecklist.org'.replace(/\/$/, '');
const NON_DEFAULT_LOCALES = Object.keys(LOCALES).filter((l) => l !== DEFAULT_LOCALE);

/**
 * Strip a leading locale segment (`/en/`, `/es/`, `/fr/`, ...) from a trailing-slash path.
 * @param {string} p — path starting and ending with `/`
 */
function stripLocalePrefix(p) {
  for (const locale of Object.keys(LOCALES)) {
    const prefix = `/${locale}/`;
    if (p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      return rest ? `/${rest.replace(/\/$/, '')}/` : '/';
    }
  }
  return p;
}

/**
 * @param {string} dedupeKey — trailing-slash path, may be `/es/...`, `/fr/...` or English canonical
 * @returns {string} English canonical path with slashes, e.g. `/signal/` or `/`
 */
function normalizeToEnCanonicalPath(dedupeKey) {
  let p = dedupeKey.startsWith('/') ? dedupeKey : `/${dedupeKey}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return stripLocalePrefix(p);
}

/**
 * Google-supported hreflang cluster: the default locale, every other locale, and x-default.
 * @param {string} dedupeKey
 * @returns {Array<{ href: string, hreflang: string, hrefIsAbsolute: boolean }>}
 */
function buildHreflangAlternateRefs(dedupeKey) {
  const enPath = normalizeToEnCanonicalPath(dedupeKey);
  const enUrl =
    enPath === '/' ? `${SITE_URL}/` : `${SITE_URL}${enPath.endsWith('/') ? enPath : `${enPath}/`}`;

  const localeRefs = NON_DEFAULT_LOCALES.map((locale) => ({
    href:
      enPath === '/'
        ? `${SITE_URL}/${locale}/`
        : `${SITE_URL}/${locale}${enPath.replace(/\/$/, '')}/`,
    hreflang: locale,
    hrefIsAbsolute: true,
  }));

  return [
    { href: enUrl, hreflang: DEFAULT_LOCALE, hrefIsAbsolute: true },
    ...localeRefs,
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
  stripLocalePrefix,
  normalizeToEnCanonicalPath,
  buildHreflangAlternateRefs,
  seoPriorityAndChangefreq,
};
