CREATE TABLE IF NOT EXISTS annotation_documents (
  id UUID PRIMARY KEY,
  scope_key TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  pr_number TEXT NOT NULL,
  deployment_key TEXT NOT NULL,
  site_path TEXT NOT NULL,
  locale TEXT NOT NULL,
  content_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_key, site_path, locale)
);

CREATE TABLE IF NOT EXISTS annotation_threads (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES annotation_documents(id) ON DELETE CASCADE,
  anchor_selector JSONB NOT NULL,
  quote_text TEXT NOT NULL,
  start_offset INTEGER NULL,
  end_offset INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('open', 'resolved'))
);

CREATE TABLE IF NOT EXISTS annotation_comments (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES annotation_threads(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  edited_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS annotation_events (
  id UUID PRIMARY KEY,
  thread_id UUID NULL REFERENCES annotation_threads(id) ON DELETE CASCADE,
  comment_id UUID NULL REFERENCES annotation_comments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotation_documents_path_locale
  ON annotation_documents (scope_key, site_path, locale);
CREATE INDEX IF NOT EXISTS idx_annotation_documents_scope
  ON annotation_documents (repo_full_name, pr_number, deployment_key);
CREATE INDEX IF NOT EXISTS idx_annotation_threads_document
  ON annotation_threads (document_id);
CREATE INDEX IF NOT EXISTS idx_annotation_threads_selector
  ON annotation_threads USING GIN (anchor_selector);
CREATE INDEX IF NOT EXISTS idx_annotation_comments_thread_created
  ON annotation_comments (thread_id, created_at);
