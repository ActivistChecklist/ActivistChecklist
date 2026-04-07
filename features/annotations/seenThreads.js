const SEEN_THREADS_KEY_PREFIX = 'ac.annotations.seen.';

function getSeenStorageKey(scope) {
  return `${SEEN_THREADS_KEY_PREFIX}${scope.scopeKey || 'unknown'}`;
}

export function loadSeenThreadMap(scope) {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(getSeenStorageKey(scope));
    return raw ? JSON.parse(raw) : {};
  } catch (_err) {
    return {};
  }
}

export function saveSeenThreadMap(scope, map) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getSeenStorageKey(scope), JSON.stringify(map));
}
