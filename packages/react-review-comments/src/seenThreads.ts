import type { ReviewCommentsScope, RrcComment, RrcThread } from './types';

const SEEN_THREADS_KEY_PREFIX = 'ac.annotations.seen.';

/** Stable string for comparing thread activity (overview vs list vs localStorage). */
export function normalizeThreadUpdatedAt(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim();
}

/** Thread has activity the user has not acknowledged (localStorage seen map vs thread updated_at). */
export function isThreadUnread(
  thread: Pick<RrcThread, 'id' | 'updated_at' | 'updatedAt'>,
  seenMap: Record<string, string>
): boolean {
  const tu = normalizeThreadUpdatedAt(thread.updated_at ?? thread.updatedAt);
  if (!tu) {
    return false;
  }
  const seen = normalizeThreadUpdatedAt(seenMap[thread.id]);
  return !seen || seen !== tu;
}

/**
 * Comment is "new" if created after last seen stamp, or (first open of an unread thread) the latest comment.
 */
export function isCommentNewSinceSeen(
  comment: RrcComment,
  thread: RrcThread,
  seenMap: Record<string, string>
): boolean {
  const cAt = normalizeThreadUpdatedAt(comment.created_at ?? comment.createdAt);
  if (!cAt) {
    return false;
  }
  const lastSeen = normalizeThreadUpdatedAt(seenMap[thread.id]);
  if (lastSeen) {
    return cAt > lastSeen;
  }
  if (!isThreadUnread(thread, seenMap)) {
    return false;
  }
  let newestId = '';
  let newestAt = '';
  for (const cm of thread.comments) {
    const t = normalizeThreadUpdatedAt(cm.created_at ?? cm.createdAt);
    if (t >= newestAt) {
      newestAt = t;
      newestId = cm.id;
    }
  }
  return Boolean(newestId && comment.id === newestId);
}

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
