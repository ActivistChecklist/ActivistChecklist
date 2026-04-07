import crypto from 'node:crypto';
import { ensureAnnotationSchema, query } from '@/lib/annotations/db';

function uuid() {
  return crypto.randomUUID();
}

export async function getOrCreateDocument({ scopeKey, repoFullName, prNumber, deploymentKey, path, locale, contentHash }) {
  await ensureAnnotationSchema();
  const existing = await query(
    `SELECT id, scope_key, repo_full_name, pr_number, deployment_key, site_path, locale, content_hash
     FROM annotation_documents
     WHERE scope_key = $1 AND site_path = $2 AND locale = $3
     LIMIT 1`,
    [scopeKey, path, locale]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (contentHash && row.content_hash !== contentHash) {
      await query(
        `UPDATE annotation_documents
         SET content_hash = $2, updated_at = NOW()
         WHERE id = $1`,
        [row.id, contentHash]
      );
    }
    return row;
  }

  const id = uuid();
  const created = await query(
    `INSERT INTO annotation_documents (
      id, scope_key, repo_full_name, pr_number, deployment_key, site_path, locale, content_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, scope_key, repo_full_name, pr_number, deployment_key, site_path, locale, content_hash`,
    [id, scopeKey, repoFullName, prNumber, deploymentKey, path, locale, contentHash || null]
  );
  return created.rows[0];
}

export async function listThreadsForDocument(documentId) {
  await ensureAnnotationSchema();
  const threadsResult = await query(
    `SELECT id, document_id, anchor_selector, quote_text, start_offset, end_offset, status, created_by, created_at, updated_at
     FROM annotation_threads
     WHERE document_id = $1
     ORDER BY created_at ASC`,
    [documentId]
  );
  const threadIds = threadsResult.rows.map((row) => row.id);
  const commentsResult = threadIds.length > 0
    ? await query(
      `SELECT id, thread_id, body, created_by, edited_at, deleted_at, created_at, updated_at
       FROM annotation_comments
       WHERE thread_id = ANY($1::uuid[])
         AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [threadIds]
    )
    : { rows: [] };

  const commentsByThreadId = new Map();
  for (const comment of commentsResult.rows) {
    if (!commentsByThreadId.has(comment.thread_id)) {
      commentsByThreadId.set(comment.thread_id, []);
    }
    commentsByThreadId.get(comment.thread_id).push(comment);
  }

  return threadsResult.rows
    .map((thread) => ({
      ...thread,
      comments: commentsByThreadId.get(thread.id) || [],
    }))
    .filter((thread) => thread.comments.length > 0);
}

export async function createThread({ documentId, anchorSelector, quoteText, startOffset, endOffset, createdBy, initialComment }) {
  await ensureAnnotationSchema();
  const threadId = uuid();
  const threadResult = await query(
    `INSERT INTO annotation_threads (id, document_id, anchor_selector, quote_text, start_offset, end_offset, status, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, 'open', $7)
     RETURNING id, document_id, anchor_selector, quote_text, start_offset, end_offset, status, created_by, created_at, updated_at`,
    [threadId, documentId, JSON.stringify(anchorSelector), quoteText, startOffset, endOffset, createdBy]
  );
  const thread = threadResult.rows[0];
  const commentId = uuid();
  const commentResult = await query(
    `INSERT INTO annotation_comments (id, thread_id, body, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, thread_id, body, created_by, edited_at, deleted_at, created_at, updated_at`,
    [commentId, thread.id, initialComment, createdBy]
  );
  const comment = commentResult.rows[0];
  return { ...thread, comments: [comment] };
}

async function assertThreadInScope(threadId, scope) {
  const result = await query(
    `SELECT t.id
     FROM annotation_threads t
     INNER JOIN annotation_documents d ON d.id = t.document_id
     WHERE t.id = $1
       AND d.scope_key = $2
       AND d.repo_full_name = $3
       AND d.pr_number = $4
       AND d.deployment_key = $5
     LIMIT 1`,
    [threadId, scope.scopeKey, scope.repoFullName, scope.prNumber, scope.deploymentKey]
  );
  return Boolean(result.rows[0]);
}

export async function createComment({ threadId, body, createdBy, scope }) {
  await ensureAnnotationSchema();
  const inScope = await assertThreadInScope(threadId, scope);
  if (!inScope) {
    return null;
  }
  const id = uuid();
  const result = await query(
    `INSERT INTO annotation_comments (id, thread_id, body, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, thread_id, body, created_by, edited_at, deleted_at, created_at, updated_at`,
    [id, threadId, body, createdBy]
  );
  await query(
    `UPDATE annotation_threads
     SET updated_at = NOW()
     WHERE id = $1`,
    [threadId]
  );
  return result.rows[0];
}

async function getThreadIdForCommentInScope(commentId, scope) {
  const result = await query(
    `SELECT c.thread_id
     FROM annotation_comments c
     INNER JOIN annotation_threads t ON t.id = c.thread_id
     INNER JOIN annotation_documents d ON d.id = t.document_id
     WHERE c.id = $1
       AND c.deleted_at IS NULL
       AND d.scope_key = $2
       AND d.repo_full_name = $3
       AND d.pr_number = $4
       AND d.deployment_key = $5
     LIMIT 1`,
    [commentId, scope.scopeKey, scope.repoFullName, scope.prNumber, scope.deploymentKey]
  );
  return result.rows[0]?.thread_id || null;
}

export async function updateComment({ commentId, body, scope }) {
  await ensureAnnotationSchema();
  const threadId = await getThreadIdForCommentInScope(commentId, scope);
  if (!threadId) {
    return null;
  }
  const result = await query(
    `UPDATE annotation_comments
     SET body = $2, edited_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING id, thread_id, body, created_by, edited_at, deleted_at, created_at, updated_at`,
    [commentId, body]
  );
  await query(
    `UPDATE annotation_threads
     SET updated_at = NOW()
     WHERE id = $1`,
    [threadId]
  );
  return result.rows[0] || null;
}

export async function deleteComment({ commentId, scope }) {
  await ensureAnnotationSchema();
  const threadId = await getThreadIdForCommentInScope(commentId, scope);
  if (!threadId) {
    return null;
  }
  const result = await query(
    `UPDATE annotation_comments
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [commentId]
  );
  await query(
    `UPDATE annotation_threads
     SET updated_at = NOW()
     WHERE id = $1`,
    [threadId]
  );
  return result.rows[0] || null;
}

export async function updateThreadStatus({ threadId, status, scope }) {
  await ensureAnnotationSchema();
  const inScope = await assertThreadInScope(threadId, scope);
  if (!inScope) {
    return null;
  }
  const result = await query(
    `UPDATE annotation_threads
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, document_id, anchor_selector, quote_text, start_offset, end_offset, status, created_by, created_at, updated_at`,
    [threadId, status]
  );
  return result.rows[0] || null;
}

export async function cleanupOldAnnotationData({ olderThanDays = 45 }) {
  await ensureAnnotationSchema();
  const days = Number.isFinite(olderThanDays) ? olderThanDays : 45;
  const deleted = await query(
    `DELETE FROM annotation_documents
     WHERE updated_at < NOW() - ($1::text || ' days')::interval`,
    [String(days)]
  );
  return { deletedDocuments: deleted.rowCount || 0, olderThanDays: days };
}

export async function listScopeOverview(scope) {
  await ensureAnnotationSchema();
  const docsResult = await query(
    `SELECT id, site_path, locale, updated_at
     FROM annotation_documents
     WHERE scope_key = $1
       AND repo_full_name = $2
       AND pr_number = $3
       AND deployment_key = $4
     ORDER BY site_path ASC`,
    [scope.scopeKey, scope.repoFullName, scope.prNumber, scope.deploymentKey]
  );

  const docIds = docsResult.rows.map((doc) => doc.id);
  const threadsResult = docIds.length > 0
    ? await query(
      `SELECT
         t.id,
         t.document_id,
         t.status,
         t.updated_at,
         (
           SELECT COUNT(*)
           FROM annotation_comments c
           WHERE c.thread_id = t.id
             AND c.deleted_at IS NULL
         )::int AS comment_count
       FROM annotation_threads t
       WHERE t.document_id = ANY($1::uuid[])
         AND EXISTS (
           SELECT 1
           FROM annotation_comments c2
           WHERE c2.thread_id = t.id
             AND c2.deleted_at IS NULL
         )
       ORDER BY t.updated_at DESC`,
      [docIds]
    )
    : { rows: [] };

  const threadsByDocumentId = new Map();
  for (const thread of threadsResult.rows) {
    if (!threadsByDocumentId.has(thread.document_id)) {
      threadsByDocumentId.set(thread.document_id, []);
    }
    threadsByDocumentId.get(thread.document_id).push(thread);
  }

  return docsResult.rows.map((doc) => {
    const threads = threadsByDocumentId.get(doc.id) || [];
    const commentCount = threads.reduce((sum, thread) => sum + thread.comment_count, 0);
    const lastActivityAt = threads[0]?.updated_at || doc.updated_at;
    return {
      documentId: doc.id,
      sitePath: doc.site_path,
      locale: doc.locale,
      threadCount: threads.length,
      commentCount,
      lastActivityAt,
      threads: threads.map((thread) => ({
        id: thread.id,
        status: thread.status,
        updatedAt: thread.updated_at,
        commentCount: thread.comment_count,
      })),
    };
  });
}
