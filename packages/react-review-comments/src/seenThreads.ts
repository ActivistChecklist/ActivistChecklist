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

/** Case-insensitive trim match for `created_by` vs session author. */
export function reviewCommentAuthorsMatch(a: string | undefined, b: string | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/** Thread has activity the user has not acknowledged (localStorage seen map vs thread updated_at). */
export function isThreadUnread(
  thread: Pick<RrcThread, 'id' | 'updated_at' | 'updatedAt' | 'comments'>,
  seenMap: Record<string, string>,
  currentAuthor?: string
): boolean {
  const tu = normalizeThreadUpdatedAt(thread.updated_at ?? thread.updatedAt);
  if (!tu) {
    return false;
  }
  const seen = normalizeThreadUpdatedAt(seenMap[thread.id]);
  if (seen && seen === tu) {
    return false;
  }

  const me = (currentAuthor || '').trim();
  if (!me || !thread.comments?.length) {
    return !seen || seen !== tu;
  }

  const commentsAfterSeen = thread.comments.filter((c) => {
    const cat = normalizeThreadUpdatedAt(c.created_at ?? c.createdAt);
    if (!cat) {
      return false;
    }
    return !seen || cat > seen;
  });

  if (commentsAfterSeen.length === 0) {
    return !seen || seen !== tu;
  }

  return commentsAfterSeen.some((c) => !reviewCommentAuthorsMatch(c.created_by, me));
}

/**
 * Comment is "new" if created after last seen stamp, or (first open of an unread thread) the latest comment.
 * Never "new" for the current session author's own comments.
 */
export function isCommentNewSinceSeen(
  comment: RrcComment,
  thread: RrcThread,
  seenMap: Record<string, string>,
  currentAuthor?: string
): boolean {
  if (currentAuthor && reviewCommentAuthorsMatch(comment.created_by, currentAuthor)) {
    return false;
  }
  const cAt = normalizeThreadUpdatedAt(comment.created_at ?? comment.createdAt);
  if (!cAt) {
    return false;
  }
  const lastSeen = normalizeThreadUpdatedAt(seenMap[thread.id]);
  if (lastSeen) {
    return cAt > lastSeen;
  }
  if (!isThreadUnread(thread, seenMap, currentAuthor)) {
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
