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
    destination: '/federal',
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
  // PDFs used to live in /images/. Old links and printed copies still point there.
  {
    source: '/images/police-at-the-door-poster-activistchecklist-org-v4.pdf',
    destination: '/files/downloads/police-at-the-door-poster-activistchecklist-org-v4.pdf',
    permanent: true,
  },
  {
    source: '/images/police-at-the-door-poster-activistchecklist-org-v3.pdf',
    destination: '/files/downloads/police-at-the-door-poster-activistchecklist-org-v4.pdf',
    permanent: true,
  },
  {
    source: '/images/police-at-the-door-spanish-activistchecklist.pdf',
    destination: '/files/downloads/police-at-the-door-spanish-activistchecklist.pdf',
    permanent: true,
  },
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

/**
 * Apache `Redirect` line for one entry. A `/:path*` prefix maps to a plain path
 * prefix, which Apache matches segment-wise and appends the remainder to.
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
  return `Redirect ${code} ${from} ${to}`;
}

module.exports = { REDIRECTS, toApacheRedirectLine };
