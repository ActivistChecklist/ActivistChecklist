/**
 * Guess the page a 404'd path was meant to be, when the path is a real URL with
 * junk stuck to it. Most of our real-visitor 404s are links pasted from chat apps,
 * docs and social posts that dragged trailing characters along:
 *
 *   /ice/)before            (markdown or prose punctuation)
 *   /travel%E2%81%A9        (invisible Unicode from iMessage / WhatsApp)
 *   /essentials/%C2%A0      (non-breaking space)
 *   /es/essentials/:8Seguridad
 *   /ESSENTIALS
 *
 * The 404 page checks each candidate exists before redirecting, so a wrong guess
 * costs one HEAD request and nothing else.
 */

// Invisible formatting characters (Unicode category Cf: zero-width spaces,
// bidi marks and isolates, BOM). They never belong in a path, wherever they appear.
const INVISIBLE = /\p{Cf}/gu;

// Whitespace right after a slash, as in "/ travel/". Whitespace elsewhere ends
// the path, since what follows is usually the rest of a sentence; we try both.
const SPACE_AFTER_SLASH = /\/\s+/g;

// Leading run of well-formed segments: slug characters, optionally with dotted
// file extensions (so /files/x.pdf survives but a trailing "." does not).
const CLEAN_PREFIX = /^(?:\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)*)+/;

function safeDecode(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function withTrailingSlash(path) {
  const last = path.slice(path.lastIndexOf('/') + 1);
  return path.endsWith('/') || last.includes('.') ? path : `${path}/`;
}

function cleanPrefix(path) {
  const match = path.match(CLEAN_PREFIX);
  return match ? withTrailingSlash(match[0]) : null;
}

/**
 * Candidate paths to try, best first. Empty when the path has no junk to strip,
 * so bot probes like /private-keys or /wp-admin cost nothing.
 *
 * @param {string} pathname  `location.pathname` (percent-encoded is fine)
 * @returns {string[]} same-origin paths, each starting with a single "/"
 */
export function cleanedPathCandidates(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return [];

  const decoded = safeDecode(pathname).replace(INVISIBLE, '');
  const variants = [decoded, decoded.replace(SPACE_AFTER_SLASH, '/')];
  const original = withTrailingSlash(pathname);

  const candidates = [...variants, ...variants.map((v) => v.toLowerCase())].map(cleanPrefix);
  return [...new Set(candidates)].filter((c) => c && c !== '/' && c !== original);
}
