import type { ReviewCommentsScope } from './types';

const SEEN_THREADS_KEY_PREFIX = 'ac.annotations.seen.';

function getSeenStorageKey(scope: ReviewCommentsScope): string {
  return `${SEEN_THREADS_KEY_PREFIX}${scope.scopeKey || 'unknown'}`;
}

export function loadSeenThreadMap(scope: ReviewCommentsScope): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(getSeenStorageKey(scope));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveSeenThreadMap(scope: ReviewCommentsScope, map: Record<string, string>): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getSeenStorageKey(scope), JSON.stringify(map));
}
