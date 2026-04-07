import type { ReviewCommentsScope } from './types';

/** Single partition slot when scope is keyed only by the site host (see README). */
const DEFAULT_SLOT = 'default';

function normalizeHostHeader(hostHeader: string | null | undefined): string {
  if (hostHeader == null || typeof hostHeader !== 'string') {
    return '';
  }
  return hostHeader.trim().toLowerCase();
}

/**
 * Build {@link ReviewCommentsScope} from the browser-visible host (e.g. `headers().get('host')`
 * or `window.location.host`). Partitions Mongo data by deployment / preview URL without env vars.
 */
export function reviewCommentsScopeFromHostHeader(hostHeader: string | null | undefined): ReviewCommentsScope {
  const normalized = normalizeHostHeader(hostHeader);
  if (!normalized) {
    return {
      scopeKey: 'unknown',
      repoFullName: 'unknown',
      prNumber: DEFAULT_SLOT,
      deploymentKey: DEFAULT_SLOT,
    };
  }
  return {
    scopeKey: normalized,
    repoFullName: normalized,
    prNumber: DEFAULT_SLOT,
    deploymentKey: DEFAULT_SLOT,
  };
}

/** Same scope rules as {@link reviewCommentsScopeFromHostHeader}, using the incoming request (proxy-aware). */
export function reviewCommentsScopeFromRequest(request: Request): ReviewCommentsScope {
  const h = request.headers.get('x-forwarded-host') || request.headers.get('host');
  return reviewCommentsScopeFromHostHeader(h);
}
