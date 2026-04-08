/**
 * Normalizes a document path for the review-comments API (trailing slash, except root `/`).
 * Uses the visitor's URL path as-is (no locale stripping); scope comes from the request host separately.
 */
export function normalizeReviewCommentsDocumentPath(path: string): string {
  const p = (path || '/').trim();
  if (p === '/' || p === '') {
    return '/';
  }
  return p.endsWith('/') ? p : `${p}/`;
}

/** Next `usePathname()` value → API document path (full path the user sees, normalized). */
export function inferDocumentPathFromPathname(pathname: string): string {
  return normalizeReviewCommentsDocumentPath(pathname || '/');
}
