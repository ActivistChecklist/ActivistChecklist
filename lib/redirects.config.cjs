/**
 * Central list of HTTP redirects.
 *
 * - `next.config.js` `redirects()` uses this for `next dev` and `next start`.
 * - Static Apache export (`BUILD_MODE=static`): `scripts/postbuild.sh` copies
 *   `public/.htaccess` to `out/.htaccess`, then `scripts/inject-htaccess-redirects.cjs`
 *   fills the `### BEGIN GENERATED REDIRECTS ###` … `### END ###` block from this array.
 *   Edit only `REDIRECTS` here; do not hand-edit generated Redirect lines in `out/`.
 *
 * @type {readonly { source: string; destination: string; permanent?: boolean }[]}
 */
const REDIRECTS = [
  {
    source: '/government',
    destination: '/federal',
    permanent: true,
  },
  {
    source: '/images/police-at-the-door-poster-activistchecklist-org-v4.pdf',
    destination: '/files/downloads/police-at-the-door-poster-activistchecklist-org-v4.pdf',
    permanent: true,
  },
];

module.exports = { REDIRECTS };
