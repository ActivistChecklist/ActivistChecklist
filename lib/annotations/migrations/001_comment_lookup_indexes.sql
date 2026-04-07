CREATE INDEX IF NOT EXISTS idx_annotation_comments_not_deleted
  ON annotation_comments (thread_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_annotation_comments_thread_deleted
  ON annotation_comments (thread_id, deleted_at);
