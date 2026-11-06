/**
 * Central list of HTTP redirects.
 *
 * - `next.config.js` `redirects()` uses this for `next dev` and `next start`.
 * - Static Apache export (`BUILD_MODE=static`): `scripts/postbuild.sh` copies
 *   `public/.htaccess` to `out/.htaccess`, then `scripts/inject-htaccess-redirects.cjs`
 *   fills the `### BEGIN GENERATED REDIRECTS ###` … `### END ###` block from this array.
 *   Edit only `REDIRECTS` here; do not hand-edit generated Redirect lines in `out/`.
 *
 * Sources are exact paths, or a prefix ending in `/:path*` (with the same suffix on
 * the destination). Apache's `Redirect` already matches by path prefix, so that is
 * the only pattern both servers agree on; anything else is rejected at build time.
 *
 * @type {readonly { source: string; destination: string; permanent?: boolean }[]}
 */
const REDIRECTS = [
  {
    source: '/government',
    destination: '/federal/',
    permanent: true,
  },
  // The organizing guide was replaced by /action-safety/ (2026-11-02). Its
  // translated copies were live too, so keep one entry per live locale in
  // lib/i18n-config.mjs.
  {
    source: '/organizing',
    destination: '/action-safety/',
    permanent: true,
  },
  {
    source: '/es/organizing',
    destination: '/es/action-safety/',
    permanent: true,
  },
  {
    source: '/fr/organizing',
    destination: '/fr/action-safety/',
    permanent: true,
  },
  {
    source: '/it/organizing',
    destination: '/it/action-safety/',
    permanent: true,
  },
  // The resources page was removed (2026-11-03). Same one-entry-per-live-locale
  // rule as above.
  {
    source: '/resources',
    destination: '/',
    permanent: true,
  },
  {
    source: '/es/resources',
    destination: '/es/',
    permanent: true,
  },
  {
    source: '/fr/resources',
    destination: '/fr/',
    permanent: true,
  },
  {
    source: '/it/resources',
    destination: '/it/',
    permanent: true,
  },
  // Before #501 (2026-05-27), links to static files on non-English pages picked up
  // the locale prefix. Those /es/files/... URLs got indexed and linked from
  // elsewhere, so visitors still land on them. Keep one entry per non-default
  // locale in lib/i18n-config.mjs.
  {
    source: '/es/files/:path*',
    destination: '/files/:path*',
    permanent: true,
  },
  // The "Police at the door" poster was a Canva PDF under /files/downloads/
  // (and /images/ before that) until the build started generating it from
  // content/<locale>/pdf/ (2026-11-06). Old links, QR codes and printed copies
  // still point at the old names, so each goes straight to its language's PDF.
  {
    source: '/files/downloads/police-at-the-door-poster-activistchecklist-org-v4.pdf',
    destination: '/files/pdf/en/police-at-the-door.pdf',
    permanent: true,
  },
  {
    source: '/files/downloads/police-at-the-door-spanish-activistchecklist.pdf',
    destination: '/files/pdf/es/police-at-the-door.pdf',
    permanent: true,
  },
  {
    source: '/images/police-at-the-door-poster-activistchecklist-org-v4.pdf',
    destination: '/files/pdf/en/police-at-the-door.pdf',
    permanent: true,
  },
  {
    source: '/images/police-at-the-door-poster-activistchecklist-org-v3.pdf',
    destination: '/files/pdf/en/police-at-the-door.pdf',
    permanent: true,
  },
  {
    source: '/images/police-at-the-door-spanish-activistchecklist.pdf',
    destination: '/files/pdf/es/police-at-the-door.pdf',
    permanent: true,
  },
  // Other PDFs used to live in /images/ too.
  {
    source: '/images/activistchecklist-flyer-4up.pdf',
    destination: '/files/downloads/activistchecklist-flyer-4up.pdf',
    permanent: true,
  },
  {
    source: '/images/activistchecklist-flyer-single.pdf',
    destination: '/files/downloads/activistchecklist-flyer-single.pdf',
    permanent: true,
  },
];

const PREFIX_SUFFIX = '/:path*';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Apache line for one entry. A `/:path*` prefix maps to a plain `Redirect`, which
 * Apache matches segment-wise and appends the remainder to. An exact source gets an
 * anchored `RedirectMatch` instead, so it matches only that path (with or without
 * the trailing slash) like Next.js does. A prefix `Redirect /resources /` would send
 * /resources/ to //.
 */
function toApacheRedirectLine({ source, destination, permanent = true }) {
  const code = permanent ? '301' : '302';
  const isPrefix = source.endsWith(PREFIX_SUFFIX);
  if (isPrefix !== destination.endsWith(PREFIX_SUFFIX)) {
    throw new Error(
      `Redirect ${source} → ${destination}: both sides need ${PREFIX_SUFFIX}, or neither`,
    );
  }
  const from = isPrefix ? source.slice(0, -PREFIX_SUFFIX.length) : source;
  const to = isPrefix ? destination.slice(0, -PREFIX_SUFFIX.length) : destination;
  if (/[:*()]/.test(from) || /[:*()]/.test(to.replace(/^https?:\/\//, ''))) {
    throw new Error(
      `Redirect ${source} → ${destination}: only exact paths or a ${PREFIX_SUFFIX} prefix work in .htaccess`,
    );
  }
  if (isPrefix) return `Redirect ${code} ${from} ${to}`;
  return `RedirectMatch ${code} ^${escapeRegex(from)}/?$ ${to}`;
}

/**
 * Where the live site sends `pathname`, or null if no redirect applies. Matches
 * the Apache lines above: an exact source with or without its trailing slash, a
 * `/:path*` source by whole segments with the rest of the path carried over.
 * scripts/check-links.mjs uses it to accept links to retired pages.
 */
function redirectTarget(pathname, redirects = REDIRECTS) {
  for (const { source, destination } of redirects) {
    if (source.endsWith(PREFIX_SUFFIX)) {
      const from = source.slice(0, -PREFIX_SUFFIX.length);
      if (pathname === from || pathname.startsWith(`${from}/`)) {
        return destination.slice(0, -PREFIX_SUFFIX.length) + pathname.slice(from.length);
      }
    } else if (pathname === source || pathname === `${source}/`) {
      return destination;
    }
  }
  return null;
}

module.exports = { REDIRECTS, toApacheRedirectLine, redirectTarget };
