/**
 * MongoDB collection names for @activistchecklist/react-review-comments.
 * Default database name (when the connection URL has no path) is `review_comments` — see `db.ts`.
 */
export const REVIEW_COMMENTS_COLLECTIONS = {
  documents: 'rrc_documents',
  threads: 'rrc_threads',
  comments: 'rrc_comments',
} as const;
